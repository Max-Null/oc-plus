/**
 * oc-plus 部署脚本 V3.10（Node.js 跨平台）
 * 注意：此版本号仅为部署脚本自身的迭代标识，非 oc-plus 系统版本。
 *       各组件独立管理版本：双星 V3.7 / 分形 v3.4 / 技能 各自维护。
 *
 * 用法: node deploy.mjs
 * 替代 deploy.ps1，解决 PowerShell 5.1 中文编码解析失败问题。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const OC = path.join(HOME, ".config", "opencode");

// ============================================================
// 路径常量
// ============================================================

const SRC = {
  agents: path.join(__dirname, "双星系统", "agents"),
  fractalAgent: path.join(__dirname, "分形", "agents"),
  commands: path.join(__dirname, "双星系统", "commands"),
  fractalTs: path.join(__dirname, "分形", "fractal.ts"),
  pipelineTs: path.join(__dirname, "分形", "pipeline.ts"),
  dedupTs: path.join(__dirname, "分形", "dedup-checker.ts"),
  searchTs: path.join(__dirname, "分形", "search.ts"),
  engineBm25: path.join(__dirname, "分形", "engine", "bm25.ts"),
  engineCore: path.join(__dirname, "分形", "engine", "engine.ts"),
  engineVector: path.join(__dirname, "分形", "engine", "vector.ts"),
  promptsLib: path.join(__dirname, "分形", "lib", "prompts.ts"),
  scripts: path.join(__dirname, "分形", "scripts"),
  promptTemplates: path.join(__dirname, "分形", "prompts"),
  agentsPriority: path.join(__dirname, "agents-priority.ts"),
  skills: path.join(__dirname, "技能"),
  fractalSkills: path.join(__dirname, "分形", "技能"),
};

const DST = {
  agents: path.join(OC, "agents"),
  commands: path.join(OC, "commands"),
  plugins: path.join(OC, "plugins"),
  pluginsLib: path.join(OC, "plugins", "lib"),
  scripts: path.join(OC, "scripts"),
  fractalPrompts: path.join(OC, "fractal-prompts"),
  skills: path.join(OC, "skills"),
  plans: path.join(OC, "plans"),
  memoriesBlocks: path.join(OC, "memories", "blocks"),
  memoriesTriggers: path.join(OC, "memories", "triggers"),
  projectMemoriesBlocks: path.join(__dirname, ".opencode", "memories", "blocks"),
  projectMemoriesTriggers: path.join(__dirname, ".opencode", "memories", "triggers"),
};

// ============================================================
// 工具函数
// ============================================================

const stats = { deployed: [], skipped: [], failed: [], cleaned: [] };

function log(emoji, msg) {
  console.log(`  ${emoji} ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      log("+", dir.replace(HOME, "~"));
    } catch (e) {
      log("x", `${dir} — ${e.message}`);
      stats.failed.push(dir);
    }
  }
}

/**
 * 从实际 OC 环境的 opencode.json 读取 provider 配置
 * 返回 { providerId, modelName } 或 null（配置不存在时）
 */
function readOcProviderConfig() {
  const ocConfigPath = path.join(OC, "opencode.json");
  if (!fs.existsSync(ocConfigPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(ocConfigPath, "utf-8"));
    const modelRef = config.model; // e.g. "ds/deepseek-v4-pro" or "ds:deepseek-v4-pro"
    if (!modelRef) return null;
    // 支持冒号和斜杠两种分隔符，统一输出为斜杠格式（OC 标准）
    const sep = modelRef.includes("/") ? "/" : modelRef.includes(":") ? ":" : null;
    if (!sep) return null;
    const idx = modelRef.indexOf(sep);
    const providerId = modelRef.slice(0, idx);
    const modelName = modelRef.slice(idx + 1);
    return { providerId, modelName };
  } catch (e) {
    return null;
  }
}

/**
 * 从实际 OC 环境的 opencode.json 读取 modelAliases 配置
 * 返回 { [alias]: "providerId:modelName" } 或 null
 */
function readModelAliases() {
  const ocConfigPath = path.join(OC, "opencode.json");
  if (!fs.existsSync(ocConfigPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(ocConfigPath, "utf-8"));
    return config.modelAliases || null;
  } catch (e) {
    return null;
  }
}

