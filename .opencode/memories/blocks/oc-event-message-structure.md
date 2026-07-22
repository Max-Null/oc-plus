<!-- priority: 30 --><!-- type: knowledge --><!-- status: auto --><!-- description: OC EventMessageUpdated 事件结构——role/content 在 info 内 -->

## EventMessageUpdated 事件结构（实测 + SDK 类型确认）

**事实**：`message.updated` 事件的 `properties` 只有 `{ info: Message }`，`role`/`content`/`parts` 全部嵌套在 `properties.info` 下，**不在** `properties` 顶层。

类型定义（`@opencode-ai/sdk/dist/gen/types.gen.d.ts:129-134`）：
```ts
export type EventMessageUpdated = {
    type: "message.updated";
    properties: {
        info: Message;  // UserMessage | AssistantMessage
    };
};
```

正确的读取路径：
- ✅ `event.properties.info.role` — role 是 "user" 或 "assistant"
- ✅ `event.properties.info.content` — 消息正文
- ✅ `event.properties.info.parts` — 工具调用等子部件
- ❌ `event.properties.role` — 永远 undefined

**原则**：插件中读取事件字段时，先查 SDK 类型定义（`node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`），不要猜路径。

**反例**：fractal.ts 中 4 处 `properties.role` / `properties.content` 写法，导致触发线 4 断言检测完全静默失效（2026-07-21 修复）。

**结论**：`.properties.info.xxx`，记死这个路径。
