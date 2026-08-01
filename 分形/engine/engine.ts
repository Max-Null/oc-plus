/**
 * 知识引擎 — KnowledgeEngine 主类
 *
 * 职责：扫描知识目录（.md 文件）、解析元数据、构建 BM25 索引、提供搜索 API。
 * 设计约束：
 * - 零依赖，纯 Node.js 标准库
 * - 同步 API（fs.readdirSync，100 文件 < 5ms）
 * - 无副作用：不包含定时器/监听器，刷新由调用方触发
 */

import fs from "node:fs";
import path from "node:path";
import { BM25Index, type SearchDoc, type SearchResult } from "./bm25.js";
import { VectorIndex, rrfFuse, type FusedHit } from "./vector.js";

// ============================================================
// 类型定义
// ============================================================

/** 知识块元数据 */
export interface BlockMeta {
  fileName: string;      // "java-sql-n-plus-1.md"
  relPath: string;       // "auto/java-sql-n-plus-1.md" or "java-sql-n-plus-1.md"
  status: string;        // "auto" | "suggest" | "pending"
  type: string;          // "knowledge" | "habit" | …
  label: string;         // 知识标题
  description: string;   // 一句话摘要
  priority: number;      // 权重 0-100
  body: string;          // 正文首 N 字
}

/** 搜索引擎统计 */
export interface EngineStats {
  totalBlocks: number;   // 扫描到的 .md 文件总数
  indexed: number;       // 已索引到 BM25 的文档数（有 description 的）
  vectorReady: boolean;  // 语义向量模型是否就绪（V4 P2）
}

/** 引擎配置 */
export interface EngineOptions {
  bodyLength?: number;   // 正文截断长度，默认 200
}

/** 合法 status 子目录 */
const STATUS_DIRS = ["pending", "auto", "suggest"];

// ============================================================
// 主类
// ============================================================

export class KnowledgeEngine {
  private dirs: string[];
  private opts: Required<EngineOptions>;
  private bm25: BM25Index;
  private blocks: BlockMeta[] = [];
  private initialized = false;
  /** 语义向量索引（V4 P2，可选挂载；未挂载或模型不可用 → 纯 BM25） */
  private vector: VectorIndex | null = null;

  constructor(dirs: string[], opts?: EngineOptions) {
    this.dirs = dirs.filter(d => typeof d === "string" && d.length > 0);
    this.opts = { bodyLength: opts?.bodyLength ?? 200 };
    this.bm25 = new BM25Index();
  }

  // ============================================================
  // 公开 API
  // ============================================================

  /** 扫描所有目录，解析元数据，构建 BM25 索引（同步） */
  init(): void {
    this._scanAll();
    this._buildIndex();
    this.initialized = true;
  }

  /** BM25 搜索（同步，纯内存操作） */
  search(query: string, topK: number = 5): Array<{ doc: BlockMeta; score: number }> {
    if (!this.initialized) this.init();
    const results = this.bm25.search(query, topK);
    return results.map(r => ({
      doc: this._docToBlockMeta(r.doc),
      score: r.score,
    }));
  }

  /**
   * 挂载语义向量索引（V4 P2）
   * 传入的 VectorIndex 负责模型加载与向量重建，引擎只负责融合搜索
   */
  setVectorIndex(v: VectorIndex | null): void {
    this.vector = v;
  }

  /** 向量索引是否可用（未挂载或模型未就绪 = false） */
  get vectorReady(): boolean {
    return this.vector !== null && this.vector.ready;
  }

  /**
   * 融合搜索（V4 P2+P3）：向量就绪 → RRF 融合 BM25 + 语义；否则降级纯 BM25
   * 注意：异步（embedding 是异步 API），调用方需 await；BM25 路径无额外延迟
   */
  async searchHybrid(query: string, topK: number = 5): Promise<Array<{ doc: BlockMeta; score: number }>> {
    if (!this.initialized) this.init();

    // 向量不可用 → 直接降级同步 BM25（保持原有行为与延迟）
    if (!this.vectorReady) {
      return this.search(query, topK);
    }

    // 两路各自取 topK×2（融合后仍有足够的候选）
    const bm25Results = this.bm25.search(query, topK * 2);
    const vecResults = await this.vector!.search(query, topK * 2);

    // BM25 零命中时语义兜底；两路都空则空结果
    if (bm25Results.length === 0 && vecResults.length === 0) return [];

    const fused: FusedHit[] = rrfFuse(
      bm25Results.map(r => ({ filePath: r.doc.filePath })),
      vecResults.map(r => ({ filePath: r.filePath })),
      topK
    );

    // 融合结果按 filePath 回查 blocks 元数据
    return fused
      .map(f => {
        const doc = this.blocks.find(b => b.fileName === f.filePath);
        return doc ? { doc, score: f.score } : null;
      })
      .filter((x): x is { doc: BlockMeta; score: number } => x !== null);
  }

  /** 返回所有已索引的 knowledge block 元数据 */
  list(): BlockMeta[] {
    if (!this.initialized) this.init();
    return [...this.blocks]; // 浅拷贝防止外部修改
  }

  /** 返回索引统计 */
  stats(): EngineStats {
    if (!this.initialized) this.init();
    return {
      totalBlocks: this.blocks.length,
      indexed: this.bm25.size,
      vectorReady: this.vectorReady,
    };
  }

