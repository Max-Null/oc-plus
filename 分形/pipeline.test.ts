/**
 * OC-plus 流水线 — 单元测试 + 集成测试
 *
 * 运行方式：node --test 分形/pipeline.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  assessComplexity,
  extractAlignmentContext,
  splitAlignmentOutput,
  checkDesignDoneSignal,
  checkImplementDoneSignal,
  checkGateReleaseSignal,
  createPipelineState,
  readPipelineState,
  writePipelineState,
  clearPipelineState,
  isStageComplete,
  transitionToNextStage,
  isStageSkipRequest,
  isTaskCancelRequest,
} from "./pipeline.js";

import type { AlignmentContext, PipelineState } from "./pipeline.js";

// ============================================================
// 测试辅助
// ============================================================

const MEMORIES_DIR = path.join(os.homedir(), ".config", "opencode", "memories");
const TEST_FEATURE = "测试功能-流水线";

/** 构造默认 AlignmentContext */
function makeCtx(overrides: Partial<AlignmentContext> = {}): AlignmentContext {
  return {
    feature: "测试功能",
    taskType: "web-app",
    isExisting: false,
    estimatedFiles: 1,
    isNewModule: false,
    isCrossModule: false,
    ...overrides,
  };
}

// ============================================================
// 单元测试：assessComplexity()
// ============================================================

describe("assessComplexity()", () => {
  // 已有功能迭代 → complex
  it("已有功能迭代 → complex", () => {
    assert.strictEqual(assessComplexity(makeCtx({ isExisting: true, estimatedFiles: 1 })), "complex");
  });

  // 跨模块 → complex
  it("跨模块 → complex", () => {
    assert.strictEqual(assessComplexity(makeCtx({ isCrossModule: true, estimatedFiles: 2 })), "complex");
  });

  // 新模块 → complex
  it("新模块 → complex", () => {
    assert.strictEqual(assessComplexity(makeCtx({ isNewModule: true, estimatedFiles: 2 })), "complex");
  });

  // ≥3 文件 → complex
  it("≥3 文件 → complex", () => {
    assert.strictEqual(assessComplexity(makeCtx({ estimatedFiles: 3 })), "complex");
  });

  // 纯新小功能 → simple
  it("纯新 1 文件小功能 → simple", () => {
    assert.strictEqual(assessComplexity(makeCtx({ estimatedFiles: 1, isNewModule: false })), "simple");
  });
});

// ============================================================
// 单元测试：extractAlignmentContext()
// ============================================================

describe("extractAlignmentContext()", () => {
  // 正常 JSON 解析
  it("正常 JSON 解析 → 返回正确对象", () => {
    const msg = [
      "设计对齐，开始实现",
      "",
      "```json",
      '{"feature":"用户登录","taskType":"web-app","isExisting":false,"estimatedFiles":5,"isNewModule":true,"isCrossModule":false}',
      "```",
    ].join("\n");
    const ctx = extractAlignmentContext(msg);
    assert.ok(ctx);
    assert.strictEqual(ctx!.feature, "用户登录");
    assert.strictEqual(ctx!.taskType, "web-app");
    assert.strictEqual(ctx!.isExisting, false);
    assert.strictEqual(ctx!.estimatedFiles, 5);
    assert.strictEqual(ctx!.isNewModule, true);
    assert.strictEqual(ctx!.isCrossModule, false);
  });

  // 最小 JSON（只有 feature 字段）
  it("最小 JSON → 默认值补全", () => {
    const msg = '设计对齐\n```json\n{"feature":"最短"}\n```';
    const ctx = extractAlignmentContext(msg);
    assert.ok(ctx);
    assert.strictEqual(ctx!.feature, "最短");
    assert.strictEqual(ctx!.taskType, "web-app"); // 默认
    assert.strictEqual(ctx!.estimatedFiles, 1);   // 默认
  });

  // JSON 格式错误
  it("JSON 格式错误 → null", () => {
    const msg = "设计对齐，开始实现\n```json\n{bad json}\n```";
    assert.strictEqual(extractAlignmentContext(msg), null);
  });

  // 无匹配关键字
  it("无匹配关键字 → null", () => {
    assert.strictEqual(extractAlignmentContext("普通消息，没有对齐标记"), null);
  });

  // 无效 taskType → 默认 web-app
  it("无效 taskType → 默认 web-app", () => {
    const msg = '设计对齐\n```json\n{"feature":"测试","taskType":"invalid"}\n```';
    const ctx = extractAlignmentContext(msg);
    assert.ok(ctx);
    assert.strictEqual(ctx!.taskType, "web-app");
  });
});

// ============================================================
// 单元测试：splitAlignmentOutput()
// ============================================================

describe("splitAlignmentOutput()", () => {
  // 正常双 Section
  it("正常双 Section → 均非空", () => {
    const msg = [
      "设计对齐，开始实现",
      "<!-- LLM_SECTION_START -->",
      "- 认证: JWT + refresh",
      "- 不做OAuth ← 外部依赖不可用",
      "<!-- LLM_SECTION_END -->",
      "",
      "<!-- HUMAN_SECTION_START -->",
      "## 关键决策",
      "详细的决策描述...",
      "<!-- HUMAN_SECTION_END -->",
    ].join("\n");
    const result = splitAlignmentOutput(msg);
    assert.ok(result);
    assert.ok(result!.llm);
    assert.ok(result!.human);
    assert.strictEqual(result!.degraded, false);
    assert.ok(result!.llm!.includes("JWT"));
    assert.ok(result!.human!.includes("关键决策"));
  });

  // 缺 LLM Section → 降级从人类版提取
  it("缺 LLM Section → 降级提取 + degraded=true", () => {
    const msg = [
      "设计对齐，开始实现",
      "<!-- HUMAN_SECTION_START -->",
      "- 认证: 用户名+JWT",
      "- 不做OAuth",
      "- 硬约束: bcrypt",
      "详细描述如下...",
      "<!-- HUMAN_SECTION_END -->",
    ].join("\n");
    const result = splitAlignmentOutput(msg);
    assert.ok(result);
    assert.strictEqual(result!.degraded, true);
    assert.ok(result!.llm); // 降级后 LLM 版不应为空
    assert.ok(result!.human);
    assert.ok(result!.llm!.includes("认证")); // 应该有 bullet 内容
  });

  // 无任何 Section
  it("无任何 Section → null", () => {
    assert.strictEqual(splitAlignmentOutput("普通消息"), null);
  });
});

