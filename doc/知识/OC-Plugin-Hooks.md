# OC Plugin Hooks 完整参考

> 来源：`@opencode-ai/plugin` 源码 `packages/plugin/src/index.ts` + OC 官方文档
> 验证日期：2026-07-18

## 插件签名

```typescript
// 标准导出格式（文件插件必需 export default）
export default {
  id: "plugin-id",           // 文件插件必须声明 id
  server: async (input: PluginInput, options?: PluginOptions) => Promise<Hooks>,
}

// PluginInput 字段
interface PluginInput {
  client: any        // OpencodeClient（session.prompt() / session.promptAsync()）
  project: Project   // 项目信息
  directory: string  // 工作目录
  worktree: string   // Git 工作树根
  serverUrl: URL     // 服务端地址
  $: BunShell        // 执行系统命令
}
```

## 完整 Hooks 列表（16+）

### 生命周期 Hooks

| Hook | 触发时机 | 可修改 |
|------|---------|--------|
| `dispose` | 插件卸载 | ❌ |
| `config` | 启动时注入配置 | ✅ 命令/agent/MCP |

### 事件 Hook

| Hook | 说明 |
|------|------|
| `event` | 订阅所有系统事件（30+ 事件类型） |

可用事件类型：

| 类别 | 事件 |
|------|------|
| Command | `command.executed` |
| File | `file.edited`, `file.watcher.updated` |
| LSP | `lsp.client.diagnostics`, `lsp.updated` |
| Message | `message.part.removed`, `message.part.updated`, `message.removed`, `message.updated` |
| Permission | `permission.replied`, `permission.updated` |
| Session | `session.created`, `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`, `session.status`, `session.updated` |
| Shell | `shell.command.*` |
| Tool | `tool.execute.after`, `tool.execute.before` |
| TUI | `tui.prompt.append`, `tui.command.execute`, `tui.toast.show` |

### 拦截/修改 Hooks

| Hook | 触发时机 | 可修改 |
|------|---------|--------|
| `chat.message` | 收到新消息 | ✅ 消息内容 + parts |
| `chat.params` | LLM 调用前 | ✅ temperature, topP, maxTokens |
| `chat.headers` | LLM 调用前 | ✅ HTTP 头 |
| `permission.ask` | 权限请求 | ✅ ask/deny/allow |
| `command.execute.before` | 命令执行前 | ✅ parts |
| `tool.execute.before` | 工具执行前 | ✅ args |
| `tool.execute.after` | 工具执行后 | ✅ title, output, metadata |
| `shell.env` | Shell 启动前 | ✅ 环境变量 |

### 上下文/压缩 Hooks

| Hook | 触发时机 | 可修改 |
|------|---------|--------|
| `experimental.chat.system.transform` | 构建 system prompt 前 | ✅ 追加 system 行 |
| `experimental.chat.messages.transform` | 发送消息列表前 | ✅ 整个消息列表 |
| `experimental.session.compacting` | 会话压缩前 | ✅ 压缩 prompt / context |
| `experimental.compaction.autocontinue` | 压缩后 | ✅ 是否自动继续 |
| `experimental.text.complete` | LLM 输出后 | ✅ 文本 |

### 扩展 Hooks

| Hook | 说明 |
|------|------|
| `tool` | 注册自定义工具 |
| `tool.definition` | 修改工具描述/参数 |
| `auth` | 注册认证 provider |
| `provider` | 注册模型 provider |
| `experimental.provider.small_model` | 选择小型模型 |

## 关键限制

- **event hook 中不能 spawn sub-agent**（OC Issue #20387）
- `tool.execute.after` 不能从 hook 中调用 `client.agent.invoke()`
- 替代方案：`client.session.prompt()` / `promptAsync()` + event hook
- `@opencode-ai/plugin` 是纯类型包，无运行时代码——`import type` 在运行时被擦除
