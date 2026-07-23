# 分形审查与习惯确认时机优化

> 状态：已完成 | 创建：2026-07-23

## 背景

用户提出两个问题：
1. 文件编辑后审查的触发时机不当——`file.edited` 事件在 agent 回复过程中反复触发，立即注入审查会打断回复
2. 习惯确认在每轮 `system.transform` 开头硬性阻断——打断用户原本意图

## 改动1：文件编辑审查 → 推迟到 session.idle 批量注入

**当前流程（有问题）：**
```
file.edited → tryTriggerMatch → generateTriggerMessage → promptAsync 立即注入
```

**新流程：**
```
file.edited → 队列 pendingReviewQueue（仅 glob 匹配，不做 LLM）
session.idle → 消费队列 → generateTriggerMessage → promptAsync({ noReply: true })
```

**改动的代码位置：** `D:\Project\oc-plus\分形\fractal.ts`

### 修改点1-1：event hook 中 `file.edited` 处理（≈L1895-1898）
- 移除立即 `tryTriggerMatch(event.properties)` 调用
- 改为：提取 filePath → glob 匹配 → 推入 `pendingReviewQueue[]`
- 保留 `editsThisTurn++` 和 `logEvent(event)`

### 修改点1-2：event hook 中新增 `session.idle` 处理（≈L1898 之后）
- 新增 `if (event.type === "session.idle")` 分支
- 消费 `pendingReviewQueue`，按 sessionID 过滤
- 逐条调 `generateTriggerMessage` + `promptAsync({ noReply: true })`
- 用 `splice` 清空已消费项

### 修改点1-3：新增队列状态变量
- `pendingReviewQueue: Array<{ filePath: string; trigger: TriggerMatch; sessionID: string }>` — 模块级
- 辅助函数 `extractFilePath(props)` / `extractSessionID(props)` — 从 `tryTriggerMatch` 中提取

## 改动2：习惯确认 → 从 system.transform 移到 session.idle

**当前流程（有问题）：**
```
每轮 system.transform → 检查 pending blocks → 注入硬性阻断规则（必须用 question()）
```

**新流程：**
```
session.idle → 检查 pending blocks/triggers → promptAsync({ noReply: true }) 注入温和提醒
```

### 修改点2-1：system.transform 移除 pending 确认注入（L1716-1731）
- 删除 `// 注入 pending 确认提示` 整段代码（L1716-1731）
- 同时删除 `prompts/core-rules.md` 中的 `习惯确认` 硬性阻断规则段落

### 修改点2-2：event hook 中 `session.idle` 新增习惯确认（与 1-2 合并）
- 在同一个 `session.idle` 分支中，处理完审查队列后
- 调用 `mergeBlocksAndTriggers()` 检查 pending items
- 如果有 → 生成温和提醒文本 → `promptAsync({ noReply: true })`

### 修改点2-3：`prompts/core-rules.md` 移除硬性阻断规则
- 文件：`D:\Project\oc-plus\分形\prompts\core-rules.md`
- 删除 L29-L31 的 `习惯确认` 硬性规则（`你必须先用 question 工具逐条确认...`）
- 保留元知识记录规则（手动+自主两路）

## 风险点

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| session.idle 在子 agent 场景可能提前触发 | 中 | 官方维护者称正常场景下可靠；用 splice 清空队列防重复 |
| 多会话 interleaving | 低 | 按 sessionID 过滤队列项 |
| noReply:true 的消息可能不被 agent 看到 | 低 | OC SDK 文档确认 noReply 消息会被保留为对话上下文 |

## 测试缝

- 改动1：人工测试——编辑触发文件 → 观察审查消息是否在 agent 完成回复后出现
- 改动2：人工测试——存在 pending block 时完成一轮对话 → 观察提醒是否出现在末尾
- 单元测试：涉及 OC plugin 环境，暂无测试框架，以手动验证为主

## 执行步骤

1. ✅ 阶段1：读取关键代码段
2. ⬜ 阶段2：制定规格（当前）
3. ⬜ 修改 `prompts/core-rules.md` — 移除硬性阻断
4. ⬜ 修改 `fractal.ts` — 改动1+2
5. ⬜ 编译验证 `npx tsc --noEmit`
6. ⬜ 阶段4：git diff + 军师审查
