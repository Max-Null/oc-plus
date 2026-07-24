# 计划阶段启动指令

设计方案确认后，注入到 system.transform 的计划阶段启动 prompt。

## 触发条件

`checkDesignStageComplete()` 返回 true → `state.currentStage === "planning"` → system.transform 注入。

## Prompt 模板

```markdown
设计方案已确认。现在进入**计划阶段**。

请将「{feature}」的设计方案拆解为具体实施任务。

要求：
- 每步 2-5 分钟可完成
- {如果 complexity === "simple"：3 步以内即可}
- {如果 complexity === "complex"：需要完整拆解，覆盖所有模块和接口}
- 写入 `~/.config/opencode/plans/{时间戳}-{功能名}.md`
- 每步标注验证方式（如何确认这一步做对了）

格式参考：
```markdown
## 实施计划

### 步骤 1: xxx
- 操作：xxx
- 文件：xxx
- 验证：xxx
```

完成后输出「计划已完成」。
```
