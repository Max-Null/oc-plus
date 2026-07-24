# OC-plus 流水线 V1 实施计划

> 来源：`~/.config/opencode/plans/2026-07-24-1800-oc-plus-pipeline.md`
> 创建时间：2026-07-24

---

## 一、任务总览

| # | 任务 | 类型 | 优先级 | 依赖 | 预估工作量 |
|---|------|------|--------|------|-----------|
| 1 | 新增 `分形/pipeline.ts` | 新增文件 | 🔴 高 | 无 | ~150 行 |
| 2 | 新增 `分形/prompts/pipeline-stage-designing.md` | 新增文件 | 🔴 高 | 任务 1 | ~50 行 |
| 3 | 新增 `分形/prompts/pipeline-stage-planning.md` | 新增文件 | 🔴 高 | 任务 1 | ~30 行 |
| 4 | 新增 `分形/pipeline.test.ts` | 新增文件 | 🔴 高 | 任务 1 | ~100 行 |
| 5 | 修改 `分形/fractal.ts` | 修改文件 | 🔴 高 | 任务 1-3 | ~40 行 |
| 6 | 修改 `技能/mxy-design-doc/SKILL.md` | 修改文件 | 🟡 中 | 任务 5 | ~20 行 |

---

## 二、任务 1：新增 pipeline.ts

### 2.1 文件路径

`D:\Project\oc-plus\分形\pipeline.ts`

### 2.2 包含内容

| 模块 | 行数 | 内容 |
|------|------|------|
| `TaskType` 枚举 | 5 | web-app / plugin / document / ppt / data |
| `Complexity` 类型 | 3 | simple / complex |
| `PipelineState` 接口 | 25 | pipelineId / status / route / context / currentStage / stages / timestamps |
| `AlignmentContext` 接口 | 10 | feature / taskType / isExisting / estimatedFiles / isNewModule / isCrossModule |
| `StageStatus` 接口 | 5 | status / startedAt / completedAt |
| `assessComplexity(ctx)` | 15 | 纯逻辑函数，4 条判断规则 |
| `extractAlignmentContext(msg)` | 25 | 正则提取 JSON + 降级处理 |
| `splitAlignmentOutput(msg)` | 20 | Section 切割（LLM_SECTION / HUMAN_SECTION） |
| `checkImplementDone(msg)` | 5 | 正则匹配 `### 编码完成` |
| `checkDesignDone(msg)` | 5 | 正则匹配 `### 设计完成` |
| `readPipelineState()` | 10 | 读 `.pipeline-state.json`，JSON 解析失败返回 null |
| `writePipelineState(state)` | 10 | 写 `.pipeline-state.json` |
| `clearPipelineState()` | 5 | 删 `.pipeline-state.json` |
| `checkStageCompletion(state, lastMsg)` | 15 | 根据 currentStage 调用对应检测函数 |
| `transitionToNextStage(state)` | 20 | 阶段过渡 + 注入 prompt |

### 2.3 验证方式

- 运行 `node --test 分形/pipeline.test.ts` 或 `npx vitest run 分形/pipeline.test.ts`
- 手动构造各种 `AlignmentContext` 输入，验证 `assessComplexity()` 返回值
- 手动调用 `splitAlignmentOutput()` 验证两种 Section 都能解析

---

## 三、任务 2：新增 pipeline-stage-designing.md

### 3.1 文件路径

`D:\Project\oc-plus\分形\prompts\pipeline-stage-designing.md`

### 3.2 Prompt 模板内容

行为前门对齐完成后，注入到 system.transform 的设计阶段启动指令。

核心要点：
- 告知当前任务名称 + 任务类型（从 AlignmentContext.taskType 读取）
- 根据 `taskType` 路由到对应产出：web-app → 设计方案 + 原型 / plugin → 设计方案 / document → 大纲 / ppt → 页面结构 / data → 查询计划
- 提醒调用 `mxy-design-doc` skill
- 完成后输出 `### 设计完成` 信号

---

## 四、任务 3：新增 pipeline-stage-planning.md

### 4.1 文件路径

`D:\Project\oc-plus\分形\prompts\pipeline-stage-planning.md`

### 4.2 Prompt 模板内容

设计方案确认后，注入到 system.transform 的计划阶段启动指令。

核心要点：
- 告知当前任务名称 + 设计方案位置
- 要求拆解为具体实施任务（每步 2-5 分钟）
- 写入 `~/.config/opencode/plans/` 目录
- 完成后输出「计划已完成」信号

---

## 五、任务 4：新增 pipeline.test.ts

### 5.1 文件路径

`D:\Project\oc-plus\分形\pipeline.test.ts`

