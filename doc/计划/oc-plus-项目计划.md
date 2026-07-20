# oc-plus 项目计划

> 状态：进行中 · 最后更新：2026-07-20

## 一、当前版本概览

> 版本号在各模块的「变更历史」中记录；此表仅列当前部署状态。

| 模块 | 版本 | 状态 |
|------|------|------|
| 双星系统 | V3.7 | ✅ skill感知 + 修改审查 + 编码工程规范 + 工匠LSP深度 |
| 分形 Guardian Agent | V3.4 | ✅ 五条触发线 + 可配阈值 + 关键词注入 + 默认行为 |
| agents-priority | — | ✅ AGENTS.md 中文规范始终位于 system prompt 最前面 |
| MCP 服务器 | — | ✅ github / websearch / gh_grep / context7（opencode.json 直配，不依赖外部插件） |
| 部署脚本 | V3.5 | ✅ 移除 omo-slim 依赖，新增 MCP 配置提醒 |
| ACP 上下文精简 | latest | ✅ 已安装，OC 内置压缩已禁用 |
| AGENTS.md | — | ✅ 持续维护 |
| CC 规则隔离 | — | ✅ |

---

## 二、分形 Guardian Agent — 待办

### 2.1 已完成

| 版本 | 内容 |
|------|------|
| V2.0 | Plugin 签名升级为 `PluginInput`（拿到 `client`）；system.transform 移除硬编码回应规则；event hook 三层漏斗（glob→LLM→prompt） |
| V2.1 | 元知识记录扩展为手动 + 自主两路触发（含 rubric 正反例） |
| V3.0 | 改名「分形」；Guardian Agent 设计（三条触发线）；归档 V2.0 设计文档 |

### 2.2 触发线实现进度

| 触发线 | 场景 | 检测方式 | 状态 |
|--------|------|---------|------|
| 1. 文件写入匹配 | 写完文件后匹配 trigger | glob 预筛选 + LLM 语义判断 | ✅ |
| 2. 连续无进展循环 | 反复修改不收敛 + 无联网 | 滑动窗口（最近 5 条 tool call）纯规则 | ✅ |
| 3. 上下文压力 | token 用量 > 70% 模型窗口 | 阈值判断纯规则 | ⏸️ ACP 已覆盖核心需求 |
| 4. 主动联网查证 | 凭记忆下断言 + 未联网查证 | ASSERTION_RE + websearch 追踪 + 分级计数器 | ✅ |
| 5. 提交后知识提取 | git commit 完成后提取可记忆知识点 | tool.execute.after 检测 commit → LLM 分析 diff+message → 写入 blocks/ | ✅ |

### 2.3 后续计划

| 阶段 | 优先级 | 内容 |
|------|--------|------|
| F1 反馈闭环 | 短期 | ✅ Guardian 动态阈值；✅ 优化知识注入精准度；记忆反馈循环（pursuit/dismissal）；事件 hook 恢复监控 |
| F2 协同与学习 | 中期 | 多触发线协同避免消息轰炸；跨会话学习；触发线 4 数据闭环（分析命中率、调优衰减算法） |

### 2.4 ACP 借鉴改进清单

> 来源：对比 ACP 架构（`system.transform` + `chat.message.transform` 双通道、命令系统、nudge 频率控制、可定制 prompt 模板），整理四项可借鉴设计。

| # | 改进项 | 说明 | 优先级 |
|---|--------|------|--------|
| 1 | **双通道注入** | 新增 `chat.message` hook，同轮内往消息列表注入警告（触发线 2 循环检测等），比跨轮 system prompt 提醒更即时 | ✅ |
| 2 | **注入频率控制** | 长会话中 knowledge 索引/习惯列表不必每轮都塞，学习 ACP 的 `nudgeFrequency` 做间隔注入 | ✅ |
| 3 | **可定制 prompt 模板** | 注入文案从硬编码抽成外部文件（`~/.config/opencode/fractal-prompts/`），用户可直接编辑 | ✅ |
| 4 | **命令系统 `/fractal`** | `/fractal status`（触发线命中/窗口状态）、`/fractal pause`（暂停某类注入）、`/fractal learn`（手动触发自主学习） | ✅ |

---

## 三、双星系统 — 待办

### 3.1 P1 — skill 感知 + 修改审查（✅ 已完成 2026-07-17）

- [x] 双星 agent 新增 skill 感知：执行任务前先检查 available_skills
- [x] 双星 agent 新增修改审查：改前计划 + 改后验证
- [x] agents-priority 插件：确保 AGENTS.md 中文规范始终位于 system prompt 最前面（omo-slim 已移除，插件功能从"对抗注入"转为"保险前置"）
- [x] deploy.ps1 覆盖分形插件 + agents-priority 部署

### 3.2 P2 — 分形集成优化（✅ 已完成 2026-07-19）

- [x] 双星 agent prompt 中增加「分形 Guardian Agent」指引：收到 `[分形]` 前缀消息时按用户指令处理
- [x] 观察分形 V2.1 LLM 自主学习后，blocks/ 和 triggers/ 的生成质量和频率（blocks: 7 个知识块，5 个 auto，内容覆盖合理；triggers: 空，未生成）
- [ ] 如果 triggers/ 生成了 auto 级别的习惯，验证分形是否正确触发（当前 triggers 为空，需等待分形在实际使用中生成触发规则后验证）

### 3.3 P3 — 待办（✅ 全部完成 2026-07-19）

