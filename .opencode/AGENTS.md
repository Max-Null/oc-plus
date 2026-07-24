# oc-plus 项目说明

给 OpenCode 加装 agent 系统——双星（主力智能助手）+ 记忆管家（自动学习习惯）。

## 项目目标

将 OpenCode 从 60 分改造到 80 分，增强不替换 OC 原生体系。

## 目录结构

```
oc-plus/
├── 双星系统/           ← 协作系统：primary agent + 3 顾问 subagent
│   ├── agents/         Agent 定义
│   ├── commands/       自定义命令
│   └── archive/        历史版本归档
├── 分形/               ← Guard系统：多场景Guardian Agent + Pipeline 流水线 + 自主知识记录
│   ├── agents/         助理 agent
│   ├── scripts/        CLI 工具（含 rollback.mjs 一键回滚）
│   ├── prompts/        可定制 prompt 模板
│   ├── lib/            prompts.ts 等库文件
│   ├── fractal.ts      插件源码
│   ├── pipeline.ts     流水线引擎（V1：行为前门 → 5 阶段编排）
│   ├── pipeline.test.ts 流水线测试（26 用例）
│   ├── tsconfig.json
│   └── 机制说明.md
├── 技能/               ← 内置 skill：8 个 mxy-* + 6 个 omo-*
├── doc/                ← 项目文档
│   ├── 知识/           CC vs OC 对比分析 + API 速查
│   ├── 设计/           功能设计方案
│   ├── 计划/           项目计划
│   └── 原型/           产品原型
├── .opencode/          ← 项目级 OC 配置
│   ├── AGENTS.md       本文件
│   └── memories/       项目级记忆 blocks
├── deploy.mjs          部署脚本（主入口）
├── deploy.ps1          部署脚本（PowerShell 包装器）
├── 回滚.bat            双击一键回滚到上一个可用版本
├── agents-priority.ts  AGENTS.md 排序插件
├── opencode.json.example 配置模板
├── package.json
└── README.md

各子目录必须有 README.md 做索引
```

## 关键模块

| 目录 | 说明 |
|------|------|
| `双星系统/` | 双星 primary agent + 工匠/参谋/军师 subagent + commands |
| `分形/` | 分形插件（三层记忆 + Guardian Agent + Pipeline V1 流水线 + B 断言检测 + 自主知识记录） |
| `技能/` | mxy-commit-review 等 14 个内置 skill |
| `doc/知识/` | CC vs OC 对比 + OC Plugin API 速查 + Hooks 完整列表 + 加载机制 + 上下文插件 |

## opencode.json 配置要点

- 插件名 `"fractal"` 对应文件 `plugins/fractal.ts`，**不要**写成 `"oc-plus-fractal"`
- 默认 agent 键名为 `default_agent`，**不是** `agent`
- `package.json` 中 `@opencode-ai/plugin` 和 `@opencode-ai/sdk` 版本应与 `opencode-ai` CLI 版本对齐（`npm view opencode-ai version`）

## 修改 OC 前先查本地知识库

涉及 OC 插件/agent/hook 的修改时，**先 `read` `doc/知识/` 下的文档**，再联网查：

| 先查本地（确定性的） | 文档路径 |
|------|------|
| OC hooks 有哪些、能改什么 | `doc/知识/OC-Plugin-Hooks.md` |
| 插件为什么加载不了 | `doc/知识/OC-Plugin-Loading.md` |
| 上下文精简有什么现成方案 | `doc/知识/OC-Context-Plugins.md` |

本地文档是踩坑后沉淀的——不要每次遇到 OC 问题都从零联网查。

## 部署

`node deploy.mjs`（或 `.\deploy.ps1` 包装器）— 部署所有 agent、插件、命令到 `~/.config/opencode/`
