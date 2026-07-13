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

## 双星系统架构

```
用户输入
    │
    ▼
┌──────────────────────────────────────┐
│     协调层 (双星 / Primary)    │
│  ┌──────────┐  并行调用  ┌──────────┐ │
│  │ 左脑     │ ←────────→ │ 右脑     │ │
│  │ 微观路径  │            │ 宏观目标  │ │
│  │ temp=0.2 │            │ temp=0.7 │ │
│  │ 只读     │            │ 只读     │ │
│  └────┬─────┘            └────┬─────┘ │
│       │ JSON 摘要              │       │
│       └──────────┬─────────────┘       │
│                  ▼                     │
│         仲裁整合（偏差≥20%→右脑优先）    │
│                  │                     │
│            最终指令 + 日志              │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│    Build Executor (Subagent)          │
│    执行层 / 全权限 / temp=0.1          │
│    接收指令 → 执行代码 → 返回结果       │
└──────────────────────────────────────┘
```

~/.config/opencode/agents/ 下 4 个 agent 定义，通过 `/double-star` 命令启动协作流程。

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
│   │   ├── 左脑.md
│   │   ├── 右脑.md
│   │   ├── 双星.md
│   │   └── 构建执行器.md
│   └── commands/
│       └── double-star.md
├── 记忆管家/
│   ├── 设计.md              ← 记忆管家设计文档
│   ├── memories.ts          ← 记忆管家 Plugin 源码（668行）
│   └── agents/
│       └── 助理.md ← 赛博分身 agent 定义
└── doc/                    ← 计划 / 原型 / 知识
```

## 全局部署

所有 agent 定义和命令需要部署到全局才能跨项目生效：

```
~/.config/opencode/
├── agents/
│   ├── 左脑.md        ← 从 oc-plus/双星系统/agents/ 复制
│   ├── 右脑.md
│   ├── 双星.md
│   ├── 构建执行器.md
│   └── 助理.md    ← 从 oc-plus/记忆管家/agents/ 复制
└── commands/
    └── double-star.md
```

## 部署（在新电脑上）

将 oc-plus 目录复制到目标电脑，打开 PowerShell，执行以下步骤：

### 1. 部署 agent 定义

```powershell
$OC = "$env:USERPROFILE\.config\opencode"
New-Item -ItemType Directory -Path "$OC\agents" -Force | Out-Null
New-Item -ItemType Directory -Path "$OC\commands" -Force | Out-Null

# 逐个复制，不会误伤已有 agent
Copy-Item ".\双星系统\agents\左脑.md" "$OC\agents\" -Force
Copy-Item ".\双星系统\agents\右脑.md" "$OC\agents\" -Force
Copy-Item ".\双星系统\agents\双星.md" "$OC\agents\" -Force
Copy-Item ".\双星系统\agents\构建执行器.md" "$OC\agents\" -Force
Copy-Item ".\记忆管家\agents\助理.md" "$OC\agents\" -Force
```

### 2. 部署命令

```powershell
Copy-Item ".\双星系统\commands\*.md" "$OC\commands\" -Force
```

### 3. 部署记忆管家 Plugin

```powershell
New-Item -ItemType Directory -Path "$OC\plugins" -Force | Out-Null
Copy-Item ".\记忆管家\memories.ts" "$OC\plugins\memories.ts" -Force

# 创建记忆存储目录
New-Item -ItemType Directory -Path "$OC\memories\blocks" -Force | Out-Null
New-Item -ItemType Directory -Path "$OC\memories\triggers" -Force | Out-Null
```

### 4. 注册 Plugin

编辑 `~/.config/opencode/opencode.json`，确保 `plugin` 数组中包含 `"memories"`：

```json
{
  "plugin": ["...其他插件...", "memories"]
}
```

### 5. 重启 opencode

重新启动 opencode 后，在任意项目中输入 `/double-star` 测试双星系统，正常使用一段时间后检查 `~/.config/opencode/memories/events.log` 验证记忆管家是否在记录事件。
