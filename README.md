# oc-plus — OpenCode 80分改造计划

将 OpenCode 从 60 分改造到 80 分，实现与 Claude Code 同等的使用体验。

## 改造原则

```
增强不替换：所有模块在 OC 原生体系上叠加，不替换原生 agent/tool
```

## 当前状态（V3.6 · 2026-07-19）

| 模块 | 版本 | 状态 |
|------|------|------|
| 双星系统 | **V3.6** | ✅ skill感知 + 修改审查 + agents-priority + 分形集成 + 编码工程规范 |
| agents-priority | — | ✅ AGENTS.md 中文规范前置，不被 omo-slim 淹没 |
| 分形 | V3.3 | ✅ Guardian Agent + 五条触发线全部实现（含触发线2无反馈环扩展） + 三层记忆 + 自主知识记录 + 断言检测 + 提交知识提取 |
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
├── 技能/               ← 自定义 skill（mxy- 系列 8 个 + mxy-commit-review）
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