/**
 * 替换 agent 文件中的 model: 行
 * - 优先解析 modelAliases（如 DS_MODEL_LOW → ds:deepseek-v4-flash）
 * - 别名未配置则回退到默认 provider 配置
 * - 别名都不是则用原始默认 provider
 * 格式: model: "providerId/modelName"（OC 要求双引号）
 */
function patchAgentModel(content, providerId, modelName, aliases) {
  // 提取当前 model 值（去掉引号和换行）
  const modelMatch = content.match(/^model:\s*"([^"]+)"/m);
  const currentModel = modelMatch ? modelMatch[1] : "";
  let resolvedModel = currentModel;

  // 若当前 model 是已知别名 → 解析
  if (aliases && aliases[currentModel]) {
    resolvedModel = aliases[currentModel];
  } else if (currentModel && currentModel.includes(":")) {
    // 已是完整 provider:model 引用 → 替换 provider/model 为实际配置
    resolvedModel = `${providerId}/${modelName}`;
  } else if (currentModel && currentModel.includes("/")) {
    resolvedModel = `${providerId}/${modelName}`;
  }

  // 兜底：别名/格式都未匹配 → 保持原始值不变（避免 model: "" 导致 OC 报 unknown provider）
  const modelLine = resolvedModel ? `model: "${resolvedModel}"` : `model: "${currentModel}"`;
  return content.replace(/^model:\s*.+$/m, modelLine);
}

function copyFile(src, destDir, label, destName) {
  const dest = path.join(destDir, destName || path.basename(src));
  if (!fs.existsSync(src)) {
    stats.skipped.push(label || src);
    log("x", `源文件不存在: ${src}`);
    return;
  }
  try {
    ensureDir(destDir);
    fs.copyFileSync(src, dest);
    stats.deployed.push(label || path.basename(src));
    log("V", label || path.basename(src));
  } catch (e) {
    log("x", `${label || src} — ${e.message}`);
    stats.failed.push(label || src);
  }
}

/**
 * 拷贝目录，skipExisting 控制策略：
 *   true  → 目标已存在时检查文件时间戳，源更新则覆盖（保护用户修改 + 允许项目升级）
 *   false → 无条件覆盖
 */
function copyDir(srcDir, destDir, skipExisting = true, label = "") {
  if (!fs.existsSync(srcDir)) {
    log(".", `${label || path.basename(srcDir)} (源目录不存在)`);
    return;
  }
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      if (skipExisting && fs.existsSync(dest)) {
        // 目录存在 → 递归进入，逐文件比较时间戳
        copyDir(src, dest, true, entry.name);
      } else {
        copyDirRecursive(src, dest, entry.name, skipExisting);
      }
    } else {
      const shouldCopy = skipExisting
        ? (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs)
        : true;
      if (shouldCopy) {
        const action = fs.existsSync(dest) ? "U" : "V"; // U=更新覆盖, V=新建
        try {
          fs.copyFileSync(src, dest);
          stats.deployed.push(entry.name);
          log(action, entry.name);
        } catch (e) {
          log("x", `${entry.name} — ${e.message}`);
          stats.failed.push(entry.name);
        }
      }
    }
  }
}

function copyDirRecursive(src, dest, label, skipExisting) {
  try {
    fs.cpSync(src, dest, { recursive: true, force: true });
    stats.deployed.push(label);
    log("V", label);
  } catch (e) {
    log("x", `${label} — ${e.message}`);
    stats.failed.push(label);
  }
}

/** 删除过期遗弃文件并汇报 */
function cleanupStale(filePath, label) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      stats.cleaned.push(label);
      log("-", `${label} (过期，已清理)`);
    }
  } catch { /* 静默 */ }
}

function cleanupStaleGlob(dir, globPrefix) {
  try {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.startsWith(globPrefix));
    for (const f of files) {
      cleanupStale(path.join(dir, f), f);
    }
  } catch { /* 静默 */ }
}

// ============================================================
// superpowers 安装
// ============================================================

/**
 * 自动安装 superpowers 插件到 ~/.config/opencode/node_modules/superpowers
 * 已存在则跳过，避免重复联网下载。
 * 安装失败不阻断部署流程。
 */
