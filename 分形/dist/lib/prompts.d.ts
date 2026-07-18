/**
 * 分形 — LLM 分析 prompt 模板
 */
export declare function getSystemPrompt(): string;
export declare function getUserPrompt(existingBlocks: string[], existingTriggers: string[], eventSummaryLength: number, eventSummaryJson: string, memoryPaths: string[]): string;
