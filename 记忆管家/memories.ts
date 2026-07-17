/**
 * 记忆管家 Plugin for OpenCode — v1.2
 *
 * 三层记忆架构：
 * - 全局：~/.config/opencode/memories/
 * - 个人项目级：~/.config/opencode/project/<hash>/memories/
 * - 共享项目级：<项目>/.opencode/memories/
 *
 * 核心功能：
 * 1. system.transform：注入 blocks + triggers 到 system prompt
 * 2. event：记录用户操作到 events.log
 * 3. 分析触发：新会话启动时检查增量，调用 LLM 自主学习用户习惯
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getSystemPrompt, getUserPrompt } from "./prompts.js";

// ============================================================
// 路径常量
// ============================================================

const HOME = os.homedir();
const OC_CONFIG = path.join(HOME, ".config", "opencode");
const MEMORIES_DIR = path.join(OC_CONFIG, "memories");
const BLOCKS_DIR = path.join(MEMORIES_DIR, "blocks");
const TRIGGERS_DIR = path.join(MEMORIES_DIR, "triggers");
const EVENT_LOG = path.join(MEMORIES_DIR, "events.log");
const DEBUG_LOG = path.join(MEMORIES_DIR, "debug.log");
const LAST_ANALYSIS = path.join(MEMORIES_DIR, "last-analysis.json");

const ANALYSIS_THRESHOLD = 20; // 累积 N 条事件后触发分析
const MAX_EVENTS_FOR_ANALYSIS = 200;
const MAX_LOG_SIZE = 1 * 1024 * 1024; // 日志轮转阈值：1MB

// ============================================================
// 日志轮转：超过阈值时保留最近一段，其余丢弃
// ============================================================

function rotateLog(logPath: string, maxSize: number = MAX_LOG_SIZE) {
  try {
    if (!fs.existsSync(logPath)) return;
    const stat = fs.statSync(logPath);
    if (stat.size <= maxSize) return;
    // 保留最近 100KB 的事件
    const content = fs.readFileSync(logPath, "utf-8");
    const keepSize = Math.min(maxSize, stat.size);
    const tail = content.slice(-keepSize);
    // 从第一个完整行开始保留
    const firstNewline = tail.indexOf("\n");
    fs.writeFileSync(logPath, firstNewline > 0 ? tail.slice(firstNewline + 1) : tail, "utf-8");
    debug(`LOG: 轮转 ${logPath}，${stat.size} → ${fs.statSync(logPath).size} bytes`);
  } catch { /* 静默 */ }
}

// ============================================================
// 工具函数
// ============================================================