function installSuperpowers() {
  const destDir = path.join(OC, "node_modules", "superpowers");
  if (fs.existsSync(destDir)) {
    log(".", "superpowers 已安装，跳过");
    return;
  }
  try {
    log(".", "安装中（首次需下载 ~2MB，约 5-10 秒）...");
    execSync(
      `npm install superpowers@git+https://github.com/obra/superpowers.git --prefix "${OC}"`,
      { stdio: "pipe", timeout: 120000 }
    );
    log("V", "superpowers 安装成功");
  } catch (e) {
    const msg = e.stderr?.toString() || e.message;
    log("!", `superpowers 安装失败（不影响 oc-plus 使用）: ${msg.slice(0, 120)}`);
    log("!", `手动安装: npm install superpowers@git+https://github.com/obra/superpowers.git --prefix "${OC}"`);
  }
}

// ============================================================
// 运行时依赖安装（V4 P2）
// ============================================================

/**
 * 安装 @huggingface/transformers + undici 到 ~/.config/opencode/node_modules
 * - transformers：语义向量索引（vector.ts）运行时动态 import 的模型推理库
 * - undici：提供 ProxyAgent，让模型下载走系统代理（Windows 注册表代理场景）
 * 已存在则跳过；失败不阻断部署（向量功能自动降级 BM25）。
 */
function installTransformers() {
  const destDir = path.join(OC, "node_modules", "@huggingface", "transformers");
  if (fs.existsSync(destDir)) {
    log(".", "@huggingface/transformers 已安装，跳过");
  } else {
    try {
      log(".", "安装 @huggingface/transformers（首次需下载 ~10MB，约 10-20 秒）...");
      execSync(
        `npm install @huggingface/transformers --prefix "${OC}"`,
        { stdio: "pipe", timeout: 180000 }
      );
      log("V", "@huggingface/transformers 安装成功");
    } catch (e) {
      const msg = e.stderr?.toString() || e.message;
      log("!", `@huggingface/transformers 安装失败（语义向量降级 BM25）: ${msg.slice(0, 120)}`);
      log("!", `手动安装: npm install @huggingface/transformers --prefix "${OC}"`);
    }
  }
  // undici：模型下载走系统代理的依赖（可选，未装则直连重试）
  const undiciDir = path.join(OC, "node_modules", "undici");
  if (fs.existsSync(undiciDir)) {
    log(".", "undici 已安装，跳过");
  } else {
    try {
      execSync(
        `npm install undici --prefix "${OC}"`,
        { stdio: "pipe", timeout: 120000 }
      );
      log("V", "undici 安装成功（模型下载走系统代理）");
    } catch (e) {
      log("!", "undici 安装失败（模型下载走直连，被墙时降级 BM25）");
    }
  }
}

// ============================================================
// 主流程
// ============================================================

