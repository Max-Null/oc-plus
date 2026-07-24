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

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ============================================================
// 类型定义
// ============================================================

/** 任务类型（从行为前门对齐中确认，永不自动判断） */
export type TaskType = "web-app" | "plugin" | "document" | "ppt" | "data";

/** 复杂度（影响阶段内的文档深度，不影响是否跳过阶段） */
export type Complexity = "simple" | "complex";

/** 流水线阶段 */
export type PipelineStage = "idle" | "aligning" | "designing" | "planning" | "implementing" | "delivering";

/** 流水线路由（V1 只有 full——所有任务走完整 5 阶段） */
export type PipelineRoute = "full";

/** 单个阶段的执行状态 */
export interface StageStatus {
  status: "pending" | "active" | "completed";
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
  llm: string | null;    // LLM 版内容（可能为 null，触发降级）
  human: string | null;  // 人类版内容
  degraded: boolean;     // 是否使用了降级策略
}

// ============================================================
// 路径常量
// ============================================================

const HOME = os.homedir();
const OC_CONFIG = path.join(HOME, ".config", "opencode");
const MEMORIES_DIR = path.join(OC_CONFIG, "memories");
const PIPELINE_STATE_FILE = path.join(MEMORIES_DIR, ".pipeline-state.json");

// ============================================================
// Section 标记常量（Agent 输出格式规范）
// ============================================================

const LLM_SECTION_START = "<!-- LLM_SECTION_START -->";
const LLM_SECTION_END = "<!-- LLM_SECTION_END -->";
const HUMAN_SECTION_START = "<!-- HUMAN_SECTION_START -->";
const HUMAN_SECTION_END = "<!-- HUMAN_SECTION_END -->";

/** 阶段完成信号关键字 */
const DESIGN_DONE_RE = /### 设计完成/;
const IMPLEMENT_DONE_RE = /### 编码完成/;

/** 门释放确认关键字（与 fractal.ts isAlignmentConfirmation 保持一致） */
const GATE_RELEASE_RE = /设计对齐/;

// ============================================================
// 阶段顺序
// ============================================================

const STAGE_ORDER: PipelineStage[] = [
  "idle",
  "aligning",
  "designing",
  "planning",
  "implementing",
  "delivering",
];

// ============================================================
// 复杂度判断（纯逻辑，不调 LLM）
// ============================================================

/**
 * 根据对齐上下文判断任务复杂度。
 * 所有任务都走完整 5 阶段，complexity 仅影响文档深度。
 */
export function assessComplexity(ctx: AlignmentContext): Complexity {
  // 已有功能迭代、跨模块、新模块、≥3 文件 → 复杂
  if (ctx.isExisting || ctx.isCrossModule || ctx.isNewModule || ctx.estimatedFiles >= 3) {
    return "complex";
  }
  return "simple";
}

// ============================================================
// AlignmentContext 提取（从 Agent 门释放消息中解析 JSON）
// ============================================================

/**
 * 从 assistant 消息中提取 AlignmentContext。
 * 匹配「设计对齐」关键字后的 JSON 块。
 * 解析失败返回 null——不阻断流水线，用默认值。
 */
export function extractAlignmentContext(message: string): AlignmentContext | null {
  // 宽松匹配：设计对齐 + 后续 ```json 块
  const match = message.match(/设计对齐[\s\S]*?```json\s*([\s\S]*?)\s*```/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    return {
      feature: String(parsed.feature || "未知功能"),
      taskType: validateTaskType(parsed.taskType),
      isExisting: Boolean(parsed.isExisting),
      estimatedFiles: Number(parsed.estimatedFiles) || 1,
      isNewModule: Boolean(parsed.isNewModule),
      isCrossModule: Boolean(parsed.isCrossModule),
    };
  } catch {
    // JSON 解析失败——静默降级
    return null;
  }
}

function validateTaskType(raw: unknown): TaskType {
  const valid: TaskType[] = ["web-app", "plugin", "document", "ppt", "data"];
  const s = String(raw || "web-app");
  return valid.includes(s as TaskType) ? (s as TaskType) : "web-app";
}