  /** 手动重建索引（重新扫描目录） */
  refresh(): void {
    this.blocks = [];
    this.bm25 = new BM25Index();
    this._scanAll();
    this._buildIndex();
    this.initialized = true;
  }

  /**
   * 直接喂入 blocks 列表并重建索引（不扫描目录）
   * 用于 fractal 从缓存取 blocks 后直接搜索，避免重复 IO
   */
  feedBlocks(blocks: BlockMeta[]): void {
    this.blocks = blocks;
    this.bm25 = new BM25Index();
    this._buildIndex();
    this.initialized = true;
  }

  // ============================================================
  // 静态工具方法（供 fractal triggers 解析复用）
  // ============================================================

  /**
   * 解析 HTML 注释元数据
   * 格式：<!-- key: value -->
   * @param maxIndex 仅解析前 N 个字符，防止扫描全文件
   */
  static parseMeta(content: string, maxIndex: number = 100): Record<string, string> | null {
    const meta: Record<string, string> = {};
    const commentRegex = /<!--\s*(\w+):\s*(.*?)\s*-->/g;
    let match: RegExpExecArray | null;
    while ((match = commentRegex.exec(content)) !== null) {
      if (match.index > maxIndex) break;
      meta[match[1]] = match[2].trim();
    }
    return Object.keys(meta).length > 0 ? meta : null;
  }

  /**
   * 扫描目录下的所有 .md 文件（兼容 flat + status 子目录）
   * 返回 { fileName, content, relPath }
   */
  static scanDir(dirPath: string): Array<{ fileName: string; content: string; relPath: string }> {
    const results: Array<{ fileName: string; content: string; relPath: string }> = [];

    // 向后兼容：旧 flat 结构 *.md
    if (fs.existsSync(dirPath)) {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const filePath = path.join(dirPath, entry.name);
          results.push({
            fileName: entry.name,
            content: _safeReadFile(filePath),
            relPath: entry.name,
          });
        }
      }
    }

    // 新结构：<status>/*.md
    for (const sub of STATUS_DIRS) {
      const subDir = path.join(dirPath, sub);
      if (fs.existsSync(subDir)) {
        for (const entry of fs.readdirSync(subDir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith(".md")) {
            const filePath = path.join(subDir, entry.name);
            results.push({
              fileName: entry.name,
              content: _safeReadFile(filePath),
              relPath: `${sub}/${entry.name}`,
            });
          }
        }
      }
    }

    return results;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /** 扫描所有目录并解析元数据 */
  private _scanAll(): void {
    const seen = new Set<string>(); // label → 冲突覆盖

    for (const dir of this.dirs) {
      if (!fs.existsSync(dir)) continue;
      const entries = KnowledgeEngine.scanDir(dir);

      for (const entry of entries) {
        const meta = KnowledgeEngine.parseMeta(entry.content, 400);
        if (!meta) continue;

        const label = meta.label || entry.fileName.replace(".md", "");
        const block: BlockMeta = {
          fileName: entry.fileName,
          relPath: `blocks/${entry.relPath}`,
          status: meta.status || "auto",
          type: meta.type || "knowledge",
          label,
          description: meta.description || "",
          priority: parseInt(meta.priority, 10) || 50,
          body: _extractBody(entry.content).slice(0, this.opts.bodyLength),
        };

        // 同名 label 后者覆盖（全局 > 项目级）
        if (seen.has(label)) {
          const idx = this.blocks.findIndex(b => b.label === label);
          if (idx !== -1) this.blocks[idx] = block;
        } else {
          this.blocks.push(block);
          seen.add(label);
        }
      }
    }
  }

  /** 把所有有 description 的 blocks 构建到 BM25 索引 */
  private _buildIndex(): void {
    const docs: SearchDoc[] = [];
    for (const b of this.blocks) {
      // 仅索引有描述的知识（无描述的 pending block 不参与搜索）
      if (!b.description) continue;
      docs.push({
        filePath: b.fileName,
        fileName: b.fileName,
        title: b.label,
        description: b.description,
        body: b.body,
      });
    }
    this.bm25.rebuild(docs);
  }

  /** 将内部 SearchDoc 转换为 BlockMeta（搜索结果映射） */
  private _docToBlockMeta(doc: SearchDoc): BlockMeta {
    return this.blocks.find(b => b.fileName === doc.fileName) || {
      fileName: doc.fileName,
      relPath: "",
      status: "",
      type: "",
      label: doc.title,
      description: doc.description,
      priority: 0,
      body: doc.body,
    };
  }
}

// ============================================================
// 私有工具函数（不暴露，避免使用者耦合实现细节）
// ============================================================

/** 安全读文件（不存在返回空串） */
function _safeReadFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/** 提取元数据注释之后的正文本体 */
function _extractBody(content: string): string {
  const lines = content.split("\n");
  const valueLines: string[] = [];
  let inMeta = true;
  for (const line of lines) {
    if (inMeta && line.trim().startsWith("<!--")) continue;
    if (inMeta && line.trim() === "") continue;
    inMeta = false;
    valueLines.push(line);
  }
  return valueLines.join("\n").trim();
}
