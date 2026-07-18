<!-- type: knowledge --><!-- status: pending --><!-- description: OC 1.18 插件自动发现：子目录隔离非插件模块 -->

## OC 1.18 插件自动发现 — 子目录隔离法

**事实**：OC 1.18 用 Glob 模式 {plugin,plugins}/*.{ts,js} 扫描插件目录，**每个匹配的一级 .ts 文件都会被当作插件处理**。非插件工具模块（如 prompts.ts）放在同一目录会导致加载错误。

**原则**：工具模块放子目录（如 plugins/lib/），Glob 的 * 不匹配子目录 → OC 不扫描。插件内 import 改为 ./lib/xxx.js。

**反例**：
- ❌ plugins/fractal.ts + plugins/prompts.ts → prompts.ts 被 OC 当插件报 Plugin export is not a function
- ✅ plugins/fractal.ts + plugins/lib/prompts.ts → OC 只扫描到 fractal.ts

**结论**：插件目录只放插件入口文件，所有依赖模块放到子目录。

**额外要点**：
- OC 1.18 原生日志：~/.local/share/opencode/log/opencode.log（UTC 时间戳）
- V1 hooks（system.transform、event、tool.execute.after）在 1.18 仍有效
- ile:// URL 在 opencode.json 的 plugin 数组中不工作（1.18 仅 npm 包名有效）
- Bun 缓存失败的 import：改代码 → 重启 OC 才能生效
