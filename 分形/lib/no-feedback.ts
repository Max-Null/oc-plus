/**
 * 触发线 2 扩展：无反馈环检测状态管理（独立模块，便于单元测试）
 *
 * 职责：
 * - 状态读写（.no-feedback-loop.json）
 * - 跨会话重置逻辑
 * - 计数更新（edit 无 bash 递增 / bash 重置）
 * - 阈值判断（consecutiveTurns >= NO_FEEDBACK_THRESHOLD 时注入警告）
 *
 * 为什么独立：逻辑曾在 fractal.ts 内部不可测（V3.8.2 迁移后计数在跑但注入
 * 是 dead code 的回归，2026-08-05 修复时抽出，保证可测试性）。
 */

import fs from "node:fs";

/** 连续无反馈环阈值：达到即注入"缺少反馈环"警告 */
export const NO_FEEDBACK_THRESHOLD = 3;

export interface NoFeedbackState {
  consecutiveTurns: number; // 连续无反馈环的轮数
  lastSessionId: string;
  updatedAt: string;
}

/** 默认空状态（文件不存在或解析失败时兜底） */
export function emptyNoFeedbackState(): NoFeedbackState {
  return { consecutiveTurns: 0, lastSessionId: "", updatedAt: "" };
}

/**
 * 读取无反馈环状态；文件缺失/解析失败 → 返回空状态（不抛异常）
 * @param filePath 状态文件路径（注入以便测试）
 */
export function readNoFeedbackState(filePath: string): NoFeedbackState {
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        consecutiveTurns: Number(raw.consecutiveTurns) || 0,
        lastSessionId: String(raw.lastSessionId || ""),
        updatedAt: String(raw.updatedAt || ""),
      };
    }
  } catch { /* 静默 */ }
  return emptyNoFeedbackState();
}

/**
 * 写入无反馈环状态（自动更新 updatedAt 时间戳）
 * @param filePath 状态文件路径（注入以便测试）
 */
export function saveNoFeedbackState(filePath: string, state: NoFeedbackState) {
  try {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  } catch { /* 静默 */ }
}

/**
 * 跨会话重置：会话变化（或首次初始化 lastSessionId 为空）时清空计数
 * @param state 当前状态
 * @param sessionId 当前会话 ID（为空时跳过判断，避免事件缺省误清计数）
 * @returns 重置后的新状态
 */
export function resetForNewSession(state: NoFeedbackState, sessionId: string): NoFeedbackState {
  const sid = sessionId || "";
  if (sid && state.lastSessionId !== sid) {
    return { ...state, consecutiveTurns: 0, lastSessionId: sid };
  }
  return state;
}

/**
 * 计数更新：上轮有 edit 但无 bash → 递增；有 bash → 重置；无 edit → 保持
 * @param state 当前状态
 * @param editsThisTurn 上轮 edit 次数
 * @param bashCalledThisTurn 上轮是否有 bash 执行（反馈环存在的证据）
 * @returns 更新后的新状态
 */
export function updateNoFeedbackCount(
  state: NoFeedbackState,
  editsThisTurn: number,
  bashCalledThisTurn: boolean,
): NoFeedbackState {
  if (editsThisTurn > 0 && !bashCalledThisTurn) {
    return { ...state, consecutiveTurns: state.consecutiveTurns + 1 };
  }
  if (bashCalledThisTurn) {
    return { ...state, consecutiveTurns: 0 };
  }
  return state;
}

/**
 * 阈值判断：consecutiveTurns 达到阈值时生成警告文本
 * @param consecutiveTurns 当前计数
 * @param threshold 阈值（默认 NO_FEEDBACK_THRESHOLD）
 * @returns 达到阈值返回警告文本，否则 null
 */
export function buildNoFeedbackWarning(consecutiveTurns: number, threshold: number = NO_FEEDBACK_THRESHOLD): string | null {
  if (consecutiveTurns < threshold) return null;
  return (
    `\n## ⚠️ 分形：缺少反馈环\n连续 ${consecutiveTurns} 轮修改代码但未执行测试。` +
    `按照结构化调试流程，先建立反馈环再修复（Phase 1）。` +
    `在下一轮修改代码前，先跑一次相关测试建立"能变红"的反馈环。\n`
  );
}
