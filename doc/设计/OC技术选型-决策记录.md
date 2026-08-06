# OC 技术选型 — 决策记录

> 2026-07-19 · 进行中 · 2026-08-06 更新（Tavily 双通道 / ACP 实战踩坑 / 分形 V3.7 / 技能清单同步）

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
| **Web 搜索** | CC 内置 | websearch MCP（Exa）+ tavily MCP | 双通道，合计 2,000 次/月免费额度 |
| **文档查询** | CC 内置 | context7 MCP | 实时库文档 |
| **代码搜索** | CC 内置 | gh_grep + GitHub MCP | 双通道 |
| **GitHub 访问** | CC 内置 | GitHub MCP（PAT） | API 直连，反爬 |
| **记忆系统** | CC 内置 `[[双括号]]` | 分形 Guardian Agent（自制） | 三层漏斗 + LLM 自主学习 + 多场景触发 |

## 自定义技能 OC 适配

8 个自定义技能已从 CC 版本升级为 OC 专用版（后新增 mxy-agents-migrate，共 9 个）：

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

**当前状态**：V3.7 六条触发线全部实现 ✅（文件编辑审查 / 无进展循环 / 上下文压力→ACP 接管 / 联网查证 / 提交知识提取 / 行为前门）+ Pipeline V1 流水线 + 三层记忆 + 回滚保护

## MCP 选型 — 复刻配置（重点）

> 目标：**任何电脑照此节即可复刻当前环境的全部 MCP**。配置位置：`~/.config/opencode/opencode.json` → `mcp` 字段。当前共 6 个 MCP，全部实测可用。

### 选型总览

| MCP | 类型 | 用途 | 认证 | 免费额度 | 选型理由 |
|-----|------|------|------|---------|---------|
| github | remote | GitHub 操作（PR/Issue/搜索/代码） | PAT | 无限 | 官方 Copilot MCP，API 直连反爬 |
| websearch | remote | 通用网页搜索 | 匿名可用（可选 key 提额） | 1,000 次/月 | Exa 搜索+抓取二合一，无需注册 |
| tavily | remote | 通用网页搜索 + extract/map/crawl | API key | 1,000 credits/月 | 无需信用卡，邮箱注册即用，额度叠加 |
| gh_grep | remote | GitHub 代码全文搜索 | 无 | 无限 | grep.app 免费，秒级全文检索 |
| context7 | remote | 实时库文档（SDK/框架 API） | 可选（匿名可用） | 1,000 次/月 | 官方文档聚合，省去翻文档 |
| mysql | local | 业务库查询（cloud_warehouse） | 库账号密码 | 无 | 内网直连，SQL 操作 |

**搜索额度组合策略**：websearch（Exa）+ tavily 双通道 = 2,000 次/月免费，一家限流自动切另一家。Brave 未选（注册需信用卡验证，国内不可行）。

### 复刻配置（opencode.json `mcp` 段）

```jsonc
"mcp": {
  "github": {
    "type": "remote",
    "enabled": true,
    "oauth": false,
    "url": "https://api.githubcopilot.com/mcp/",
    "headers": { "Authorization": "Bearer {file:~/.config/opencode/.secrets/github-token}" }
  },
  "websearch": {
    "type": "remote",
    "enabled": true,
    "oauth": false,
    "url": "https://mcp.exa.ai/mcp?tools=web_search_exa"
  },
  "tavily": {
    "type": "remote",
    "enabled": true,
    "oauth": false,
    "url": "https://mcp.tavily.com/mcp/?tavilyApiKey=你的key"
  },
  "gh_grep": {
    "type": "remote",
    "enabled": true,
    "oauth": false,
    "url": "https://mcp.grep.app"
  },
  "context7": {
    "type": "remote",
    "enabled": true,
    "oauth": false,
    "url": "https://mcp.context7.com/mcp"
  },
  "mysql": {
    "type": "local",
    "enabled": true,
    "command": "npx",
    "args": ["-y", "@benborla29/mcp-server-mysql"],
    "env": {
      "MYSQL_HOST": "内网IP", "MYSQL_PORT": "3306",
      "MYSQL_USER": "用户名", "MYSQL_PASS": "密码", "MYSQL_DB": "cloud_warehouse",
      "ALLOW_INSERT_OPERATION": "true", "ALLOW_UPDATE_OPERATION": "true",
      "ALLOW_DELETE_OPERATION": "true",
      "SCHEMA_INSERT_PERMISSIONS": "cloud_warehouse:true",
      "SCHEMA_UPDATE_PERMISSIONS": "cloud_warehouse:true",
      "SCHEMA_DELETE_PERMISSIONS": "cloud_warehouse:true"
    }
  }
}
```

### 认证获取

