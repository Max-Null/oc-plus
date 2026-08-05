/**
 * 触发线 2 扩展：无反馈环状态管理单元测试
 *
 * 覆盖：状态读写、跨会话重置、计数更新、阈值警告
 * 运行方式：node --test 分形/no-feedback.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  NO_FEEDBACK_THRESHOLD,
  emptyNoFeedbackState,
  readNoFeedbackState,
  saveNoFeedbackState,
  resetForNewSession,
  updateNoFeedbackCount,
  buildNoFeedbackWarning,
} from "./lib/no-feedback.js";

import type { NoFeedbackState } from "./lib/no-feedback.js";

// ============================================================
// 测试辅助
// ============================================================

/** 构造默认状态 */
function makeState(overrides: Partial<NoFeedbackState> = {}): NoFeedbackState {
  return { consecutiveTurns: 0, lastSessionId: "", updatedAt: "", ...overrides };
}

// ============================================================
// 状态读写
// ============================================================

describe("readNoFeedbackState", () => {
  it("文件不存在 → 返回空状态", () => {
    const state = readNoFeedbackState(path.join(os.tmpdir(), "no-such-file.json"));
    assert.deepEqual(state, { consecutiveTurns: 0, lastSessionId: "", updatedAt: "" });
  });

  it("文件损坏 → 返回空状态（不抛异常）", () => {
    const tmp = path.join(os.tmpdir(), `nf-invalid-${Date.now()}.json`);
    fs.writeFileSync(tmp, "{invalid json", "utf-8");
    try {
      const state = readNoFeedbackState(tmp);
      assert.deepEqual(state, emptyNoFeedbackState());
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  it("正常读取已持久化的状态", () => {
    const tmp = path.join(os.tmpdir(), `nf-read-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ consecutiveTurns: 7, lastSessionId: "ses_abc", updatedAt: "2026-01-01" }), "utf-8");
    try {
      const state = readNoFeedbackState(tmp);
      assert.equal(state.consecutiveTurns, 7);
      assert.equal(state.lastSessionId, "ses_abc");
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
});

describe("saveNoFeedbackState", () => {
  it("写入后重新读取内容一致 + updatedAt 自动更新", () => {
    const tmp = path.join(os.tmpdir(), `nf-save-${Date.now()}.json`);
    try {
      const state = makeState({ consecutiveTurns: 5, lastSessionId: "ses_x" });
      saveNoFeedbackState(tmp, state);
      assert.ok(state.updatedAt.length > 0, "updatedAt 应被写入");
      const loaded = readNoFeedbackState(tmp);
      assert.equal(loaded.consecutiveTurns, 5);
      assert.equal(loaded.lastSessionId, "ses_x");
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
});

// ============================================================
// 跨会话重置
// ============================================================

describe("resetForNewSession", () => {
  it("会话变化 → 清空计数并更新 lastSessionId", () => {
    const state = makeState({ consecutiveTurns: 5, lastSessionId: "ses_a" });
    const next = resetForNewSession(state, "ses_b");
    assert.equal(next.consecutiveTurns, 0);
    assert.equal(next.lastSessionId, "ses_b");
  });

  it("首次初始化（lastSessionId 为空）→ 设置 lastSessionId 并清空", () => {
    const state = makeState({ consecutiveTurns: 3, lastSessionId: "" });
    const next = resetForNewSession(state, "ses_c");
    assert.equal(next.consecutiveTurns, 0);
    assert.equal(next.lastSessionId, "ses_c");
  });

  it("同一会话 → 保持计数不变", () => {
    const state = makeState({ consecutiveTurns: 5, lastSessionId: "ses_a" });
    const next = resetForNewSession(state, "ses_a");
    assert.equal(next.consecutiveTurns, 5);
    assert.equal(next.lastSessionId, "ses_a");
  });

  it("sessionId 为空 → 跳过判断不重置（避免事件缺省误清计数）", () => {
    const state = makeState({ consecutiveTurns: 4, lastSessionId: "ses_a" });
    const next = resetForNewSession(state, "");
    assert.equal(next.consecutiveTurns, 4);
    assert.equal(next.lastSessionId, "ses_a");
  });
});

// ============================================================
// 计数更新
// ============================================================

describe("updateNoFeedbackCount", () => {
  it("有 edit 无 bash → 递增", () => {
    const state = makeState({ consecutiveTurns: 2 });
    const next = updateNoFeedbackCount(state, 3, false);
    assert.equal(next.consecutiveTurns, 3);
  });

  it("有 bash → 重置为 0", () => {
    const state = makeState({ consecutiveTurns: 10 });
    const next = updateNoFeedbackCount(state, 2, true);
    assert.equal(next.consecutiveTurns, 0);
  });

  it("无 edit → 保持", () => {
    const state = makeState({ consecutiveTurns: 2 });
    const next = updateNoFeedbackCount(state, 0, false);
    assert.equal(next.consecutiveTurns, 2);
  });
});

// ============================================================
// 阈值警告
// ============================================================

describe("buildNoFeedbackWarning", () => {
  it("低于阈值 → null（不注入）", () => {
    assert.equal(buildNoFeedbackWarning(2), null);
  });

  it("等于阈值 → 返回警告文本", () => {
    const warning = buildNoFeedbackWarning(3);
    assert.ok(warning);
    assert.ok(warning!.includes("缺少反馈环"));
    assert.ok(warning!.includes("连续 3 轮"));
  });

  it("超过阈值 → 返回警告文本（含实际轮数）", () => {
    const warning = buildNoFeedbackWarning(5);
    assert.ok(warning!.includes("连续 5 轮"));
  });

  it("阈值常量 = 3（设计值）", () => {
    assert.equal(NO_FEEDBACK_THRESHOLD, 3);
  });
});