// ============================================================
// 单元测试：阶段完成信号检测
// ============================================================

describe("阶段完成信号检测", () => {
  it("「### 设计完成」→ true", () => {
    assert.strictEqual(checkDesignDoneSignal("### 设计完成"), true);
    assert.strictEqual(checkDesignDoneSignal("部分文本 ### 设计完成 后文"), true);
  });

  it("无信号 → false", () => {
    assert.strictEqual(checkDesignDoneSignal("还在设计中..."), false);
  });

  it("「### 编码完成」→ true", () => {
    assert.strictEqual(checkImplementDoneSignal("### 编码完成\n```json\n{}\n```"), true);
  });

  it("门释放「设计对齐」→ true", () => {
    assert.strictEqual(checkGateReleaseSignal("设计对齐，开始实现"), true);
  });

  it("无门释放信号 → false", () => {
    assert.strictEqual(checkGateReleaseSignal("开始编码"), false);
  });
});

// ============================================================
// 单元测试：异常处理辅助函数
// ============================================================

describe("异常处理辅助函数", () => {
  it("用户说「跳过设计」→ stage skip 检测", () => {
    assert.strictEqual(isStageSkipRequest("算了跳过设计文档直接改代码吧"), true);
    assert.strictEqual(isStageSkipRequest("不写设计文档了"), true);
    assert.strictEqual(isStageSkipRequest("直接编码"), true);
  });

  it("正常消息不触发 skip", () => {
    assert.strictEqual(isStageSkipRequest("设计方案写完了"), false);
    assert.strictEqual(isStageSkipRequest("继续下一步"), false);
  });

  it("「取消任务」→ cancel 检测", () => {
    assert.strictEqual(isTaskCancelRequest("取消任务"), true);
    assert.strictEqual(isTaskCancelRequest("放弃这个任务"), true);
    assert.strictEqual(isTaskCancelRequest("不做这个了"), true);
  });
});

// ============================================================
// 集成测试：状态文件读写
// ============================================================

describe("流水线状态文件操作", () => {
  // 测试前清理
  before(() => {
    clearPipelineState();
  });

  // 测试后清理
  after(() => {
    clearPipelineState();
  });

  it("写 → 读 → 一致性", () => {
    const ctx = makeCtx({ feature: "集成测试功能" });
    const state = createPipelineState(ctx);

    writePipelineState(state);
    const restored = readPipelineState();
    assert.ok(restored);
    assert.strictEqual(restored!.pipelineId, state.pipelineId);
    assert.strictEqual(restored!.currentStage, "designing");
    assert.strictEqual(restored!.context.feature, "集成测试功能");
    assert.strictEqual(restored!.complexity, "simple");
  });

  it("文件不存在 → null", () => {
    clearPipelineState();
    assert.strictEqual(readPipelineState(), null);
  });

  it("clearPipelineState → 文件删除", () => {
    const state = createPipelineState(makeCtx());
    writePipelineState(state);
    assert.ok(readPipelineState());
    clearPipelineState();
    assert.strictEqual(readPipelineState(), null);
  });
});

// ============================================================
// 集成测试：完整 5 阶段流转
// ============================================================

describe("完整流水线流转", () => {
  it("aligning → designing → planning → implementing → delivering → completed", () => {
    const ctx = makeCtx({ feature: "完整流转测试" });
    const state = createPipelineState(ctx);

    // 初始状态：aligning 已完成，designing 激活
    assert.strictEqual(state.currentStage, "designing");
    assert.strictEqual(state.status, "active");
    assert.strictEqual(state.stages.designing.status, "active");

    // ↓ designing → planning
    const state2 = transitionToNextStage(state);
    assert.strictEqual(state2.currentStage, "planning");
    assert.strictEqual(state2.stages.designing.status, "completed");

    // ↓ planning → implementing
    const state3 = transitionToNextStage(state2);
    assert.strictEqual(state3.currentStage, "implementing");
    assert.strictEqual(state3.stages.planning.status, "completed");

    // ↓ implementing → delivering
    const state4 = transitionToNextStage(state3);
    assert.strictEqual(state4.currentStage, "delivering");
    assert.strictEqual(state4.stages.implementing.status, "completed");

    // ↓ delivering → completed
    const state5 = transitionToNextStage(state4);
    assert.strictEqual(state5.currentStage, "idle");
    assert.strictEqual(state5.status, "completed");
    assert.strictEqual(state5.stages.delivering.status, "completed");
  });

  it("createPipelineState 根据 complexity 生成正确 stages", () => {
    const simpleCtx = makeCtx({ feature: "简单功能", estimatedFiles: 1 });
    const simpleState = createPipelineState(simpleCtx);
    assert.strictEqual(simpleState.complexity, "simple");

    const complexCtx = makeCtx({ feature: "复杂功能", isExisting: true, estimatedFiles: 5 });
    const complexState = createPipelineState(complexCtx);
    assert.strictEqual(complexState.complexity, "complex");
  });
});
