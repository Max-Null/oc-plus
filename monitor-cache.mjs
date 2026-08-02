/**
 * 缓存命中率监控脚本
 * 读取 fractal events.log，按消息输出最近 N 条的缓存命中情况
 * 用法: node monitor-cache.mjs [--last N] [--session 短码]
 *   --last 50    只看最近 50 条消息（默认 20）
 *   --session xxx 只看指定 sessionID 前缀的消息
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const eventsPath = join(homedir(), ".config", "opencode", "memories", "events.log");

const args = process.argv.slice(2);
const lastArg = args.indexOf("--last");
const last = lastArg >= 0 ? parseInt(args[lastArg + 1], 10) || 20 : 20;
const sessArg = args.indexOf("--session");
const sessFilter = sessArg >= 0 ? args[sessArg + 1] : null;

let rows = [];
try {
  const content = readFileSync(eventsPath, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const ev = obj.event;
    if (!ev || ev.type !== "message.updated") continue;
    const props = ev.properties || {};
    const info = props.info || {};
    const tokens = info.tokens || {};
    const t = tokens.total ?? tokens.input ?? 0;
    const input = tokens.input ?? 0;
    const read = tokens.cache?.read ?? 0;
    const write = tokens.cache?.write ?? 0;
    const session = (props.sessionID || "").slice(0, 8);
    const role = info.role || "?";
    // 仅统计有效 assistant 消息（input>0 且 read<=input，排除中间态消息）
    if (role !== "assistant" || input <= 0 || read > input) continue;
    if (sessFilter && !session.startsWith(sessFilter)) continue;
    rows.push({ ts: obj.ts, session, input, read, write, model: info.modelID || "?" });
  }
} catch (err) {
  console.error("读取 events.log 失败:", err.message);
  process.exit(1);
}

// 去重：同 session + 同 input + 同 read 的连续重复行只保留最后一条
const deduped = [];
for (const r of rows) {
  const prev = deduped[deduped.length - 1];
  if (prev && prev.session === r.session && prev.input === r.input && prev.read === r.read && prev.write === r.write) {
    deduped[deduped.length - 1] = r;
  } else {
    deduped.push(r);
  }
}

const target = deduped.slice(-last);
console.log(`=== 缓存监控: 最近 ${target.length} 条消息（文件 ${statSync(eventsPath).size} bytes）===\n`);
console.log("时间(本地)      | session  | 模型             | input     | cache_read | cache_write | 命中率");
console.log("----------------+----------+------------------+-----------+------------+-------------+-------");
for (const r of target) {
  const local = new Date(r.ts).toLocaleTimeString("zh-CN", { hour12: false });
  const rate = inputRate(r.input, r.read);
  console.log(
    `${local.padEnd(15)} | ${r.session.padEnd(8)} | ${(r.model + "").padEnd(16)} | ${String(r.input).padStart(9)} | ${String(r.read).padStart(10)} | ${String(r.write).padStart(11)} | ${rate}`
  );
}

// 汇总
const totalIn = target.reduce((s, r) => s + r.input, 0);
const totalRead = target.reduce((s, r) => s + r.read, 0);
console.log(`\n汇总: 总 input=${totalIn}, 总 cache_read=${totalRead}, 平均命中率=${totalIn > 0 ? Math.round(totalRead / totalIn * 1000) / 10 : 0}%`);
console.log(`最近 3 条平均命中率: ${trendRate(target.slice(-3))}`);
console.log(`最近 5 条平均命中率: ${trendRate(target.slice(-5))}`);

function inputRate(input, read) {
  if (input <= 0) return "n/a";
  return Math.round(read / input * 1000) / 10 + "%";
}
function trendRate(arr) {
  const inSum = arr.reduce((s, r) => s + r.input, 0);
  const rdSum = arr.reduce((s, r) => s + r.read, 0);
  if (inSum <= 0) return "n/a";
  return Math.round(rdSum / inSum * 1000) / 10 + "%";
}