function main() {
  console.log("===== oc-plus 部署 V3.11 =====");
  console.log(`目标: ${OC}\n`);

  // [ -2] pre-deploy validation — 类型检查
  console.log("[-2] pre-deploy: TypeScript type check...");
  const tsconfigPath = path.join(__dirname, "分形", "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tscResult = execSync(
        `npx tsc --noEmit --project "${tsconfigPath}" 2>&1`,
        { encoding: "utf-8", timeout: 60000, cwd: __dirname }
      );
      // 过滤掉 node_modules 的错误（如 @types/node 的 Buffer 类型冲突），只关心我们的源码错误
      const ourErrors = tscResult.split("\n").filter(line => {
        return !line.includes("node_modules") && (line.includes("error TS") || line.includes("分形/"));
      });
      if (ourErrors.length > 0) {
        console.log("  ✗ 类型检查失败！以下错误必须修复后才能部署：\n");
        console.log(ourErrors.join("\n"));
        console.log("\n  提示: 上面的错误都是 oc-plus 源码问题，修复后重新运行 node deploy.mjs。");
        console.log("  如果误判（错误来自 node_modules 类型定义），可以忽略，但建议先确认。");
        return 1;
      }
      log("V", "类型检查通过");
    } catch (e) {
      // tsc 非零退出时，检查 stderr 内容
      const stderr = e.stderr?.toString() || e.message || "";
      const ourErrors = stderr.split("\n").filter(line => {
        return !line.includes("node_modules") && (line.includes("error TS") || line.includes("分形/"));
      });
      if (ourErrors.length > 0) {
        console.log("  ✗ 类型检查失败！以下错误必须修复后才能部署：\n");
        console.log(stderr.slice(0, 2000)); // 截断超长输出
        console.log("\n  提示: 修复后重新运行 node deploy.mjs。");
        return 1;
      }
      // tsc 失败但错误都来自 node_modules → 跳过（已知的 @types 冲突）
      log(".", "tsc 有 node_modules 类型告警（不影响源码），跳过");
    }
  } else {
    log(".", "未找到 tsconfig，跳过类型检查");
  }
  console.log("");

  // [ -1] pre-deploy backup — 备份当前运行版本
  console.log("[-1] pre-deploy: backing up current deployment...");
  const backupDir = path.join(OC, ".deploy-backup");
  const backupMetaPath = path.join(backupDir, "backup.json");
  ensureDir(backupDir);
  // 备份可能被覆盖的关键文件
  const toBackup = [
    { src: path.join(OC, "plugins", "fractal.ts"), label: "plugins/fractal.ts" },
    { src: path.join(OC, "plugins", "lib", "prompts.ts"), label: "plugins/lib/prompts.ts" },
    { src: path.join(OC, "plugins", "agents-priority.ts"), label: "plugins/agents-priority.ts" },
  ];
  const backed = [];
  for (const b of toBackup) {
    if (fs.existsSync(b.src)) {
      const dest = path.join(backupDir, path.basename(b.src));
      try {
        fs.copyFileSync(b.src, dest);
        backed.push(b.label);
      } catch (e) { log("x", `备份 ${b.label} 失败: ${e.message}`); }
    }
  }
  // 写备份元数据
  const backupMeta = {
    timestamp: new Date().toISOString(),
    source: { dir: __dirname, branch: "unknown" },
    backedUpFiles: backed,
    gitCommit: (() => {
      try { return execSync("git rev-parse --short HEAD", { encoding: "utf-8", cwd: __dirname }).trim(); }
      catch { return "unknown"; }
    })(),
  };
  fs.writeFileSync(backupMetaPath, JSON.stringify(backupMeta, null, 2), "utf-8");
  log("V", `备份完成: ${backed.length} 文件 → ${backupDir.replace(HOME, "~")}`);
  console.log("");

  // [0/7] pre-deployment cleanup of deprecated files
  console.log("[0/7] pre-deployment cleanup...");
  const memoriesDir = path.join(OC, "memories");
  cleanupStale(path.join(OC, "plugins", "memories.ts"), "memories.ts (superseded by fractal.ts)");
  cleanupStale(path.join(memoriesDir, "review-habits.md"), "review-habits.md (old format)");
  cleanupStale(path.join(memoriesDir, "loop-test.tmp"), "loop-test.tmp (test residue)");
  cleanupStaleGlob(memoriesDir, ".hook-event-"); // omo-slim catalog snapshots
  console.log(`  清理 ${stats.cleaned.length} 个过期文件\n`);

  // [1/7] create target directories
  console.log("[1/7] creating target directories...");
  for (const d of Object.values(DST)) {
    ensureDir(d);
  }
  ensureDir(path.join(OC, "memories")); // top-level memories dir (blocks/triggers already in DST)
  ensureDir(DST.plans);
  console.log("");

  // [2/7] deploy agents
  console.log("[2/7] deploying agents...");
  // 从实际 OC 环境读取 provider 配置，部署时自动替换 agent 文件中的 model 引用
  const ocProvider = readOcProviderConfig();
  const modelAliases = readModelAliases();
  if (ocProvider) {
    log(".", `provider 配置: ${ocProvider.providerId}:${ocProvider.modelName}`);
  } else {
    log("!", "未读取到 OC provider 配置，agent model 将使用源文件默认值");
  }
  if (modelAliases) {
    const aliasList = Object.entries(modelAliases).map(([k, v]) => `${k}=>${v}`).join(", ");
    log(".", `modelAliases: ${aliasList}`);
  } else {
    log("!", "modelAliases 未配置——DS_MODEL_LOW/DS_MODEL_HIGH 将不解析，agent 可能报 unknown provider");
    log("!", "请在 opencode.json 中参照 opencode.json.example 添加 modelAliases 段");
  }
  const agentFiles = [
    { src: path.join(SRC.agents, "双星.md"), label: "double-star agent" },
    { src: path.join(SRC.agents, "工匠.md"), label: "artisan agent" },
    { src: path.join(SRC.agents, "参谋.md"), label: "tactician agent" },
    { src: path.join(SRC.agents, "军师.md"), label: "strategist agent" },
    { src: path.join(SRC.fractalAgent, "助理.md"), label: "assistant agent" },
  ];
  for (const a of agentFiles) {
    // 读取源文件内容，解析 model 别名后替换为实际配置
    if (fs.existsSync(a.src)) {
      try {
        ensureDir(DST.agents);
        let content = fs.readFileSync(a.src, "utf-8");
        if (ocProvider) {
          content = patchAgentModel(content, ocProvider.providerId, ocProvider.modelName, modelAliases);
        }
        const dest = path.join(DST.agents, path.basename(a.src));
        fs.writeFileSync(dest, content, "utf-8");
        stats.deployed.push(a.label);
        log("V", a.label);
      } catch (e) {
        log("x", `${a.label} — ${e.message}`);
        stats.failed.push(a.label);
      }
    } else {
      stats.skipped.push(a.label);
      log("x", `源文件不存在: ${a.src}`);
    }
  }
  console.log("");

  // [3/7] deploy plugins
  console.log("[3/7] deploying plugins...");
  // 清理旧文件名（OC 缓存导致旧文件不被重新发现）
  cleanupStale(path.join(DST.plugins, "fractal.ts"), "fractal.ts (已迁移到 fractal-guardian.ts)");
  copyFile(SRC.fractalTs, DST.plugins, "fractal-guardian.ts (Guardian Agent)", "fractal-guardian.ts");
  copyFile(SRC.pipelineTs, DST.pluginsLib, "pipeline.ts (流水线引擎)");
  copyFile(SRC.dedupTs, DST.pluginsLib, "dedup-checker.ts (去重审查)");
  copyFile(SRC.searchTs, DST.pluginsLib, "search.ts (V4 BM25 搜索引擎)");
  copyFile(SRC.engineBm25, DST.pluginsLib, "bm25.ts (知识引擎 BM25)");
  copyFile(SRC.engineCore, DST.pluginsLib, "engine.ts (知识引擎核心)");
  copyFile(SRC.engineVector, DST.pluginsLib, "vector.ts (知识引擎语义向量)");
  copyFile(SRC.promptsLib, DST.pluginsLib, "lib/prompts.ts");
  copyFile(SRC.agentsPriority, DST.plugins, "agents-priority.ts");
  // 修正 fractal-guardian.ts 中的 import 路径：子模块部署在 lib/ 下
  {
    const fractalDest = path.join(DST.plugins, "fractal-guardian.ts");
    let content = fs.readFileSync(fractalDest, "utf-8");
    content = content.replace('"./pipeline.js"', '"./lib/pipeline.ts"');
    content = content.replace('"./dedup-checker.js"', '"./lib/dedup-checker.ts"');
    content = content.replace('"./lib/prompts.js"', '"./lib/prompts.ts"');
    content = content.replace('"./search.js"', '"./lib/search.ts"');
    content = content.replace('"./engine/engine.js"', '"./lib/engine.ts"');
    content = content.replace('"./engine/vector.js"', '"./lib/vector.ts"');
    fs.writeFileSync(fractalDest, content, "utf-8");

    // 修正 search.ts 重导出路径：部署后 bm25.ts 在 lib/，非 engine/
    const searchDest = path.join(DST.pluginsLib, "search.ts");
    let searchContent = fs.readFileSync(searchDest, "utf-8");
    searchContent = searchContent.replace('"./engine/bm25.js"', '"./bm25.ts"');
    fs.writeFileSync(searchDest, searchContent, "utf-8");

    // 修正 engine.ts 内部 import：部署后 vector.ts 同在 lib/ 下，相对路径不用改
    // （engine.ts 引用 "./vector.js"，部署后 vector.ts 与 engine.ts 同级 → 保留 ./vector.js 即可）
    // 但 fractal-guardian.ts 引用的 vector 路径需指向 lib/vector.ts（上面已处理）
  }
  console.log("");

  // [4/7] deploy commands
  console.log("[4/7] deploying commands...");
  copyDir(SRC.commands, DST.commands, false);
  console.log("");

  // [5/7] deploy scripts
  console.log("[5/7] deploying scripts...");
  const scriptFiles = ["memories-cli.mjs", "test-analyze.mjs", "fractal-cli.mjs", "rollback.mjs"];
  for (const s of scriptFiles) {
    copyFile(path.join(SRC.scripts, s), DST.scripts, s);
  }
  console.log("");

  // [5b] deploy helper .bat files
  // 回滚.bat 放在 OC 配置根目录，双击即可恢复
  const rollbackBat = path.join(__dirname, "回滚.bat");
  const batDestDir = OC; // 放在 ~/.config/opencode/ 根目录
  if (fs.existsSync(rollbackBat)) {
    const batDest = path.join(batDestDir, "回滚.bat");
    try {
      fs.copyFileSync(rollbackBat, batDest);
      stats.deployed.push("回滚.bat");
      log("V", "回滚.bat (双击一键回滚)");
    } catch (e) {
      log("x", `回滚.bat — ${e.message}`);
    }
  }
  console.log("");

  // [6/7] deploy prompt templates
  // 注意：以下为显式列表，非 copyDir 全量复制。新增模板文件时需同步更新此列表。
  console.log("[6/7] deploying prompt templates...");
  const promptTemplates = [
    "core-rules.md",
    "websearch-rules.md",
    "assertion-reminder.md",
    "pipeline-stage-designing.md",
    "pipeline-stage-planning.md",
    "agent-baseline-artisan.md",
    "agent-baseline-strategist.md",
  ];
  for (const t of promptTemplates) {
    copyFile(path.join(SRC.promptTemplates, t), DST.fractalPrompts, t);
  }
  console.log("");

  // [7/7] deploy skills
  console.log("[7/7] deploying skills...");
  copyDir(SRC.skills, DST.skills, true); // skip existing — don't overwrite user's skill mods
  copyDir(SRC.fractalSkills, DST.skills, true); // 分形专属技能
  console.log("");

  // [8/8] install superpowers plugin
  console.log("[8/8] installing superpowers plugin...");
  installSuperpowers();
  installTransformers();
  console.log("");

  // summary
  console.log("===== deploy complete =====");
  console.log(`  deployed: ${stats.deployed.length} | skipped: ${stats.skipped.length} | failed: ${stats.failed.length} | cleaned: ${stats.cleaned.length}`);
  if (stats.skipped.length) {
    stats.skipped.slice(0, 10).forEach(s => console.log(`     skip: ${s}`));
    if (stats.skipped.length > 10) console.log(`     ... +${stats.skipped.length - 10} more`);
  }
  if (stats.failed.length) {
    stats.failed.forEach(f => console.log(`     FAIL: ${f}`));
  }

  // [9/9] post-deploy verification
  console.log("\n[9/9] post-deploy verification...");
  const verifications = [];

  // 验证 1：fractal-guardian.ts MD5 与源码一致
  const srcFractal = fs.readFileSync(SRC.fractalTs, "utf-8")
    // 源码中的 import 路径与部署后不同——对比时对源码做同样替换
    .replace('"./pipeline.js"', '"./lib/pipeline.ts"')
    .replace('"./dedup-checker.js"', '"./lib/dedup-checker.ts"')
    .replace('"./lib/prompts.js"', '"./lib/prompts.ts"')
    .replace('"./search.js"', '"./lib/search.ts"')
    .replace('"./engine/engine.js"', '"./lib/engine.ts"')
    .replace('"./engine/vector.js"', '"./lib/vector.ts"');
  const dstFractal = fs.readFileSync(path.join(DST.plugins, "fractal-guardian.ts"), "utf-8");
  const srcHash = crypto.createHash("md5").update(srcFractal).digest("hex");
  const dstHash = crypto.createHash("md5").update(dstFractal).digest("hex");
  const md5Ok = srcHash === dstHash;
  verifications.push({ label: "fractal-guardian.ts MD5", pass: md5Ok });
  if (md5Ok) log("V", "fractal-guardian.ts MD5 一致");
  else log("x", `fractal-guardian.ts MD5 不一致 (源码: ${srcHash.slice(0,8)}, 部署: ${dstHash.slice(0,8)})`);

  // 验证 2：import 依赖文件存在
  const importCheck = (() => {
    const content = dstFractal;
    const matches = content.matchAll(/from\s+"(\.\/[^"]+)"/g);
    let allExist = true;
    for (const m of matches) {
      const importPath = path.join(path.dirname(path.join(DST.plugins, "fractal-guardian.ts")), m[1]);
      if (!fs.existsSync(importPath)) {
        log("x", `import 依赖缺失: ${m[1]} (${importPath})`);
        allExist = false;
      }
    }
    return allExist;
  })();
  verifications.push({ label: "import 依赖完整", pass: importCheck });
  if (importCheck) log("V", "import 依赖完整");
  else log("x", "import 依赖缺失——分形将无法加载");

  // 验证 3：plugins 目录结构
  const dirCheck = (() => {
    const required = [
      { file: "fractal-guardian.ts", label: "fractal-guardian.ts" },
      { file: "agents-priority.ts", label: "agents-priority.ts" },
      { file: "lib/pipeline.ts", label: "lib/pipeline.ts" },
      { file: "lib/prompts.ts", label: "lib/prompts.ts" },
    ];
    let allGood = true;
    for (const r of required) {
      const exists = fs.existsSync(path.join(DST.plugins, r.file));
      if (!exists) { log("x", `${r.label} 缺失`); allGood = false; }
      else log("V", r.label);
    }
    // 确认旧文件已清理
    if (fs.existsSync(path.join(DST.plugins, "fractal.ts"))) {
      log("!", "fractal.ts 仍存在（应已清理——可能导致 OC 缓存旧版本）");
      allGood = false;
    }
    return allGood;
  })();
  verifications.push({ label: "plugins 目录结构", pass: dirCheck });

  const allVerified = verifications.every(v => v.pass);
  console.log(allVerified ? "  ✓ 全部验证通过" : "  ✗ 验证未通过——请修复后重新部署");

  // post-deploy: opencode.json checklist
  console.log("\n===== opencode.json checklist =====");
  console.log("deploy 已将文件复制到位，但需手动配置以下内容。");
  console.log("完整模板见项目根目录 opencode.json.example，可直接复制后修改关键字段。");
  console.log("");
  console.log("1. provider 模型配置（agent model 会自动从这里读取）:");
  console.log("   编辑 provider.ds.options.apiKey，替换为你的 DeepSeek Key");
  console.log("   获取: https://platform.deepseek.com/api_keys");
  console.log("   修改 model 字段（如 ds:deepseek-v4-pro）后，下次部署 agent 会自动同步");
  console.log("");
  console.log("2. plugin 数组（桌面端 1.18.x 不支持自动发现，必须 file:/// 显式列出）:");
  console.log('   ["superpowers", "opencode-acp@latest",');
  console.log('    "file:///C:/Users/.../plugins/fractal-guardian.ts",');
  console.log('    "file:///C:/Users/.../plugins/agents-priority.ts"]');
  console.log("");
  console.log("3. 安装 opencode-acp（自适应上下文压缩）:");
  console.log("   opencode plugin opencode-acp@latest --global");
  console.log('   同时在 opencode.json 中禁用内置压缩: "compaction": { "auto": false }');
  console.log("");
  console.log("4. default_agent:");
  console.log('   "default_agent": "双星"');
  console.log("");
  console.log("5. MCP 服务器（联网搜索 / 代码搜索 / 文档查询）:");
  console.log("   复制 opencode.json.example 中的 mcp 段到你的 opencode.json");
  console.log("   ⚠️ remote 类型 MCP 必须同时指定 type 和 enabled，否则 OC 解析报错 ConfigInvalidError");
  console.log("   包含 4 个 MCP:");
  console.log("   · github     — GitHub 操作（需要 PAT: https://github.com/settings/tokens）");
  console.log("   · websearch  — Exa AI 搜索（免费匿名可用，不限额度但有限速）");
  console.log("   · gh_grep    — GitHub 代码全文搜索（无需认证）");
  console.log("   · context7   — 实时库文档（免费 1,000 次/月，无需 Key）");
  console.log("");
  console.log("6. 权限配置:");
  console.log("   ⚠️ key 名是 permission（单数），不是 permissions（复数）");
  console.log("   复制 opencode.json.example 中的 permission 段");
  console.log("");
  console.log("7. 环境变量检查:");
  console.log("   OPENCODE_EXPERIMENTAL_LSP_TOOL=true");
  console.log("   OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1");
  console.log("");
  console.log("8. 模型别名（Agent 分层缓存优化必须）:");
  console.log("   在项目根目录 opencode.json.example 顶层配置 modelAliases 段");
  console.log("   deploy.mjs 部署时自动读取并替换 agent 文件中的 DS_MODEL_LOW/HIGH 占位符");
  console.log("   ⚠️ 不要写入 ~/.config/opencode/opencode.json（OC 不识别的自定义字段，会导致启动报错）");
  console.log("");
  console.log("完成后重启 OpenCode。验证: memories/.fractal-healthcheck 应出现（分形自检标记）。");

  return stats.failed.length > 0 ? 1 : 0;
}

process.exit(main());
