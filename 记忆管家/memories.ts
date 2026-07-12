/**
 * 记忆管家 Plugin for OpenCode
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
  blocks: Array<{ label: string; description: string; confidence: string; status: string; value: string }>;
  triggers: Array<{ label: string; human_description: string; confidence: string; status: string; content: string }>;
} {
  const blockMap = new Map<string, { label: string; description: string; confidence: string; status: string; value: string }>();
  const triggerMap = new Map<string, { label: string; human_description: string; confidence: string; status: string; content: string }>();

  // 从低优先级到高优先级遍历
  for (const memPath of memoryPaths) {
    // 读取 blocks/
    const blocksDir = path.join(memPath, "blocks");
    if (fs.existsSync(blocksDir)) {
      const files = fs.readdirSync(blocksDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const content = safeReadFile(path.join(blocksDir, file));
        const meta = parseMeta(content, 100);
        if (meta) {
          const label = meta.label || file.replace(".md", "");
          blockMap.set(label, {
            label,
            description: meta.description || "",
            confidence: meta.confidence || "",
            status: meta.status || "observing",
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
        const meta = parseMeta(content, 300);
        if (meta) {
          const label = meta.label || file.replace(".md", "");
          triggerMap.set(label, {
            label,
            human_description: meta.human_description || "",
            confidence: meta.confidence || "",
            status: meta.status || "observing",
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
          return JSON.parse(line).ts > last.ts;
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
    const model = config.model || "deepseek-chat";
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

  const systemPrompt = `你是用户的赛博分身——记忆管家（分析模式）。

你的任务：分析用户的操作记录，自主发现用户的重复行为模式（habits）。

## 记忆框架

记忆文件分两类，存放在 memPath 下的两个子目录中：

### blocks/ — 习惯描述（供主 agent 参考）
格式：
\`\`\`markdown
<!-- label: 标签名 -->
<!-- description: 简短描述（给 LLM 看） -->
<!-- confidence: 确认次数/总观察次数 -->
<!-- status: observing | suggest | auto-execute -->

习惯的具体描述...
\`\`\`

### triggers/ — 触发规则（供 system prompt 注入，主 agent 执行）
格式：
\`\`\`markdown
<!-- label: 标签名 -->
<!-- human_description: 给人看的说明 -->
<!-- confidence: x/y -->
<!-- status: suggest | auto-execute -->

trigger:
  on: file_created
  match:
    - "glob模式1"
    - "glob模式2"
  exclude:
    - "glob排除模式"

action:
  type: review
  focus:
    - 审查重点1
    - 审查重点2

message_template:
  "你刚生成了 {filename}，按我的习惯，你先审查一遍吧。重点看：{focus}"
\`\`\`

## 置信度阈值

- 2-3 次：status=observing，只写 block，不写 trigger
- 4-6 次：status=suggest，写 trigger
- 7+ 次：status=auto-execute，更新 trigger status

## 自主发现规则

1. 扫描事件序列，发现反复出现的模式。不限于以下方向：
   - 用户 A 操作后经常 B 操作（如"生成文档后手动审查"）
   - 用户反复纠正同一类错误（如"反复指出命名不规范"）
   - 用户对某些工具/命令有偏好
2. 发现新模式 → 创建 block 文件
3. 已有模式再次确认 → 更新 confidence 计数
4. 跨过阈值 → 创建/更新 trigger 文件
5. 没有新发现 → 返回 "NO_NEW_HABITS"
6. 不确定是不是习惯 → 宁可不记，不瞎猜

## 输出格式

严格返回 JSON，格式如下（不输出 markdown 或解释）：

{
  "actions": [
    {
      "type": "create_block | update_block | create_trigger | update_trigger | skip",
      "file": "文件名（如 review-habits.md）",
      "memPath": "0=全局 1=个人项目级 2=共享项目级",
      "content": "文件完整内容（UTF-8，含元数据注释）",
      "reason": "为什么做这个操作（一句话）"
    }
  ],
  "summary": "本次分析摘要（一句话，如 发现1个新模式，确认2个已有习惯）"
}`;

  const userPrompt = `## 已有记忆

### blocks
${existingBlocks.length > 0 ? existingBlocks.join("\n\n---\n\n") : "（空，暂无任何已记录的习惯）"}

### triggers
${existingTriggers.length > 0 ? existingTriggers.join("\n\n---\n\n") : "（空，暂无任何触发规则）"}

## 新增事件（${eventSummary.length} 条）

${JSON.stringify(eventSummary, null, 2)}

## 记忆路径

- path[0]（全局）: ${memoryPaths[0]}
- path[1]（个人项目级）: ${memoryPaths[1] || "（未传入项目目录）"}
- path[2]（共享项目级）: ${memoryPaths[2] || "（未传入或不存在）"}

请分析并返回 JSON。`;

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
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      debug(`MEMORY: LLM 调用失败 HTTP ${response.status}`);
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

      // 注入 blocks（习惯参考）
      if (blocks.length > 0) {
        const blockText = blocks
          .map(b => `### ${b.label}\n${b.description}\n${b.value}`)
          .join("\n\n");
        output.system.push(
          `\n## 用户习惯参考（赛博分身自动维护）\n以下是从你的操作中自动发现的习惯，供参考：\n\n${blockText}\n`
        );
        debug(`MEMORY: 注入 ${blocks.length} 个 block`);
      }

      // 注入 triggers（执行规则）
      const suggestTriggers = triggers.filter(t => t.status === "suggest");
      const autoTriggers = triggers.filter(t => t.status === "auto-execute");

      if (autoTriggers.length > 0) {
        const triggerTexts = autoTriggers.map(t =>
          `**[自动执行] ${t.human_description}**\n${t.content}`
        ).join("\n\n");
        output.system.push(
          `\n## 自动执行规则（赛博分身确认的习惯）\n即使没有用户指令，你必须在以下情况自动执行对应操作：\n\n${triggerTexts}\n`
        );
      }

      if (suggestTriggers.length > 0) {
        const triggerTexts = suggestTriggers.map(t =>
          `**[建议执行] ${t.human_description}**\n${t.content}`
        ).join("\n\n");
        output.system.push(
          `\n## 建议执行规则（赛博分身正在观察的习惯）\n建议在以下情况考虑执行对应操作：\n\n${triggerTexts}\n`
        );
      }

      if (triggers.length > 0) {
        debug(`MEMORY: 注入 ${autoTriggers.length} 个自动规则 + ${suggestTriggers.length} 个建议规则`);
      }

      // 注入例行规则：每次文件操作后请示赛博分身
      if (triggers.length > 0) {
        output.system.push(
          `\n## 例行规则\n每次完成文件写入操作后，通过 task tool 调用赛博分身 subagent（cyber-alterego），附上你刚才做了什么（操作类型、文件路径、简要说明）。这只需很短的时间，就像用户每次做完事后看一眼助理。\n`
        );
      }
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

      // 调试：记录事件类型分布
      try {
        const rawLog = path.join(MEMORIES_DIR, "raw-events.log");
        const sample = {
          ts: new Date().toISOString(),
          type: event.type,
          keys: Object.keys(event),
          propKeys: event.properties ? Object.keys(event.properties) : [],
        };
        fs.appendFileSync(rawLog, JSON.stringify(sample) + "\n", "utf-8");
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

      const autoTriggers = triggers.filter(t => t.status === "auto-execute");
      if (autoTriggers.length > 0) {
        output.context.push(
          `## 用户习惯（赛博分身 — 跨会话持久记忆）\n` +
          blocks.map(b => `- ${b.label}: ${b.description}`).join("\n") +
          `\n` +
          autoTriggers.map(t => `- [自动] ${t.human_description}`).join("\n")
        );
        debug("HOOK: session.compacting injected habits");
      }
    },
  };
};
