/**
 * 记忆管家 LLM 分析端到端测试
 * 用法：node test-analyze.mjs
 * 读取 events.log 中最近 25 条事件，直接调 API 验证分析流程
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const OC_CONFIG = path.join(HOME, ".config", "opencode");
const MEMORIES_DIR = path.join(OC_CONFIG, "memories");
const EVENT_LOG = path.join(MEMORIES_DIR, "events.log");
const BLOCKS_DIR = path.join(MEMORIES_DIR, "blocks");
const TRIGGERS_DIR = path.join(MEMORIES_DIR, "triggers");

// ====== 1. 读取配置 ======
const configRaw = fs.readFileSync(path.join(OC_CONFIG, "opencode.json"), "utf-8");
const config = JSON.parse(configRaw);
const providers = config.provider || {};
let apiConfig = null;
for (const [, p] of Object.entries(providers)) {
  const opts = p.options;
  if (opts?.apiKey && opts?.baseURL) {
    apiConfig = {
      apiKey: opts.apiKey,
      baseURL: opts.baseURL.replace(/\/+$/, ""),
      // 去前缀 + 用 flash
      model: "deepseek-v4-flash",
    };
    break;
  }
}
if (!apiConfig) { console.error("无法获取 API 配置"); process.exit(1); }
console.log(`API: ${apiConfig.baseURL} | model: ${apiConfig.model}`);

// ====== 2. 读取事件（最近 25 条） ======
const lines = fs.readFileSync(EVENT_LOG, "utf-8").split("\n").filter(Boolean);
const sample = lines.slice(-25);
const eventSummary = sample
  .map(line => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean)
  .map(rec => ({
    ts: rec.ts,
    type: rec.event?.type,
    role: rec.event?.properties?.role,
    content: typeof rec.event?.properties?.content === "string"
      ? rec.event.properties.content.slice(0, 200)
      : undefined,
  }))
  .filter(e => e.type);
console.log(`事件样本: ${eventSummary.length} 条`);

// ====== 3. 读取已有 blocks / triggers ======
const existingBlocks = [];
const existingTriggers = [];
for (const d of [BLOCKS_DIR, TRIGGERS_DIR]) {
  if (fs.existsSync(d)) {
    for (const f of fs.readdirSync(d).filter(f => f.endsWith(".md"))) {
      const content = fs.readFileSync(path.join(d, f), "utf-8");
      (d.includes("blocks") ? existingBlocks : existingTriggers).push(
        `文件: ${d.includes("blocks") ? "blocks" : "triggers"}/${f}\n${content.slice(0, 500)}`
      );
    }
  }
}
console.log(`已有 blocks: ${existingBlocks.length} | triggers: ${existingTriggers.length}`);

// ====== 4. 构造 prompt ======
const systemPrompt = `你是用户的赛博分身——记忆管家（分析模式）。

你的任务：分析用户的操作记录，自主发现用户的重复行为模式（habits）。

记忆文件分两类：
- blocks/：习惯描述（供主 agent 参考）
- triggers/：触发规则（供 system prompt 注入）

输出严格 JSON：
{
  "actions": [{ "type": "create_block | skip", "file": "文件名", "memPath": "0|1|2", "content": "完整内容", "reason": "原因" }],
  "summary": "摘要"
}
没有新发现返回 {"actions": [], "summary": "NO_NEW_HABITS"}`;

const userPrompt = `## 已有记忆

### blocks
${existingBlocks.length > 0 ? existingBlocks.join("\n\n---\n\n") : "（空）"}

### triggers
${existingTriggers.length > 0 ? existingTriggers.join("\n\n---\n\n") : "（空）"}

## 新增事件（${eventSummary.length} 条）
${JSON.stringify(eventSummary, null, 2)}

请分析并返回 JSON。`;

// ====== 5. 调 API ======
console.log(`\n发送请求 (${eventSummary.length} 条事件)...`);
try {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 60000);
  const response = await fetch(`${apiConfig.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      thinking: { type: "disabled" },
    }),
    signal: controller.signal,
  });

  console.log(`HTTP ${response.status}`);
  const data = await response.json();

  if (!response.ok) {
    console.error("错误:", JSON.stringify(data, null, 2).slice(0, 500));
    process.exit(1);
  }

  const result = data.choices?.[0]?.message?.content || null;
  if (!result) {
    console.error("无返回内容");
    process.exit(1);
  }

  console.log(`\n===== LLM 返回 (${result.length} bytes) =====`);
  console.log(result);
  console.log("===== 结束 =====");

  // 尝试解析 JSON
  try {
    const parsed = JSON.parse(result);
    console.log(`\n解析成功！actions: ${parsed.actions?.length || 0} 条`);
    if (parsed.summary) console.log(`摘要: ${parsed.summary}`);
  } catch {
    const m = result.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        console.log(`\n容错解析成功！actions: ${parsed.actions?.length || 0} 条`);
      } catch { console.log("\n无法解析返回的 JSON"); }
    } else {
      console.log("\n返回内容不是 JSON 格式");
    }
  }
} catch (err) {
  console.error("异常:", err.message);
  process.exit(1);
}
