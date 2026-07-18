# OC 插件加载机制

> 来源：OC 源码 `packages/opencode/src/plugin/loader.ts` + `shared.ts` + 实战踩坑
> 验证日期：2026-07-18

## 加载流程

```
OC 启动
  ↓
读取 opencode.json → plugin 数组（npm 包）+ 自动发现（本地文件）
  ↓
resolvePluginTarget() → 本地路径或 npm 安装
  ↓
createPluginEntry() → 解析入口模块
  ↓
import(entry) → Bun 动态导入
  ↓
readV1Plugin(mod) → 检测模块导出格式
```

## 两条加载路径

### 路径 A：V1 格式（推荐）

```typescript
// ✅ 需要 export default + id + server
export const MyPlugin = async (input) => { return { ...hooks... } }

export default {
  id: "my-plugin",      // 文件插件必需！resolvePluginId 会检查
  server: MyPlugin,
}
```

`readV1Plugin(mod, spec, "server", "detect")` 检测 `mod.default` 是否为对象（含 server 函数）。

### 路径 B：Legacy 模式（不稳定，不推荐）

如果路径 A 返回 undefined（detect 模式），回退到 `getLegacyPlugins`——遍历所有命名导出，找出函数类型的导出。

## 自动发现

- `~/.config/opencode/plugins/*.ts` — 全局，启动时自动加载
- `.opencode/plugins/*.ts` — 项目级，启动时自动加载
- `opencode.json` 的 `plugin` 数组中写的是 **npm 包名**，不是本地文件

## 踩坑记录

### 坑 1：没有 export default

**现象**：插件完全不加载，debug.log 为空  
**原因**：`readV1Plugin` 要求 `mod.default`，没有 default export 则走 legacy 路径（不稳定）  
**修复**：加 `export default { id: "xxx", server: pluginFn }`

### 坑 2：Bun 缓存失败的 dynamic import

**现象**：修改代码后重启 OC，改动不生效  
**原因**：Bun 会缓存失败的模块解析（OC loader.ts 注释明确提到），一旦失败后续导入都返回缓存结果  
**修复**：改代码 → 重启 OC（因为 Bun 缓存是进程级的）

### 坑 3：模块级别 I/O 可能被沙箱阻止

**现象**：模块顶层的 `fs.writeFileSync` 在 OC 沙箱中可能失败，导致整个模块加载崩溃  
**建议**：I/O 操作放在函数体内，不要放在模块顶层

### 坑 4：`import type { PluginInput }` 无意义

`@opencode-ai/plugin` 是纯类型包，`import type` 在运行时被完全擦除。担心导入失败时用内联类型即可。