// ============================================================
// 对齐共识 Section 切割
// ============================================================

/**
 * 从 Agent 门释放消息中切割 LLM 版和人类版对齐共识。
 * 降级策略：LLM 版标记缺失时，从人类版首段提取作为兜底。
 */
export function splitAlignmentOutput(message: string): AlignmentSections | null {
  const llmMatch = extractSection(message, LLM_SECTION_START, LLM_SECTION_END);
  const humanMatch = extractSection(message, HUMAN_SECTION_START, HUMAN_SECTION_END);

  // 两个 Section 都没有 → 不是对齐输出
  if (!llmMatch && !humanMatch) return null;

  let llmContent: string | null = llmMatch;
  let degraded = false;

  // 降级：LLM 版缺失但人类版存在 → 从人类版提取首段 bullets 作为 LLM 版兜底
  if (!llmContent && humanMatch) {
    llmContent = extractFirstBullets(humanMatch);
    degraded = true;
  }

  return {
    llm: llmContent,
    human: humanMatch,
    degraded,
  };
}

/** 从消息中提取被 start/end 标记包裹的内容 */
function extractSection(message: string, startMarker: string, endMarker: string): string | null {
  const startIdx = message.indexOf(startMarker);
  if (startIdx === -1) return null;
  const contentStart = startIdx + startMarker.length;
  const endIdx = message.indexOf(endMarker, contentStart);
  if (endIdx === -1) return null;
  return message.slice(contentStart, endIdx).trim();
}

/** 降级策略：从人类版文本中提取每行以 "- " 开头的首段内容 */
function extractFirstBullets(humanContent: string): string {
  const lines = humanContent.split("\n");
  const bullets: string[] = [];
  let inBulletSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      inBulletSection = true;
      bullets.push(trimmed);
    } else if (inBulletSection && trimmed.length > 0 && !trimmed.startsWith("#")) {
      // 延续行（多行 bullet）
      bullets[bullets.length - 1] += " " + trimmed;
    } else if (inBulletSection && trimmed.length === 0) {
      break; // 空行结束 bullet 段
    }
  }

  return bullets.length > 0
    ? bullets.join("\n")
    : humanContent.slice(0, 500); // 无 bullet 时取前 500 字符兜底
}

// ============================================================
// 阶段完成信号检测
// ============================================================

/** 检测 Agent 是否输出了「设计完成」信号 */
export function checkDesignDoneSignal(message: string): boolean {
  return DESIGN_DONE_RE.test(message);
}

/** 检测 Agent 是否输出了「编码完成」信号 */
export function checkImplementDoneSignal(message: string): boolean {
  return IMPLEMENT_DONE_RE.test(message);
}

/** 检测门释放信号（对齐完成，Agent 输出「设计对齐」） */
export function checkGateReleaseSignal(message: string): boolean {
  return GATE_RELEASE_RE.test(message);
}

// ============================================================
// 流水线状态文件操作
// ============================================================

