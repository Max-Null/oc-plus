#!/usr/bin/env node

/**
 * 记忆管家 CLI — 查看三层记忆中的 blocks 和 triggers
 *
 * 用法：
 *   node memories-cli.mjs                    # 默认：表格展示当前项目 + 全局
 *   node memories-cli.mjs --json             # JSON 输出（供 GUI 消费）
 *   node memories-cli.mjs --all              # 全局 + 所有项目的个人级（不含共享）
 *   node memories-cli.mjs --status pending   # 只看 pending 状态
 *   node memories-cli.mjs --type habit       # 只看 habit 类型
 *   node memories-cli.mjs --project /path    # 指定项目目录（默认 cwd）
 *   node memories-cli.mjs --no-project       # 只看全局，跳过项目级
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// ============================================================
// 命令行参数解析
// ============================================================

const args = process.argv.slice(2);
const flags = {
  json: args.includes("--json"),
  table: !args.includes("--json"),
  all: args.includes("--all"),
  noProject: args.includes("--no-project"),
  status: getArg("--status"),
  type: getArg("--type"),
  project: getArg("--project"),
};

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

// ============================================================
// 路径计算（与 memories.ts 同步）
// ============================================================

const HOME = os.homedir();
const OC_CONFIG = path.join(HOME, ".config", "opencode");
const MEMORIES_DIR = path.join(OC_CONFIG, "memories");

function getMemoryPaths(projectDir) {
  const paths = [{ dir: MEMORIES_DIR, label: "全局" }];

  if (projectDir) {
    const projectHash = crypto.createHash("md5").update(projectDir).digest("hex").slice(0, 8);
    paths.push({
      dir: path.join(OC_CONFIG, "project", projectHash, "memories"),
      label: "个人项目级",
    });

    const sharedPath = path.join(projectDir, ".opencode", "memories");
    if (fs.existsSync(sharedPath)) {
      paths.push({ dir: sharedPath, label: "共享项目级" });
    }
  }

  return paths;
}

function safeReadFile(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf-8");
  } catch { /* */ }
  return "";
}

// ============================================================
// 解析 block/trigger 文件的 HTML 注释元数据
// ============================================================

function parseMeta(content, maxIndex = 150) {
  const meta = {};
  const commentRegex = /<!--\s*(\w+):\s*(.*?)\s*-->/g;
  let match;
  while ((match = commentRegex.exec(content)) !== null) {
    if (match.index > maxIndex) break;
    meta[match[1]] = match[2].trim();
  }
  return Object.keys(meta).length > 0 ? meta : null;
}

function extractValue(content) {
  const lines = content.split("\n");
  const valueLines = [];
  let inMeta = true;
  for (const line of lines) {
    if (inMeta && (line.trim().startsWith("<!--") || line.trim() === "")) continue;
    inMeta = false;
    valueLines.push(line);
  }
  return valueLines.join("\n").trim();
}

// ============================================================
// 读取并汇总所有记忆
// ============================================================

function collectMemories(memoryPaths) {
  const allBlocks = [];
  const allTriggers = [];

  for (const mem of memoryPaths) {
    const blocksDir = path.join(mem.dir, "blocks");
    if (fs.existsSync(blocksDir)) {
      for (const file of fs.readdirSync(blocksDir).filter(f => f.endsWith(".md"))) {
        const content = safeReadFile(path.join(blocksDir, file));
        const meta = parseMeta(content);
        if (meta) {
          allBlocks.push({
            source: mem.label,
            sourceDir: mem.dir,
            file,
            type: meta.type || "habit",
            label: meta.label || file.replace(".md", ""),
            description: meta.description || "",
            confidence: meta.confidence || "",
            confidence_reason: meta.confidence_reason || "",
            status: meta.status || "pending",
            suggested_status: meta.suggested_status || "",
            value: extractValue(content),
          });
        }
      }
    }

    const triggersDir = path.join(mem.dir, "triggers");
    if (fs.existsSync(triggersDir)) {
      for (const file of fs.readdirSync(triggersDir).filter(f => f.endsWith(".md"))) {
        const content = safeReadFile(path.join(triggersDir, file));
        const meta = parseMeta(content, 400);
        if (meta) {
          allTriggers.push({
            source: mem.label,
            sourceDir: mem.dir,
            file,
            type: meta.type || "habit",
            label: meta.label || file.replace(".md", ""),
            human_description: meta.human_description || "",
            description: meta.description || "",
            confidence: meta.confidence || "",
            confidence_reason: meta.confidence_reason || "",
            status: meta.status || "pending",
            suggested_status: meta.suggested_status || "",
            content: extractValue(content),
          });
        }
      }
    }
  }

  return { blocks: allBlocks, triggers: allTriggers };
}

