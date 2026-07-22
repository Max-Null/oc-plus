# OC 插件加载机制

> 来源：OC 源码 `packages/opencode/src/plugin/index.ts` + 实战踩坑
> 验证日期：2026-07-19（OC 1.18.3 实测）

## 加载流程（OC 1.18.x）

```
OC 启动
  ↓
自动发现 `~/.config/opencode/plugins/*.ts`（全局）+ `.opencode/plugins/*.ts`（项目）
  ↓ 注：Glob 模式为 {plugin,plugins}/*.{ts,js}，只扫描一级文件，子目录不扫描
  ↓
Bun 动态 import() 每个文件
  ↓
applyPlugin() → 先试 readV1Plugin，失败则走 getLegacyPlugins
  ↓
插件函数被调用 → 返回 Hooks → 懒加载：首次 hook 触发才调插件函数
```

## 1.18.x 关键变化

| 项目 | 1.17.x | 1.18.3 |
|------|--------|--------|
| 自动发现 | ✅ `Glob.scan` | ✅ 仍然有效 |
| `file://` URL 加载 | 可能有效 | ❌ 无效，报 `Plugin export is not a function` |
| npm 包加载 | ✅ 有效 | ✅ 有效 |
| V1 hook 兼容 | ✅ | ✅ `system.transform`、`event`、`tool.execute.after` 均可用 |
| 插件报错可见性 | 无 | ✅ 写入 OC 原生日志 `~/.local/share/opencode/log/opencode.log` |
| 非插件文件处理 | ? | 目录下**每个** `.ts` 都当插件加载，非插件文件报错 |

## 1.18.x 调试方法

1. **OC 原生日志**：`~/.local/share/opencode/log/opencode.log`（UTC 时间戳）
2. **搜索插件加载错误**：`grep "failed to load plugin" opencode.log`
3. **确认插件是否被扫描**：日志中是否有 `path=file:///.../plugins/xxx.ts` 的错误或加载记录

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

> ⚠️ **1.18.3 Windows 实测：自动发现已失效。** 仅 npm 包可用。详见坑 9。

- `~/.config/opencode/plugins/*.ts` — 全局，启动时自动加载（1.17.x ✅，1.18.3 Windows ❌）
- `.opencode/plugins/*.ts` — 项目级，启动时自动加载（1.17.x ✅，1.18.3 Windows ❌）
- `opencode.json` 的 `plugin` 数组中写的是 **npm 包名**（1.18.3 `file://` 也失效）
- ACP 已集成：与分形触发线分工明确（ACP 管压缩，分形管决策质量），推荐配置见文档

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

### 坑 7：1.18.x 非插件文件被当插件加载（子目录隔离法）

**现象**：`prompts.ts`（工具模块）和 `fractal.ts`（插件）放在同一目录 → `prompts.ts` 报 `Plugin export is not a function` → 可能干扰同目录其他文件加载  
**根因**：OC 1.18 的 `Glob.scan("{plugin,plugins}/*.{ts,js}")` 只匹配一级文件，但每个匹配到的 `.ts` 文件都会被当作插件处理  
**修复**：非插件模块移到子目录（如 `plugins/lib/prompts.ts`），Glob 的 `*` 不匹配子目录，OC 不会扫描。插件源码中的 import 改为 `./lib/prompts.js`

```
# ❌ 旧结构（prompts.ts 被 OC 当插件加载报错）
plugins/
├── fractal.ts       (import "./prompts.js")
└── prompts.ts       ← OC 扫描到 → 报错

# ✅ 新结构（prompts.ts 在子目录不被扫描）
plugins/
├── fractal.ts       (import "./lib/prompts.js")
└── lib/
    └── prompts.ts   ← 子目录，不被 OC 扫描
```

### 坑 8：1.18.x `file://` URL 不再支持

**现象**：`opencode.json` 的 `plugin` 数组中写 `"file:///C:/Users/.../plugins/xxx.ts"` 不加载  
**根因**：OC 1.18 的 `resolvePluginTarget` 可能不处理本地 `file://` URL，或处理失败时静默跳过  
**替代方案**：发布为 npm 包。

### 坑 9：OC 1.18.3 Windows 本地插件全部失效（仅 npm registry 可用）

**现象**：`~/.config/opencode/plugins/*.ts` / `*.js` 自动发现不工作；`.opencode/plugins/*` 项目级也不工作；`file://` URL 不工作；npm 包正常（`opencode-acp@latest` 可加载）。

**验证手段**（2026-07-21 实测）：

| # | 方法 | 结果 |
|---|------|------|
| 1 | `plugins/test-js.js` 零依赖自动发现 | ❌ |
| 2 | `.opencode/plugins/test-js.js` 项目级 | ❌ |
| 3 | `"file:///C:/Users/.../xxx.ts"` in plugin array | ❌ |
| 4 | `npm install file:路径` → `~/.config/opencode/node_modules/` | ❌ (OC 不读此目录) |
| 5 | `npm install file:路径` → `~/.cache/opencode/packages/` | ❌ (Bun 不解析 `file:` 依赖) |
| 6 | `opencode plugin add "file:/D:/Project/oc-plus/分形"` | ❌ (被当包名去 npm 查) |
| 7 | npm 预编译 `.js` + junction → OC 缓存 | ❌ |
| 8 | `opencode-acp@latest` npm registry 包 | ✅ |
| 9 | **`"./plugins/xxx/dist/xxx.js"` 相对路径** | ✅ **(2026-07-22 实测通过)** |

**结论**：OC 1.18.3 Windows 版**支持本地文件相对路径引用**。将编译后的 `.js` 放在 `~/.config/opencode/plugins/<name>/dist/` 子目录结构中，用 `"./plugins/<name>/dist/<name>.js"` 相对路径在 `opencode.json` plugin 数组中引用即可。子目录自带 `package.json`（含 `"main"` 字段）可按 OC 目录扫描机制自动发现。裸 `.ts` 文件放 `plugins/` 根目录**不被**自动发现。

## ACP 集成建议

分形 Guardian Agent 与 ACP（上下文精简）互补——分形负责"提醒"，ACP 负责"压缩"。以下配置建议确保两者在长会话中协作良好：

### opencode.json 推荐配置

```jsonc
{
  "plugin": [
    "opencode-acp@latest",  // ACP 放前面，确保先于分形初始化
    "agents-priority",
    "oh-my-opencode-slim"
  ],
  "acp": {
    // ACP 不会压缩系统 prompt（分形注入的规则和提醒始终可见）
    "protectedTools": ["write", "edit", "read"],
    // 分形通过 bash 执行的 CLI（/fractal、memories）不被压缩
    "minContextLimit": 35,
    "maxContextLimit": 60
  }
}
```

### 分形与 ACP 的分工

| 功能 | 分形负责 | ACP 负责 |
|------|---------|---------|
| 上下文压缩 | ❌ | ✅ 自动压缩 + 命令 `/compact` |
| 触发线提醒注入 | ✅ system.transform | ❌ |
| 长会话 prompt 膨胀 | ✅ 频率控制（每 5 轮） | ✅ token 阈值压缩 |
| 命令系统 | `/fractal` | `/compact` |
| 保护关键输出 | ❌ | `protectedTools` |

**关键原则**：分形不做压缩、ACP 不做提醒。各司其职，互补不冲突。
