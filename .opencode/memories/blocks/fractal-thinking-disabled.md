<!-- type: knowledge --><!-- status: auto --><!-- description: fractal.ts 中 LLM 调用统一禁用 thinking 的原因——DeepSeek 默认开启会浪费 token -->

## fractal.ts 中 thinking 显式禁用的设计原因

**事实**：DeepSeek V4 的 thinking 模式**默认开启**（官方文档确认：`The thinking toggle defaults to enabled`）。

**为什么显式传 `{ "type": "disabled" }`**：
- 分析任务（事件分析、trigger 语义匹配、commit 知识提取）不需要推理链——直接输出结果即可
- thinking 模式下会生成 `reasoning_content`，计入 token 费用
- thinking 模式下不支持 `temperature` 参数（传了也无效），禁掉后 temperature 才生效

**不传 thinking 会怎样**：默认开启 → 每次分析调用多花推理 token（无意义的内部推理）→ 响应更慢 → temperature 被忽略。

**结论**：fractal.ts 中所有 LLM 调用都要显式 `thinking: { type: "disabled" }`，删除任何一处都会导致该调用静默切换到 thinking 模式。
