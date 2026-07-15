# oc-plus — OpenCode 80分改造计划

将 OpenCode 从 60 分改造到 80 分，实现与 Claude Code 同等的使用体验。

## 改造原则

```
增强不替换：所有模块在 OC 原生体系上叠加，不替换原生 agent/tool
```

## 当前状态（V3.3 · 2026-07-15）

| 模块 | 版本 | 状态 |
|------|------|------|
| 双星系统 | **V3.3** | ✅ 主力智能助手 + 工匠(带LSP) + 参谋/军师顾问 |
| 记忆管家 | V1.0 | ✅ 三层记忆 + 赛博分身 |
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

## 记忆管家

```
~/.config/opencode/plugins/memories.ts (668行)
  ├── system.transform → 注入 blocks + triggers 到 system prompt
  ├── event            → 记录 message/file/tool 事件到 events.log
  ├── 分析触发          → 新会话启动时检查增量，LLM 自主学习习惯
  └── session.compacting → 防压缩丢失

~/.config/opencode/memories/
  ├── blocks/           ← 习惯描述（赛博分身自动维护）
  ├── triggers/         ← 触发规则（赛博分身生成）
  ├── events.log        ← 事件原始日志
  ├── debug.log         ← 诊断日志
  └── last-analysis.json ← 分析进度记录

~/.config/opencode/agents/助理.md ← 赛博分身 agent
```

## 部署

```powershell
.\deploy.ps1
```

脚本会部署所有 agent（双星/工匠/参谋/军师/助理）、命令和记忆管家插件到 `~/.config/opencode/`。

**手动部署或新电脑首次安装时：**

1. 确保 `opencode.json` 的 `plugin` 数组包含 `"memories"` 和 `"oh-my-opencode-slim"`
2. 设置环境变量 `OPENCODE_EXPERIMENTAL_LSP_TOOL=true`（LSP 主动工具）
3. 创建记忆存储目录：
   ```powershell
   New-Item -ItemType Directory -Path "$env:USERPROFILE\.config\opencode\memories\blocks" -Force
   New-Item -ItemType Directory -Path "$env:USERPROFILE\.config\opencode\memories\triggers" -Force
   ```
4. 重启 OpenCode

## 文档

| 文档 | 说明 |
|------|------|
| `双星系统/设计.md` | V3 架构总览 |
| `双星系统/版本记录.md` | V1→V3 完整版本历史 |
| `双星系统/archive/V1/设计.md` | V1 仲裁器架构（已废弃） |
| `双星系统/archive/V2/设计.md` | V2 智能助手架构（基线） |
| `doc/设计/双星V3-编码能力升级方案.md` | V3 详细设计方案 |
| `doc/知识/权限控制机制对比-CC-vs-OC.md` | CC vs OC 权限机制对比 |
| `doc/知识/skill选型参考.md` | 35 个技能选型指南 |
