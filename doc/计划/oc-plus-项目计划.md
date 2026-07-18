# oc-plus 项目计划

> 状态：进行中 · 最后更新：2026-07-19

## 一、当前版本概览

| 模块 | 版本 | 状态 |
|------|------|------|
| 双星系统 | V3.4 | ✅ skill感知 + 修改审查 + agents-priority |
| 分形 Guardian Agent | V3.1 | ✅ 四条触发线设计完成（触发线 4 待实现） |
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
| 5. 提交后知识提取 | git commit 完成后提取可记忆知识点 | tool.execute.after 检测 commit → LLM 分析 diff+message → 写入 blocks/ | 📋 |

### 2.3 后续计划

| 阶段 | 内容 |
|------|------|
| V3.1（短期） | ✅ ACP 四项借鉴改进全部完成；Guardian 动态阈值 ✅；记忆反馈循环 ✅；ACP 保护规则 ✅ |
| V3.2（中期） | 触发线 5：提交后知识提取；多触发线协同避免消息轰炸；跨会话学习 |

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

### 3.1 V3.4 — skill 感知 + 修改审查（✅ 已完成 2026-07-17）

- [x] 双星 agent 新增 skill 感知：执行任务前先检查 available_skills
- [x] 双星 agent 新增修改审查：改前计划 + 改后验证
- [x] agents-priority 插件：确保 AGENTS.md 中文规范不被 omo-slim 英文 prompt 淹没
- [x] deploy.ps1 覆盖分形插件 + agents-priority 部署

### 3.2 V3.5 — 分形集成优化

- [ ] 双星 agent prompt 中增加「分形 Guardian Agent」指引：收到 `[分形]` 前缀消息时按用户指令处理
- [ ] 观察分形 V2.1 LLM 自主学习后，blocks/ 和 triggers/ 的生成质量和频率
- [ ] 如果 triggers/ 生成了 auto 级别的习惯，验证分形是否正确触发

### 3.3 V4.0 — 深度集成方向

- [ ] **分形驱动工作流**：双星启动时主动读取 blocks/ 中的知识记忆，作为决策上下文
- [ ] **自动化习惯执行**：auto 状态的习惯直接成为双星的默认行为，不再通过 question 工具确认
- [ ] **双星自身习惯学习**：observability — 记录双星的决策链（为什么选这个方案），用于回溯和优化
- [ ] **工匠 LSP 深度使用**：工匠目前有 LSP 权限但使用偏基础，补充 goToDefinition / callHierarchy 等用法的具体指导

### 3.4 已知问题

- [ ] opencode.json 中 `/memories` 命令 template 有中文乱码（PowerShell GBK 编码问题），且命令名需更新

---

## 四、项目基础设施 — 待办

- [x] `doc/计划/README.md` 完善索引
- [x] 部署脚本 `deploy.ps1` 覆盖分形 CLI 脚本和 prompts.ts
- [x] README.md 模块版本更新
- [ ] 修复 opencode.json 中 `/memories` 命令模板乱码 → 转为 UTF-8，重命名为 `/fenxing`
