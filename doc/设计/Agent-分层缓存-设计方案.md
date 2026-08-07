# Agent 分层缓存优化 — 设计方案

> DeepSeek 全前缀缓存机制下，子 agent 调用命中率从 11-18% 优化到同类连续调用 >50%。
>
> 创建时间：2026-07-30 | 状态：已实施（P0+P1 完成，P2 基线已部署，注入待 OC 支持） | 版本：v1.3

## 一、背景

### 1.1 问题现状

V3.8.2 已将分形 Guardian 的动态注入从 `system.transform` 迁移到 `chat.message`，主 agent（双星）的 DeepSeek 缓存命中率恢复到 99%+。但子 agent（工匠/军师/参谋/助理）调用命中率仅 11-18%，cache_read 固定 14.6K——仅为 fractal 注入的 S1+S2 全局前缀。

### 1.2 根因

OpenCode 的 `task` 工具创建子 agent 时，发送的是**独立 API 调用**，包含全新 system prompt。DeepSeek 的缓存是**严格全前缀匹配**——只要 `messages[0]`（system prompt）与已有缓存单元不同，整个前缀不可命中。

每次子 agent 调用的 system prompt = OC 内建模板(~3K) + S1+S2(14.6K) + agent prompt(~1-3K) + 任务描述(~1K)。其中仅 S1+S2 跨调用稳定，其余部分改变 → 命中率 14.6K/120K ≈ 12%。

### 1.3 社区共识

omo/omo-slim 的结论：**DeepSeek 全前缀缓存与 OC 子 agent 模式物理不兼容**，不可求解。社区策略是分层接受——主 agent 守护缓存，子 agent 用廉价 Flash 模型降低单价。

## 二、方案概述

### 三梯度优化

```
P0: 压缩 agent prompt       → 每次调用省 1-3K tokens（无论是否命中缓存）
P1: 模型分层（按职责）        → 工匠/助理用 Flash，单价降至 1/10
P2: agent-aware 稳定基线     → 同类 agent 连续调用共享前缀，命中率 >50%
P3: 工匠复用主会话 context   → 仅方案文档，不立即实施
```

### 模型重新分配

| agent | 当前 | 改为 | 理由 |
|-------|------|------|------|
| 工匠 | deepseek-v4-pro | **deepseek-v4-flash** | 编码执行（LSP+bash+edit），确定性任务不需推理 |
| 参谋 | deepseek-v4-pro | deepseek-v4-pro | 战术纠偏，判断方向偏离 |
| 军师 | deepseek-v4-pro | deepseek-v4-pro | 战略审查，代码异味分析 |
| 助理 | deepseek-v4-pro | **deepseek-v4-flash** | 关键词匹配 + 替用户发指令，极轻量 |

### P2 缓存原理

每个子 agent 调用是独立 API 请求，有自己的缓存单元。同一 agent 类型的连续调用可共享前缀：

```
请求1(S1+S2+工匠基线+工匠.md+任务A) → 缓存单元A（完整）
请求2(S1+S2+工匠基线+工匠.md+任务B) → 命中A的前缀（工匠基线稳定）
请求3(S1+S2+军师基线+军师.md+任务C) → 全新缓存单元C
请求4(S1+S2+工匠基线+工匠.md+任务D) → 仍命中A的前缀（不受请求3影响）
```

## 三、涉及改动

### P0：压缩 agent prompt（4 文件）

| # | 文件 | 当前行数 | 目标 | 砍什么 |
|---|------|---------|------|--------|
| 1 | `agents/工匠.md` | 53 | ~30 | LSP 速查表缩为 1 行（保留 `prepareCallHierarchy` 前置要求 + `1-based` 位置参数）; 5 步 → 3 步（续接并段、自测+报告合并）; 续接机制从 3 行缩为半句 |
| 2 | `agents/军师.md` | 54 | ~25 | 12 异味表缩为逗号分隔名称列表（保留名称，砍掉判断标准和修复方法，加「定义参考《重构》第 3 章」）; 查证约束砍掉（core-rules S1 已注入）; 审查工匠产出 3 段并 1 段 |
| 3 | `agents/参谋.md` | 27 | ~15 | 审视原则详述保留核心句（删除冗余解释）; 编码规范场景检查并段（从 3 行缩为 1 行）; 查证约束砍掉（同军师） |
| 4 | `agents/助理.md` | 40 | ~20 | 「你不是/你是」双列表合并为一句; 执行流程 4 步 → 2 步; 措辞模板保留一句话（「按**我**的习惯」是核心标记不可丢） |

### P1：模型分层 + 别名机制（3 文件）

**agent 模型分配：**

| # | 文件 | 改动 |
|---|------|------|
| 1 | `agents/工匠.md` | `model: "DS_MODEL_LOW"`（部署时 `deploy.mjs` 替换为真实模型名） |
| 2 | `agents/助理.md` | 同上 |

