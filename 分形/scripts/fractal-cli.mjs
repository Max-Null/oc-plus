#!/usr/bin/env node
/**
 * 分形 CLI — /fractal 命令的实现
 * 用法：node fractal-cli.mjs <subcommand> [args...]
 *
 * 子命令：
 *   status           查看触发线和状态摘要
 *   pause <line>     暂停指定触发线（1-5）
 *   resume <line>    恢复指定触发线
 *   learn            手动触发学习分析
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const MEMORIES = path.join(os.homedir(), ".config", "opencode", "memories");
const COUNTER = path.join(MEMORIES, ".assertion-counter.json");
const DEBUG = path.join(MEMORIES, "debug.log");
const EVENTS = path.join(MEMORIES, "events.log");
const BLOCKS = path.join(MEMORIES, "blocks");
const TRIGGERS = path.join(MEMORIES, "triggers");
const PAUSE_PREFIX = ".fractal-pause-";
const LEARN_FLAG = path.join(MEMORIES, ".fractal-learn-flag.json");

const sub = process.argv[2] || "status";

// ======= 辅助函数 =======

function readJSON(fpath) {
  try {
    if (fs.existsSync(fpath)) return JSON.parse(fs.readFileSync(fpath, "utf-8"));
  } catch {}
  return null;
}

function countFiles(dir) {
  try { return fs.readdirSync(dir).length; } catch { return 0; }
}

function tailFile(fpath, n = 10) {
  try {
    const lines = fs.readFileSync(fpath, "utf-8").trim().split("\n");
    return lines.slice(-n);
  } catch { return []; }
}

// ======= 子命令实现 =======

function cmdStatus() {
  const counter = readJSON(COUNTER);
  const blocks = countFiles(BLOCKS);
  const triggers = countFiles(TRIGGERS);
  const pauseFiles = fs.readdirSync(MEMORIES).filter(f => f.startsWith(PAUSE_PREFIX));
  const paused = pauseFiles.map(f => f.replace(PAUSE_PREFIX, "").replace(".json", ""));

  console.log("═══════════════════════════════════════");
  console.log("  分形 Guardian Agent V3.1");
  console.log("═══════════════════════════════════════\n");

  // 触发线状态
  console.log("── 触发线状态 ──");
  const lines = [
    { id: "1", name: "文件写入匹配", status: paused.includes("1") ? "⏸️ 已暂停" : "✅ 活跃" },
    { id: "2", name: "连续无进展循环", status: paused.includes("2") ? "⏸️ 已暂停" : "✅ 活跃" },
    { id: "3", name: "上下文压力", status: "⏸️ ACP 已覆盖" },
    { id: "4", name: "主动联网查证", status: paused.includes("4") ? "⏸️ 已暂停" : "✅ 活跃" },
    { id: "5", name: "提交后知识提取", status: "📋 计划中" },
  ];
  for (const l of lines) {
    console.log(`  触发线 ${l.id} · ${l.name}: ${l.status}`);
  }

  // 触发线 4 计数器
  console.log("\n── 触发线 4 · 断言计数器 ──");
  if (counter && counter.count > 0) {
    console.log(`  累计未查证: ${counter.count} 次`);
    console.log(`  最近断言: "${counter.lastSnippet}"`);
    console.log(`  上次更新: ${counter.updatedAt || "未知"}`);
  } else {
    console.log("  无未查证断言 ✅");
  }

  // 知识库
  console.log("\n── 知识库 ──");
  console.log(`  blocks/: ${blocks} 条`);
  console.log(`  triggers/: ${triggers} 条`);

  // 最近事件
  console.log("\n── 最近事件 ──");
  const events = tailFile(EVENTS, 5);
  if (events.length > 0) {
    for (const e of events) {
      try {
        const { ts, event } = JSON.parse(e);
        const type = event?.type || "unknown";
        const time = new Date(ts).toLocaleString("zh-CN");
        console.log(`  [${time}] ${type}`);
      } catch { /* skip */ }
    }
  } else {
    console.log("  无最近事件");
  }

  // 最近 debug
  const dbg = tailFile(DEBUG, 3);
  const recentDbg = dbg.filter(l => l.includes("触发线") || l.includes("FRACTAL") || l.includes("HOOK"));
  if (recentDbg.length > 0) {
    console.log("\n── 最近分形活动 ──");
    for (const l of recentDbg) console.log(`  ${l.substring(0, 120)}`);
  }

  console.log("\n命令: /fractal pause <线号> | /fractal resume <线号> | /fractal learn");
}

function cmdPause(line) {
  if (!line || !/^[1-5]$/.test(line)) {
    console.log("用法: /fractal pause <1-5>");
    console.log("  1=文件写入匹配  2=循环检测  4=联网查证");
    process.exit(1);
  }
  const name = { "1": "文件写入匹配", "2": "连续无进展循环", "4": "主动联网查证" }[line] || `触发线 ${line}`;
  fs.writeFileSync(path.join(MEMORIES, `${PAUSE_PREFIX}${line}.json`), JSON.stringify({
    paused: true, line, name, ts: new Date().toISOString()
  }), "utf-8");
  console.log(`✅ 已暂停触发线 ${line}（${name}）`);
  console.log("   重启会话后生效。恢复: /fractal resume " + line);
}

function cmdResume(line) {
  if (!line || !/^[1-5]$/.test(line)) {
    console.log("用法: /fractal resume <1-5>");
    process.exit(1);
  }
  const fpath = path.join(MEMORIES, `${PAUSE_PREFIX}${line}.json`);
  if (fs.existsSync(fpath)) {
    fs.unlinkSync(fpath);
    console.log(`✅ 已恢复触发线 ${line}`);
  } else {
    console.log(`触发线 ${line} 未被暂停`);
  }
}

function cmdLearn() {
  fs.writeFileSync(LEARN_FLAG, JSON.stringify({
    requested: true, ts: new Date().toISOString()
  }), "utf-8");
  console.log("✅ 已提交学习请求");
  console.log("   下次会话启动时将分析 events.log 增量并提取习惯");
}

// ======= 路由 =======

switch (sub) {
  case "status":
    cmdStatus();
    break;
  case "pause":
    cmdPause(process.argv[3]);
    break;
  case "resume":
    cmdResume(process.argv[3]);
    break;
  case "learn":
    cmdLearn();
    break;
  default:
    console.log(`未知子命令: ${sub}`);
    console.log("可用: status | pause <1-5> | resume <1-5> | learn");
    process.exit(1);
}
