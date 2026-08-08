<!-- 报告：分形插件语义向量在 oc-gui serve 环境加载失败（2026-08-08） -->

# transformers 加载失败报告（交给 oc-gui / fractal 仓库会话）

## 一、现象

分形插件（fractal-guardian.js，部署在 `~/.config/opencode/plugins/`）的语义向量引擎启动时输出：

```
[serve] [vector] ensureModel 失败，降级 BM25: Cannot find module '@huggingface/transformers'
```

即插件动态 `import("@huggingface/transformers")` 在 oc-gui spawn 的 serve 进程中**找不到模块**，语义向量功能静默降级为 BM25 关键词检索（知识检索质量明显下降）。debug.log 中 `[V4] 语义向量就绪` 记录消失。

表面症状像"部署时没装依赖"，实际依赖已正确安装——**是模块解析（module resolution）层面的兼容性问题**。

## 二、排查结论（关键证据链）

### 1. 依赖确实已安装

- `~/.config/opencode/node_modules/@huggingface/transformers` 存在（4.2.0，8/5 安装，deploy.mjs 的 installTransformers() 负责）
- Node 26 从 `~/.config/opencode/plugins/` 实测 import 成功（935 个导出）
- bundle 是 ESM 格式，transformers 走 esbuild external + 运行时动态 import（bundle 1071 行）

### 2. 同一份 bundle + 同一份 node_modules，不同进程结果不同（核心矛盾）

| 时间 | 运行进程 | 运行时 | 结果 |
|------|----------|--------|------|
| 14:42 前 | 官方桌面端 `@opencode-aidesktop`（Electron NodeService） | Node | `[V4]` 就绪 ✅ |
| 15:05 重启后 | **oc-gui spawn 的 serve**（`H:\MaxNull\WorkStation\fractal\resources\bin\opencode.exe serve`，1.18.14） | **Bun** | import 失败 ❌ |

### 3. 根因：transformers 4.2.0 的 exports 字段是非法结构

`@huggingface/transformers@4.2.0` 的 `package.json`（npm registry 官方确认，非本地损坏）：

```json
"exports": {
  "node": { "import": {...}, "require": {...} },
  "default": { ... }
}
```

按 Node.js 规范（nodejs.org/api/packages.html），`exports` 的**顶层键必须是 `./` 开头的路径键**（`"."`、`"./subpath"`），条件键（`node`/`import`/`default`）只能**嵌套在路径键之下**。上述结构是"顶层条件键"非法写法——Node 和 Bun 的解析器对此容忍度不同：

- **Node**：实测容错回退到 `main` 字段（`./dist/transformers.node.cjs`）→ 加载成功（这就是 14:42 前"正常"的原因）
- **Bun（opencode 内置运行时）**：严格按 exports 解析，顶层找不到 `"."` 路径键 → 直接报 `Cannot find module '@huggingface/transformers'`

（相关佐证：webpack/enhanced-resolve issue #325 明确指出"顶层条件键"是 Node.js 都不支持的语法；Bun 文档的 exports 示例均为 `"."` 路径键写法。）

## 三、已做的修复（oc-plus 侧，治标）

1. **立即修复**：`~/.config/opencode/node_modules/@huggingface/transformers/package.json` 手动改写为标准结构（已备份 .bak）：

```json
"exports": {
  ".": {
    "node": { "import": {...}, "require": {...} },
    "default": { ... }
  }
}
```

2. **治本（oc-plus deploy.mjs）**：新增 `patchTransformersExports()`，每次部署后自动检查并幂等修复 exports。重装 transformers 后不会复发。

修复后 Node 实测 import 正常（935 导出）；oc-gui 侧待重启 serve 验证 `[V4] 语义向量就绪` 恢复。

## 四、给 oc-gui / fractal 仓库的优化建议（按优先级）

1. **【高】内置 opencode 二进制版本同步**：oc-gui 的 `resources/bin/opencode.exe` 是 **1.18.14**，与 npm 全局 `opencode-ai`（**1.18.15**）不同源。插件生态以 npm 版为基准，两版本内置 Bun 解析行为可能存在差异。建议升级内置二进制到最新版并固定版本，避免"官方桌面端正常、oc-gui 不正常"的分裂环境。
2. **【中】serve 进程插件错误可见性**：`[serve]` 前缀日志目前只出现在 serve 进程输出，不进 `~/.local/share/opencode/log/opencode.log`，排查时"插件加载失败"这类关键错误完全不可见（本次排查耗时集中在确认"到底谁在加载失败"）。建议 oc-gui 把 serve 的 stderr/插件 console.error 透传到诊断面板或落盘（参考 oc-gui 已做的 `--print-logs` 落盘改造，但插件错误未覆盖）。
3. **【低】安装引导可检测此坑**：若 oc-gui 有依赖安装逻辑，可加入 exports 结构校验（检测顶层键是否含 `"."`），对非法 exports 的包提前告警，避免"装了但用不了"的隐性故障。

## 五、复现与验证方法

复现：在 oc-gui 环境（Bun）中执行 `await import("@huggingface/transformers")`，观察 `Cannot find module`。
修复验证：改写 exports 为 `"."` 路径键后重试 import；或直接重启 oc-gui serve 观察 debug.log 是否出现 `[V4] 语义向量就绪（24 文档 × 384 维）`。
