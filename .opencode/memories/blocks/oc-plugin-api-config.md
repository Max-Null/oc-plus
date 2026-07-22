<!-- priority: 30 --><!-- type: knowledge --><!-- status: auto --><!-- description: OC 插件中读取 API 配置的正确方式——匹配式查 provider.models，不硬编码 -->

## 插件中 LLM API 配置的正确读取方式

**事实**：`opencode.json` 中模型名格式为 `provider名:模型名`（如 `ds:deepseek-v4-pro`），但 DeepSeek API 只接受纯模型名。直接传 `ds:xxx` 会返回 HTTP 400。

**原则**：
1. 从 `config.model` 解析出 provider 名和模型名（按 `:` 拆分）
2. 用 provider 名去 `config.provider[providerName]` 精确匹配——**不要遍历所有 provider 碰运气**
3. 从 `provider.models` 中匹配式选择分析用模型（优先含 `flash` 关键字的）
4. 模型名必须剥离 provider 前缀再发给 API

**反例**：PHASE2 版本直接把 `config.model` 原值（`ds:deepseek-v4-pro`）发给 API → 400。之前还硬编码过 `"deepseek-v4-flash"` 字符串。

**结论**：从 `provider.models` 的 key 中匹配，不要在任何地方硬编码模型名字符串。