**模型别名配置（`model-aliases.json` 独立文件，勿写入 `opencode.json`）：**

> ⚠️ 8/8 修正：`modelAliases` 不能放在 `opencode.json` 顶层——OC 严格校验配置（`additionalProperties: false`），未知键 `modelAliases` 会抛 `ConfigInvalidError` 导致启动失败。别名独立为构建期配置文件 `model-aliases.json`（deploy.mjs 读取，OC 不加载）。

```jsonc
// model-aliases.json
{
  "DS_MODEL_LOW": "ds:deepseek-v4-flash",   // 工匠/助理
  "DS_MODEL_HIGH": "ds:deepseek-v4-pro",    // 参谋/军师/双星
  "DS_MODEL_VISION": "moonshotai-cn:kimi-k3"         // 制图师（models.dev 内置）
}
```

fractal 在 `system.transform` 第一轮时读取 `model-aliases.json` 的 `modelAliases`，将 agent frontmatter 中的 `${alias:low}` / `${alias:high}` 替换为实际模型名。替换只在内存中进行（不影响磁盘上的 agent 文件），对 OC 的 agent 加载机制透明。

**换环境只需改一处**：`model-aliases.json` 中修改别名映射，所有 agent 自动跟随。未配置别名 → fractal 打印警告并降级为 `ds/deepseek-v4-pro`。

### P2：agent-aware 稳定基线（3 文件 + 1 新增）

| # | 文件 | 改动类型 |
|---|------|---------|
| 5 | `分形/fractal.ts` | system.transform 新增 agent-aware 注入逻辑：检测当前 agent 类型，注入对应的稳定基线块 |
| 6 | `分形/prompts/agent-baseline-artisan.md` | **新增** — 工匠基线（编码铁律：类型检查、不吞异常、LSP 优先、不委派不规划） |
| 7 | `分形/prompts/agent-baseline-strategist.md` | **新增** — 军师基线（审查铁律：12 异味、查证约束、5 句上限） |
| 8 | `deploy.mjs` | 新增 2 个 baseline 文件的部署步骤 |

## 四、P1 模型别名实现细节

### 4.1 为什么不能用运行时替换

联网查证 OC 机制后确认：

| 路径 | 结论 |
|------|------|
| `agent.transform` | v2 专用 API，v1 插件不支持。fractal 是 v1 插件 |
| `system.transform` 改 model | 不可行。OC 在 hook 触发**之前**已读取 agent.md 的 `model` 字段并选定模型 |
| `session.hook("request")` | v2 专用，且 model 不在可变字段列表中 |

**唯一可行路径：部署时替换**——`deploy.mjs` 在复制 agent.md 到部署目录时，将占位符替换为真实模型名。

### 4.2 配置结构

用户在 `model-aliases.json` 中定义别名映射（独立构建期文件，OC 不加载）：

```jsonc
// model-aliases.json
{
  "DS_MODEL_LOW": "ds:deepseek-v4-flash",   // 工匠/助理
  "DS_MODEL_HIGH": "ds:deepseek-v4-pro",    // 参谋/军师/双星
  "DS_MODEL_VISION": "moonshotai-cn:kimi-k3"         // 制图师（models.dev 内置）
}
```

### 4.3 agent 占位符

agent.md 的 frontmatter 使用大写占位符，部署时被替换：

```yaml
---
model: "DS_MODEL_LOW"    # deploy.mjs 替换为 ds/deepseek-v4-flash
---
```

### 4.4 deploy.mjs 替换逻辑

```
deploy.mjs 启动
  ↓
读 model-aliases.json → 提取别名映射
  ↓
复制 agent.md 时，正则替换：
  DS_MODEL_HIGH → modelAliases.high
  DS_MODEL_LOW  → modelAliases.low
  ↓
部署后的 agent.md 已是真实模型名 → OC 正常加载
```

### 4.5 设计决策

| 决策 | 原因 |
|------|------|
| 部署时替换而非运行时 | OC v1 插件没有 agent.transform，无法在运行时改 model |
| 占位符大写 `DS_MODEL_LOW` | 避免与 YAML 变量语法混淆；故意写死 `_LOW`/`_HIGH` 语义而非通用模板 |
| 部署后 `git status` 不变 | deploy.mjs 输出到 `~/.config/opencode/` 而非项目目录，不改源文件 |
| 换环境只需两步 | 修改 model-aliases.json + 重新 `node deploy.mjs` |

## 五、P2 实现细节

### 5.1 agent 类型识别

在 `system.transform` 中通过 `input.agent` 字段识别当前请求的 agent 类型：