function debug(msg: string) {
  try {
    fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`, "utf-8");
  } catch { /* 静默 */ }
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function safeReadFile(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch { /* 读取失败返回空 */ }
  return "";
}

/**
 * 获取三层记忆路径
 * 优先级（同名项覆盖）：共享项目级 > 个人项目级 > 全局
 */
function getMemoryPaths(projectDir?: string): string[] {
  const paths: string[] = [];

  // 全局
  paths.push(MEMORIES_DIR);

  // 个人项目级（如果知道项目目录）
  if (projectDir) {
    const projectHash = crypto.createHash("md5").update(projectDir).digest("hex").slice(0, 8);
    paths.push(path.join(OC_CONFIG, "project", projectHash, "memories"));
  }

  // 共享项目级（如果存在）
  if (projectDir) {
    const sharedPath = path.join(projectDir, ".opencode", "memories");
    if (fs.existsSync(sharedPath)) {
      paths.push(sharedPath);
    }
  }

  return paths;
}

/**
 * 按优先级合并读取多个路径下的子目录文件
 * 高优先级同名文件覆盖低优先级
 */
function mergeBlocksAndTriggers(memoryPaths: string[]): {
  blocks: Array<{ type: string; label: string; description: string; confidence: string; status: string; suggested_status: string; memPathIndex: string; fileName: string; value: string }>;
  triggers: Array<{ type: string; label: string; human_description: string; confidence: string; status: string; suggested_status: string; memPathIndex: string; fileName: string; content: string }>;
} {
  const blockMap = new Map<string, { type: string; label: string; description: string; confidence: string; status: string; suggested_status: string; memPathIndex: string; fileName: string; value: string }>();
  const triggerMap = new Map<string, { type: string; label: string; human_description: string; confidence: string; status: string; suggested_status: string; memPathIndex: string; fileName: string; content: string }>();

  // 从低优先级到高优先级遍历
  for (let pathIndex = 0; pathIndex < memoryPaths.length; pathIndex++) {
    const memPath = memoryPaths[pathIndex];
    // 读取 blocks/
    const blocksDir = path.join(memPath, "blocks");
    if (fs.existsSync(blocksDir)) {
      const files = fs.readdirSync(blocksDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const content = safeReadFile(path.join(blocksDir, file));
        const meta = parseMeta(content, 150);
        if (meta) {
          const label = meta.label || file.replace(".md", "");
          blockMap.set(label, {
            type: meta.type || "habit",
            label,
            description: meta.description || "",
            confidence: meta.confidence || "",
            status: meta.status || "pending",
            suggested_status: meta.suggested_status || "suggest",
            memPathIndex: String(pathIndex),
            fileName: file,
            value: extractBlockValue(content),
          });
        }
      }
    }

    // 读取 triggers/
    const triggersDir = path.join(memPath, "triggers");
    if (fs.existsSync(triggersDir)) {
      const files = fs.readdirSync(triggersDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const content = safeReadFile(path.join(triggersDir, file));
        const meta = parseMeta(content, 400);
        if (meta) {
          const label = meta.label || file.replace(".md", "");
          triggerMap.set(label, {
            type: meta.type || "habit",
            label,
            human_description: meta.human_description || "",
            confidence: meta.confidence || "",
            status: meta.status || "pending",
            suggested_status: meta.suggested_status || "suggest",
            memPathIndex: String(pathIndex),
            fileName: file,
            content: extractTriggerContent(content),
          });
        }
      }
    }
  }

  return {
    blocks: Array.from(blockMap.values()),
    triggers: Array.from(triggerMap.values()),
  };
}

/**
 * 解析 block/trigger 文件的 HTML 注释元数据
 * <!-- label: xxx --><!-- description: xxx --><!-- confidence: x/y --><!-- status: xxx -->
 * trigger 文件额外包含 human_description 字段
 */
function parseMeta(content: string, maxIndex: number = 100): Record<string, string> | null {
  const meta: Record<string, string> = {};
  const commentRegex = /<!--\s*(\w+):\s*(.*?)\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = commentRegex.exec(content)) !== null) {
    if (match.index > maxIndex) break; // 仅解析文件头部的注释
    meta[match[1]] = match[2].trim();
  }
  return Object.keys(meta).length > 0 ? meta : null;
}

/**
 * 提取 block 文件中元数据注释之后的内容（即 value 部分）
 */
function extractBlockValue(content: string): string {
  // 跳过所有 HTML 注释行
  const lines = content.split("\n");
  const valueLines: string[] = [];
  let inMeta = true;
  for (const line of lines) {
    if (inMeta && line.trim().startsWith("<!--")) continue;
    if (inMeta && line.trim() === "") continue;
    inMeta = false;
    valueLines.push(line);
  }
  return valueLines.join("\n").trim();
}

/**
 * 提取 trigger 文件中元数据注释之后的内容（即规则部分）
 */
function extractTriggerContent(content: string): string {
  return extractBlockValue(content); // 逻辑相同
}

// ============================================================
// 事件记录（扩展版）
// ============================================================

function logEvent(event: unknown) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), event }) + "\n";
    fs.appendFileSync(EVENT_LOG, line, "utf-8");
    rotateLog(EVENT_LOG); // 超过 1MB 自动轮转
  } catch {
    // 静默失败
  }
}

// ============================================================
// 分析功能（新会话启动时触发，LLM 自主发现习惯）
// ============================================================

function getLastAnalysis(): { ts: string | null; count: number } {
  try {
    if (fs.existsSync(LAST_ANALYSIS)) {
      return JSON.parse(fs.readFileSync(LAST_ANALYSIS, "utf-8"));
    }
  } catch { /* */ }
  return { ts: null, count: 0 };
}

function saveLastAnalysis(ts: string, count: number) {
  try {
    fs.writeFileSync(LAST_ANALYSIS, JSON.stringify({ ts, count }), "utf-8");
  } catch { /* 写入失败不影响主流程 */ }
}

function getNewEvents(): string[] {
  if (!fs.existsSync(EVENT_LOG)) return [];
  const last = getLastAnalysis();
  const lines = fs.readFileSync(EVENT_LOG, "utf-8").split("\n").filter(Boolean);
  const newLines = last.ts
    ? lines.filter(line => {
        try {
          const lastTs = last.ts as string; // 三元表达式已过滤 null，闭包内需显式断言
          return JSON.parse(line).ts > lastTs;
        } catch { return false; }
      })
    : lines;
  return newLines.slice(-MAX_EVENTS_FOR_ANALYSIS);
}

function getApiConfig(): { apiKey: string; baseURL: string; model: string } | null {
  const configPath = path.join(OC_CONFIG, "opencode.json");
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    // 去掉 provider: 前缀，API 只接受纯 model 名
    let model = (config.model || "my-deepseek:deepseek-v4-flash").includes(":")
      ? (config.model || "my-deepseek:deepseek-v4-flash").split(":")[1]
      : config.model;
    // 分析任务用 flash 更经济，若非 flash 则替换
    if (!model.includes("flash")) model = "deepseek-v4-flash";
    const providers = config.provider || {};
    for (const [, provider] of Object.entries(providers)) {
      const p = provider as Record<string, unknown>;
      const opts = p.options as Record<string, unknown> | undefined;
      if (opts?.apiKey && opts?.baseURL) {
        return {
          apiKey: opts.apiKey as string,
          baseURL: (opts.baseURL as string).replace(/\/+$/, ""),
          model,
        };
      }
    }
  } catch { /* */ }
  return null;
}

/**
 * 调用 LLM 自主学习用户习惯（记忆管家分析模式）
 *
 * 与 Phase 2 的区别：不预定义输出格式，
 * LLM 自主决定发现什么类型的习惯、以什么格式存储。
 */
async function analyzeAndUpdate(eventLines: string[], memoryPaths: string[]): Promise<string | null> {
  const config = getApiConfig();
  if (!config) {
    debug("MEMORY: 无法获取 API 配置，跳过分析");
    return null;
  }

  // 准备事件摘要
  const eventSummary = eventLines
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean)
    .map((rec: Record<string, unknown>) => {
      const ev = rec.event as Record<string, unknown> | undefined;
      if (!ev) return null;
      return {
        ts: rec.ts,
        type: ev.type,
        role: (ev as any).properties?.role,
        content: typeof (ev as any).properties?.content === "string"
          ? ((ev as any).properties.content as string).slice(0, 300)
          : undefined,
      };
    })
    .filter(Boolean);

  if (eventSummary.length === 0) {
    debug("MEMORY: 无有效事件可分析");
    return null;
  }

  // 读取已有的 blocks 和 triggers，让 LLM 知道当前状态
  const existingBlocks: string[] = [];
  const existingTriggers: string[] = [];
  for (const memPath of memoryPaths) {
    const blocksDir = path.join(memPath, "blocks");
    if (fs.existsSync(blocksDir)) {
      for (const f of fs.readdirSync(blocksDir).filter(f => f.endsWith(".md"))) {
        existingBlocks.push(`文件: blocks/${f}\n${safeReadFile(path.join(blocksDir, f)).slice(0, 500)}`);
      }
    }
    const triggersDir = path.join(memPath, "triggers");
    if (fs.existsSync(triggersDir)) {
      for (const f of fs.readdirSync(triggersDir).filter(f => f.endsWith(".md"))) {
        existingTriggers.push(`文件: triggers/${f}\n${safeReadFile(path.join(triggersDir, f)).slice(0, 500)}`);
      }
    }
  }

  const systemPrompt = getSystemPrompt();

  const userPrompt = getUserPrompt(existingBlocks, existingTriggers, eventSummary.length, JSON.stringify(eventSummary, null, 2), memoryPaths);

  try {
    debug(`MEMORY: 调用 LLM 分析 ${eventSummary.length} 条事件...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s 超时，防止阻塞
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        // 分析模式不需要推理链，显式关闭减少 token
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      // 增强错误日志，记录 response body 的前 500 字符帮助诊断
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch { /* 读取失败忽略 */ }
      debug(`MEMORY: LLM 调用失败 HTTP ${response.status} — ${errorBody.slice(0, 500)}`);
      return null;
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const result = data.choices?.[0]?.message?.content || null;
    if (result) {
      debug(`MEMORY: LLM 返回 ${result.length} bytes`);
    }
    return result;
  } catch (err) {
    debug(`MEMORY: LLM 调用异常 ${String(err)}`);
    return null;
  }
}

