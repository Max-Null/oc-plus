# oc-plus — OpenCode 80 分增强套件

> 将原生 OpenCode 从 60 分提升到 80 分，获得接近 Claude Code 的编码体验。一套 agent 协作系统 + 记忆引擎 + 14 个内置技能的开箱即用方案。

## 装完有什么变化？

| | 原生 OpenCode | 安装 oc-plus 后 |
|---|---|---|
| **助手** | 单 agent，一问一答 | 四 agent 协作：双星决策 → 工匠编码 → 军师审查 → 参谋纠偏 |
| **记忆** | 无 | 分形 Guardian 自主分析操作习惯，跨会话持久保留 |
| **联网查证** | 内置搜索，质量一般 | 四条 MCP 通道（配置模板提供）：Exa AI 搜索 + GitHub 代码搜索 + Context7 实时文档 + GitHub API |
| **编码方法论** | 无 | 深模块设计 + 红绿重构 + 结构化调试 + 12 异味审查 |
| **代码审查** | 无 | 军师独立审查（双轴：规范轴 + 规格轴） |
| **技能** | 少量内置 | 额外 14 个内置 skill（提交审查、代码整理、设计方案、PPT 压缩…） |
| **规范优先级** | AGENTS.md 的位置不固定 | agents-priority 插件确保中文编码规范始终排在最前面 |
| **上下文压缩** | 内置固定阈值压缩 | opencode-acp 自适应压缩（软阈值 + nudge 机制） |

## 前置条件