```typescript
const agentName = (input as any).agent || "";
const agentBaseline = (() => {
  if (agentName.includes("工匠") || agentName.includes("artisan"))
    return loadPrompt("agent-baseline-artisan.md", "");
  if (agentName.includes("军师") || agentName.includes("strategist"))
    return loadPrompt("agent-baseline-strategist.md", "");
  return ""; // 参谋/助理/双星：无额外基线
})();
if (agentBaseline) output.system.unshift(agentBaseline); // 插入到 S1 之前
```

### 5.2 注入位置

基线块注入到 **S1 之前**（`unshift` 到 system 数组头部），确保：
- 同类型 agent 的 system prompt 前缀完全一致
- 不影响主 agent（双星）的缓存结构

### 5.3 基线内容原则

- 纯规则，不含角色描述（角色描述是 agent.md 的职责）
- 从对应 agent.md 中**提取**，不是新增规则
- agent.md 改为引用 `（编码铁律见系统前缀，此处仅含角色+流程）`

## 六、预期效果

| 指标 | 当前 | P0 后 | P0+P1 后 | P0+P1+P2 后 |
|------|------|-------|----------|-------------|
| 工匠单次 token 量 | ~120K | ~117K | ~117K（单价 1/10） | ~119K（+2K 基线） |
| 工匠缓存命中率 | 12% | 12% | 12% | **>50%**（同类连续调用） |
| 军师缓存命中率 | 12% | 12% | 12% | **>50%**（同类连续调用） |
| 参谋调用成本 | pro 单价 | pro 单价 | pro 单价 | pro 单价（无变化，基线不适用） |
| 助理调用成本 | pro 单价 | pro 单价 | **flash 单价（1/10）** | flash 单价（基线不适用） |
| 主 agent 命中率 | 99% | 99% | 99% | 99%（不受影响） |

## 七、验证方法

1. **P0 验证**：`git diff` 检查 agent.md 行数变化 → 确认 30-50% 压缩
2. **P1 验证**：检查 agent.md 的 `model` 字段 → 确认工匠/助理改为 flash
3. **P2 验证**：
   - 部署后触发 3 次工匠调用 → events.log 中第 2/3 次 cache_read > 50K（vs 当前 14.6K）
   - 部署后触发 1 次工匠接 1 次军师 → 第 2 次（军师）cache_read 仍 14.6K（不同基线）

## 八、风险与边界

| 风险 | 影响 | 缓解 |
|------|------|------|
| 别名未配置 | `model-aliases.json` 缺失/无别名 → deploy.mjs 打印警告并使用内置默认值 `ds/deepseek-v4-pro` / `ds/deepseek-v4-flash` | `model-aliases.json.example` 预填默认值；deploy.mjs 输出醒目的 WARN 日志 |
| 部署后未重新 deploy | 修改 model-aliases.json 后忘记重新部署 → 已部署的 agent.md 仍用旧模型名 | deploy.mjs 在替换占位符时写入 `.deploy-version` 标记文件，fractal 首轮校验一致性，不一致打印警告 |
| Flash 模型编码质量不如 Pro | 工匠生成代码质量下降 | 观察。工匠是执行者而非设计者，Flash 的 SWE-bench 79% 对确定性任务足够 |
| 基线块增加 token 量 | 每次调用多 2K tokens | 仅工匠/军师有基线，且压缩 agent.md 抵消增量 |
| `input.agent` 字段不稳定 | agent 识别失败 = 基线不注入 | 降级为当前行为（不崩溃） |

## 九、P3 预研方向

工匠复用主会话 context：OC 的 task 工具如果能传递主会话的 system prompt + 仅追加子 agent 指令，则工匠可以共享主 agent 的完整缓存前缀（命中率 ≈ 主 agent 的 99%）。涉及 OC 源码级别的 task 工具改造，先输出方案文档评估可行性。

## 十、变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.3 | 2026-08-08 | 修正配置载体：`modelAliases` 独立为 `model-aliases.json`（写在 `opencode.json` 会触发 OC ConfigInvalidError 启动失败——8/8 实际踩坑）；deploy.mjs 读取路径、example 模板、风险表同步更新 |
| v1.2 | 2026-07-30 | 联网查证 OC v1 插件机制后修正 P1 方案：`${alias:low}` 运行时替换不可行（OC 在 hook 前已读 model），改为 `DS_MODEL_LOW` 占位符 + `deploy.mjs` 部署时替换；风险表新增「部署后未重新 deploy」风险 |
| v1.1 | 2026-07-30 | P0 压缩方案 3 处风险修正（工匠 LSP 速查保留关键行、军师 12 异味保留名称清单、助理措辞模板保留）; P1 新增模型别名机制（`${alias:low/high}` + opencode.json 映射）; P1 验证方法补充别名未配置降级 |
| v1.0 | 2026-07-30 | 初版：P0 压缩 + P1 模型分层 + P2 agent-aware 基线 + P3 预研方向 |