### 5.2 测试用例清单

#### 单元测试

| # | 用例 | 被测函数 | 预期 |
|---|------|---------|------|
| 1 | 已有功能迭代 | `assessComplexity` | `"complex"` |
| 2 | 跨模块改动 | `assessComplexity` | `"complex"` |
| 3 | 新模块 | `assessComplexity` | `"complex"` |
| 4 | ≥3 文件 | `assessComplexity` | `"complex"` |
| 5 | 纯新 1 文件小功能 | `assessComplexity` | `"simple"` |
| 6 | 正常 JSON 解析 | `extractAlignmentContext` | 返回正确对象 |
| 7 | JSON 格式错误 | `extractAlignmentContext` | `null` |
| 8 | 无匹配关键字 | `extractAlignmentContext` | `null` |
| 9 | 正常双 Section | `splitAlignmentOutput` | llm + human 均非空 |
| 10 | 缺 LLM Section | `splitAlignmentOutput` | llm 从 human 首段降级提取 |
| 11 | 编码完成信号 | `checkImplementDone` | `true` |
| 12 | 无信号 | `checkImplementDone` | `false` |

#### 集成测试

| # | 用例 | 预期 |
|---|------|------|
| 13 | 状态文件读写一致性 | 读出的 = 写入的 |
| 14 | 状态文件损坏 | `readPipelineState()` 返回 `null` |
| 15 | 完整 5 阶段流转 | 从 aligning 一路到 completed |

---

## 六、任务 5：修改 fractal.ts

### 6.1 文件路径

`D:\Project\oc-plus\分形\fractal.ts`

### 6.2 改动点

| # | 位置 | 改动内容 | 行数 |
|---|------|---------|------|
| ① | 行为前门释放后的 event hook | 调用 `pipeline.onGateRelease(ctx)` | ~10 行 |
| ② | system.transform 注入 | 增加流水线阶段检测 + 注入对应 prompt | ~15 行 |
| ③ | 触发线 1 `flushReviewQueue` | 增加文档/测试存在性检查维度 | ~10 行 |
| ④ | message.updated event | 检测 Agent 输出中的 Section 标记（LLM_SECTION / HUMAN_SECTION / 编码完成 / 设计完成）→ 调用 pipeline 对应函数 | ~15 行 |

### 6.3 关键约束

- 不修改触发线 2、4、5 的任何逻辑
- 不修改行为前门的质询逻辑（只改释放后的 hook）
- 所有流水线逻辑通过 `pipeline.ts` 的导出来调用，fractal.ts 只做接入

---

## 七、任务 6：修改 mxy-design-doc SKILL.md

### 7.1 文件路径

`D:\Project\oc-plus\技能\mxy-design-doc\SKILL.md`

### 7.2 改动内容

在 skill 入口增加任务类型判断逻辑：

```
输入参数增加 taskType 字段（从 pipeline 阶段注入的 prompt 中读取）
根据 taskType 选择产出模板：
  web-app  → 设计方案.md + 原型文档.md
  plugin   → 仅设计方案.md
  document → 大纲 + 草稿
  ppt      → 大纲 + 页面结构
  data     → 查询计划 + 报表模板
```

### 7.3 关键约束

- 永不自动判断任务类型，只从传入的 taskType 读取
- 保持现有模板格式不变，仅增加类型路由

---

## 八、执行顺序

```
任务 1 (pipeline.ts)
   ├── 任务 2 (pipeline-stage-designing.md)
   ├── 任务 3 (pipeline-stage-planning.md)
   └── 任务 4 (pipeline.test.ts)
         │
         ▼
任务 5 (修改 fractal.ts，依赖 1-4)
         │
         ▼
任务 6 (修改 mxy-design-doc SKILL.md，依赖 5)
         │
         ▼
运行全量测试 → 确认通过
```

任务 2、3、4 可在任务 1 完成后并行启动。

---

## 九、验证清单（完成后逐项确认）

- [ ] `assessComplexity()` 所有用例通过
- [ ] `extractAlignmentContext()` 正常 + 异常用例通过
- [ ] `splitAlignmentOutput()` 双 Section + 降级用例通过
- [ ] 阶段检测函数（checkDesignDone / checkImplementDone）通过
- [ ] 状态文件读写 + 损坏恢复通过
- [ ] 完整 5 阶段流转集成测试通过
- [ ] fractal.ts 改动不破坏现有触发线（1/2/4/5 功能正常）
- [ ] mxy-design-doc 正确路由到对应任务类型模板
- [ ] 手动 E2E：完整走一遍"用户登录"从门释放到提交的流程