/** 读取流水线状态，文件不存在或损坏返回 null */
export function readPipelineState(): PipelineState | null {
  try {
    if (!fs.existsSync(PIPELINE_STATE_FILE)) return null;
    const raw = fs.readFileSync(PIPELINE_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as PipelineState;
    // 基础校验：必须包含关键字段
    if (!parsed.pipelineId || !parsed.currentStage || !parsed.stages) return null;
    return parsed;
  } catch {
    // 文件损坏或权限问题——静默降级
    return null;
  }
}

/** 写入流水线状态（覆盖） */
export function writePipelineState(state: PipelineState): void {
  try {
    const dir = path.dirname(PIPELINE_STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(PIPELINE_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // 写入失败静默——流水线可降级为无状态模式
  }
}

/** 清空流水线状态（任务取消或完成后清理） */
export function clearPipelineState(): void {
  try {
    if (fs.existsSync(PIPELINE_STATE_FILE)) {
      fs.unlinkSync(PIPELINE_STATE_FILE);
    }
  } catch {
    // 静默
  }
}

// ============================================================
// 流水线创建与阶段流转
// ============================================================

/** 生成流水线 ID */
function generatePipelineId(feature: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  // 功能名取前 10 个中文字符转拼音首字母（简化：直接用中文截断）
  const shortFeature = feature.slice(0, 15).replace(/\s+/g, "-");
  return `${date}-${time}-${shortFeature}`;
}

/** 创建新的流水线状态（门释放后调用） */
export function createPipelineState(ctx: AlignmentContext): PipelineState {
  const complexity = assessComplexity(ctx);
  const pipelineId = generatePipelineId(ctx.feature);

  const stages: Record<Exclude<PipelineStage, "idle">, StageStatus> = {
    aligning: { status: "completed", completedAt: new Date().toISOString() },
    designing: { status: "active", startedAt: new Date().toISOString() },
    planning: { status: "pending" },
    implementing: { status: "pending" },
    delivering: { status: "pending" },
  };

  return {
    pipelineId,
    status: "active",
    taskType: ctx.taskType,
    route: "full",
    complexity,
    context: ctx,
    currentStage: "designing",
    stages,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** 获取当前阶段的完成状态 */
export function isStageComplete(
  state: PipelineState,
  projectDir: string,
  lastAssistantMessage?: string
): boolean {
  // designing 阶段需要同时检查文件存在 + Agent 信号
  if (state.currentStage === "designing") {
    return checkDesignStageComplete(state, projectDir, lastAssistantMessage);
  }

  // implementing 阶段只检查 Agent 信号
  if (state.currentStage === "implementing") {
    return lastAssistantMessage ? checkImplementDoneSignal(lastAssistantMessage) : false;
  }

  // planning 阶段检查 plans/ 目录下是否存在对应计划文件
  if (state.currentStage === "planning") {
    return checkPlanStageComplete(state);
  }

  // delivering 阶段检查是否有新的 git commit（由触发线 5 机制处理，此处返回 false）
  return false;
}

/** 检查 DESIGNING 阶段是否完成 */
function checkDesignStageComplete(
  state: PipelineState,
  projectDir: string,
  lastMsg?: string
): boolean {
  // 条件 1：设计文件已创建
  const designFile = path.join(projectDir, "doc", "设计", `${state.context.feature}.md`);
  if (!fs.existsSync(designFile)) return false;

  // 条件 2：web-app 类型还需要原型文档
  if (state.taskType === "web-app") {
    const protoFile = path.join(projectDir, "doc", "原型", `${state.context.feature}.md`);
    if (!fs.existsSync(protoFile)) return false;
  }

  // 条件 3：Agent 已输出「设计完成」信号（防文件创建但内容未定稿）
  if (lastMsg && !checkDesignDoneSignal(lastMsg)) return false;

  return true;
}

/** 检查 PLANNING 阶段是否完成 */
function checkPlanStageComplete(state: PipelineState): boolean {
  try {
    const plansDir = path.join(OC_CONFIG, "plans");
    if (!fs.existsSync(plansDir)) return false;
    const files = fs.readdirSync(plansDir).filter(f => f.endsWith(".md"));
    return files.some(f => f.includes(state.context.feature));
  } catch {
    return false;
  }
}

/** 过渡到下一阶段 */
export function transitionToNextStage(state: PipelineState): PipelineState {
  const currentIdx = STAGE_ORDER.indexOf(state.currentStage);
  const nextStage = STAGE_ORDER[currentIdx + 1];

  // 没有下一阶段 → 流水线完成
  if (!nextStage || nextStage === "idle") {
    // 先标记当前阶段完成，再置 completed
    if (state.currentStage !== "idle" && state.currentStage !== "aligning") {
      state.stages[state.currentStage as Exclude<PipelineStage, "idle" | "aligning">].status = "completed";
      state.stages[state.currentStage as Exclude<PipelineStage, "idle">].completedAt = new Date().toISOString();
    }
    state.status = "completed";
    state.currentStage = "idle";
    state.updatedAt = new Date().toISOString();
    writePipelineState(state);
    return state;
  }

  // 完成当前阶段
  if (state.currentStage !== "aligning") {
    if (state.currentStage !== "idle") {
      state.stages[state.currentStage as Exclude<PipelineStage, "idle" | "aligning">].status = "completed";
    }
    // aligning 不单独记录状态（门释放即完成）
  }
  // 记录完成时间（对齐阶段也记录，由上面 completedAt 覆盖）
  if (state.currentStage !== "idle") {
    state.stages[state.currentStage as Exclude<PipelineStage, "idle">].completedAt = new Date().toISOString();
  }

  // 激活下一阶段
  state.currentStage = nextStage;
  state.stages[nextStage as Exclude<PipelineStage, "idle">].status = "active";
  state.stages[nextStage as Exclude<PipelineStage, "idle">].startedAt = new Date().toISOString();
  state.updatedAt = new Date().toISOString();

  writePipelineState(state);
  return state;
}

// ============================================================
// 阶段启动 prompt 模板
// ============================================================

/**
 * 获取当前阶段的启动 prompt（注入到 chat 或 system.transform）
 * 返回值：需要注入的文本，或 null（无需注入）
 */
export function getStageStartPrompt(state: PipelineState): string | null {
  const f = state.context.feature;
  const typeLabel = getTaskTypeLabel(state.taskType);

  switch (state.currentStage) {
    case "designing":
      return [
        `行为前门对齐完成。现在进入**设计阶段**（任务类型：${typeLabel}）。`,
        "",
        `请使用 \`mxy-design-doc\` skill 为「${f}」创建设计方案。`,
        `复杂度：${state.complexity === "simple" ? "简单（要点即可，1-2 段）" : "复杂（完整模板）"}。`,
        "",
        "完成后输出「### 设计完成」信号进入下一阶段。",
      ].join("\n");

    case "planning":
      return [
        `设计方案已确认。现在进入**计划阶段**。`,
        "",
        `请将「${f}」的设计方案拆解为具体实施任务，写入 \`~/.config/opencode/plans/\` 目录。`,
        `每步 2-5 分钟可完成。${state.complexity === "simple" ? "3 步以内即可。" : "需要完整拆解。"}`,
      ].join("\n");

    case "implementing":
      return [
        `计划已确认。现在开始**编码实现**「${f}」。`,
        "",
        "按计划逐步实现，触发线 1 会自动审查每次文件编辑。",
        "编码完成后输出「### 编码完成」信号进入审查阶段。",
        "",
        `注意：${state.complexity === "simple" ? "这是轻量功能，保持实现简洁。" : "这是复杂功能，注意边界处理和测试覆盖。"}`,
      ].join("\n");

    case "delivering":
      return [
        `编码完成。现在进入**交付审查**。`,
        "",
        "请使用 `mxy-commit-review` skill 进行最终审查并提交。",
        "审查通过后流水线自动完成。",
      ].join("\n");

    default:
      return null;
  }
}

function getTaskTypeLabel(type: TaskType): string {
  const labels: Record<TaskType, string> = {
    "web-app": "Web 应用",
    "plugin": "插件/工具",
    "document": "文档",
    "ppt": "PPT",
    "data": "数据分析",
  };
  return labels[type] || "未知";
}

// ============================================================
// 异常处理辅助函数
// ============================================================

/** 检查用户消息是否要求跳过阶段（一律拒绝） */
export function isStageSkipRequest(message: string): boolean {
  return /跳过.*设计|跳过.*文档|跳过.*计划|算了.*不写|不写.*设计|不写.*计划|直接.*改代码|直接.*编码/.test(message);
}

/** 检查用户消息是否明确取消任务 */
export function isTaskCancelRequest(message: string): boolean {
  return /取消任务|放弃.*任务|不做.*了/.test(message);
}

/** 生成逃课拒绝消息 */
export function getStageSkipRejection(feature: string): string {
  return [
    `流水线不可跳阶段。`,
    `「${feature}」小功能设计文档几分钟就写完，大功能不写就是在造屎山。`,
    "如需放弃整个任务，说「取消任务」。",
  ].join("\n");
}
