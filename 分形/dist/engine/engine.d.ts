/**
 * 知识引擎 — KnowledgeEngine 主类
 *
 * 职责：扫描知识目录（.md 文件）、解析元数据、构建 BM25 索引、提供搜索 API。
 * 设计约束：
 * - 零依赖，纯 Node.js 标准库
 * - 同步 API（fs.readdirSync，100 文件 < 5ms）
 * - 无副作用：不包含定时器/监听器，刷新由调用方触发
 */
import { VectorIndex } from "./vector.js";
/** 知识块元数据 */
export interface BlockMeta {
    fileName: string;
    relPath: string;
    status: string;
    type: string;
    label: string;
    description: string;
    priority: number;
    body: string;
}
/** 搜索引擎统计 */
export interface EngineStats {
    totalBlocks: number;
    indexed: number;
    vectorReady: boolean;
}
/** 引擎配置 */
export interface EngineOptions {
    bodyLength?: number;
}
export declare class KnowledgeEngine {
    private dirs;
    private opts;
    private bm25;
    private blocks;
    private initialized;
    /** 语义向量索引（V4 P2，可选挂载；未挂载或模型不可用 → 纯 BM25） */
    private vector;
    constructor(dirs: string[], opts?: EngineOptions);
    /** 扫描所有目录，解析元数据，构建 BM25 索引（同步） */
    init(): void;
    /** BM25 搜索（同步，纯内存操作） */
    search(query: string, topK?: number): Array<{
        doc: BlockMeta;
        score: number;
    }>;
    /**
     * 挂载语义向量索引（V4 P2）
     * 传入的 VectorIndex 负责模型加载与向量重建，引擎只负责融合搜索
     */
    setVectorIndex(v: VectorIndex | null): void;
    /** 向量索引是否可用（未挂载或模型未就绪 = false） */
    get vectorReady(): boolean;
    /**
     * 融合搜索（V4 P2+P3）：向量就绪 → RRF 融合 BM25 + 语义；否则降级纯 BM25
     * 注意：异步（embedding 是异步 API），调用方需 await；BM25 路径无额外延迟
     */
    searchHybrid(query: string, topK?: number): Promise<Array<{
        doc: BlockMeta;
        score: number;
    }>>;
    /** 返回所有已索引的 knowledge block 元数据 */
    list(): BlockMeta[];
    /** 返回索引统计 */
    stats(): EngineStats;
    /** 手动重建索引（重新扫描目录） */
    refresh(): void;
    /**
     * 直接喂入 blocks 列表并重建索引（不扫描目录）
     * 用于 fractal 从缓存取 blocks 后直接搜索，避免重复 IO
     */
    feedBlocks(blocks: BlockMeta[]): void;
    /**
     * 解析 HTML 注释元数据
     * 格式：<!-- key: value -->
     * @param maxIndex 仅解析前 N 个字符，防止扫描全文件
     */
    static parseMeta(content: string, maxIndex?: number): Record<string, string> | null;
    /**
     * 扫描目录下的所有 .md 文件（兼容 flat + status 子目录）
     * 返回 { fileName, content, relPath }
     */
    static scanDir(dirPath: string): Array<{
        fileName: string;
        content: string;
        relPath: string;
    }>;
    /** 扫描所有目录并解析元数据 */
    private _scanAll;
    /** 把所有有 description 的 blocks 构建到 BM25 索引 */
    private _buildIndex;
    /** 将内部 SearchDoc 转换为 BlockMeta（搜索结果映射） */
    private _docToBlockMeta;
}
