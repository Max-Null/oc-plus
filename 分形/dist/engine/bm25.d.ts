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
    filePath: string;
    fileName: string;
    title: string;
    description: string;
    body: string;
}
/** 搜索结果 */
export interface SearchResult {
    doc: SearchDoc;
    score: number;
}
export declare class BM25Index {
    /** 文档存储：path → SearchDoc */
    private docs;
    /** 倒排索引：term → [{docPath, termFreq}] */
    private inverted;
    /** 文档长度（token 数） */
    private lengths;
    /** 总文档数 */
    private N;
    /** 平均文档长度 */
    private avgdl;
    /** 添加/更新一篇文档到索引 */
    index(doc: SearchDoc): void;
    /** 搜索：返回 top-K 结果 */
    search(query: string, topK?: number): SearchResult[];
    /** 从索引中删除一篇文档 */
    remove(filePath: string): void;
    /** 获取文档数 */
    get size(): number;
    /** 重建索引（清空后批量添加） */
    rebuild(docs: SearchDoc[]): void;
    private _removeDoc;
    private _updateAvgdl;
}
/**
 * 简单分词：空格/标点分割 + CJK 2-gram 分字
 *
 * 策略：
 * - 英文：按空白和标点分词，转小写
 * - 中文：2-gram 滑动窗口（"数据库慢了" → ["数据","据库","库慢","慢了"]）
 *   + 也保留完整词（如 "性能慢"），2-gram 保证子串匹配
 * - 去停用词：单字符的英文/数字跳过
 */
export declare function tokenize(text: string): string[];
