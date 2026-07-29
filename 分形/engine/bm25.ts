/**
 * 知识引擎 — BM25 倒排索引
 *
 * 从 分形/search.ts 迁移，算法零改动。
 * 设计约束：
 * - 零外部依赖，无原生编译需求
 * - 内存索引（200 个 block 在 1MB 内），无需文件 I/O
 * - BM25 排名 + N-gram 中文分字，覆盖精确匹配和同词根
 * - 搜索延迟 < 1ms
 */

/** 索引文档 */
export interface SearchDoc {
  filePath: string;   // blocks/*.md 完整路径（可点击跳转）
  fileName: string;   // 文件名（快速匹配）
  title: string;      // metadata title 字段
  description: string; // metadata description 字段
  body: string;       // 正文首 200 字
}

/** 搜索结果 */
export interface SearchResult {
  doc: SearchDoc;
  score: number;      // BM25 分数，越高越相关
}

/** BM25 参数 */
const BM25_K1 = 1.5;  // term frequency saturation
const BM25_B = 0.75;  // length normalization

export class BM25Index {
  /** 文档存储：path → SearchDoc */
  private docs = new Map<string, SearchDoc>();
  /** 倒排索引：term → [{docPath, termFreq}] */
  private inverted = new Map<string, Array<{ path: string; tf: number }>>();
  /** 文档长度（token 数） */
  private lengths = new Map<string, number>();
  /** 总文档数 */
  private N = 0;
  /** 平均文档长度 */
  private avgdl = 0;

  // ============================================================
  // 公开 API
  // ============================================================

  /** 添加/更新一篇文档到索引 */
  index(doc: SearchDoc): void {
    const isUpdate = this.docs.has(doc.filePath);
    if (isUpdate) this._removeDoc(doc.filePath);

    this.docs.set(doc.filePath, doc);
    if (!isUpdate) this.N++; // 仅新增时递增，更新不重复计数

    // 构建搜索文本：title + description + body
    const text = `${doc.title} ${doc.description} ${doc.body}`;
    const tokens = tokenize(text);

    // 词频统计（文档内）
    const tfMap = new Map<string, number>();
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
    }

    // 写入倒排索引 + 文档长度
    const docLen = tokens.length;
    this.lengths.set(doc.filePath, docLen);
    this._updateAvgdl();

    for (const [term, tf] of tfMap) {
      const postings = this.inverted.get(term) || [];
      // 更新已有条目或添加新条目
      const existing = postings.find(p => p.path === doc.filePath);
      if (existing) {
        existing.tf = tf;
      } else {
        postings.push({ path: doc.filePath, tf });
      }
      this.inverted.set(term, postings);
    }
  }

  /** 搜索：返回 top-K 结果 */
  search(query: string, topK: number = 5): SearchResult[] {
    if (this.N === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // 计算每个候选文档的 BM25 分数
    const scores = new Map<string, number>();

    for (const qt of queryTokens) {
      const postings = this.inverted.get(qt);
      if (!postings) continue; // 查询词不在任何文档中

      // IDF：log((N - n + 0.5) / (n + 0.5) + 1)
      const n = postings.length;
      const idf = Math.log((this.N - n + 0.5) / (n + 0.5) + 1);

      for (const { path, tf } of postings) {
        const docLen = this.lengths.get(path) || 1;
        // BM25 单 term 分数
        const numerator = tf * (BM25_K1 + 1);
        const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / this.avgdl));
        scores.set(path, (scores.get(path) || 0) + idf * numerator / denominator);
      }
    }

    // 排序 + 截断
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([path, score]) => ({
        doc: this.docs.get(path)!,
        score: Math.round(score * 1000) / 1000, // 保留 3 位小数
      }));
  }

  /** 从索引中删除一篇文档 */
  remove(filePath: string): void {
    if (!this.docs.has(filePath)) return; // 幂等：不存在的文档静默跳过
    this._removeDoc(filePath);
    this.N--;
    this._updateAvgdl();
  }

  /** 获取文档数 */
  get size(): number { return this.N; }

  /** 重建索引（清空后批量添加） */
  rebuild(docs: SearchDoc[]): void {
    this.docs.clear();
    this.inverted.clear();
    this.lengths.clear();
    this.N = 0;
    this.avgdl = 0;
    for (const doc of docs) {
      this.index(doc);
    }
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private _removeDoc(filePath: string): void {
    this.docs.delete(filePath);
    this.lengths.delete(filePath);
    // 从倒排索引中移除此文档的所有出现
    for (const [term, postings] of this.inverted) {
      const idx = postings.findIndex(p => p.path === filePath);
      if (idx !== -1) {
        postings.splice(idx, 1);
        if (postings.length === 0) this.inverted.delete(term);
      }
    }
  }

  private _updateAvgdl(): void {
    if (this.lengths.size === 0) {
      this.avgdl = 0;
      return;
    }
    let sum = 0;
    for (const len of this.lengths.values()) sum += len;
    this.avgdl = sum / this.lengths.size;
  }
}

// ============================================================
// 分词器
// ============================================================

/**
 * 简单分词：空格/标点分割 + CJK 2-gram 分字
 *
 * 策略：
 * - 英文：按空白和标点分词，转小写
 * - 中文：2-gram 滑动窗口（"数据库慢了" → ["数据","据库","库慢","慢了"]）
 *   + 也保留完整词（如 "性能慢"），2-gram 保证子串匹配
 * - 去停用词：单字符的英文/数字跳过
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // 先按 CJK 边界切分
  const segments = splitMixed(text);

  for (const seg of segments) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(seg)) {
      // CJK 段：2-gram + 完整词
      const chars = [...seg];
      for (let i = 0; i < chars.length - 1; i++) {
        tokens.push(chars[i] + chars[i + 1]);
      }
      // 也保留完整词（支持精确匹配）
      tokens.push(seg);
    } else {
      // ASCII 段：按空白 + 标点分词
      const lowered = seg.toLowerCase();
      const words = lowered.split(/[\s.,;:!?()\[\]{}"'`~@#$%^&*+=|\\/<>\-]+/).filter(Boolean);
      // 跳过单字符（太短无区分度）
      for (const w of words) {
        if (w.length > 1) tokens.push(w);
      }
    }
  }

  // 不在此处去重——TF 计算依赖频次，在 index() 中用 tfMap 统计
  return tokens;
}

/** 按 CJK 边界切分文本为混合段 */
function splitMixed(text: string): string[] {
  const result: string[] = [];
  let buf = "";
  let isCJK = false;

  for (const ch of text) {
    const chIsCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch);
    if (buf.length === 0) {
      isCJK = chIsCJK;
      buf = ch;
    } else if (chIsCJK === isCJK && ch !== " ") {
      buf += ch;
    } else {
      if (buf.trim()) result.push(buf.trim());
      isCJK = chIsCJK;
      buf = ch;
    }
  }
  if (buf.trim()) result.push(buf.trim());
  return result;
}
