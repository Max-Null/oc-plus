/**
 * fractal-guardian.ts → fractal-guardian.js bundle 脚本
 *
 * 为什么需要 bundle：OC 桌面版加载 file:/// 的 .ts 插件时用 esbuild 打包，
 * 而 vector.ts 依赖 @huggingface/transformers → onnxruntime-node（.node 原生文件），
 * esbuild 无 .node loader → 插件静默加载失败（8/2 引入 vector 后 fractal 从未工作）。
 *
 * 修复：bundle 成单文件 .js，external 掉运行时才需要的依赖（从 OC node_modules 动态加载），
 * opencode.json 的 plugin 指向 bundle 产物。
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 入口：项目源码 fractal.ts（部署时改名 fractal-guardian.ts）
const ENTRY = path.join(__dirname, "fractal.ts");
// 产物：部署到 OC plugins 目录的 bundle js
const OUT_FILE = path.join(__dirname, "dist", "fractal-guardian.js");

// 运行时依赖：bundle 时跳过，运行时从 OC node_modules 解析（deploy.mjs installTransformers 已安装）
const EXTERNAL = ["@huggingface/transformers", "undici", "onnxruntime-node"];

await build({
  entryPoints: [ENTRY],
  outfile: OUT_FILE,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: EXTERNAL,
  sourcemap: false,
  logLevel: "info",
});

console.log(`✅ bundle 完成: ${OUT_FILE} (${(await import("node:fs")).statSync(OUT_FILE).size} bytes)`);
