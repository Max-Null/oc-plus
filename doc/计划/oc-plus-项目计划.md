# oc-plus 项目计划

> 状态：进行中 · 最后更新：2026-07-19

## 一、当前版本概览

> 版本号在各模块的「变更历史」中记录；此表仅列当前部署状态。

| 模块 | 版本 | 状态 |
|------|------|------|
| 双星系统 | V3.6 | ✅ skill感知 + 修改审查 + agents-priority + 分形集成 + 编码工程规范 |
| 分形 Guardian Agent | V3.3 | ✅ 五条触发线全部实现（含触发线2无反馈环扩展） |
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
| F1 反馈闭环 | 短期 | ~~Guardian 动态阈值~~ ✅；~~优化知识注入精准度~~ ✅；记忆反馈循环（pursuit/dismissal）；ACP 保护规则；事件 hook 恢复监控 |
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
- [x] agents-priority 插件：确保 AGENTS.md 中文规范不被 omo-slim 英文 prompt 淹没
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

---

## 四、项目基础设施 — 待办

- [x] `doc/计划/README.md` 完善索引
- [x] 部署脚本 `deploy.ps1` 覆盖分形 CLI 脚本和 prompts.ts
- [x] README.md 模块版本更新
- [x] 修复 opencode.json 中 `/memories` 命令模板乱码 → 转为 UTF-8，重命名为 `/fenxing`
