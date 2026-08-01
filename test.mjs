/**
 * oc-plus 测试运行器
 *
 * 为什么需要 bundle：Node 22.12 的 --experimental-strip-types 不支持
 * 把 ".js" 导入重写为 ".ts" 源文件（--experimental-rewrite-relative-import-extensions
 * 是 22.13+ 才有的 flag），直接 node --test 跑 .ts 测试文件会 ERR_MODULE_NOT_FOUND。
 * 用 esbuild 打包成纯 JS 后再交给 node --test，规避该限制。
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 测试文件清单（新增测试文件时在此追加）
const TEST_FILES = ["分形/engine/test.ts", "分形/engine/vector.test.ts", "分形/search.test.ts"];

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-plus-test-"));

try {
  // 逐个 bundle 到临时目录（保持相对导入关系）
  for (const file of TEST_FILES) {
    const outFile = path.join(outDir, path.basename(file).replace(/\.ts$/, ".mjs"));
    await build({
      entryPoints: [file],
      bundle: true,
      format: "esm",
      platform: "node",
      outfile: outFile,
      logLevel: "silent",
      // transformers.js 含 onnxruntime 原生 .node 文件，不能 bundle；
      // 测试运行时从 node_modules 解析（vector.test.ts 用 mock，不真正加载模型）
      external: ["@huggingface/transformers"],
    });
  }

  // node --test 运行所有 bundle 产物
  execSync(`node --test ${outDir}/*.mjs`, { stdio: "inherit" });
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