/**
 * 执行 LLM 返回的分析结果：创建/更新 block 和 trigger 文件
 */
function applyAnalysisResult(resultJson: string, memoryPaths: string[]) {
  let parsed: { actions?: Array<{
    type: string;
    file: string;
    memPath: string;
    content: string;
    reason: string;
  }>; summary?: string } | null = null;

  try {
    parsed = JSON.parse(resultJson);
  } catch {
    // 容错：尝试从文本中提取 JSON
    const jsonMatch = resultJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch { /* */ }
    }
  }

  if (!parsed || !parsed.actions) {
    debug("MEMORY: 无法解析 LLM 返回的 JSON");
    return;
  }

  for (const action of parsed.actions) {
    if (action.type === "skip") continue;

    const pathIndex = parseInt(action.memPath, 10);
    if (isNaN(pathIndex) || pathIndex >= memoryPaths.length) {
      debug(`MEMORY: 无效的 memPath: ${action.memPath}`);
      continue;
    }
    const basePath = memoryPaths[pathIndex];

    let targetDir: string;
    if (action.type.startsWith("create_trigger") || action.type.startsWith("update_trigger")) {
      targetDir = path.join(basePath, "triggers");
    } else {
      targetDir = path.join(basePath, "blocks");
    }

    ensureDir(targetDir);
    const filePath = path.join(targetDir, action.file);

    try {
      fs.writeFileSync(filePath, action.content, "utf-8");
      debug(`MEMORY: ${action.type} → ${filePath} (${action.reason})`);
    } catch (err) {
      debug(`MEMORY: 写入失败 ${filePath}: ${String(err)}`);
    }
  }

  debug(`MEMORY: 分析完成 — ${parsed.summary || "无摘要"}`);
}