- [x] **自动化习惯执行**（分形侧）：分形注入时，auto 状态的习惯直接改为指令语气，不再通过 question 工具确认
- [x] **工匠 LSP 深度使用**（工匠侧）：工匠 prompt 补充 goToDefinition / callHierarchy / findReferences 等 LSP 工具用法示例

> 已砍：「分形驱动工作流」（双星不该重复消费分形已注入的知识）、「双星决策链学习」（责任边界模糊，参谋 + 军师 + 触发线 5 已覆盖）

### 3.4 已知问题

- [x] opencode.json 中 `/memories` 命令模板乱码（PowerShell GBK 编码问题），已重命名为 `/fenxing`

### 3.5 P4 — omo-slim 移除后的待验证短板（2026-07-20）

> 背景：oh-my-opencode-slim v2.2.0 插件通过 17 个 hook 修改了 OC 运行时——system prompt 注入、phase reminder、session 管理、agent 权限路由、工具拦截等。移除后双星首次以纯净环境运行，以下能力可能在 omo-slim 辅助下"隐形运转"，需在实际使用中逐项验证是否需要补全。
>
> 原则：不假设缺什么就补什么——先观察双星裸跑是否真的出问题，再决定是否补。

#### 3.5.1 风险分级

| # | 待验证项 | 风险 | 判断依据 |
|---|---------|:--:|---------|
| 1 | **四阶段纪律保持** | 🔴 高 | phase reminder 是每条消息注入的持续外部约束。失去后双星仅靠 prompt 自我约束，长对话中注意力衰减可能导致跳过阶段 |
| 2 | **Task 结果追踪** | 🟡 中 | task-session-manager 自动追踪 + Background Job Board 状态通知。失去后双星需自行判断 task 完成时机，可能过早/过晚 |
| 3 | **并发写冲突** | 🟢 低 | 双星已按"无依赖子任务可并行"原则调度，工匠各司其职，实际冲突概率低 |
| 4 | **委托意识** | 🟢 低 | 双星 prompt 已有明确委托判断流程（简单自己干 / 复杂四阶段），post-file-tool-nudge 是冗余提醒 |
| 5 | **子 agent 会话复用** | 🟢 低 | 纯 token 效率优化，不影响功能正确性 |
| 6 | **工具调用错误恢复** | 🟢 低 | DeepSeek 模型极少 JSON 格式错误；task 调用失败有明确错误返回，双星可自行决策 |
| 7 | **Agent MCP 权限路由** | 🟢 低 | 双星子 agent（工匠/参谋/军师/助理）设计上就不需要 MCP 工具，frontmatter 已正确配置。搜索由主 agent 自己用 websearch 完成 |

#### 3.5.2 P4-1: 四阶段纪律保持（🔴 高优先级）

**问题**：omo-slim 的 phase reminder 在每条消息末尾注入 `<system-reminder>Scheduler workflow: plan lanes → dispatch → track → reconcile → verify</system-reminder>`。这是持续的外部约束。失去后双星可能：
- 简单任务直接动手，跳过"先对齐再动手"的理解确认
- 复杂任务跳过规格制定（阶段 2），直接研究→实现
- 实现后跳过亲自验证（阶段 4）

**方案**：在双星 prompt 的 `## 工作方式` 节强化纪律——将"简单任务直接执行，复杂任务先列步骤"升级为明确的**强制检查点**，不依赖外部注入。

**待办**：
- [ ] 双星 prompt 增加「输出纪律」：每条回复开头必须输出 `###思考结果 <理解 + 打算>`（已有此规则，需确认在实际使用中是否严格遵循）
- [x] 在阶段转换处增加「自检锚」：研究结果出来后自问"需要写规格吗？"、实现完成后自问"亲自验证了吗？"
- [ ] 观察 3-5 次复杂任务后判断是否需要外部注入机制（fractal.ts 触发线）

#### 3.5.3 P4-2: Task 结果追踪（🟡 中优先级）

**问题**：omo-slim 的 task-session-manager 通过 `experimental.chat.messages.transform` 注入 Background Job Board 元数据，告诉 orchestrator 哪些 task 已完成。失去后双星：
- 调工匠后不知道何时去读结果（过早 = 空等待，过晚 = 浪费时间）
- 可能重复检查同一个 task

**方案**：在双星 prompt 中明确 task 结果获取协议——调 task 后不应轮询，应等待 OC 自动通知结果。

**待办**：
- [ ] 确认 OC 原生行为：task 工具调用子 agent 完成后，结果是否自动追加到主 agent 上下文（大概率是——这是 OC 原生行为，omo-slim 只是额外加了 Board 管理）
- [x] 如果 OC 有原生结果通知，双星无需额外处理；只需 prompt 中加一句「task 调用后等待结果自动返回，不要轮询」
- [ ] 如果 OC 没有，需要 fractal.ts 新增触发线：检测 task 调用→追踪 session→完成后注入提醒

---

## 四、项目基础设施 — 待办

- [x] `doc/计划/README.md` 完善索引
- [x] 部署脚本 `deploy.ps1` 覆盖分形 CLI 脚本和 prompts.ts
- [x] README.md 模块版本更新
- [x] 修复 opencode.json 中 `/memories` 命令模板乱码 → 转为 UTF-8，重命名为 `/fenxing`
- [x] 移除 oh-my-opencode-slim 插件 → 纯净双星评估环境（2026-07-20）
- [x] MCP 服务器迁移：websearch/gh_grep/context7 从 omo-slim 内置转为 opencode.json 直配（2026-07-20）
- [x] `doc/知识/omo-slim架构分析.md` 沉淀源码分析结论（2026-07-20）
