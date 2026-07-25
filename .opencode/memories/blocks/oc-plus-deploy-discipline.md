<!-- type: knowledge --><!-- status: auto --><!-- description: deploy.mjs 必须保持为单一真相源——永远不直接编辑已部署文件，类型检查是部署必要条件 -->

# deploy.mjs 铁律

## 事实
oc-plus 通过 `deploy.mjs` 将源码复制到 `~/.config/opencode/`。违反以下规则导致的问题占据本次升级 40% 的排查时间：

## 规则
1. **不直接编辑已部署文件** — 所有修改在源码目录完成，通过 deploy.mjs 部署。直接改部署文件 → 下次部署覆盖 → 问题看似"修复"实则复现
2. **新增模块依赖必须注册** — 任何新的 `import` 依赖必须在 deploy.mjs 的 SRC/DST 中注册。`pipeline.ts` 漏注册 → 分形加载失败（排查了 1 小时）
3. **类型检查是部署必要条件** — `tsc --noEmit` 通过后才部署。之前 `跳过` 的心态掩盖了 TS1128 语法错误
4. **库文件放 `lib/` 子目录** — `plugins/lib/` 不被 OC 扫描，`plugins/` 下所有 `.ts` 被当插件加载
5. **部署后验证** — 对比 MD5、检查 import 路径指向的文件是否存在

## 反例
❌ 在 `~/.config/opencode/plugins/fractal.ts` 直接加诊断代码 → PowerShell 正则出错清空文件
✅ 修改源码 `分形/fractal.ts` → `node deploy.mjs` 部署

❌ 部署 `pipeline.ts` 到 `plugins/` → OC 当插件加载 → 模型配置失效
✅ 部署到 `plugins/lib/pipeline.ts` + deploy.mjs 替换 import 路径

## 结论
deploy.mjs 是 oc-plus 的"真理之源"。任何偏离此规则的调试都是在制造更多 bug。如果不确定某个文件该放哪、import 该怎么写，先改 deploy.mjs 的逻辑，不要手改部署目录。
