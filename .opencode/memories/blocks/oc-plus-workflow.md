<!-- type: knowledge --><!-- status: auto --><!-- description: oc-plus 改动流程——先改源码再部署，不要反过来 -->

## 改动流程：先源码，再部署

**原则**：在 oc-plus 工作区下，任何对分形/双星/技能的改动，**必须先改项目源码目录**，再通过 `node deploy.mjs` 部署到 `~/.config/opencode/`。

```
正确：分形/fractal.ts（改）→ deploy.mjs → ~/.config/opencode/plugins/fractal.ts（生效）
错误：~/.config/opencode/plugins/fractal.ts（改）→ 往回 Copy-Item → 分形/fractal.ts
```

**为什么**：源码是唯一的事实来源，部署目标是从源码派生的。反向操作会导致 commit 遗漏、两次校验哈希不一致。

**反例**：本轮两次直接改 `~/.config/opencode/plugins/fractal.ts`，事后才往回同步，浪费了额外的 diff 验证和重复部署步骤。
