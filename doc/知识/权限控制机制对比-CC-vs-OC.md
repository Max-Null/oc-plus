# CC vs OC 权限控制机制对比

> 生成时间：2026-07-15 | 基于官方文档和社区资料

---

## 一、总览对比

| 维度 | Claude Code (CC) | OpenCode (OC) |
|------|-----------------|---------------|
| 配置文件 | `.claude/settings.json` | `opencode.json` |
| 规则类型 | `allow` / `ask` / `deny` 三个数组 | `allow` / `ask` / `deny` 三个 effect（V2 数组语法） |
| 规则格式 | `Tool(pattern)`，如 `Bash(git push *)` | `{ action, resource, effect }` 三元组 |
| 评估顺序 | **deny → ask → allow，第一个匹配胜出** | **数组顺序，最后匹配胜出（last-wins）** |
| 配置层级 | managed > CLI > local项目 > shared项目 > user | Agent默认 < 用户配置 < Session运行时（三级叠加） |
| Agent 覆盖 | subagent 可设不同 mode | Agent 级 `permissions` 数组追加在全局规则之后 |

---

## 二、权限模式对比

### CC：6 种模式（`Shift+Tab` 循环切换）

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `default`（Manual） | 标准行为，首次使用工具时提示 | 日常开发、敏感项目 |
| `acceptEdits` | 自动接受文件编辑和常见文件系统命令 | 代码迭代 |
| `plan` | 只读探索，不编辑源码 | 探索代码库、设计方案 |
| `auto` | **后台 AI 分类器审查操作**，安全放行、风险阻止 | 长任务、减少提示疲劳 |
| `dontAsk` | 只允许预批准的工具，其余拒绝 | 锁定 CI/脚本 |
| `bypassPermissions` | 跳过所有提示（仅隔离环境） | 容器、VM |

### OC：YOLO 模式 + Agent 切换

| 模式/机制 | 说明 | 适用场景 |
|-----------|------|---------|
| 默认（规则控制） | 按 `permissions` 规则决定 allow/ask/deny | 日常开发 |
| **YOLO 模式** | 自动批准所有 `ask` 规则（`deny` 仍然生效） | 快速原型、低风险批量操作 |
| 自定义 Agent | 创建权限不同的 Agent 应对不同场景 | 精细化权限管理 |
| TUI 命令面板 | Enable/Disable auto-approve permissions | 临时切换 |

---

## 三、auto 模式深度对比（核心差异）

### CC 的 auto 模式

```
用户请求 → 权限规则评估 → auto 分类器（第二道闸门）→ 执行/阻止
```

- **独立分类器模型**在后台审查每个工具调用，不是简单的规则匹配
- 检查维度：是否破坏性（批量删除）、敏感数据外泄、恶意代码执行
- 配置 `autoMode` 块微调分类器行为：
  - `environment`：声明信任的仓库/桶/域名
  - `hard_deny`：无条件阻止（用户意图也无法覆盖）
  - `soft_deny`：可被用户意图覆盖的阻止
  - `allow`：`soft_deny` 的例外
- 被阻止的操作记录在 `/permissions` → Recently denied，可按 `r` 重试
- 启用条件：满足账户要求 + `claude --enable-auto-mode`

### OC 的 YOLO 模式

```
用户请求 → 权限规则评估（ask 全部变 allow，deny 依然生效）→ 执行
```

- **没有 AI 分类器**，纯粹是规则层面的"批量批准"
- 行为：「所有 `ask` → 自动批准为 `once`」
- `deny` 规则始终生效，这是安全底线
- 两种模式：
  - **Session-only**：重启后重置
  - **Permanent**：保存到 `opencode.json`
- 启用方式：
  - TUI 命令面板：Enable auto-approve permissions
  - CLI：`opencode --yolo`
  - 环境变量：`OPENCODE_YOLO=true`
  - 配置：`"yolo": true`

### 本质区别

| | CC auto 模式 | OC YOLO 模式 |
|---|---|---|
| 决策机制 | AI 分类器（语义理解） | 规则匹配（全部放行 ask） |
| 安全级别 | 高（分类器阻止风险操作） | 中（仅 deny 规则兜底） |
| 误杀率 | 有一定误杀（可调） | 无（不会误杀 ask，但也不会主动识别风险） |
| 可配置性 | 丰富的 `autoMode` 配置 | 二元开关 |
| 适用场景 | 长任务、需离开屏幕 | 快速原型、信任的操作 |

---

## 四、规则语法对比

### CC

```jsonc
// ~/.claude/settings.json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(git status)",
      "Bash(git diff)"
    ],
    "ask": [
      "Bash(git push *)"
    ],
    "deny": [
      "Read(./.env)",
      "Bash(rm -rf *)"
    ]
  }
}
```

### OC（V2 推荐）

```jsonc
// opencode.json
{
  "permissions": [
    { "action": "*",     "resource": "*",              "effect": "ask"   },
    { "action": "read",  "resource": "*",              "effect": "allow" },
    { "action": "read",  "resource": "*.env",          "effect": "deny"  },
    { "action": "shell", "resource": "git status *",   "effect": "allow" },
    { "action": "shell", "resource": "git push *",     "effect": "deny"  },
    { "action": "edit",  "resource": "packages/docs/*.mdx", "effect": "allow" }
  ]
}
```

> **关键差异**：CC 是 deny 优先且第一个匹配胜出，OC 是数组顺序、最后匹配胜出。OC 建议将宽泛规则放前面、具体例外放后面。

---

## 五、运行时审批交互

| 行为 | CC | OC |
|------|----|----|
| 批准一次 | Yes（permission prompt） | `once` |
| 批准并记住（会话内） | — | `always`（当前 session 有效，重启丢失） |
| 拒绝 | Yes | `reject`（同时拒绝同 session 的其他待处理请求） |
| 持久化批准 | 通过 `permissions.allow` 规则 | 无（`always` 不持久化，出于安全设计） |

---

## 六、选型建议

| 如果你的需求是…… | 推荐 |
|------------------|------|
| 日常开发，需要精细控制 | OC 权限规则 + 按需 Agent 覆盖 |
| 长任务不想频繁点确认 | CC auto 模式（有分类器保障） |
| 快速原型/低风险批量操作 | OC YOLO 模式（Session-only） |
| 团队统一安全策略 | CC managed settings 的 deny + disableBypassPermissionsMode |
| 多 Agent 协作各司其职 | OC 的 Agent 级 permissions 覆盖（更灵活） |
| CI/脚本中的锁定模式 | CC `dontAsk` 或 OC 严格 deny 规则 |
