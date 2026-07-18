# OC 技术选型 — 决策记录

> 2026-07-19 · 进行中

## 背景

办公环境将禁止 Claude Code（闭源 + 信息泄露风险），在 OpenCode 上重建 AI 辅助开发环境。

## CC → OC 对照

| 模块 | CC | OC | 说明 |
|------|-----|-----|------|
| **Agent 体系** | CC 内置 | oh-my-opencode-slim（6 specialist） | OC 支持自定义 agent 全链路 |
| **模型** | Claude 系列 | DeepSeek V4 Pro / Flash | 分层使用 |
| **LSP** | 无 | ✅ 已启用 | 语言服务器集成 |
| **文档 Skill** | docx/pdf/pptx/xlsx（专有）| minimax-docx/pdf/xlsx + pptx-generator（MIT）| 开源替代 |
| **Skill 创建** | skill-creator（CC 专用）| agent-skill-creator v6.0（MIT，17 平台）| 跨平台，更强 |
| **MCP 构建** | mcp-builder | ✅ 同源迁移 | Apache 2.0 |
| **Web 测试** | webapp-testing | ✅ 同源迁移 | Apache 2.0 |
| **设计/视觉** | theme-factory 等 5 个 | ✅ 同源迁移 | Apache 2.0 |
| **沟通/协作** | internal-comms / doc-coauthoring | ✅ 同源迁移 | Apache 2.0 |
| **提交审查** | M-commit-review | mxy-commit-review | 已适配 OC（AskUserQuestion→question 等） |
| **代码拉取** | M-git-pull | mxy-git-pull | 无 CC 依赖，直接可用 |
| **代码整理** | M-organize-code / M-organize-scss / M-organize-vue3 | mxy-organize-code / mxy-organize-scss / mxy-upgrade-vue3 | 已适配 OC（工具名/记忆/IDE 特性替换） |
| **文档同步** | M-update-docs | mxy-update-docs | CLAUDE.md→AGENTS.md |
| **PPT 压缩** | pptx-slim | mxy-pptx-slim | 无依赖，直接可用 |
| **设计方案** | 设计-文档 | mxy-design-doc | 已适配 OC，加排除条件防误判 |
| **品牌指南** | brand-guidelines（Anthropic）| ❌ 不适用 | OC 项目不需要 |
| **Web 搜索** | CC 内置 | websearch MCP（Exa） | MCP 扩展 |
| **文档查询** | CC 内置 | context7 MCP | 实时库文档 |
| **代码搜索** | CC 内置 | gh_grep + GitHub MCP | 双通道 |
| **GitHub 访问** | CC 内置 | GitHub MCP（PAT） | API 直连，反爬 |
| **记忆系统** | CC 内置 `[[双括号]]` | 分形 Guardian Agent（自制） | 三层漏斗 + LLM 自主学习 + 多场景触发 |

## 自定义技能 OC 适配

8 个自定义技能已从 CC 版本升级为 OC 专用版：

| 改动项 | 涉及技能 | 说明 |
|--------|---------|------|
| `AskUserQuestion` → `question` | commit-review, organize-code, design-doc | OC 交互工具不同 |
| `M-xxx` → `mxy-xxx` | 全部 8 个 | 统一前缀，区分自定义 |
| `CLAUDE.md` → `AGENTS.md` | commit-review, update-docs, upgrade-vue3 | OC 行为准则文件 |
| `[[记忆]]` → 内联 | organize-scss | CC 记忆系统不存在 |
| `<ide_selection>` → 通用描述 | organize-code | CC IDE 扩展特性不存在 |

## 分形 Guardian Agent

CC 的记忆系统（`[[双括号引用]]`）在 OC 中由自制的「分形 Guardian Agent」替代。

| 维度 | CC | OC 分形 |
|------|-----|-----------|
| 记忆存储 | CC 内部管理 | 三层：全局 / 个人项目级 / 共享项目级 |
| 习惯发现 | 手动配置 | LLM 自主学习（20 条事件触发分析） |
| 置信度 | — | LLM 语义判断（high/medium/low），非固定计数 |
| 触发方式 | `[[引用名]]` | system prompt 注入 + event hook 多场景触发 |
| 插件实现 | CC 内置 | Plugin（fractal.ts）+ 助理 agent 参考定义 |
| Guardian 能力 | 无 | 三条触发线（文件匹配 / 循环检测 / 上下文压力） |

**当前状态**：V2.0 三层漏斗 ✅ / V2.1 自主知识记录 ✅ / V3.0 Guardian 设计完成，触发线 2 待实现

## 上下文精简 — ACP 选型

| 维度 | CC | OC ACP |
|------|-----|--------|
| 压缩方式 | 四层架构（microcompact→auto→block→reactive） | 模型自主 compress 工具 + 外部执行 |
| 触发机制 | 固定 83.5% token 阈值 | 窗口 55% 软阈值 + 自适应 nudge |
| 短会话处理 | 同阈值，可能过度压缩 | 45% minContextLimit 延迟触发 |

**选型理由**：社区验证（2.3K 周下载），活跃维护，已安装。详见 `doc/知识/OC-Context-Plugins.md`。

**安装**：`opencode plugin opencode-acp@latest --global` | 需禁用 OC 内置压缩 `"compaction": { "auto": false }`

## 技能总览（31 个）

| 来源 | 许可 | 数量 | 技能 |
|------|------|------|------|
| OC 原生 | — | 9 | simplify, codemap, clonedeps, deepwork, reflect, worktrees, oh-my-opencode-slim, verification-planning, release-smoke-test |
| MiniMax-AI | MIT | 4 | minimax-docx, minimax-pdf, minimax-xlsx, pptx-generator |
| anthropics | Apache 2.0 | 9 | mcp-builder, webapp-testing, theme-factory, canvas-design, algorithmic-art, slack-gif-creator, web-artifacts-builder, internal-comms, doc-coauthoring |
| FrancyJGLisboa | MIT | 1 | agent-skill-creator |
| mxy-* 自定义 | 自有 | 8 | mxy-commit-review, mxy-git-pull, mxy-organize-code, mxy-organize-scss, mxy-upgrade-vue3, mxy-update-docs, mxy-pptx-slim, mxy-design-doc |

```text
~/.config/opencode/skills/
├── OC 原生（9）
│   └── simplify / codemap / clonedeps / deepwork / reflect
│       worktrees / oh-my-opencode-slim / verification-planning
│       release-smoke-test
├── 文档处理（4） — MiniMax-AI MIT
│   └── minimax-docx / minimax-pdf / minimax-xlsx / pptx-generator
├── 开发工具（3）
│   └── agent-skill-creator（MIT） / mcp-builder / webapp-testing
├── 设计/视觉（5） — Apache 2.0
│   └── theme-factory / canvas-design / algorithmic-art
│       slack-gif-creator / web-artifacts-builder
├── 沟通/协作（2） — Apache 2.0
│   └── internal-comms / doc-coauthoring
└── 自定义 mxy-*（8） — 已适配 OC
    └── mxy-commit-review / mxy-git-pull / mxy-organize-code
        mxy-organize-scss / mxy-upgrade-vue3 / mxy-update-docs
        mxy-pptx-slim / mxy-design-doc
```

## 待办

- [x] 文档类 Skill 迁移
- [x] Apache 2.0 Skill 迁移 + 平替评估
- [x] 自定义 Skill 迁移 + OC 适配
- [ ] 重启 OC 全流程验证
- [ ] 文档技能依赖安装（Python ✅ / LibreOffice ⬜ 待手动安装）

---

*决策记录会在推进过程中持续更新。*
