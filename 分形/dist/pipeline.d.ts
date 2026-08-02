/**
 * OC-plus 流水线 — 阶段编排引擎 V1
 *
 * 在行为前门释放后自动串连对齐→设计→计划→编码→交付五个阶段。
 * 提供纯逻辑函数供 fractal.ts 调用，所有状态持久化到 .pipeline-state.json。
 *
 * 阶段流转：
 *   IDLE → ALIGNING（行为前门）→ DESIGNING → PLANNING → IMPLEMENTING → DELIVERING → IDLE
 *
 * 不允许跳过任何阶段。complexity 仅影响文档深度（simple = 要点，complex = 完整模板）。
 */
/** 任务类型（从行为前门对齐中确认，永不自动判断） */
export type TaskType = "web-app" | "plugin" | "document" | "ppt" | "data";
/** 复杂度（影响阶段内的文档深度，不影响是否跳过阶段） */
export type Complexity = "simple" | "complex";
/** 流水线阶段 */
export type PipelineStage = "idle" | "aligning" | "designing" | "planning" | "implementing" | "delivering";
/** 流水线路由 */
export type PipelineRoute = "full" | "direct";
/** 单个阶段的执行状态 */
export interface StageStatus {
    status: "pending" | "active" | "completed" | "skipped";
    startedAt?: string;
    completedAt?: string;
}
/** 行为前门释放时提取的对齐上下文 */
export interface AlignmentContext {
    feature: string;
    taskType: TaskType;
    isExisting: boolean;
    estimatedFiles: number;
    isNewModule: boolean;
    isCrossModule: boolean;
}
/** 流水线持久化状态 */
export interface PipelineState {
    pipelineId: string;
    status: "active" | "completed" | "aborted";
    taskType: TaskType;
    route: PipelineRoute;
    complexity: Complexity;
    context: AlignmentContext;
    currentStage: PipelineStage;
    stages: Record<Exclude<PipelineStage, "idle">, StageStatus>;
    startedAt: string;
    updatedAt: string;
}
/** 对齐共识切割结果 */
export interface AlignmentSections {
    llm: string | null;
    human: string | null;
    degraded: boolean;
}
/**
 * 根据对齐上下文判断任务复杂度。
 * 所有任务都走完整 5 阶段，complexity 仅影响文档深度。
 */
export declare function assessComplexity(ctx: AlignmentContext): Complexity;
/**
 * 从 assistant 消息中提取 AlignmentContext。
 * 匹配「设计对齐」关键字后的 JSON 块。
 * 解析失败返回 null——不阻断流水线，用默认值。
 */
export declare function extractAlignmentContext(message: string): AlignmentContext | null;
/**
 * 从 Agent 门释放消息中切割 LLM 版和人类版对齐共识。
 * 降级策略：LLM 版标记缺失时，从人类版首段提取作为兜底。
 */
export declare function splitAlignmentOutput(message: string): AlignmentSections | null;
/** 检测 Agent 是否输出了「设计完成」信号 */
export declare function checkDesignDoneSignal(message: string): boolean;
/** 检测 Agent 是否输出了 implementing 完成信号（根据任务类型匹配） */
export declare function checkImplementDoneSignal(message: string, taskType: TaskType): boolean;
/** 检测门释放信号（对齐完成，Agent 输出「设计对齐」） */
export declare function checkGateReleaseSignal(message: string): boolean;
/** 读取流水线状态，文件不存在或损坏返回 null */
export declare function readPipelineState(): PipelineState | null;
/** 写入流水线状态（覆盖） */
export declare function writePipelineState(state: PipelineState): void;
/** 清空流水线状态（任务取消或完成后清理） */
export declare function clearPipelineState(): void;
/** 创建新的流水线状态（门释放后调用）
 * @param ctx 对齐上下文
 * @param flashComplexity flash 分类器结果（可选）— simple 时跳过 planning，直接 implementing
 */
export declare function createPipelineState(ctx: AlignmentContext, flashComplexity?: "simple" | "complex"): PipelineState;
/** 获取当前阶段的完成状态 */
export declare function isStageComplete(state: PipelineState, projectDir: string, lastAssistantMessage?: string): boolean;
/** 过渡到下一阶段 */
export declare function transitionToNextStage(state: PipelineState): PipelineState;
/**
 * 获取当前阶段的启动 prompt（注入到 chat 或 system.transform）
 * 返回值：需要注入的文本，或 null（无需注入）
 */
export declare function getStageStartPrompt(state: PipelineState): string | null;
/** 检查用户消息是否要求跳过阶段（一律拒绝） */
export declare function isStageSkipRequest(message: string): boolean;
/** 检查用户消息是否明确取消任务 */
export declare function isTaskCancelRequest(message: string): boolean;
/** 生成逃课拒绝消息 */
export declare function getStageSkipRejection(feature: string): string;