- [OpenCode](https://opencode.ai) 已安装
- [Node.js](https://nodejs.org) ≥ 18
- DeepSeek API Key（[免费注册](https://platform.deepseek.com/api_keys)）
- （可选）GitHub Personal Access Token — 启用 GitHub MCP 操作

## 快速开始

```powershell
# 1. 克隆
git clone https://github.com/Max-Null/oc-plus.git
cd oc-plus

# 2. 部署（自动拷贝所有 agent / plugin / skill 到 ~/.config/opencode/）
node deploy.mjs

# 3. 编辑 ~/.config/opencode/opencode.json
#    复制 opencode.json.example 中的 mcp + permissions 段，
#    替换 provider.ds.options.apiKey 为你的 DeepSeek Key

# 4. 设置环境变量后重启 OpenCode
```

详细配置说明见下方 [部署](#部署) 章节。

## 当前状态（2026-07-22）

| 模块 | 版本 | 状态 |
|------|------|------|
| 双星系统 | V3.7 | ✅ skill 感知 + 修改审查 + 编码工程规范 + 工匠 LSP 深度 + 计划文档机制 |
| agents-priority | — | ✅ AGENTS.md 中文规范始终位于 system prompt 最前面 |
| 分形 Guardian | V3.5 | ✅ 五条触发线 + 三层记忆 + 自主知识记录 + 计划摘要注入 + .active.json 跨会话跟踪 |
| opencode-acp | latest | ✅ 自适应上下文压缩（触发线 3 由 ACP 覆盖，分形不再重复实现） |
| AGENTS.md | — | ✅ 全局行为规范 |
| CC 规则隔离 | — | ✅ `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1` |

## 架构

```
双星 (primary)
  │  智能助手，先对齐理解，再动手
  │
  ├─ 非编码 / 简单编码 → 自己干
  ├─ 搜索 → 提炼关键词再搜
  │
  └─ 复杂编码 → 四阶段：
        ├─ 研究：工匠(×N 并行) 探索代码库
        ├─ 综合：双星制定规格 + 参谋/军师(可选)
        ├─ 实现：工匠编码 + 自测
        └─ 验证：双星亲自 diff + 军师审查

参谋 (subagent, temp 0.7) — 战术纠偏：方向有没有偏离目标？
军师 (subagent, temp 0.3) — 战略远见：全局代码审视 + 工匠产出审查
工匠 (subagent, temp 0.1) — CC Worker 风格编码执行者（带 LSP）
```

## 分形 Guardian Agent

```
~/.config/opencode/plugins/fractal.ts（分形/ 目录，OC 自动发现加载）
  ├── system.transform     → 四条触发线的核心注入通道（规则注入 + 分级干预 + 知识索引）
  ├── chat.message         → 同轮消息注入（通过 assistant parts 检测 websearch 调用）
  ├── event                → 记录 message.updated/file.edited 等事件
  ├── 触发线 1             → 文件写入匹配 trigger（三层漏斗：glob→LLM→prompt）
  ├── 触发线 2             → 连续无进展循环（滑动窗口纯规则）
  ├── 触发线 3             → 上下文压力（由 opencode-acp 插件覆盖）
  ├── 触发线 4             → 主动联网查证（ASSERTION_RE + 分级计数器）
  ├── 触发线 5             → 提交后知识提取（轮询 git log → LLM 分析 → 写入 blocks/）
  └── 频率控制             → knowledge/habits 每 5 轮注入，核心规则每轮注入

~/.config/opencode/memories/
  ├── blocks/              ← 知识块（分形自动维护）
  ├── triggers/            ← 触发规则（分形生成）
  ├── events.log           ← 事件原始日志
  ├── debug.log            ← 诊断日志
  ├── .assertion-counter.json ← 触发线 4 分级计数
  └── .commit-last-check.json ← 触发线 5 提交时间戳

分形/agents/助理.md        ← 赛博分身 agent 参考定义（不再自动调用）
分形/prompts/              ← 可定制 prompt 模板（core-rules/websearch-rules/assertion-reminder）
分形/scripts/              ← CLI 工具：fractal-cli
分形/设计.md               ← 设计文档（V3.2）
```

## 内置技能（14 个）

部署后自动安装到 `~/.config/opencode/skills/`，由双星自动调用。

### 编码工作流（8 个 · mxy-* 系列）

| 技能 | 触发场景 | 功能 |
|------|---------|------|
| mxy-commit-review | "提交" / "commit" / "收尾" | 代码审查 + 修复 + 二次审查 + 生成提交信息 + 推送 |
| mxy-design-doc | "写方案" / "出设计文档" / "补文档" | 生成功能设计方案 + 产品原型文档 |
| mxy-git-pull | "拉代码" / "拉取" | 拉取最新代码并总结变更 |
| mxy-organize-code | "整理代码" / "格式化" | 增加注释 + 按标准分层排序（支持单文件/批量） |
| mxy-organize-scss | "整理样式" | stylelint 诊断 + 修复 + 中文注释 |
| mxy-upgrade-vue3 | "升级 Vue3" | Vue2 Options API → Vue3 `<script setup>` 语法 |
| mxy-update-docs | "更新文档" | 根据代码同步更新 AGENTS.md + README.md |
| mxy-pptx-slim | "PPT 太大" / "压缩" | 压缩 PPTX 中的视频/GIF/PNG |

### 研发增强（6 个 · omo-* 系列）

| 技能 | 功能 |
|------|------|
| omo-codemap | 为陌生仓库生成层级化代码地图 |
| omo-clonedeps | 克隆关键依赖源码到本地供审查 |
| omo-reflect | 审查近期工作，发现重复模式，建议可复用配置 |
| omo-simplify | 不改变行为的前提下提升代码可读性 |
| omo-verification-planning | 编码前制定项目专属的验证路径 |
| omo-worktrees | Git Worktree 管理——为复杂任务创建安全的隔离编码分支 |

> 推荐额外安装 [agent-skill-creator](https://github.com/FrancyJGLisboa/agent-skill-creator)（⭐2K）：`npx skills add FrancyJGLisboa/agent-skill-creator`

## 部署

### 自动部署

```powershell
# Node.js 脚本（推荐，无编码问题）
node deploy.mjs

# 或通过 PowerShell 包装器
.\deploy.ps1
```

脚本自动执行 7 步：清理过期文件 → 创建目录 → 部署 agent/plugin → 命令 → 脚本 → prompt 模板 → 技能。

### 手动配置

部署完成后，**手动编辑 `~/.config/opencode/opencode.json`**：

> 完整模板见项目根目录 `opencode.json.example`，可直接复制后修改关键字段。

**1. 模型 API Key**

```json
"provider": {
  "ds": {
    "options": {
      "apiKey": "sk-your-deepseek-api-key",
      "baseURL": "https://api.deepseek.com/v1"
    }
  }
}
```

**2. 安装 opencode-acp**（自适应上下文压缩）

```bash
opencode plugin opencode-acp@latest --global
```

> ACP 安装后需在 `opencode.json` 中禁用 OC 内置压缩：`"compaction": { "auto": false }`

**3. plugin 数组**

```json
"plugin": ["~/.config/opencode/node_modules/superpowers", "opencode-acp@latest", "fractal", "agents-priority"]
```

> 插件名 `"fractal"` 必须与文件 `plugins/fractal.ts` 一致，**不要**写成 `"oc-plus-fractal"`。
> `opencode-acp@latest` 在上一步已通过 `opencode plugin` 命令全局安装，此处声明即可。

**4. 默认 agent**

```json
"default_agent": "双星"
```

> 注意键名是 `default_agent`，不是 `agent`（`agent` 是配置 agent 属性的对象键）。

**5. MCP 服务器**（联网搜索 / 代码搜索 / 文档查询）

```json
"mcp": {
  "github": {
    "url": "https://api.githubcopilot.com/mcp/",
    "env": { "GITHUB_TOKEN": "ghp_your-pat" }
  },
  "websearch": {
    "url": "https://mcp.exa.ai/mcp?tools=web_search_exa"
  },
  "gh_grep": {
    "url": "https://mcp.grep.app"
  },
  "context7": {
    "url": "https://mcp.context7.com/mcp"
  }
}
```

| MCP | 用途 | 需要认证 |
|-----|------|:---:|
| websearch | Exa AI 搜索（免费匿名可用，有限速） | 可选 |
| github | GitHub 操作（PR/Issue/搜索） | PAT |
| gh_grep | GitHub 代码全文搜索 | 不需要 |
| context7 | 实时库文档（免费 1,000 次/月） | 可选 |

**6. 权限**

```json
"permissions": {
  "github": "allow",
  "websearch": "allow",
  "webfetch": "allow",
  "gh_grep": "allow",
  "context7": "allow"
}
```

**7. 依赖版本**与 CLI 对齐，编辑 `~/.config/opencode/package.json`：

```json
"dependencies": {
  "@opencode-ai/plugin": "^1.18.3",
  "@opencode-ai/sdk": "^1.18.3"
}
```

然后运行 `npm install`（在 `~/.config/opencode/` 目录下）。

**8. 环境变量**

```powershell
OPENCODE_EXPERIMENTAL_LSP_TOOL=true
OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1
```

**9. 重启 OpenCode。** 验证：`~/.config/opencode/memories/debug.log` 应出现 `[fractal] 模块已导入`。

## 故障排查

| 问题 | 检查 |
|------|------|
| 双星没生效 | `opencode.json` 中 `default_agent` 是否设为 `"双星"`（不是 `agent`） |
| 分形无日志 | `plugin` 数组中是否包含 `"fractal"`（不是 `"oc-plus-fractal"`） |
| 联网搜索不可用 | `opencode.json` 的 `mcp` 段是否已配置、`permissions` 是否 allow |
| 部署后 agent 未更新 | 重启 OpenCode（agent 在启动时加载） |
| 环境变量未生效 | Windows 用 `setx` 设置后需新开终端 |
| 插件加载报错 | `~/.config/opencode/package.json` 依赖版本是否与 CLI 对齐，是否执行了 `npm install` |

## 文档

| 文档 | 说明 |
|------|------|
| `双星系统/设计.md` | V3 架构总览 |
| `双星系统/版本记录.md` | V1→V3 完整版本历史 |
| `双星系统/archive/V1/设计.md` | V1 仲裁器架构（已废弃） |
| `双星系统/archive/V2/设计.md` | V2 智能助手架构（基线） |
| `doc/设计/双星V3-编码能力升级方案.md` | V3 详细设计方案 |
| `doc/知识/权限控制机制对比-CC-vs-OC.md` | CC vs OC 权限机制对比 |
| `doc/知识/CC插件系统-OC改造参考.md` | CC 插件系统 vs OC 插件 API 对比分析 |
| `doc/知识/skill选型参考.md` | 35 个技能选型指南 |
| `doc/知识/omo-slim架构分析.md` | omo-slim 源码分析 |

## 目录结构

```
oc-plus/
├── 双星系统/           ← 协作系统：primary agent + 3 个顾问 subagent
│   ├── agents/         Agent 定义（双星/工匠/参谋/军师）
│   ├── commands/       自定义命令（double-star）
│   └── archive/        历史版本归档
├── 分形/               ← 分形 Guardian Agent：五条触发线 + 三层记忆 + 赛博分身
│   ├── fractal.ts       插件源码（OC 自动发现加载）
│   ├── lib/             prompt 工具模块（子目录不被 OC 扫描）
│   ├── agents/          助理 agent 定义
│   ├── prompts/         可定制 prompt 模板
│   ├── scripts/         CLI 工具（fractal-cli）
│   ├── archive/         历史版本归档
│   └── 设计.md          设计文档
├── 技能/               ← 内置 skill：8 个 mxy-* + 6 个 omo-*（deploy.mjs 自动部署）
├── doc/                ← 项目文档
│   ├── 知识/           CC vs OC 对比分析 + API 速查
│   ├── 设计/           功能设计方案
│   ├── 计划/           项目计划、排期
│   └── 原型/           产品原型
├── .opencode/          ← 项目级 OC 配置（memory blocks 等）
├── deploy.mjs           部署脚本（Node.js，推荐）
├── deploy.ps1           部署脚本（PowerShell 包装器）
├── opencode.json.example 配置文件模板
├── package.json         插件依赖声明
└── README.md            本文件
```
