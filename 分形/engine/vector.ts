/**
 * 知识引擎 — 语义向量索引（V4 P2+P3）
 *
 * 职责：用 bge-small-zh-v1.5（中文专用 embedding 模型，384 维）把知识块
 * 转为向量，支持语义搜索（关键词不重叠也能命中），并与 BM25 做 RRF 融合。
 *
 * 设计约束：
 * - transformers.js（@huggingface/transformers）动态 import：模型不可用或
 *   加载失败时优雅降级（ready=false），不影响 BM25 主路径
 * - 懒加载：模型首次使用才加载（异步），预热由调用方触发
 * - 向量归一化后存内存（200 块 × 384 float32 ≈ 300KB），搜索为点积
 * - 输出确定性：同文本 → 同向量（不破坏 S3 缓存前缀稳定性）
 */

// ============================================================
// 类型定义
// ============================================================

import { execSync } from "node:child_process";

/** 待向量化的文档 */
export interface VectorDoc {
  filePath: string;   // 与 SearchDoc.filePath 对齐（blocks/*.md）
  text: string;       // 用于 embedding 的文本（title + description + body）
}

/** 向量搜索结果 */
export interface VectorHit {
  filePath: string;
  score: number;      // 余弦相似度（归一化后点积），0~1
}

/** RRF 融合后的排名结果 */
export interface FusedHit {
  filePath: string;
  score: number;      // RRF 融合分
}

// ============================================================
// 常量
// ============================================================

/** transformers.js 上的中文 embedding 模型（BAAI/bge-small-zh-v1.5 的 ONNX 版） */
const MODEL_ID = "Xenova/bge-small-zh-v1.5";
/** 向量维度（bge-small-zh 固定） */
const DIM = 384;
/** RRF 常数（避免排名悬殊时一方完全压制） */
const RRF_K = 60;
/** RRF 融合权重：BM25 主路径 0.7 + 语义补充 0.3 */
const W_BM25 = 0.7;
const W_VEC = 0.3;

// ============================================================
// RRF 融合（纯函数，便于单元测试）
// ============================================================

/**
 * 用 RRF（Reciprocal Rank Fusion）融合 BM25 与向量两路排名
 * @param bm25Ranks  BM25 结果，按相关性降序（含 filePath）
 * @param vecRanks   向量结果，按相似度降序（含 filePath）
 * @param topK       返回条数
 */
export function rrfFuse(
  bm25Ranks: Array<{ filePath: string }>,
  vecRanks: Array<{ filePath: string }>,
  topK: number = 5
): FusedHit[] {
  const acc = new Map<string, number>();

  // BM25 权重更高：关键词精确命中优先
  bm25Ranks.forEach((h, i) => {
    const rank = i + 1; // 1-based
    acc.set(h.filePath, (acc.get(h.filePath) || 0) + W_BM25 / (RRF_K + rank));
  });
  // 向量补充召回：语义相关但无关键词重叠的文档
  vecRanks.forEach((h, i) => {
    const rank = i + 1;
    acc.set(h.filePath, (acc.get(h.filePath) || 0) + W_VEC / (RRF_K + rank));
  });

  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([filePath, score]) => ({ filePath, score }));
}

// ============================================================
// 主类
// ============================================================

