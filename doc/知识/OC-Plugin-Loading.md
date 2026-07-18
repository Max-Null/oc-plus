# OC 插件加载机制

> 来源：OC 源码 `packages/opencode/src/plugin/index.ts` + 实战踩坑
> 验证日期：2026-07-19（OC 1.17.x）

## 加载流程

```
OC 启动
  ↓
自动发现 `~/.config/opencode/plugins/*.ts`（全局）+ `.opencode/plugins/*.ts`（项目）
  ↓
Bun 动态 import() 每个文件
  ↓
applyPlugin() → 先试 readV1Plugin，失败则走 getLegacyPlugins
  ↓
插件函数被调用 → 返回 Hooks → 懒加载：首次 hook 触发才调插件函数
```

## 插件格式（OC 1.17.x 实测）

### ✅ 函数式格式（唯一可用）

```typescript
// 具名导出 + 默认导出都要有
export const FractalPlugin = async (input) => {
  // 初始化逻辑
  return {
    "chat.message": async (input, output) => { ... },
    "experimental.chat.system.transform": async (input, output) => { ... },
  }
}

export default FractalPlugin
```

### ❌ 对象直出格式（1.17.x 静默跳过）

```typescript
// 旧版格式 — 模块被 import 但 hook 不注册
export default {
  "chat.message": async (input, output) => { ... },
}
```

`readV1Plugin` 在 detect 模式下检测到对象无 `id`/`server`/`tui` 字段 → 返回 undefined → `getLegacyPlugins` 也不处理（它只处理函数类型导出），钩子对象被丢弃。

### ❌ V1 格式（同样不工作）

```typescript
// 模块 import 成功但 plugin.server() 不会被 OC 自动调用
export default { id: "xx", server: async (input) => { return hooks } }
```

`readV1Plugin` 能识别但 `server` 函数返回的 hooks 不会被注册。

## 自动发现

- `~/.config/opencode/plugins/*.ts` — 全局，启动时自动加载
- `.opencode/plugins/*.ts` — 项目级，启动时自动加载
- `opencode.json` 的 `plugin` 数组中写的是 **npm 包名**，不是本地文件

## 踩坑记录

### 坑 1：对象直出格式在 1.17.x 静默失败

**现象**：模块被 import（顶层代码执行），但 hook 函数永不触发，debug.log 无 hook 输出  
**根因**：对象直出 `export default { hook: fn }` 既不被 `readV1Plugin` 识别（无 id/server/tui），也不被 `getLegacyPlugins` 处理（非函数）  
**修复**：改用函数式格式 `export const P = async () => { return hooks }` + `export default P`

### 坑 2：prompts.ts 生成不完整 part 导致 OC 全局崩溃

**现象**：OC 会话回复卡住，无任何报错  
**根因**：插件注入的 system prompt / message part 不完整，破坏了 OC 消息结构  
**教训**：所有插件生成的内容必须有完整性边界校验

### 坑 3：Bun 缓存失败的模块解析

**现象**：修改代码后重启 OC，改动不生效  
**原因**：Bun 会缓存失败的模块解析（OC loader.ts 注释明确提到），一旦失败后续导入都返回缓存结果  
**修复**：改代码 → 重启 OC（Bun 缓存是进程级的）

### 坑 4：模块级别 I/O 可能被沙箱阻止

**现象**：模块顶层的 `fs.writeFileSync` 在 OC 沙箱中可能失败  
**建议**：I/O 操作放在函数体内

### 坑 5：import 类型包无意义

`@opencode-ai/plugin` 是纯类型包，`import type` 在运行时被完全擦除。担心导入失败时用内联类型即可。

### 坑 6：1.17.x 懒加载

**现象**：模块 import 后等很久才看到 hook 输出  
**原因**：插件函数在首次 hook 触发时才被调用，不是启动时立刻调用  
**验证方法**：发一条消息 → 触发 `chat.message` → 检查 log
