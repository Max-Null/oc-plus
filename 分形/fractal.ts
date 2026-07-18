/**
 * 分形 Plugin for OpenCode — v3.1
 *
 * 四层触发线 Guardian Agent：
 * - 触发线 1：文件写入匹配 trigger（glob→LLM→prompt）
 * - 触发线 2：连续无进展循环（滑动窗口→模板注入）
 * - 触发线 4：主动联网查证（断言检测→分级计数器→system.transform 注入）
 *
 * 三层记忆架构：
 * - 全局：~/.config/opencode/memories/
 * - 个人项目级：~/.config/opencode/project/<hash>/memories/
 * - 共享项目级：<项目>/.opencode/memories/
 *
 * 核心功能：
 * 1. system.transform：注入 blocks + triggers + 联网查证规则到 system prompt
 * 2. event：记录事件 + 断言检测 + websearch 追踪 + trigger 匹配
 * 3. 分析触发：新会话启动时检查增量，调用 LLM 自主学习用户习惯
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getSystemPrompt, getUserPrompt } from "./lib/prompts.js";

// 模块级诊断：确认文件被 OC 导入
console.log("[fractal] 模块已导入", new Date().toISOString());

// V2.0：PluginInput 最小化接口
interface PluginInput {
  client: any;       // OpencodeClient，仅调用 session.promptAsync()
  directory: string; // 项目目录
}

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
const PAUSE_PREFIX = path.join(MEMORIES_DIR, ".fractal-pause-"); // /fractal pause <n> 标志文件前缀
const LEARN_FLAG = path.join(MEMORIES_DIR, ".fractal-learn-flag.json"); // /fractal learn 触发标志
const PROMPT_DIR = path.join(OC_CONFIG, "fractal-prompts"); // 可定制 prompt 模板目录

const ANALYSIS_THRESHOLD = 20; // 累积 N 条事件后触发分析
const MAX_EVENTS_FOR_ANALYSIS = 200;
const MAX_LOG_SIZE = 1 * 1024 * 1024; // 日志轮转阈值：1MB
const ASSERTION_FLAG = path.join(MEMORIES_DIR, ".assertion-flag.json"); // B：断言检测信号文件
const ASSERTION_COUNTER = path.join(MEMORIES_DIR, ".assertion-counter.json"); // 触发线 4：分级计数器

// B：断言检测模式 — 匹配 LLM 凭记忆下的未验证结论
const ASSERTION_RE = /(?:不支持|做不到|只有\s*\d+\s*种|(?<!\S)(?:没有|缺少)\s+\S+|不存在|无法\s+\S+|远[比低高]\S+|过于\S+)/;

// 触发线 4：联网工具名检测（包含 websearch / webfetch 等）
const WEBSEARCH_TOOLS = /websearch|web_search|webfetch/;

// 触发线 4：计数器衰减阈值 — 连续 N 轮无断言后自动降级
const COUNTER_DECAY_TURNS = 3;

// /fractal pause <n> 检查：某条触发线是否被暂停
function isLinePaused(line: string): boolean {
  try { return fs.existsSync(PAUSE_PREFIX + line + ".json"); } catch { return false; }
}

/**
 * 加载外部 prompt 模板文件，不存在时返回内置默认值
 */
function loadPrompt(filename: string, fallback: string): string {
  try {
    const fpath = path.join(PROMPT_DIR, filename);
    if (fs.existsSync(fpath)) {
      return fs.readFileSync(fpath, "utf-8").trim();
    }
  } catch { /* 静默 */ }
  return fallback;
}

/**
 * 加载分段模板并替换占位符（{{key}}）
 * 模板用 "\n---\n" 分隔多个 section，section 从 1 开始计数
 */
function loadPromptSection(filename: string, section: number, vars: Record<string, string>, fallback: string): string {
  try {
    const raw = loadPrompt(filename, fallback);
    const sections = raw.split("\n---\n");
    let template = (sections[section - 1] || sections[0] || "").trim();
    // 替换 {{key}} 占位符
    template = template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
    return template;
  } catch { /* 静默 */ }
  return fallback;
}

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

