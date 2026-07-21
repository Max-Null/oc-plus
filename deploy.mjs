/**
 * oc-plus 部署脚本 V3.9（Node.js 跨平台）
 * 注意：此版本号仅为部署脚本自身的迭代标识，非 oc-plus 系统版本。
 *       各组件独立管理版本：双星 V3.7 / 分形 v3.4 / 技能 各自维护。
 *
 * 用法: node deploy.mjs
 * 替代 deploy.ps1，解决 PowerShell 5.1 中文编码解析失败问题。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

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

function copyFile(src, destDir, label) {
  const dest = path.join(destDir, path.basename(src));
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
// 主流程
// ============================================================

function main() {
  console.log("===== oc-plus 部署 V3.9 =====");
  console.log(`目标: ${OC}\n`);

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
  console.log("");

  // [2/7] deploy agents
  console.log("[2/7] deploying agents...");
  const agentFiles = [
    { src: path.join(SRC.agents, "双星.md"), label: "double-star agent" },
    { src: path.join(SRC.agents, "工匠.md"), label: "artisan agent" },
    { src: path.join(SRC.agents, "参谋.md"), label: "tactician agent" },
    { src: path.join(SRC.agents, "军师.md"), label: "strategist agent" },
    { src: path.join(SRC.fractalAgent, "助理.md"), label: "assistant agent" },
  ];
  for (const a of agentFiles) {
    copyFile(a.src, DST.agents, a.label);
  }
  console.log("");

  // [3/7] deploy plugins
  console.log("[3/7] deploying plugins...");
  copyFile(SRC.fractalTs, DST.plugins, "fractal.ts (Guardian Agent)");
  copyFile(SRC.promptsLib, DST.pluginsLib, "lib/prompts.ts");
  copyFile(SRC.agentsPriority, DST.plugins, "agents-priority.ts");
  console.log("");

  // [4/7] deploy commands
  console.log("[4/7] deploying commands...");
  copyDir(SRC.commands, DST.commands, false);
  console.log("");

  // [5/7] deploy scripts
  console.log("[5/7] deploying scripts...");
  const scriptFiles = ["memories-cli.mjs", "test-analyze.mjs", "fractal-cli.mjs"];
  for (const s of scriptFiles) {
    copyFile(path.join(SRC.scripts, s), DST.scripts, s);
  }
  console.log("");

  // [6/7] deploy prompt templates
  console.log("[6/7] deploying prompt templates...");
  copyDir(SRC.promptTemplates, DST.fractalPrompts, false);
  console.log("");

  // [7/7] deploy skills
  console.log("[7/7] deploying skills...");
  copyDir(SRC.skills, DST.skills, true); // skip existing — don't overwrite user's skill mods
  copyDir(SRC.fractalSkills, DST.skills, true); // 分形专属技能
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

  // post-deploy: opencode.json checklist
  console.log("\n===== opencode.json checklist =====");
  console.log("deploy 已将文件复制到位，但需手动配置以下内容。");
  console.log("完整模板见项目根目录 opencode.json.example，可直接复制后修改关键字段。");
  console.log("");
  console.log("1. provider 模型 API Key:");
  console.log("   编辑 provider.ds.options.apiKey，替换为你的 DeepSeek Key");
  console.log("   获取: https://platform.deepseek.com/api_keys");
  console.log("");
  console.log("2. plugin 数组:");
  console.log('   ["~/.config/opencode/node_modules/superpowers", "opencode-acp@latest", "fractal", "agents-priority"]');
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
  console.log("   包含 4 个 MCP:");
  console.log("   · websearch  — Exa AI 搜索（免费匿名可用，不限额度但有限速）");
  console.log("   · github     — GitHub 操作（需要 PAT: https://github.com/settings/tokens）");
  console.log("   · gh_grep    — GitHub 代码全文搜索（无需认证）");
  console.log("   · context7   — 实时库文档（免费 1,000 次/月，无需 Key）");
  console.log("");
  console.log("6. 权限配置:");
  console.log("   复制 opencode.json.example 中的 permissions 段");
  console.log("");
  console.log("7. 环境变量检查:");
  console.log("   OPENCODE_EXPERIMENTAL_LSP_TOOL=true");
  console.log("   OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1");
  console.log("");
  console.log("完成后重启 OpenCode。验证: memories/debug.log 应出现 [fractal] 日志行。");

  return stats.failed.length > 0 ? 1 : 0;
}

process.exit(main());