export class VectorIndex {
  /** transformers.js 的 feature-extraction pipeline 实例（懒加载） */
  private extractor: ((texts: string, opts?: Record<string, unknown>) => Promise<{ data: Float32Array }>) | null = null;
  /** 文档向量表：filePath → 归一化向量 */
  private vectors = new Map<string, Float32Array>();
  /** 模型缓存目录（transformers.js 下载模型的落盘位置） */
  private cacheDir: string | undefined;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir;
  }

  /** 模型是否就绪（未加载或加载失败 = false） */
  get ready(): boolean {
    return this.extractor !== null;
  }

  /** 已索引的文档数 */
  get size(): number {
    return this.vectors.size;
  }

  /** 向量维度（用于测试断言） */
  get dim(): number {
    return DIM;
  }

  /**
   * 懒加载模型（幂等，并发安全）
   * @returns true=模型就绪；false=加载失败（降级 BM25，不抛错）
   */
  async ensureModel(): Promise<boolean> {
    if (this.extractor) return true;
    try {
      // 动态 import：部署环境缺该依赖时自然降级，不阻塞插件加载
      const mod: typeof import("@huggingface/transformers") = await import("@huggingface/transformers");
      if (this.cacheDir) mod.env.cacheDir = this.cacheDir;
      // 网络代理：Node 原生 fetch 不走系统代理（Windows 注册表代理），
      // 直连 huggingface.co 可能被墙 → 尝试用 undici ProxyAgent 走系统代理
      await _applySystemProxy();
      const pipe = await mod.pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
      // pipeline 返回 FeatureExtractionPipeline，与私有字段类型对齐需先过 unknown
      this.extractor = pipe as unknown as typeof this.extractor;
      return true;
    } catch (e) {
      // 模型下载失败 / WASM 初始化失败 → 降级 BM25
      // 用全局 console（库文件无 debug 通道，避免额外依赖）
      console.error(`[vector] ensureModel 失败，降级 BM25: ${String(e)}`);
      this.extractor = null;
      return false;
    }
  }

  /** 文本 → 384 维归一化向量（模型未就绪返回 null） */
  async embed(text: string): Promise<Float32Array | null> {
    if (!this.extractor) return null;
    try {
      const out = await this.extractor(text, { pooling: "mean", normalize: true });
      return new Float32Array(out.data);
    } catch {
      return null;
    }
  }

  /** 重建索引：把文档全部向量化（幂等重建，调用前需 ensureModel） */
  async rebuild(docs: VectorDoc[]): Promise<void> {
    if (!this.extractor) return;
    this.vectors.clear();
    for (const d of docs) {
      const v = await this.embed(d.text);
      if (v) this.vectors.set(d.filePath, v);
    }
  }

  /** 语义搜索：query 向量与所有文档向量做点积（已归一化 → 余弦） */
  async search(query: string, topK: number = 5): Promise<VectorHit[]> {
    if (!this.extractor || this.vectors.size === 0) return [];
    const qv = await this.embed(query);
    if (!qv) return [];

    const hits: VectorHit[] = [];
    for (const [filePath, vec] of this.vectors) {
      hits.push({ filePath, score: _dot(qv, vec) });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }

  /** 清空索引（配合 refresh） */
  clear(): void {
    this.vectors.clear();
  }
}

// ============================================================
// 私有工具
// ============================================================

/** 归一化向量点积 = 余弦相似度 */
function _dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * 系统代理适配：让 transformers.js 的 fetch 走系统代理（Windows）
 *
 * 背景：Node 原生 fetch（undici）不读取 Windows 注册表代理，而 huggingface.co
 * 在国内通常需要代理才能访问。
 *
 * 优先级：
 * 1. 已有 HTTP(S)_PROXY 环境变量 → 直接设置
 * 2. undici ProxyAgent + Windows 注册表代理（127.0.0.1:7890 类 Clash 场景）
 *
 * 静默失败：任何一步出错都不影响主流程（模型仍会尝试直连）
 */
async function _applySystemProxy(): Promise<void> {
  try {
    // 环境变量优先（跨平台通用，CI/容器场景）
    let proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    // Windows 注册表读取系统代理（Clash 等工具只写注册表不写环境变量）
    if (!proxy && process.platform === "win32") {
      try {
        const enabled = _regQuery("ProxyEnable");
        if (enabled && enabled.includes("0x1")) {
          const server = _regQuery("ProxyServer");
          if (server) proxy = server.trim();
        }
      } catch {
        // 注册表读取失败 → 跳过
      }
    }
    if (!proxy) return;

    // 动态 import undici（可选依赖：未安装时跳过，不阻塞）
    try {
      const { setGlobalDispatcher, ProxyAgent } = await import("undici");
      const url = proxy.startsWith("http") ? proxy : `http://${proxy}`;
      setGlobalDispatcher(new ProxyAgent(url));
    } catch {
      // undici 未安装或代理初始化失败 → 忽略，走直连
    }
  } catch {
    // 整体失败不影响主流程
  }
}

/** 读 Windows 注册表单值（返回值部分） */
function _regQuery(valueName: string): string | null {
  const out = execSync(
    `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ${valueName}`,
    { encoding: "utf-8", windowsHide: true }
  );
  // 兼容 REG_SZ / REG_DWORD / REG_BINARY 等类型：取最后一个非空白 token
  const m = out.match(/REG_\w+\s+(.+)/);
  return m ? m[1].trim() : null;
}
