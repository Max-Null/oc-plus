<!-- type: knowledge --><!-- status: auto --><!-- description: CC 核心能力边界速查——插件/Hook/Agent/MCP 真实能力清单 -->
## CC 核心能力速查

事实：CC 和 OC 在插件系统上基本同级，各有优势。
原则：做 CC vs OC 对比时，不能说"OC 比 CC 差很多"——这已被联网验证否定了。

### CC 插件组件（10 种）
skills / commands / agents / hooks / MCP servers / LSP servers / monitors / output-styles / themes / channels
平台：`.claude-plugin/plugin.json` + 目录结构自动发现

### CC Hook 事件（28 个）
会话: SessionStart/Setup/SessionEnd
用户: UserPromptSubmit/UserPromptExpansion
工具: PreToolUse/PermissionRequest/PermissionDenied/PostToolUse/PostToolUseFailure/PostToolBatch
文件: FileChanged
Agent: SubagentStart/SubagentStop/TaskCreated/TaskCompleted/TeammateIdle
上下文: PreCompact/PostCompact/InstructionsLoaded
配置: ConfigChange/CwdChanged
通知: Notification/MessageDisplay

### CC Hook 执行类型（5 种）
command (shell子进程) / http (POST) / mcp_tool / prompt (LLM判断) / agent (多轮验证)

### CC 真正领先 OC 的领域
maxTurns（防死循环） / effort（推理深度） / background agent（原生） / worktree isolation / 后台 Monitor / Marketplace

### CC 不如 OC 的领域
Hook 效率（OC 进程内 vs CC shell子进程） / 权限粒度 / CC 兼容性（OC 原生读 .claude/） / 编程自由度

结论：对比时不要凭记忆，要查 `doc/知识/CC插件系统-OC改造参考.md`。