// ============================================================
// Plugin 导出
// ============================================================

export const MemoriesPlugin = async (ctx?: { project?: { directory?: string } }) => {
  ensureDir(MEMORIES_DIR);
  ensureDir(BLOCKS_DIR);
  ensureDir(TRIGGERS_DIR);
  rotateLog(DEBUG_LOG, 500 * 1024); // debug 日志上限 500KB
  rotateLog(EVENT_LOG); // 启动时检查一次事件日志

  const projectDir = ctx?.project?.directory || undefined;

  return {
    /**
     * 会话启动时：
     * 1. 检查事件增量，触发分析（分析模式）
     * 2. 注入 blocks + triggers 到 system prompt
     */
    "experimental.chat.system.transform": async (
      _input: unknown,
      output: { system: string[] }
    ) => {
      debug("HOOK: system.transform fired");

      // ---- 步骤 0：注入记忆管家核心规则（每次会话无条件注入） ----
      output.system.push(`\n## 记忆管家 v1.1

**回应模式**：每次完成文件写入操作（write / edit）后，必须通过 task 工具调用 \`助理\` subagent，附上操作类型、文件路径、简要说明。调用助理后，把助理返回的指令当作用户消息处理——按助理说的做。助理返回"无事，继续"时不追问。调用失败时静默跳过。

**元知识记录**：当用户说"记住"、"记下来"、"存到记忆"时，判断信息层级后写入对应的 blocks/ 目录。

文件元数据行（必须首行）：`<!-- type: knowledge --><!-- status: auto --><!-- description: 一句话摘要 -->`
正文 ≤ 15 行，结构：事实 → 原则 → 反例 → 结论。反例优先用 ❌/✅ 前后对比。写完自查是否可再压缩 30%。

写入层级：
- 全局 → `~/.config/opencode/memories/blocks/`
- 个人项目级 → `~/.config/opencode/project/<hash>/memories/blocks/`
- 共享项目级 → 项目 `.opencode/memories/blocks/`
写入后告知用户。

**习惯确认**：本章节若出现"发现新习惯，待确认"标题，你必须先用 question 工具逐条确认（含层级），确认完成后才能继续用户任务。\n`);

      const memoryPaths = getMemoryPaths(projectDir);

      // ---- 步骤 1：分析模式 ----
      const newEvents = getNewEvents();
      debug(`MEMORY: 新事件数=${newEvents.length}，阈值=${ANALYSIS_THRESHOLD}`);

      if (newEvents.length >= ANALYSIS_THRESHOLD) {
        debug("MEMORY: 触发 LLM 自主学习分析...");
        const result = await analyzeAndUpdate(newEvents, memoryPaths);
        if (result && result !== "NO_NEW_HABITS") {
          applyAnalysisResult(result, memoryPaths);
        } else {
          debug("MEMORY: 无新习惯或 LLM 未返回有效结果");
        }
        // 更新时间戳
        const lastEvent = newEvents[newEvents.length - 1];
        const lastTs = JSON.parse(lastEvent).ts;
        saveLastAnalysis(lastTs, newEvents.length);
      }

      // ---- 步骤 2：注入 blocks + triggers ----
      const { blocks, triggers } = mergeBlocksAndTriggers(memoryPaths);

      // 按 type + status 分类
      const autoHabits = triggers.filter(t => t.type === "habit" && t.status === "auto");
      const suggestHabits = triggers.filter(t => t.type === "habit" && t.status === "suggest");
      const pendingBlocks = blocks.filter(b => b.status === "pending");
      const pendingTriggers = triggers.filter(t => t.status === "pending");
      const pendingCount = pendingBlocks.length + pendingTriggers.length;
      const knowledgeItems = (blocks.filter(b => b.type === "knowledge" && b.status !== "pending") as any[])
        .concat(triggers.filter(t => t.type === "knowledge" && t.status !== "pending") as any[]);

      // 注入 knowledge 索引（仅 description + 路径，不在上下文堆积——需时自取）
      if (knowledgeItems.length > 0) {
        const indexLines = knowledgeItems.map(k => {
          const desc = (k as any).human_description || k.description;
          const mp = memoryPaths[parseInt((k as any).memPathIndex, 10)] || MEMORIES_DIR;
          const subDir = (k as any).human_description !== undefined ? "triggers" : "blocks";
          const filePath = `${mp}/${subDir}/${(k as any).fileName}`.replace(HOME, "~");
          return `- **${desc}** → \`${filePath}\``;
        });
        output.system.push(
          `\n## 你记录的元知识索引\n以下是你之前记录的元知识摘要。遇到相关话题时，用 read 工具读取完整内容：\n\n${indexLines.join("\n")}\n`
        );
      }

      // 注入 auto habits（已确认的习惯）
      if (autoHabits.length > 0) {
        const triggerTexts = autoHabits.map(t =>
          `**[已确认的习惯] ${t.human_description}**\n${t.content}`
        ).join("\n\n");
        output.system.push(
          `\n## 已确认的习惯\n你在以下场景会自然地做这些事——像肌肉记忆一样：\n\n${triggerTexts}\n`
        );
      }

      // 注入 suggest habits（观察中的习惯）
      if (suggestHabits.length > 0) {
        const triggerTexts = suggestHabits.map(t =>
          `**[观察中的习惯] ${t.human_description}**\n${t.content}`
        ).join("\n\n");
        output.system.push(
          `\n## 观察中的习惯\n你偶尔在以下场景做这些事，还不够确定，仅供参考：\n\n${triggerTexts}\n`
        );
      }

      if (triggers.length > 0) {
        debug(`MEMORY: 注入 ${autoHabits.length} 个已确认 + ${suggestHabits.length} 个观察中 + ${knowledgeItems.length} 个元知识`);
      }

      // 注入 pending 确认提示
      if (pendingCount > 0) {
        const levelName = (mp: string) => ({ "0": "全局", "1": "个人项目级", "2": "共享项目级" })[mp] || "未知";
        const pendingList = [
          ...pendingBlocks.map(b =>
            `- **${b.description || "（无描述）"}**（建议：${b.suggested_status || "suggest"}·${levelName(b.memPathIndex)}）`
          ),
          ...pendingTriggers.map(t =>
            `- **${t.human_description || "（无描述）"}**（建议：${t.suggested_status || "suggest"}·${levelName(t.memPathIndex)}）`
          ),
        ].join("\n");
        const firstDesc = pendingBlocks[0]?.description || pendingTriggers[0]?.human_description || "新模式";
        output.system.push(
          `\n## ⚠️ 记忆管家发现了新习惯，必须确认后才能继续\n记忆管家自动分析了你的操作，发现了以下新模式。**这是硬性规则（见 AGENTS.md），你必须先用 question 工具逐条确认，确认完成后才能继续执行用户任务。**\n\n${pendingList}\n\n确认方式：用 question 工具，格式参考：\n\`\`\`json\n{ "questions": [{ "question": "记忆管家发现了习惯「${firstDesc}」，是否保存？", "header": "确认习惯", "options": [{"label": "自动·全局", "description": "所有项目适用"}, {"label": "自动·本项目", "description": "仅当前项目"}, {"label": "建议·全局", "description": "观察中，所有项目"}, {"label": "建议·本项目", "description": "观察中，仅本项目"}, {"label": "不保存", "description": "跳过此习惯"}] }] }\n\`\`\`\n用户确认后：\n1. 根据选项编辑 blocks/*.md 文件的 status 为 auto 或 suggest\n2. 如果用户选的层级与 LLM 建议不同，将文件移动到对应 memPath（0=全局，1=个人项目级，2=共享项目级）\n3. 用户选择跳过则删除该文件\n`
        );
      }

      // 注入例行习惯（AGENTS.md 中已有硬性规则，此处为补充说明）
      output.system.push(
        `\n## 例行习惯\n每次完成文件写入操作后，通过 task tool 调用赛博分身 subagent（助理），这在 AGENTS.md 中是硬性规则。\n`
      );
    },

    /**
     * 监听事件：记录用户交互
     */
    event: async (input: { event: { type: string; properties?: Record<string, unknown> } }) => {
      const { event } = input;

      // 记录所有消息更新
      if (event.type === "message.updated") {
        logEvent(event);
      }

      // 记录文件编辑事件（如果 opencode 暴露了这些事件）
      if (event.type === "file.edited" || event.type === "file.watcher.updated") {
        logEvent(event);
      }

      // 记录工具调用事件
      if (event.type === "tool.execute.after") {
        logEvent(event);
      }

      // 调试：记录事件类型分布（仅首次遇到新事件类型时记录）
      try {
        const rawLog = path.join(MEMORIES_DIR, "raw-events.log");
        const sample = {
          ts: new Date().toISOString(),
          type: event.type,
          keys: Object.keys(event),
        };
        fs.appendFileSync(rawLog, JSON.stringify(sample) + "\n", "utf-8");
        rotateLog(rawLog, 100 * 1024); // raw-events 上限 100KB
      } catch { /* 静默 */ }
    },

    /**
     * 会话压缩时注入记忆，防丢失
     */
    "experimental.session.compacting": async (
      _input: unknown,
      output: { context: string[] }
    ) => {
      debug("HOOK: session.compacting fired");
      const memoryPaths = getMemoryPaths(projectDir);
      const { blocks, triggers } = mergeBlocksAndTriggers(memoryPaths);

      const autoHabits = triggers.filter(t => t.type === "habit" && t.status === "auto");
      // 压缩时兜底全量注入 knowledge（blocks + triggers），防丢失
      const blockKnowledge = blocks.filter(b => b.type === "knowledge" && b.status !== "pending");
      const triggerKnowledge = triggers.filter(t => t.type === "knowledge" && t.status !== "pending");
      const allKnowledge = [...blockKnowledge, ...triggerKnowledge];
      const hasMemories = autoHabits.length > 0 || allKnowledge.length > 0;

      if (hasMemories) {
        const lines: string[] = [];
        if (autoHabits.length > 0) {
          lines.push("## 已确认的习惯（跨会话持久）");
          lines.push(...autoHabits.map(t => `- [auto] ${t.human_description}`));
          lines.push("");
        }
        if (allKnowledge.length > 0) {
          lines.push("## 元知识（跨会话持久，全量兜底）");
          // 压缩时不再只注入摘要——全量注入防止丢失
          for (const k of allKnowledge) {
            const desc = (k as any).human_description || k.description;
            const body = (k as any).content || k.value;
            lines.push(`### ${desc}`);
            lines.push(body);
            lines.push("");
          }
        }
        output.context.push(lines.join("\n"));
        debug("HOOK: session.compacting injected habits");
      }
    },
  };
};
