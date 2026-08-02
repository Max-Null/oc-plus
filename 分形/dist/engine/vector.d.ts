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
/** 待向量化的文档 */
export interface VectorDoc {
    filePath: string;
    text: string;
}
/** 向量搜索结果 */
export interface VectorHit {
    filePath: string;
    score: number;
}
/** RRF 融合后的排名结果 */
export interface FusedHit {
    filePath: string;
    score: number;
}
/**
 * 用 RRF（Reciprocal Rank Fusion）融合 BM25 与向量两路排名
 * @param bm25Ranks  BM25 结果，按相关性降序（含 filePath）
 * @param vecRanks   向量结果，按相似度降序（含 filePath）
 * @param topK       返回条数
 */
export declare function rrfFuse(bm25Ranks: Array<{
    filePath: string;
}>, vecRanks: Array<{
    filePath: string;
}>, topK?: number): FusedHit[];
export declare class VectorIndex {
    /** transformers.js 的 feature-extraction pipeline 实例（懒加载） */
    private extractor;
    /** 文档向量表：filePath → 归一化向量 */
    private vectors;
    /** 模型缓存目录（transformers.js 下载模型的落盘位置） */
    private cacheDir;
    constructor(cacheDir?: string);
    /** 模型是否就绪（未加载或加载失败 = false） */
    get ready(): boolean;
    /** 已索引的文档数 */
    get size(): number;
    /** 向量维度（用于测试断言） */
    get dim(): number;
    /**
     * 懒加载模型（幂等，并发安全）
     * @returns true=模型就绪；false=加载失败（降级 BM25，不抛错）
     */
    ensureModel(): Promise<boolean>;
    /** 文本 → 384 维归一化向量（模型未就绪返回 null） */
    embed(text: string): Promise<Float32Array | null>;
    /** 重建索引：把文档全部向量化（幂等重建，调用前需 ensureModel） */
    rebuild(docs: VectorDoc[]): Promise<void>;
    /** 语义搜索：query 向量与所有文档向量做点积（已归一化 → 余弦） */
    search(query: string, topK?: number): Promise<VectorHit[]>;
    /** 清空索引（配合 refresh） */
    clear(): void;
}