// ============================================================
// 过滤
// ============================================================

function applyFilters(items, flags) {
  if (flags.status) {
    items = items.filter(i => i.status === flags.status);
  }
  if (flags.type) {
    items = items.filter(i => i.type === flags.type);
  }
  return items;
}

// ============================================================
// 输出
// ============================================================

function formatTable(blocks, triggers) {
  const lines = [];
  const total = blocks.length + triggers.length;

  if (total === 0) {
    lines.push("📭 暂无记录的记忆。");
    return lines.join("\n");
  }

  lines.push(`记忆管家 · ${total} 条记忆\n`);

  // blocks
  if (blocks.length > 0) {
    lines.push("━━━ blocks（习惯描述）━━━\n");
    for (const b of blocks) {
      const icon = b.status === "auto" ? "✅" : b.status === "suggest" ? "💡" : "⏳";
      lines.push(`${icon} [${b.source}] ${b.description || b.label}`);
      lines.push(`   状态: ${b.status}  置信度: ${b.confidence || "-"}  类型: ${b.type}`);
      if (b.confidence_reason) {
        lines.push(`   依据: ${b.confidence_reason}`);
      }
      if (b.value) {
        // 显示 value 摘要（最多 3 行）
        const valLines = b.value.split("\n").filter(l => l.trim()).slice(0, 3);
        for (const vl of valLines) {
          lines.push(`   内容: ${vl.slice(0, 80)}${vl.length > 80 ? "..." : ""}`);
        }
      }
      lines.push("");
    }
  }

  // triggers
  if (triggers.length > 0) {
    lines.push("━━━ triggers（触发规则）━━━\n");
    for (const t of triggers) {
      const icon = t.status === "auto" ? "🚀" : t.status === "suggest" ? "💡" : "⏳";
      lines.push(`${icon} [${t.source}] ${t.human_description || t.description || t.label}`);
      lines.push(`   状态: ${t.status}  置信度: ${t.confidence || "-"}  类型: ${t.type}`);
      if (t.confidence_reason) {
        lines.push(`   依据: ${t.confidence_reason}`);
      }
      // 显示 trigger 规则摘要
      const contentLines = t.content.split("\n").filter(l => l.trim()).slice(0, 4);
      for (const cl of contentLines) {
        lines.push(`   规则: ${cl.slice(0, 80)}${cl.length > 80 ? "..." : ""}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function formatJSON(blocks, triggers) {
  return JSON.stringify(
    {
      total: blocks.length + triggers.length,
      blocks: blocks.map(b => ({
        source: b.source,
        file: b.file,
        type: b.type,
        label: b.label,
        description: b.description,
        confidence: b.confidence,
        confidence_reason: b.confidence_reason,
        status: b.status,
        suggested_status: b.suggested_status,
        value: b.value,
      })),
      triggers: triggers.map(t => ({
        source: t.source,
        file: t.file,
        type: t.type,
        label: t.label,
        human_description: t.human_description,
        description: t.description,
        confidence: t.confidence,
        confidence_reason: t.confidence_reason,
        status: t.status,
        suggested_status: t.suggested_status,
        content: t.content,
      })),
    },
    null,
    2
  );
}

// ============================================================
// 主流程
// ============================================================

function main() {
  let memoryPaths;

  if (flags.all) {
    // 全局 + 所有已缓存的个人项目级
    memoryPaths = [{ dir: MEMORIES_DIR, label: "全局" }];
    const projectBase = path.join(OC_CONFIG, "project");
    if (fs.existsSync(projectBase)) {
      for (const hash of fs.readdirSync(projectBase)) {
        const memDir = path.join(projectBase, hash, "memories");
        if (fs.existsSync(memDir)) {
          memoryPaths.push({ dir: memDir, label: `项目(${hash})` });
        }
      }
    }
  } else if (flags.noProject) {
    memoryPaths = [{ dir: MEMORIES_DIR, label: "全局" }];
  } else {
    const projectDir = flags.project || process.cwd();
    memoryPaths = getMemoryPaths(projectDir);
  }

  const { blocks, triggers } = collectMemories(memoryPaths);
  const filteredBlocks = applyFilters(blocks, flags);
  const filteredTriggers = applyFilters(triggers, flags);

  if (flags.json) {
    console.log(formatJSON(filteredBlocks, filteredTriggers));
  } else {
    console.log(formatTable(filteredBlocks, filteredTriggers));
  }
}

main();
