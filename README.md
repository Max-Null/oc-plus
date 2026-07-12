# oc-plus — OpenCode 80分改造计划

将 OpenCode 从 60 分改造到 80 分，实现与 Claude Code 同等的使用体验。

## 改造原则

```
增强不替换：所有模块在 OC 原生体系上叠加，不替换原生 agent/tool
```

## 当前状态（跨会话同步用——读到这行即知道进度。双星 V1.1 ✅，记忆管家 V1.0 ✅）

| 阶段 | 模块 | 状态 | 说明 |
|------|------|------|------|
| 一 | Memories Plugin | ✅ Phase 1 MVP | `~/.config/opencode/plugins/memories.ts`，已注册到 opencode.json |
| 一 | review-habits.md | ✅ | `~/.config/opencode/memories/review-habits.md`，自动维护 |
| 一 | AGENTS.md（全局规则） | ✅ | `~/.config/opencode/AGENTS.md`，69 行纯净技术规范 |
| 一 | Superpowers | ✅ | 已安装，14 个 skill |
| 一 | CC 规则隔离 | ✅ | `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1` |
| 一 | 双星系统 V1.1 | ✅ 已实施 | `.opencode/agents/` 4 个 agent，`/double-star` 命令 |
| 一 | 记忆管家 V1.0 | ✅ 已实施 | 赛博分身 agent + 三层记忆 + 自主习惯发现 + 触发执行 |

## 记忆管家架构

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
```

## 下一步（读到这行知道该做什么）

1. 记忆管家 V1.0 + 双星系统 V1.1 已完成
2. 下一步：试运行，积累事件，验证赛博分身 2/4/7 阈值和三层记忆路径

## 文件清单

```
oc-plus/
├── README.md               ← 总览 + 进度同步
├── package.json
├── .gitignore
├── 双星系统/
│   ├── 设计.md              ← 双星系统设计文档
│   ├── agents/              ← 双星源码（4 agent 定义）
│   │   ├── left-brain.md
│   │   ├── right-brain.md
│   │   ├── orchestrator.md
│   │   └── build-executor.md
│   └── commands/
│       └── double-star.md
├── 记忆管家/
│   ├── 设计.md              ← 记忆管家设计文档
│   ├── memories.ts          ← 记忆管家 Plugin 源码（668行）
│   └── agents/
│       └── cyber-alterego.md ← 赛博分身 agent 定义
└── doc/                    ← 计划 / 原型 / 知识
```

## 全局部署

所有 agent 定义和命令需要部署到全局才能跨项目生效：

```
~/.config/opencode/
├── agents/
│   ├── left-brain.md        ← 从 oc-plus/双星系统/agents/ 复制
│   ├── right-brain.md
│   ├── orchestrator.md
│   ├── build-executor.md
│   └── cyber-alterego.md    ← 从 oc-plus/记忆管家/agents/ 复制
└── commands/
    └── double-star.md
```

## 使用方式

在 oc-plus 目录下启动 opencode：
```powershell
cd H:\MaxNull\WorkStation\oc-plus
opencode
```

然后说"继续上次的工作"——opencode 读到 README.md 就知道进度，接着继续。
