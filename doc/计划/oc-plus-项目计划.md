# oc-plus 项目计划

> 状态：进行中 · 最后更新：2026-07-17

## 一、当前版本概览

| 模块 | 版本 | 状态 |
|------|------|------|
| 双星系统 | V3.3 | ✅ 主力运作中 |
| 记忆管家 | V1.3 | ⬜ 试运行验证中 |
| AGENTS.md | — | ✅ 持续维护 |
| CC 规则隔离 | — | ✅ |

---

## 二、记忆管家 — 待办

### 2.1 试运行验证 ⬜

部署已就绪（2026-07-17），待重启 OC 后进行以下验证：

- [ ] 插件加载（检查 debug.log）
- [ ] system.transform 注入记忆到 system prompt
- [ ] event hook 记录事件
- [ ] 累积 20+ 事件后触发 LLM 分析
- [ ] `/memories` 命令可用
- [ ] 回应模式正常（写文件后调 助理 subagent）

### 2.2 替代升级路径 📋

**当前方案**：system.transform 中写死规则 → 主 agent 读规则 → 调 助理 subagent

**问题**：回应逻辑分散在两处（plugin 注入规则 + 助理.md agent 定义），维护成本高。

**替代方案**：event hook + `client.session.prompt`

```
event hook 监听 file.edited（或其他文件事件）
  → 匹配 triggers/ 中的触发条件
  → client.session.prompt({ noReply: true }) 注入消息到会话
  → 主 agent 自然响应
```

**收益**：
- 回应逻辑集中在 助理.md，plugin 只负责匹配和注入
- 不再需要在 system.transform 中维护「写完文件后调助理」的硬规则
- 与双星系统的职责更正交

**前置条件**：opencode SDK 需暴露 `client.session.prompt` API（当前是否可用待验证）

### 2.3 理想升级路径 📋

当 opencode SDK 支持 `client.agent.invoke({ agent: "助理", ... })` 时：

- 分析模式从 TypeScript fetch → 纯 agent 定义
- 分析逻辑与代码完全分离
- 不再需要 `prompts.ts`，prompt 直接写在 助理.md 的分析模式 section 中

---

## 三、双星系统 — 待办

（待补充）

---

## 四、项目基础设施 — 待办

- [x] `doc/计划/README.md` 完善索引
- [x] 部署脚本 `deploy.ps1` 覆盖记忆管家 CLI 脚本和 prompts.ts
- [x] README.md 中记忆管家版本号更新为 V1.3