| MCP | 获取方式 |
|-----|---------|
| github | GitHub → Settings → Developer settings → PAT，勾选 `repo` + `read:org`，存 `~/.config/opencode/.secrets/github-token`（`{file:...}` 引用，不进 opencode.json） |
| tavily | app.tavily.com 邮箱注册（**官方明确无需信用卡**），Dashboard 复制 `tvly-` 开头 key |
| websearch/context7 | 匿名可用；提额分别去 dashboard.exa.ai / context7.com 注册 |
| mysql | 内网库账号（公司内部） |

### 关键注意事项

- **remote 类型必须同时写 `"type": "remote"` + `"enabled": true`**，否则 OC 解析报错
- **代理冲突**：Clash 类代理开启时本地 MCP 的 fetch 会被劫持 → `fetch failed`，需在 Clash Parsers 注入本地 DIRECT 规则（详见 `doc/知识/OC-Context-Plugins.md` 实战踩坑章节）
- **权限放行**：`opencode.json` 的 `permission` 段需对每个 MCP allow，否则工具调用会被拦

## 上下文精简 — ACP 选型

| 维度 | CC | OC ACP |
|------|-----|--------|
| 压缩方式 | 四层架构（microcompact→auto→block→reactive） | 模型自主 compress 工具 + 外部执行 |
| 触发机制 | 固定 83.5% token 阈值 | 窗口 55% 软阈值 + 自适应 nudge |
| 短会话处理 | 同阈值，可能过度压缩 | 45% 默认 minContextLimit（本机调为 35%，见实测） |

**选型理由**：社区验证（2.3K 周下载），活跃维护，已安装。详见 `doc/知识/OC-Context-Plugins.md`。

**安装**：`opencode plugin opencode-acp@latest --global` | 需禁用 OC 内置压缩 `"compaction": { "auto": false }`

**实测验证（2026-08-06）**：
- 已配置 `~/.config/opencode/acp.jsonc`：`minContextLimit 35%` / `maxContextLimit 85%` / `nudgeFrequency 10` / `nudgeForce soft` / `iterationNudgeThreshold 50` / `modelMaxLimits my-deepseek/deepseek-v4-pro 90%` / `modelMinLimits 70%`
- ⚠️ **踩坑**：Clash 代理开启时压缩调用持续 `fetch failed`（本地回环请求被 7890 代理 REJECT）→ 已通过 CFW Parsers 注入 `127.0.0.0/8`、`::1/128`、`localhost` DIRECT 规则根治，**任何复刻环境若用 Clash 类代理必须配 Parsers**（详见 `doc/知识/OC-Context-Plugins.md` 实战踩坑章节）

## 技能总览（38 个）

| 来源 | 许可 | 数量 | 技能 |
|------|------|------|------|
| OC 原生 | — | 9 | simplify, codemap, clonedeps, deepwork, reflect, worktrees, oh-my-opencode-slim, verification-planning, release-smoke-test |
| MiniMax-AI | MIT | 4 | minimax-docx, minimax-pdf, minimax-xlsx, pptx-generator |
| anthropics | Apache 2.0 | 9 | mcp-builder, webapp-testing, theme-factory, canvas-design, algorithmic-art, slack-gif-creator, web-artifacts-builder, internal-comms, doc-coauthoring |
| FrancyJGLisboa | MIT | 1 | agent-skill-creator |
| mxy-* 自定义 | 自有 | 9 | mxy-commit-review, mxy-git-pull, mxy-organize-code, mxy-organize-scss, mxy-upgrade-vue3, mxy-update-docs, mxy-pptx-slim, mxy-design-doc, mxy-agents-migrate |
| omo-* 研发增强 | 自有 | 6 | omo-clonedeps, omo-codemap, omo-reflect, omo-simplify, omo-verification-planning, omo-worktrees |

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
├── 自定义 mxy-*（9） — 已适配 OC
│   └── mxy-commit-review / mxy-git-pull / mxy-organize-code
│       mxy-organize-scss / mxy-upgrade-vue3 / mxy-update-docs
│       mxy-pptx-slim / mxy-design-doc / mxy-agents-migrate
└── 研发增强 omo-*（6）
    └── omo-clonedeps / omo-codemap / omo-reflect / omo-simplify
        omo-verification-planning / omo-worktrees
```

## 待办

- [x] 文档类 Skill 迁移
- [x] Apache 2.0 Skill 迁移 + 平替评估
- [x] 自定义 Skill 迁移 + OC 适配
- [x] MCP 双通道搜索（Exa + Tavily，2,000 次/月）
- [x] ACP Clash 代理踩坑修复（CFW Parsers 本地 DIRECT 规则）
- [ ] 重启 OC 全流程验证
- [ ] 文档技能依赖安装（Python ✅ / LibreOffice ⬜ 待手动安装）
- [ ] 新电脑复刻演练：按本文档从零搭建一份环境，校验 MCP 选型章节是否自洽

---

*决策记录会在推进过程中持续更新。*
