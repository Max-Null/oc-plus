# oc-plus — OpenCode 80分改造计划

将 OpenCode 从 60 分改造到 80 分，实现与 Claude Code 同等的使用体验。

## 改造原则

```
增强不替换：所有模块在 OC 原生体系上叠加，不替换原生 agent/tool
```

## 当前状态（V3.7 · 2026-07-19）

| 模块 | 版本 | 状态 |
|------|------|------|
| 双星系统 | **V3.7** | ✅ skill感知 + 修改审查 + agents-priority + 分形集成 + 编码工程规范 + 工匠LSP深度 |
| agents-priority | — | ✅ AGENTS.md 中文规范始终位于 system prompt 最前面 |
| 分形 | V3.4 | ✅ Guardian Agent + 五条触发线 + 可配阈值 + 关键词注入 + 默认行为 + 三层记忆 + 自主知识记录 |
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
  ├── 触发线 3             → 上下文压力（⏸️ ACP 已覆盖）
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

## 部署

```powershell
# Node.js 脚本（推荐，无编码问题）
node deploy.mjs

# 或通过 PowerShell 包装器
.\deploy.ps1
```

脚本自动执行 7 步：清理过期文件 → 创建目录 → 部署 agent/plugin → 命令 → 脚本 → prompt 模板 → 技能。

部署完成后，**手动编辑 `~/.config/opencode/opencode.json`** 完成以下配置：

1. **plugin 数组**应包含：
   ```json
   "plugin": ["~/.config/opencode/node_modules/superpowers", "fractal", "agents-priority"]
   ```
   > 插件名 `"fractal"` 必须与文件 `plugins/fractal.ts` 一致，**不要**写成 `"oc-plus-fractal"`。

2. **默认 agent** 设为双星：
   ```json
   "default_agent": "双星"
   ```
   > 注意键名是 `default_agent`，不是 `agent`（`agent` 是配置 agent 属性的对象键）。

3. **依赖版本**与 CLI 对齐，编辑 `~/.config/opencode/package.json`：
   ```json
   "dependencies": {
     "@opencode-ai/plugin": "^1.18.3",
     "@opencode-ai/sdk": "^1.18.3"
   }
   ```
   然后运行 `npm install`（在 `~/.config/opencode/` 目录下）。

4. **环境变量**：
   ```powershell
   OPENCODE_EXPERIMENTAL_LSP_TOOL=true
   OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1
   ```

5. 重启 OpenCode。验证方式：`~/.config/opencode/memories/debug.log` 应出现 `[fractal] 模块已导入` 日志行。

## 推荐安装

以下技能体量较大（独立开源项目），未纳入仓库，建议手动安装：

| 技能 | 说明 | 仓库 | 安装方式 |
|------|------|------|---------|
| agent-skill-creator | 从工作流描述创建跨平台 Agent Skill（17 平台兼容，⭐2K） | [FrancyJGLisboa/agent-skill-creator](https://github.com/FrancyJGLisboa/agent-skill-creator) | `npx skills add FrancyJGLisboa/agent-skill-creator`<br>或 `git clone` 到 `~/.config/opencode/skills/agent-skill-creator` |

> 仓库已内置 14 个轻量 skill（`技能/` 目录，`deploy.ps1` 自动部署）。

## 文档

| 文档 | 说明 |
|------|------|
| `双星系统/设计.md` | V3 架构总览 |
| `双星系统/版本记录.md` | V1→V3 完整版本历史 |
| `双星系统/archive/V1/设计.md` | V1 仲裁器架构（已废弃） |
| `双星系统/archive/V2/设计.md` | V2 智能助手架构（基线） |
| `doc/设计/双星V3-编码能力升级方案.md` | V3 详细设计方案 |
| `doc/知识/权限控制机制对比-CC-vs-OC.md` | CC vs OC 权限机制对比 |
| `doc/知识/CC插件系统-OC改造参考.md` | CC插件系统 vs OC 插件 API 对比分析 |
| `doc/知识/skill选型参考.md` | 35 个技能选型指南 |

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
├── 技能/               ← 内置 skill：8 个 mxy-* + 6 个 omo-*（deploy.ps1 自动部署）
├── doc/                ← 项目文档
│   ├── 知识/           CC vs OC 对比分析 + API 速查
│   ├── 设计/           功能设计方案
│   ├── 计划/           项目计划、排期
│   └── 原型/           产品原型
├── .opencode/          ← 项目级 OC 配置（memory blocks 等）
├── deploy.ps1          部署脚本
├── package.json        插件依赖声明
└── README.md           本文件
```
