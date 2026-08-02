/**
 * 分形 — 事后记忆去重审查器 V1
 *
 * 在记忆保存后定期扫描 blocks/ 和 triggers/，用关键词初筛 + LLM 精确对比找出疑似重复的记忆。
 * 两阶段设计：
 *   阶段 1 — 关键词 Jaccard 重叠率（快速过滤，零 token）
 *   阶段 2 — LLM 语义对比（精确判断，仅在疑似重复时调一次）
 *
 * 触发时机：每 N 轮 system.transform 自动执行（独立于创建层去重，不依赖创建事件追踪）。
 */
export interface DedupState {
    lastCheckTurn: number;
    lastCheckTime: string;
    totalCompared: number;
    duplicatesFound: number;
}
export interface DedupResult {
    itemA: {
        fileName: string;
        label: string;
        memPath: string;
        content: string;
        type: "block" | "trigger";
    };
    itemB: {
        fileName: string;
        label: string;
        memPath: string;
        content: string;
        type: "block" | "trigger";
    };
    keywordOverlap: number;
}
export declare function readDedupState(): DedupState;
export declare function writeDedupState(state: DedupState): void;
/**
 * 执行一轮去重检查。
 * @param turnCounter 当前轮数
 * @param forceCheck 强制执行（无视间隔阈值）
 * @param apiConfig LLM API 配置（如果为 null，只做阶段 1 初筛不做 LLM 调用）
 * @param debugLog 调试日志回调
 * @returns 发现的疑似重复列表
 */
export declare function runDedupCheck(turnCounter: number, forceCheck: boolean, apiConfig: {
    baseURL: string;
    apiKey: string;
    primaryModel: string;
} | null, debugLog: (msg: string) => void, projectDir?: string): Promise<DedupResult[]>;
/**
 * 构建去重提醒消息（供 fractal.ts 注入 user prompt）
 */
export declare function buildDedupReminder(results: DedupResult[]): string;
/**
 * 获取去重检查间隔（供 fractal.ts 在日志中显示）
 */
export declare function getCheckInterval(): number;
