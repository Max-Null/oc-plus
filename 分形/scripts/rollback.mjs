/**
 * OC-plus 回滚脚本 — 从备份恢复部署
 *
 * 用法: node 分形/scripts/rollback.mjs
 * 适用场景: 部署后 OC 无法启动/崩溃，需要恢复上一个可用版本。
 * 不依赖 OC，可以用任何终端执行。
 *
 * 恢复的文件:
 *   plugins/fractal.ts
 *   plugins/lib/prompts.ts
 *   plugins/agents-priority.ts
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HOME = os.homedir();
const OC = path.join(HOME, ".config", "opencode");
const BACKUP_DIR = path.join(OC, ".deploy-backup");
const BACKUP_META = path.join(BACKUP_DIR, "backup.json");

// ============================================================
// 主流程
// ============================================================

console.log("===== OC-plus 回滚工具 =====");

// 1. 检查备份是否存在
if (!fs.existsSync(BACKUP_META)) {
  console.log("✗ 未找到备份文件。");
  console.log(`  备份目录: ${BACKUP_DIR}`);
  console.log("");
  console.log("  可能原因:");
  console.log("  1. 从未执行过 deploy.mjs（新版本才有备份功能）");
  console.log("  2. 备份已被清理");
  console.log("");
  console.log("  替代方案:");
  console.log("  · 从 git 恢复: cd oc-plus && git checkout 分形/fractal.ts && node deploy.mjs");
  console.log("  · 查看 debug.log 定位问题: cat ~/.config/opencode/memories/debug.log");
  process.exit(1);
}

// 2. 读取备份元数据
let meta;
try {
  meta = JSON.parse(fs.readFileSync(BACKUP_META, "utf-8"));
} catch (e) {
  console.log(`✗ 备份文件损坏: ${e.message}`);
  process.exit(1);
}

console.log(`备份时间: ${meta.timestamp}`);
console.log(`备份时 commit: ${meta.gitCommit || "unknown"}`);
console.log(`备份文件数: ${meta.backedUpFiles.length}`);
console.log("");

// 3. 恢复文件
const filesToRestore = [
  { backup: "fractal.ts",      target: path.join(OC, "plugins", "fractal.ts") },
  { backup: "prompts.ts",      target: path.join(OC, "plugins", "lib", "prompts.ts") },
  { backup: "agents-priority.ts", target: path.join(OC, "plugins", "agents-priority.ts") },
];

let restoredCount = 0;
let failedCount = 0;

for (const f of filesToRestore) {
  const backupFile = path.join(BACKUP_DIR, f.backup);
  if (!fs.existsSync(backupFile)) {
    console.log(`  - ${f.backup}: 备份中不存在（跳过）`);
    continue;
  }

  // 确保目标目录存在
  const targetDir = path.dirname(f.target);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    fs.copyFileSync(backupFile, f.target);
    console.log(`  ✓ ${f.backup} → ${f.target.replace(HOME, "~")}`);
    restoredCount++;
  } catch (e) {
    console.log(`  ✗ ${f.backup}: ${e.message}`);
    failedCount++;
  }
}

console.log("");

// 4. 清理流水线状态（部署出错时流水线可能处于损坏状态）
const pipelineStateFile = path.join(OC, "memories", ".pipeline-state.json");
if (fs.existsSync(pipelineStateFile)) {
  try {
    fs.unlinkSync(pipelineStateFile);
    console.log("  ✓ 清理 .pipeline-state.json");
  } catch (e) {
    console.log(`  - .pipeline-state.json 清理失败: ${e.message}`);
  }
}

console.log("");
console.log(`===== 回滚完成: 恢复 ${restoredCount} 个文件${failedCount > 0 ? `, ${failedCount} 失败` : ""} =====`);
console.log("");
console.log("现在重启 OpenCode，应该能正常启动了。");
console.log("");
console.log("回滚后建议:");
console.log("1. 在 oc-plus 工作区修复源码问题");
console.log("2. 重新部署前确保 npm test 通过");
console.log("3. 备份会保留，下次部署会自动覆盖旧备份");

if (failedCount > 0) {
  process.exit(1);
}
