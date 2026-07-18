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
├── 记忆管家/           ← 记忆系统：三层记忆 + 赛博分身 + 断言检测(B)
│   ├── agents/         助理 agent
│   ├── scripts/        CLI 工具
│   ├── memories.ts     插件源码
│   ├── prompts.ts      LLM prompt 模板
│   └── 设计.md
├── 技能/               ← 自定义 skill（mxy- 系列 9 个）
├── doc/                ← 项目文档
│   ├── 知识/           CC vs OC 对比分析 + API 速查
│   ├── 设计/           功能设计方案
│   ├── 计划/           项目计划
│   └── 原型/           产品原型
├── .opencode/          ← 项目级 OC 配置
│   ├── AGENTS.md       本文件
│   └── memories/       项目级记忆 blocks
├── deploy.ps1          部署脚本
├── package.json
└── README.md

各子目录必须有 README.md 做索引
```

## 关键模块

| 目录 | 说明 |
|------|------|
| `双星系统/` | 双星 primary agent + 工匠/参谋/军师 subagent + commands |
| `记忆管家/` | memories 插件（三层记忆 + LLM 自主学习 + B：断言检测） |
| `技能/` | mxy-commit-review 等 9 个自定义 skill |
| `doc/知识/` | CC vs OC 对比 + OC Plugin API 速查 + Hooks 完整列表 + 加载机制 + 上下文插件 |

## 修改 OC 前先查本地知识库

涉及 OC 插件/agent/hook 的修改时，**先 `read` `doc/知识/` 下的文档**，再联网查：

| 先查本地（确定性的） | 文档路径 |
|------|------|
| OC hooks 有哪些、能改什么 | `doc/知识/OC-Plugin-Hooks.md` |
| 插件为什么加载不了 | `doc/知识/OC-Plugin-Loading.md` |
| 上下文精简有什么现成方案 | `doc/知识/OC-Context-Plugins.md` |

本地文档是踩坑后沉淀的——不要每次遇到 OC 问题都从零联网查。

## 部署

`.\deploy.ps1` — 部署所有 agent、插件、命令到 `~/.config/opencode/`
