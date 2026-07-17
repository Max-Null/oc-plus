# oc-plus 项目说明

给 OpenCode 加装 agent 系统——双星（主力智能助手）+ 记忆管家（自动学习习惯）。

## 项目目标

将 OpenCode 从 60 分改造到 80 分，增强不替换 OC 原生体系。

## 关键模块

| 目录 | 说明 |
|------|------|
| `双星系统/` | 双星 primary agent + 工匠/参谋/军师 subagent + commands |
| `记忆管家/` | memories 插件（三层记忆 + LLM 自主学习）+ prompts + CLI |
| `agents-priority.ts` | 插件：确保 AGENTS.md 中文规范在 omo-slim 之前 |

## 部署

`.\deploy.ps1` — 部署所有 agent、插件、命令到 `~/.config/opencode/`

## 运行时

- 默认 agent：双星
- `~/.config/opencode/plugins/` 下插件自动发现，无需在 opencode.json 声明
- 记忆目录：`~/.config/opencode/memories/{blocks,triggers}/
