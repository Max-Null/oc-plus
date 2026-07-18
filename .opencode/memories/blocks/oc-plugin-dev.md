<!-- type: knowledge --><!-- status: auto --><!-- description: OC插件开发要点速查——hooks/加载/上下文方案 -->

## OC 插件开发要点

**Hooks 完整度**：OC 有 16+ hooks + 30+ 事件（不是 3 个）。包括 `tool.execute.before/after`、`chat.message`、`permission.ask`、`experimental.chat.messages.transform`（可修改消息列表）等。详见 `doc/知识/OC-Plugin-Hooks.md`。

**插件加载格式**：必须 `export default { id: "xxx", server: pluginFn }`。Bun 缓存失败的 dynamic import——改代码必须重启 OC。模块顶层 I/O 可能被沙箱阻止。详见 `doc/知识/OC-Plugin-Loading.md`。

**上下文精简方案**：DCP（2.2K⭐）/ACP 是社区验证方案。核心思路：LLM 主动调用 compress 工具 + 外部执行删除。短会话激进裁剪会降智，长会话收益>代价。动态阈值（根据会话特征决定是否裁剪）是空白领域。详见 `doc/知识/OC-Context-Plugins.md`。

**触发原则**：遇到 OC 相关问题 → 先 read 上述文档 → 再联网兜底。