async function getApiConfig(): Promise<{ apiKey: string; baseURL: string; model: string } | null> {
  const configPath = path.join(OC_CONFIG, "opencode.json");
  // 读配置失败时等待 200ms 后重试一次，两次都失败才返回 null
  for (let attempt = 0; attempt < 2; attempt++) {
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
    } catch { /* 首次失败后重试 */ }
    if (attempt === 0) await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

/**
 * 调用 LLM 自主学习用户习惯（分形分析模式）
 *
 * 与 Phase 2 的区别：不预定义输出格式，
 * LLM 自主决定发现什么类型的习惯、以什么格式存储。
 */
async function analyzeAndUpdate(eventLines: string[], memoryPaths: string[]): Promise<string | null> {
  const config = await getApiConfig();
  if (!config) {
    debug(`FRACTAL: 无法获取 API 配置，跳过分析`);
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
    debug("FRACTAL: 无有效事件可分析");
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
    debug(`FRACTAL: 调用 LLM 分析 ${eventSummary.length} 条事件...`);
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
      debug(`FRACTAL: LLM 调用失败 HTTP ${response.status} — ${errorBody.slice(0, 500)}`);
      return null;
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const result = data.choices?.[0]?.message?.content || null;
    if (result) {
      debug(`FRACTAL: LLM 返回 ${result.length} bytes`);
    }
    return result;
  } catch (err) {
    debug(`FRACTAL: LLM 调用异常 ${String(err)}`);
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
    debug("FRACTAL: 无法解析 LLM 返回的 JSON");
    return;
  }

  for (const action of parsed.actions) {
    if (action.type === "skip") continue;

    const pathIndex = parseInt(action.memPath, 10);
    if (isNaN(pathIndex) || pathIndex >= memoryPaths.length) {
      debug(`FRACTAL: 无效的 memPath: ${action.memPath}`);
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
      debug(`FRACTAL: ${action.type} → ${filePath} (${action.reason})`);
    } catch (err) {
      debug(`FRACTAL: 写入失败 ${filePath}: ${String(err)}`);
    }
  }

  debug(`FRACTAL: 分析完成 — ${parsed.summary || "无摘要"}`);
}

// ============================================================
// Trigger 匹配（V2.0）：解析 trigger 文件中的 glob 规则
// ============================================================

/**
 * 简单 glob → regex 转换（仅支持 **, *, ? 通配符）
 */
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // 转义正则特殊字符
    .replace(/\*\*\//g, "(?:.+/)?")          // **/ → 任意层级目录（含空）
    .replace(/\*\*/g, ".*")                   // ** → 任意字符
    .replace(/\*/g, "[^/]*")                  // * → 非 / 单段
    .replace(/\?/g, "[^/]");                  // ? → 单字符
  return new RegExp("^" + regex + "$");
}

/**
 * 从 trigger 文件内容提取匹配规则和消息模板
 * 支持简易 key: value / 缩进列表格式，不完全解析 YAML
 */
function parseTriggerFile(content: string): { match: string[]; exclude: string[]; messageTemplate: string } | null {
  // 提取 message_template（支持引号包裹的多行）
  const msgMatch = content.match(/message_template:\s*\n?\s*["']([^"']+)["']/);
  if (!msgMatch) return null;
  const messageTemplate = msgMatch[1];

  // 提取 match 列表：match: 后的缩进 "- \"...\"" 行
  const matches: string[] = [];
  const excludes: string[] = [];
  const lines = content.split("\n");
  let inMatch = false;
  let inExclude = false;
  for (const line of lines) {
    const t = line.trim();
    if (t === "match:") { inMatch = true; inExclude = false; continue; }
    if (t === "exclude:") { inExclude = true; inMatch = false; continue; }
    if (t.startsWith("trigger:") || t.startsWith("action:") || t.startsWith("message_template:")) {
      inMatch = false; inExclude = false; continue;
    }
    const listItem = t.match(/^-\s*["']?([^"']+)["']?/);
    if (!listItem) continue;
    if (inMatch) matches.push(listItem[1]);
    if (inExclude) excludes.push(listItem[1]);
  }

  if (matches.length === 0) return null;
  return { match: matches, exclude: excludes, messageTemplate };
}

/**
 * 检查给定文件路径是否匹配任意 auto 状态的 trigger
 * 返回匹配的 trigger 完整信息，或 null
 */
function matchFileTriggers(filePath: string, projectDir?: string): {
  fullContent: string;       // trigger 文件完整内容（供 LLM 语义判断）
  humanDescription: string;  // 元数据中的人类可读描述
  confidence: string;        // 置信度
  matchGlobs: string;        // 匹配的 glob 列表（供透明度标注）
} | null {
  const memoryPaths = getMemoryPaths(projectDir);
  for (const memPath of memoryPaths) {
    const triggersDir = path.join(memPath, "triggers");
    if (!fs.existsSync(triggersDir)) continue;
    try {
      const files = fs.readdirSync(triggersDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const content = safeReadFile(path.join(triggersDir, file));
        // 仅匹配 auto 状态的 trigger
        if (!content.includes("status: auto")) continue;
        const parsed = parseTriggerFile(content);
        if (!parsed) continue;

        // 检查 exclude 优先
        const isExcluded = parsed.exclude.some(g => globToRegex(g).test(filePath));
        if (isExcluded) continue;

        // 检查 match
        const isMatched = parsed.match.some(g => globToRegex(g).test(filePath));
        if (isMatched) {
          const meta = parseMeta(content, 400);
          return {
            fullContent: content,
            humanDescription: meta?.human_description || file,
            confidence: meta?.confidence || "unknown",
            matchGlobs: parsed.match.join(", "),
          };
        }
      }
    } catch { /* 静默 */ }
  }
  return null;
}

/**
 * V2.0 第二层：调 LLM API 做语义判断 + 生成赛博分身消息（含透明度标注）
 * 异步，不阻塞事件管线
 */
async function generateTriggerMessage(
  filePath: string,
  trigger: { fullContent: string; humanDescription: string; confidence: string; matchGlobs: string }
): Promise<string | null> {
  const config = await getApiConfig();
  if (!config) {
    debug("TRIGGER: 无法获取 API 配置，跳过 LLM 语义判断");
    return null;
  }

  const filename = path.basename(filePath);
  const systemPrompt = `你是用户的赛博分身。你像用户一样思考。

当前场景：
- 用户刚编辑了文件：${filePath}
- 匹配到的习惯规则：

${trigger.fullContent}

你的任务：
1. 判断此次文件编辑是否真正匹配此习惯的语义
   （不只看文件名匹配 glob，要理解操作上下文和改动性质）
2. 如果匹配，以用户口吻生成一条提醒消息。格式：

> [分形] 匹配习惯「${trigger.humanDescription}」
> (glob: ${trigger.matchGlobs}) | 置信度 ${trigger.confidence}

你刚生成了 ${filename}，按我的习惯，你先审查一遍。
重点看：[根据 trigger 中 action.focus 的具体内容填充]

3. 如果不匹配（例如改动太小、不是目标文件类型），返回空字符串
   （不要任何解释文字）
4. 措辞必须用"按我的习惯"——你是用户的分身在说话
5. 不执行审查，不写文件，只说话

返回纯文本（不要 JSON 包裹）。`;

  try {
    debug(`TRIGGER: 调 LLM 语义判断 — ${filename} (习惯: ${trigger.humanDescription})`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s 超时
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
          { role: "user", content: `文件路径：${filePath}` },
        ],
        temperature: 0.3,
        max_tokens: 500,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      debug(`TRIGGER: LLM 调用失败 HTTP ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const result = data.choices?.[0]?.message?.content || null;
    if (!result || result.trim() === "") {
      debug("TRIGGER: LLM 判断不匹配，静默跳过");
      return null;
    }
    debug(`TRIGGER: LLM 返回 ${result.length} bytes`);
    return result.trim();
  } catch (err) {
    debug(`TRIGGER: LLM 调用异常 ${String(err)}`);
    return null;
  }
}

// ============================================================
// 触发线 4：断言计数器（跨轮持久，分级升级）
// ============================================================

interface AssertionState {
  count: number;         // 累计断言（未查证）次数
  lastSnippet: string;   // 最近一次检测到的断言片段
  lastSessionId: string;
  turnsSinceLastAssert: number; // 连续无断言轮数（用于衰减）
  updatedAt: string;
}

function readCounter(): AssertionState {
  try {
    if (fs.existsSync(ASSERTION_COUNTER)) {
      const raw = JSON.parse(fs.readFileSync(ASSERTION_COUNTER, "utf-8"));
      // 类型消毒：文件可能因磁盘错误损坏，count 非数字时安全降级为 0
      return {
        count: Number(raw.count) || 0,
        lastSnippet: String(raw.lastSnippet || ""),
        lastSessionId: String(raw.lastSessionId || ""),
        turnsSinceLastAssert: Number(raw.turnsSinceLastAssert) || 0,
        updatedAt: String(raw.updatedAt || ""),
      };
    }
  } catch { /* 忽略解析错误 */ }
  return { count: 0, lastSnippet: "", lastSessionId: "", turnsSinceLastAssert: 0, updatedAt: "" };
}

function saveCounter(state: AssertionState) {
  try {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(ASSERTION_COUNTER, JSON.stringify(state, null, 2), "utf-8");
  } catch { /* 静默 */ }
}

/**
 * 递增计数器：有断言 + 本轮未联网查证
 */
function incrementCounter(sessionId: string, snippet: string) {
  const c = readCounter();
  // 跨会话重置
  if (c.lastSessionId && c.lastSessionId !== sessionId) {
    c.count = 0;
    c.turnsSinceLastAssert = 0;
  }
  c.count++;
  c.lastSnippet = snippet;
  c.lastSessionId = sessionId;
  c.turnsSinceLastAssert = 0;
  saveCounter(c);
  debug(`触发线4: 计数器递增 → count=${c.count} snippet="${snippet.slice(0, 50)}"`);
}

/**
 * 重置计数器：有断言 + 本轮已联网查证 → 本轮行为正确
 */
function resetCounter(sessionId: string) {
  const c = readCounter();
  if (c.count > 0) {
    debug(`触发线4: 计数器重置 → count=${c.count}→0（本轮已联网查证）`);
  }
  c.count = 0;
  c.lastSnippet = "";
  c.lastSessionId = sessionId;
  c.turnsSinceLastAssert = 0;
  saveCounter(c);
}

/**
 * 衰减计数器：本轮无断言 → 缓慢降级
 */
function decayCounter(sessionId: string) {
  const c = readCounter();
  if (c.lastSessionId && c.lastSessionId !== sessionId) {
    c.count = 0;
    c.turnsSinceLastAssert = 0;
    saveCounter(c);
    return;
  }
  c.turnsSinceLastAssert++;
  if (c.count > 0 && c.turnsSinceLastAssert >= COUNTER_DECAY_TURNS) {
    c.count = Math.max(0, c.count - 1);
    c.turnsSinceLastAssert = 0;
    debug(`触发线4: 计数器衰减 → count=${c.count}`);
    saveCounter(c);
  }
  // count === 0 时无需持久化衰减计数，不写磁盘（减少 IO）
  // 重启后 count 从 0 开始是正确的默认状态
}

// ============================================================
// Plugin 导出
// ============================================================

export const FractalPlugin = async (input: PluginInput, _options?: Record<string, unknown>) => {
  ensureDir(MEMORIES_DIR);
  ensureDir(BLOCKS_DIR);
  ensureDir(TRIGGERS_DIR);
  rotateLog(DEBUG_LOG, 500 * 1024); // debug 日志上限 500KB
  rotateLog(EVENT_LOG); // 启动时检查一次事件日志

  const projectDir = input.directory || undefined;
  const { client } = input;

  // 触发线 4：本轮是否已调用过联网查证工具
  let websearchCalledThisTurn = false;

  // 触发线 4：本轮是否已检测到断言（避免重复计数同一轮多次 content chunk）
  let assertionDetectedThisTurn = false;

  // 注入频率控制：knowledge 索引 + habits 不每轮都塞
  let turnCounter = 0;
  const NUDGE_INTERVAL = 5; // 每 N 轮注入一次 knowledge/habits 索引
  const MAX_KNOWLEDGE_INJECT = 5; // 记忆反馈：单轮最多注入 N 条

  // 动态阈值：分析次数递增时阈值翻倍，避免长会话频繁触发 LLM 分析
  let analysisCount = 0;

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

      // 注入频率控制：递增轮数计数器
      turnCounter++;
      const isNudgeTurn = turnCounter % NUDGE_INTERVAL === 0;
      debug(`FRACTAL: turn=${turnCounter}, nudge=${isNudgeTurn} (interval=${NUDGE_INTERVAL})`);

      // ---- 步骤 0：注入分形核心规则（外部模板，可编辑 ~/.config/opencode/fractal-prompts/core-rules.md） ----
      const coreRules = loadPrompt("core-rules.md",
        `## 分形 v2.1\n**元知识记录**（手动 + 自主两路）\n…`);
      output.system.push(`\n${coreRules}\n`);

      // 触发线 4 + B：断言检测 — 分级注入跨轮提醒
      const c = readCounter();
      try {
        // 旧版信号文件：保留兼容，触发线 4 按等级覆盖
        if (fs.existsSync(ASSERTION_FLAG)) {
          fs.unlinkSync(ASSERTION_FLAG);
        }
      } catch { /* 静默 */ }

      // 按计数器等级注入提醒（检查暂停标志，外部模板 ~/.config/opencode/fractal-prompts/assertion-reminder.md）
      if (!isLinePaused("4") && c.count > 0) {
        const section = c.count === 1 ? 1 : (c.count <= 3 ? 2 : 3);
        const reminder = loadPromptSection("assertion-reminder.md", section,
          { count: String(c.count), snippet: c.lastSnippet },
          `\n## ⚠️ 分形：请先查证再下结论\n上一轮你说了「${c.lastSnippet}」但没有联网查证。`
        );
        output.system.push(`\n${reminder}\n`);
      }

      const memoryPaths = getMemoryPaths(projectDir);

      // ---- 步骤 1：分析模式 ----
      // 检查 /fractal learn 标志：强制触发分析（忽略阈值）
      let forceLearn = false;
      try {
        if (fs.existsSync(LEARN_FLAG)) {
          forceLearn = true;
          fs.unlinkSync(LEARN_FLAG); // 一次性标志，触发后清除
          debug("FRACTAL: /fractal learn 标志检测到，强制触发分析");
        }
      } catch { /* 静默 */ }

      const newEvents = getNewEvents();
      // 动态阈值：首次 20 条，第 N 次 20 * 2^N 条（上限 400）
      const dynamicThreshold = Math.min(ANALYSIS_THRESHOLD * Math.pow(2, analysisCount), 400);
      debug(`FRACTAL: 新事件数=${newEvents.length}，阈值=${dynamicThreshold}（第 ${analysisCount + 1} 次分析）`);

      if (forceLearn || newEvents.length >= dynamicThreshold) {
        debug("FRACTAL: 触发 LLM 自主学习分析...");
        const result = await analyzeAndUpdate(newEvents, memoryPaths);
        if (result && result !== "NO_NEW_HABITS") {
          applyAnalysisResult(result, memoryPaths);
        } else {
          debug("FRACTAL: 无新习惯或 LLM 未返回有效结果");
        }
        // 更新时间戳
        const lastEvent = newEvents[newEvents.length - 1];
        const lastTs = JSON.parse(lastEvent).ts;
        saveLastAnalysis(lastTs, newEvents.length);
        analysisCount++;
        debug(`FRACTAL: 分析完成，下次阈值=${Math.min(ANALYSIS_THRESHOLD * Math.pow(2, analysisCount), 400)}`);
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

      // 记忆反馈：按文件 mtime 排序，最近修改的优先注入（pursuit）；
      // 超过 MAX_KNOWLEDGE_INJECT 条的旧知识被截断（dismissal）
      const scored: Array<{ item: any; mtime: number }> = [];
      for (const k of knowledgeItems) {
        const mp = memoryPaths[parseInt((k as any).memPathIndex, 10)] || MEMORIES_DIR;
        const subDir = (k as any).human_description !== undefined ? "triggers" : "blocks";
        const fpath = path.join(mp, subDir, (k as any).fileName);
        try { scored.push({ item: k, mtime: fs.statSync(fpath).mtimeMs }); }
        catch { scored.push({ item: k, mtime: 0 }); }
      }
      scored.sort((a, b) => b.mtime - a.mtime); // 最近修改的排前面
      const topKnowledge = scored.slice(0, MAX_KNOWLEDGE_INJECT);
      const trimmed = scored.length - topKnowledge.length;

      // 注入 knowledge 索引（仅 nudge turn 注入，按 mtime 排序优先展示活跃知识）
      if (isNudgeTurn && topKnowledge.length > 0) {
        const indexLines = topKnowledge.map(({ item: k }) => {
          const desc = (k as any).human_description || k.description;
          const mp = memoryPaths[parseInt((k as any).memPathIndex, 10)] || MEMORIES_DIR;
          const subDir = (k as any).human_description !== undefined ? "triggers" : "blocks";
          const filePath = `${mp}/${subDir}/${(k as any).fileName}`.replace(HOME, "~");
          return `- **${desc}** → \`${filePath}\``;
        });
        const truncationNote = trimmed > 0
          ? `\n> （共 ${scored.length} 条知识，仅展示最近活跃的 ${topKnowledge.length} 条。其余用 read 工具按需读取）`
          : "";
        output.system.push(
          `\n## 你记录的元知识索引\n以下是你之前记录的元知识摘要。遇到相关话题时，用 read 工具读取完整内容：\n\n${indexLines.join("\n")}${truncationNote}\n`
        );
      }

      // 注入 auto habits（已确认的习惯，仅 nudge turn 注入）
      if (isNudgeTurn && autoHabits.length > 0) {
        const triggerTexts = autoHabits.map(t =>
          `**[已确认的习惯] ${t.human_description}**\n${t.content}`
        ).join("\n\n");
        output.system.push(
          `\n## 已确认的习惯\n你在以下场景会自然地做这些事——像肌肉记忆一样：\n\n${triggerTexts}\n`
        );
      }

      // 注入 suggest habits（观察中的习惯，仅 nudge turn 注入）
      if (isNudgeTurn && suggestHabits.length > 0) {
        const triggerTexts = suggestHabits.map(t =>
          `**[观察中的习惯] ${t.human_description}**\n${t.content}`
        ).join("\n\n");
        output.system.push(
          `\n## 观察中的习惯\n你偶尔在以下场景做这些事，还不够确定，仅供参考：\n\n${triggerTexts}\n`
        );
      }

      if (triggers.length > 0) {
        const skipped = !isNudgeTurn ? " (间隔跳过注入)" : "";
        const trimInfo = trimmed > 0 ? ` 截断${trimmed}条` : "";
        debug(`FRACTAL: 注入 ${autoHabits.length} 个已确认 + ${suggestHabits.length} 个观察中 + ${knowledgeItems.length} 个元知识→展示${topKnowledge.length}${trimInfo}${skipped}`);
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
          `\n## ⚠️ 分形发现了新习惯，必须确认后才能继续\n分形自动分析了你的操作，发现了以下新模式。**这是硬性规则（见 AGENTS.md），你必须先用 question 工具逐条确认，确认完成后才能继续执行用户任务。**\n\n${pendingList}\n\n确认方式：用 question 工具，格式参考：\n\`\`\`json\n{ "questions": [{ "question": "分形发现了习惯「${firstDesc}」，是否保存？", "header": "确认习惯", "options": [{"label": "自动·全局", "description": "所有项目适用"}, {"label": "自动·本项目", "description": "仅当前项目"}, {"label": "建议·全局", "description": "观察中，所有项目"}, {"label": "建议·本项目", "description": "观察中，仅本项目"}, {"label": "不保存", "description": "跳过此习惯"}] }] }\n\`\`\`\n用户确认后：\n1. 根据选项编辑 blocks/*.md 文件的 status 为 auto 或 suggest\n2. 如果用户选的层级与 LLM 建议不同，将文件移动到对应 memPath（0=全局，1=个人项目级，2=共享项目级）\n3. 用户选择跳过则删除该文件\n`
        );
      }

      // 触发线 4：强化版联网查证规则（外部模板 ~/.config/opencode/fractal-prompts/websearch-rules.md）
      const websearchRules = loadPrompt("websearch-rules.md",
        `## 🔍 联网查证规则（分形 Guardian）\n任何涉及以下类型的结论，**必须先调 websearch 查官方文档**，禁止凭训练数据记忆回答：\n- "XX 不支持 / 做不到 / 只有 N 种方法"\n- 系统能力对比\n- 穷举型列举\n- 从局部代码推测工具完整能力\n\nwebsearch 工具已就绪。先搜再说。`
      );
      output.system.push(`\n${websearchRules}\n`);

      // 回应模式已升级为 event hook 触发（V2.0），不再硬编码写入后调助理规则
    },

    /**
     * 监听事件：记录用户交互
     */
    event: async (input: { event: { type: string; properties?: Record<string, unknown> } }) => {
      const { event } = input;

      // 记录所有消息更新
      if (event.type === "message.updated") {
        logEvent(event);

        try {
          const props = event.properties as Record<string, unknown> | undefined;
          const sessionID = props?.sessionID as string | undefined;

          // 触发线 4：用户新消息 → 重置本轮标志 + 衰减计数器
          if (props?.role === "user") {
            // 上轮有断言但本轮是新的用户消息 → 上一轮结束，检查是否需要衰减
            if (!assertionDetectedThisTurn) {
              decayCounter(sessionID || "");
            }
            websearchCalledThisTurn = false;
            assertionDetectedThisTurn = false;
            debug(`触发线4: 新用户消息 → 重置本轮标志`);
          }

          // 触发线 4：扫描 assistant 输出 → 分级计数而非简单标记
          if (props?.role === "assistant" && typeof props?.content === "string") {
            const content = props.content as string;
            if (ASSERTION_RE.test(content)) {
              const snippet = content.slice(
                Math.max(0, content.search(ASSERTION_RE) - 40),
                content.search(ASSERTION_RE) + 80
              );

              // 写入旧版信号文件（保留兼容）
              fs.writeFileSync(ASSERTION_FLAG, JSON.stringify({
                ts: new Date().toISOString(),
                snippet: snippet.trim(),
              }), "utf-8");

              // 触发线 4：分级计数
              if (!assertionDetectedThisTurn) {
                assertionDetectedThisTurn = true;
                if (websearchCalledThisTurn) {
                  resetCounter(sessionID || "");
                  debug(`触发线4: 断言检测命中但已联网查证 — ${snippet.trim().slice(0, 60)}`);
                } else {
                  incrementCounter(sessionID || "", snippet.trim());
                  debug(`触发线4: 断言检测命中且未查证 — ${snippet.trim().slice(0, 60)}`);
                }
              }
            }
          }
        } catch { /* 静默 */ }
      }

      // 记录文件编辑事件 + trigger 匹配（V2.0）
      if (event.type === "file.edited" || event.type === "file.watcher.updated") {
        logEvent(event);
        // V2.0：文件编辑触发习惯匹配
        tryTriggerMatch(event);
      }

      // 记录工具调用事件 + trigger 匹配（V2.0）
      if (event.type === "tool.execute.after") {
        logEvent(event);

        // 触发线 4：检测是否调用了联网查证工具
        const toolProps = event.properties as Record<string, unknown> | undefined;
        const toolName = toolProps?.tool as string | undefined;
        if (toolName && WEBSEARCH_TOOLS.test(toolName)) {
          websearchCalledThisTurn = true;
          debug(`触发线4: 检测到联网查证 → ${toolName}`);
        }

        // V2.0：write/edit 工具触发习惯匹配
        tryTriggerMatch(event);
      }

      // V2.0：三层漏斗 — glob 预筛选 → LLM 语义判断 → prompt 注入（不 await）
      function tryTriggerMatch(evt: { type: string; properties?: Record<string, unknown> }) {
        const props = evt.properties;
        if (!props) return;
        // 尝试多种可能的事件属性键获取文件路径
        const filePath = (props.file || props.path || props.filePath ||
          (props.params as any)?.file || (props.params as any)?.path ||
          (props.params as any)?.filePath) as string | undefined;
        if (!filePath || typeof filePath !== "string") return;

        // 第一层：glob 预筛选
        const trigger = matchFileTriggers(filePath, projectDir);
        if (!trigger) return;

        // 从事件属性提取 session ID
        const sessionID = (props.sessionID || (props.info as any)?.id) as string | undefined;
        if (!sessionID) {
          debug("TRIGGER: 无法获取 sessionID，跳过 prompt 注入");
          return;
        }

        debug(`TRIGGER: glob 匹配 ${filePath} → 习惯「${trigger.humanDescription}」，异步调 LLM 语义判断...`);

        // 二+三层：异步调 LLM 生成消息（含透明度标注）→ 注入（不 await 主流程）
        generateTriggerMessage(filePath, trigger).then((msg) => {
          if (!msg) return; // LLM 判断不匹配，静默跳过

          client.session.promptAsync({
            path: { id: sessionID },
            body: {
              noReply: true,
              parts: [{ type: "text", text: msg }],
            },
          }).then(() => {
            debug(`TRIGGER: prompt 注入成功 — ${filePath}`);
          }).catch((err: unknown) => {
            debug(`TRIGGER: prompt 注入失败 — ${String(err)}`);
          });
        }).catch((err: unknown) => {
          debug(`TRIGGER: LLM 语义判断异常 — ${String(err)}`);
        });
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
            // 联合类型收窄：确认 variant（human_description/content 或 description/value）
            const desc = ('human_description' in k ? (k as any).human_description : (k as any).description) || '';
            const body = ('content' in k ? (k as any).content : (k as any).value) || '';
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

export default FractalPlugin;
