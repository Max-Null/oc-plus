/**
 * 分形 Plugin for OpenCode — v3.4
 *
 * 五条触发线 Guardian Agent：
 * - 触发线 1：文件写入匹配 trigger（glob→LLM→prompt）
 * - 触发线 2：连续无进展循环 + 无反馈环检测（滑动窗口→system.transform 注入）
 * - 触发线 4：主动联网查证（断言检测→分级计数器→system.transform 注入）
 * - 触发线 5：提交后知识提取（git commit 检测→LLM 分析→写入 blocks）
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

// ============================================================
// 诊断模式：在 ~/.config/opencode/memories/.fractal-debug 创建空文件即可启用
// 日志输出到 ~/.config/opencode/memories/fractal-startup.log + console
// ============================================================
const _FRACTAL_DEBUG_FLAG = path.join(os.homedir(), ".config", "opencode", "memories", ".fractal-debug");
const _FRACTAL_DEBUG_LOG = path.join(os.homedir(), ".config", "opencode", "memories", "fractal-startup.log");
const _IS_FRACTAL_DEBUG = fs.existsSync(_FRACTAL_DEBUG_FLAG);
// 仅在诊断模式开启时暴露写日志函数（正常模式零开销——函数体为空）
const _fractalDebug = _IS_FRACTAL_DEBUG
  ? (label: string): void => {
      const line = `[${new Date().toISOString()}] ${label}\n`;
      try { fs.appendFileSync(_FRACTAL_DEBUG_LOG, line); } catch {/* 静默：权限/磁盘满等场景不崩溃 */}
      console.log(`[fractal:debug] ${label}`);
    }
  : (_label: string): void => {/* noop — 诊断模式未开启 */};

_fractalDebug("MODULE: imported");

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
const NO_FEEDBACK_STATE = path.join(MEMORIES_DIR, ".no-feedback-loop.json"); // 触发线 2 扩展：无反馈环检测

// B：断言检测模式 — 匹配 LLM 凭记忆下的未验证结论
const ASSERTION_RE = /(?:不支持|做不到|只有\s*\d+\s*种|(?<!\S)(?:没有|缺少)\s+\S+|不存在|无法\s+\S+|远[比低高]\S+|过于\S+)/;

// 触发线 4：联网工具名检测（包含 websearch / webfetch 等）
const WEBSEARCH_TOOLS = /websearch|web_search|webfetch/;

// 触发线 4：计数器衰减阈值 — 连续 N 轮无断言后自动降级
const COUNTER_DECAY_TURNS = 3;

// 触发线 4：分级提醒的 count 阈值
// 默认：1 次=温和提醒, 2-3 次=强硬提醒, 4+ 次=强制警告
// 可在 assertion-reminder.md 首行用 <!-- thresholds: 1,3,5 --> 覆盖（逗号分隔）
const ASSERTION_SECTION_THRESHOLDS = [1, 3]; // [温和上限, 强硬上限]，超过则为强制

// 触发线 2 扩展：连续 N 轮有 file edit 但无 bash 执行后提醒
const NO_FEEDBACK_THRESHOLD = 3;

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

/**
 * 从 assertion-reminder.md 首行解析自定义分级阈值
 * 格式：<!-- thresholds: 1,3,5 -->（逗号分隔的递增整数列表）
 * 解析成功时覆盖全局常量；失败/不存在时使用默认值 [1, 3]
 */
function parseAssertionThresholds(): number[] {
  try {
    const raw = loadPrompt("assertion-reminder.md", "");
    const match = raw.match(/<!--\s*thresholds:\s*([\d,\s]+)\s*-->/);
    if (match) {
      const values = match[1].split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      values.sort((a, b) => a - b); // 确保递增
      if (values.length >= 2) {
        debug(`触发线4: 自定义阈值=[${values.join(", ")}]`);
        return values;
      }
    }
  } catch { /* 静默 */ }
  return ASSERTION_SECTION_THRESHOLDS; // 回退默认值
}

/**
 * 根据 count 和阈值数组计算 section 编号（1-based）
 * 阈值数组 [t1, t2, ...] 定义：count <= t1 → 1, count <= t2 → 2, ... > 最后一个 → n+1
 */
function getSection(count: number, thresholds: number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    if (count <= thresholds[i]) return i + 1;
  }
  return thresholds.length + 1;
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
 * A+B 混合关键词提取：n-gram（中日韩文本）+ 标点分词（英文）
 * 解决中文无空格分隔导致 split 式分词召回率为零的问题
 */
function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const keywords: string[] = [];
  // 标点分词（英文/数字/混合文本）
  const splitWords = lower.split(/[\s,，。.!！?？:：;；、\(\)（）\[\]【】"「」『』\n\r\t]+/).filter(t => t.length >= 2);
  keywords.push(...splitWords);
  // 字符 bigram + trigram（中日韩文本），只对非纯 ASCII 片段做
  // 避免对英文单词做无意义的逐字 n-gram
  const segments = lower.split(/[a-z0-9\s,，。.!！?？:：;；、\(\)（）\[\]【】"「」『』\n\r\t]+/);
  for (const seg of segments) {
    if (seg.length < 2) continue;
    // bigram: 滑动窗口取 2 字
    for (let i = 0; i <= seg.length - 2; i++) {
      keywords.push(seg.slice(i, i + 2));
    }
    // trigram: 滑动窗口取 3 字（仅文本较长时）
    if (seg.length >= 4) {
      for (let i = 0; i <= seg.length - 3; i++) {
        keywords.push(seg.slice(i, i + 3));
      }
    }
  }
  return [...new Set(keywords)];
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
  blocks: Array<{ type: string; label: string; description: string; confidence: string; status: string; suggested_status: string; memPathIndex: string; fileName: string; value: string; priority: number; category: string }>;
  triggers: Array<{ type: string; label: string; human_description: string; confidence: string; status: string; suggested_status: string; memPathIndex: string; fileName: string; content: string }>;
} {
  const blockMap = new Map<string, { type: string; label: string; description: string; confidence: string; status: string; suggested_status: string; memPathIndex: string; fileName: string; value: string; priority: number; category: string }>();
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
            priority: parseInt(meta.priority, 10) || 50,
            category: meta.category || "reference",
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
      // 解析 provider:model 格式（如 "ds:deepseek-v4-pro"），取 provider 名和模型名
      const fullModel = String(config.model || "");
      const colonIdx = fullModel.indexOf(":");
      const providerName = colonIdx > 0 ? fullModel.slice(0, colonIdx) : "";
      const currentModel = colonIdx > 0 ? fullModel.slice(colonIdx + 1) : fullModel;

      // 从 provider 配置中查找对应 provider 的 options
      const providers = config.provider as Record<string, unknown> | undefined;
      const provider = providers?.[providerName] as Record<string, unknown> | undefined;
      const opts = provider?.options as Record<string, unknown> | undefined;

      if (!opts?.apiKey || !opts?.baseURL) {
        debug(`FRACTAL: 未找到 provider "${providerName}" 的有效 API 配置`);
        return null;
      }

      // 从 provider.models 中获取可用模型列表，匹配式选择分析用模型
      // 优先选含 "flash" 关键字的（更经济），否则用当前模型
      const models = provider?.models as Record<string, unknown> | undefined;
      let analysisModel = currentModel;
      if (models) {
        const modelKeys = Object.keys(models);
        // 先找 flash 模型，找不到则用当前模型（当前模型也要在 models 中存在）
        const flashKey = modelKeys.find(k => k.toLowerCase().includes("flash"));
        if (flashKey) {
          analysisModel = flashKey;
        } else if (!modelKeys.includes(currentModel)) {
          // 当前模型不在 provider 的模型列表中，用第一个可用模型兜底
          analysisModel = modelKeys[0] || currentModel;
        }
      }

      return {
        apiKey: opts.apiKey as string,
        baseURL: (opts.baseURL as string).replace(/\/+$/, ""),
        model: analysisModel,
      };
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
        role: (ev as any).properties?.info?.role,
        content: typeof (ev as any).properties?.info?.content === "string"
          ? ((ev as any).properties.info.content as string).slice(0, 300)
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
 * C 方案：LLM 语义重排知识候选列表
 * 仅当 n-gram + 双向匹配命中多条（>3）时调用，用 flash 模型筛选最相关的
 * 返回重排后的列表，失败/超时返回 null（调用方回退到关键词排序）
 */
async function llmRerankKnowledge(
  userMessage: string,
  candidates: Array<{ item: any; relevance: number }>,
): Promise<Array<{ item: any; relevance: number }> | null> {
  const config = await getApiConfig();
  if (!config || candidates.length === 0) return null;

  // 构造候选摘要：每条一行，格式为 "索引: 描述"
  const candidateLines = candidates.map((c, i) => {
    const desc = (c.item as any).human_description || (c.item as any).description || "";
    return `${i}: ${desc}`;
  }).join("\n");

  const prompt = `用户当前消息：${userMessage.slice(0, 200)}\n\n候选知识列表：\n${candidateLines}\n\n从以上候选中选出与用户消息最相关的条目，按相关性从高到低排列。返回纯数字索引列表，用逗号分隔（如 "3,0,4,1,2"），只输出索引不要任何其他文字。最多返回 5 条。`;

  try {
    debug(`FRACTAL: LLM 重排 ${candidates.length} 条知识候选...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s 超时，不阻塞主流程
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 50,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const result = data.choices?.[0]?.message?.content?.trim();
    if (!result) return null;

    // 解析 LLM 返回的索引列表（如 "3,0,4,1,2"）
    const indices = result.split(/[,，\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n < candidates.length);
    if (indices.length === 0) return null;

    // 按 LLM 给出的顺序重排，兜底保留未选中的原始顺序
    const seen = new Set<number>();
    const reranked: Array<{ item: any; relevance: number }> = [];
    for (const idx of indices) {
      if (!seen.has(idx)) {
        reranked.push(candidates[idx]);
        seen.add(idx);
      }
    }
    // 把 LLM 没提到的候补追加在后面
    for (let i = 0; i < candidates.length; i++) {
      if (!seen.has(i)) reranked.push(candidates[i]);
    }
    return reranked;
  } catch {
    return null; // 超时或其他异常，回退到关键词排序
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
// 触发线 2 扩展：无反馈环状态（跨轮持久）
// ============================================================

interface NoFeedbackState {
  consecutiveTurns: number; // 连续无反馈环的轮数
  lastSessionId: string;
  updatedAt: string;
}

function readNoFeedbackState(): NoFeedbackState {
  try {
    if (fs.existsSync(NO_FEEDBACK_STATE)) {
      const raw = JSON.parse(fs.readFileSync(NO_FEEDBACK_STATE, "utf-8"));
      return {
        consecutiveTurns: Number(raw.consecutiveTurns) || 0,
        lastSessionId: String(raw.lastSessionId || ""),
        updatedAt: String(raw.updatedAt || ""),
      };
    }
  } catch { /* 静默 */ }
  return { consecutiveTurns: 0, lastSessionId: "", updatedAt: "" };
}

function saveNoFeedbackState(state: NoFeedbackState) {
  try {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(NO_FEEDBACK_STATE, JSON.stringify(state, null, 2), "utf-8");
  } catch { /* 静默 */ }
}

// ============================================================
// 触发线 5：提交后知识提取
// ============================================================

// ---- PageOut 衰减状态 ----
const DECAY_STATE_FILE = path.join(MEMORIES_DIR, ".decay-state.json");
const DECAY_DEBOUNCE_MS = 30000; // 30s 防抖——同一条记忆不会在 30s 内被衰减两次

interface DecayState {
  missedRounds: Record<string, number>;  // label → 连续未命中轮数
  lastDecayWrite: Record<string, number>; // label → 上次写盘时间戳
}

function readDecayState(): DecayState {
  try {
    if (fs.existsSync(DECAY_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(DECAY_STATE_FILE, "utf-8"));
    }
  } catch { /* */ }
  return { missedRounds: {}, lastDecayWrite: {} };
}

function saveDecayState(state: DecayState) {
  try { fs.writeFileSync(DECAY_STATE_FILE, JSON.stringify(state, null, 2), "utf-8"); } catch { /* */ }
}

/**
 * PageOut 衰减：未被召回的记忆按 category 分级降权
 * - constraint：永不衰减
 * - reference：连续 10 轮未命中 → priority -5（最低 30）
 * - preference：连续 5 轮未命中 → priority -10（最低 10）
 * 写盘带 30s 防抖，避免同一轮多次衰减
 */
function decayAndPersist(
  decayed: Array<{ label: string; memPath: string; category: string }>,
  memoryPaths: string[],
) {
  const state = readDecayState();
  const now = Date.now();

  for (const d of decayed) {
    if (d.category === "constraint") continue; // 硬约束永不衰减

    // 递增未命中计数
    state.missedRounds[d.label] = (state.missedRounds[d.label] || 0) + 1;
    const missed = state.missedRounds[d.label];

    const threshold = d.category === "preference" ? 5 : 10;
    const decrement = d.category === "preference" ? 10 : 5;
    const floor = d.category === "preference" ? 10 : 30;

    if (missed >= threshold) {
      const lastWrite = state.lastDecayWrite[d.label] || 0;
      if (now - lastWrite < DECAY_DEBOUNCE_MS) continue; // 防抖

      const mp = memoryPaths[parseInt(d.memPath, 10)] || MEMORIES_DIR;
      const fpath = path.join(mp, "blocks", d.label + ".md");
      try {
        if (fs.existsSync(fpath)) {
          let content = fs.readFileSync(fpath, "utf-8");
          // 提取当前 priority
          const priMatch = content.match(/<!--\s*priority:\s*(\d+)\s*-->/);
          const oldPri = priMatch ? parseInt(priMatch[1], 10) : 50;
          const newPri = Math.max(floor, oldPri - decrement);
          if (newPri < oldPri && priMatch) {
            // 仅当文件已有 priority 元数据时才回写——避免盲注到错误位置
            content = content.replace(priMatch[0], `<!-- priority: ${newPri} -->`);
            fs.writeFileSync(fpath, content, "utf-8");
            state.lastDecayWrite[d.label] = now;
            state.missedRounds[d.label] = 0; // 重置计数
            debug(`DECAY: ${d.label} priority ${oldPri}→${newPri}`);
          }
        }
      } catch (err) {
        debug(`DECAY: 写盘失败 ${fpath}: ${String(err)}`);
      }
    }
  }
  saveDecayState(state);
}

/**
 * 轮询检测新提交 → LLM 提取知识（每轮 system.transform 执行）
 * 通过对比 git log 时间戳与上次检查时间判断是否有新提交
 */
async function checkAndExtractCommitKnowledge(
  projectDir: string | undefined,
  memoryPaths: string[],
) {
  const cwd = projectDir || ".";
  if (!fs.existsSync(path.join(cwd, ".git"))) return;

  // 读取上次检查时间戳
  const lastCheckFile = path.join(MEMORIES_DIR, ".commit-last-check.json");
  let lastCheck = "";
  try {
    if (fs.existsSync(lastCheckFile)) {
      lastCheck = JSON.parse(fs.readFileSync(lastCheckFile, "utf-8")).ts || "";
    }
  } catch { /* */ }

  // 读最新提交
  let commitMsg = "";
  let commitTs = "";
  let changedFiles = "";
  try {
    const { execSync } = await import("node:child_process");
    commitMsg = execSync("git log -1 --format='%s%n%b'", { cwd, encoding: "utf-8", timeout: 5000 }).trim();
    commitTs = execSync("git log -1 --format='%aI'", { cwd, encoding: "utf-8", timeout: 5000 }).trim();
    changedFiles = execSync("git diff HEAD~1 --stat", { cwd, encoding: "utf-8", timeout: 5000 }).trim();
  } catch { return; }

  if (!commitMsg || commitTs <= lastCheck) return; // 无新提交

  // 保存本次检查时间
  try { fs.writeFileSync(lastCheckFile, JSON.stringify({ ts: commitTs }), "utf-8"); } catch {}

  // 跳过自动提交
  if (/^(Merge|Bump|chore\(deps\)|\(bot\))/i.test(commitMsg.split("\n")[0])) {
    debug(`触发线5: 跳过自动提交 — "${commitMsg.slice(0, 50)}"`);
    return;
  }

  debug(`触发线5: 新提交检测 — "${commitMsg.slice(0, 80)}"`);

  // 调用 LLM 分析
  try {
    const config = await getApiConfig();
    if (!config) return;

    // 读取已有知识防止重复
    let existing = "";
    try {
      for (const mp of memoryPaths) {
        const bd = path.join(mp, "blocks");
        if (fs.existsSync(bd)) {
          for (const f of fs.readdirSync(bd).filter(x => x.endsWith(".md"))) {
            existing += `[${f}] ${safeReadFile(path.join(bd, f)).slice(0, 200)}\n`;
          }
        }
      }
    } catch {}

    const prompt = `你是知识提取器。分析以下 git commit，判断是否存在值得记录的知识点。\n规则：日常编码提交返回 {"action":"skip"}；涉及工具/框架踩坑经验、配置技巧、API 发现时提取为知识。知识用中文摘要，≤15行，格式：事实→原则→反例→结论。文件名小写英文+连字符。\n\n现有知识（避免重复）：${existing.slice(0, 2000) || "（无）"}\n\n提交信息：${commitMsg.slice(0, 500)}\n\n改动文件：${changedFiles.slice(0, 500)}\n\n回复纯JSON：{"action":"skip"} 或 {"action":"create","items":[{"file":"xx.md","memPath":0,"content":"<!-- type:knowledge -->...","reason":"为什么"}]}`;

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 30000);
    const resp = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3, max_tokens: 2000,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    clearTimeout(to);
    if (!resp.ok) return;

    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    let json = data.choices?.[0]?.message?.content || "";
    if (!json) return;

    let parsed: any;
    try { parsed = JSON.parse(json); } catch {
      const m = json.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { return; }
      else return;
    }
    if (!parsed || parsed.action === "skip") { debug("触发线5: LLM 判断无需记录"); return; }

    if (parsed.items) {
      for (const item of parsed.items) {
        const mp = memoryPaths[parseInt(item.memPath, 10)] || MEMORIES_DIR;
        const dir = path.join(mp, "blocks");
        ensureDir(dir);
        fs.writeFileSync(path.join(dir, item.file), item.content, "utf-8");
        debug(`触发线5: 写入知识 → ${item.file} (${item.reason})`);
      }
    }
  } catch (err) { debug(`触发线5: LLM 异常 ${String(err)}`); }
}

// ============================================================
// Plugin 导出
// ============================================================

export const FractalPlugin = async (input: PluginInput, _options?: Record<string, unknown>) => {
  _fractalDebug("FACTORY: called");
  ensureDir(MEMORIES_DIR);
  ensureDir(BLOCKS_DIR);
  ensureDir(TRIGGERS_DIR);
  rotateLog(DEBUG_LOG, 500 * 1024); // debug 日志上限 500KB
  rotateLog(EVENT_LOG); // 启动时检查一次事件日志

  const projectDir = input.directory || undefined;
  const { client } = input;

  // 触发线 4：本轮是否已检测到断言（避免重复计数同一轮多次 content chunk）
  let assertionDetectedThisTurn = false;

  // 触发线 4：本轮是否已调用过联网查证工具
  let websearchCalledThisTurn = false;

  // 触发线 2 扩展：本轮是否执行了 bash / 本轮 edit 次数
  let bashCalledThisTurn = false;
  let editsThisTurn = 0;

  // 注入频率控制：knowledge 索引 + habits 不每轮都塞
  let turnCounter = 0;
  const NUDGE_INTERVAL = 5; // 每 N 轮注入一次 knowledge/habits 索引
  const MAX_KNOWLEDGE_INJECT = 5; // 记忆反馈：单轮最多注入 N 条

  // 动态阈值：分析次数递增时阈值翻倍，避免长会话频繁触发 LLM 分析
  let analysisCount = 0;

  // 双通道注入：chat.message 同轮警告（比 system.transform 跨轮提醒更即时）
  let pendingWarnings: string[] = [];

  // 知识注入精准度：捕获上轮用户消息，用于关键词匹配
  let lastUserMessage = "";

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
      _fractalDebug("HOOK: system.transform fired");

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
      // 阈值可通过 assertion-reminder.md 首行 <!-- thresholds: 1,3,5 --> 自定义
      if (!isLinePaused("4") && c.count > 0) {
        const thresholds = parseAssertionThresholds();
        const section = getSection(c.count, thresholds);
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

      // 触发线 5：提交后知识提取（轮询 git log，不依赖工具 hook）
      try {
        if (!isLinePaused("5")) {
          await checkAndExtractCommitKnowledge(projectDir, memoryPaths);
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

      // ---- 加权排序 + 四档分层（V3.5）----
      // 融合 relevance（关键词命中率）+ priority（用户显式权重）+ recency（时间衰减）
      const userMsgLower = (lastUserMessage || "").toLowerCase();
      const userKeywords = lastUserMessage ? extractKeywords(lastUserMessage) : [];
      const now = Date.now();
      const scored: Array<{ item: any; mtime: number; relevance: number; priority: number; category: string; score: number }> = [];
      let maxRelevance = 1; // 避免除零
      for (const k of knowledgeItems) {
        const mp = memoryPaths[parseInt((k as any).memPathIndex, 10)] || MEMORIES_DIR;
        const subDir = (k as any).human_description !== undefined ? "triggers" : "blocks";
        const fpath = path.join(mp, subDir, (k as any).fileName);
        const desc = ((k as any).human_description || (k as any).description || "").toLowerCase();
        const body = ((k as any).content || (k as any).value || "").toLowerCase();
        // A：用户关键词命中知识描述
        const forwardHits = userKeywords.length > 0
          ? userKeywords.filter(kw => desc.includes(kw) || body.includes(kw)).length
          : 0;
        // B：双向——知识描述的关键词是否在用户消息中出现
        let reverseHits = 0;
        if (userMsgLower) {
          const descKeywords = extractKeywords(desc);
          reverseHits = descKeywords.filter(dk => dk.length >= 2 && userMsgLower.includes(dk)).length;
        }
        const hits = forwardHits + reverseHits;
        if (hits > maxRelevance) maxRelevance = hits;
        // mtime 用于 recency 因子（在加权循环中计算）
        let mtimeMs = 0;
        try { mtimeMs = fs.statSync(fpath).mtimeMs; } catch { /* */ }
        scored.push({ item: k, mtime: mtimeMs, relevance: hits, priority: (k as any).priority || 50, category: (k as any).category || "reference", score: 0 });
      }
      // 加权融合（归一化 relevance 后计算）
      // 权重来源：A-MAC(2603.04549) 结论——category 先验 + 命中率 + 时效性，priority 权重 0.5 是类别内最高单因子
      for (const s of scored) {
        const normRel = maxRelevance > 0 ? s.relevance / maxRelevance : 0;
        s.score = normRel * 0.4 + (s.priority / 100) * 0.5 + Math.exp(-Math.max(0, (now - s.mtime) / (1000 * 60 * 60 * 24)) / 30) * 0.1;
      }
      scored.sort((a, b) => b.score - a.score);

      // 四档分层
      const HIGH = scored.filter(s => s.score >= 0.8 || s.priority >= 90 || s.category === "constraint"); // 硬约束保护
      const IMPORTANT = scored.filter(s => !HIGH.includes(s) && s.score >= 0.6);
      const OPERATIONAL = scored.filter(s => !HIGH.includes(s) && !IMPORTANT.includes(s) && s.score >= 0.3);
      const GENERAL = scored.filter(s => !HIGH.includes(s) && !IMPORTANT.includes(s) && !OPERATIONAL.includes(s));

      // 建造预算：HIGH 不参与计数，IMPORTANT + OPERATIONAL + GENERAL
      const dynamicBudget = Math.max(2, Math.min(MAX_KNOWLEDGE_INJECT, Math.floor((8000 - output.system.join("\n").length / 4) / 800)));
      let remainingBudget = dynamicBudget;
      const selected: Array<{ item: any; relevance: number; tier: string }> = [];

      // HIGH 全注入（预算外）
      for (const s of HIGH) { selected.push({ item: s.item, relevance: s.relevance, tier: "HIGH" }); }

      // IMPORTANT → OPERATIONAL → GENERAL 按预算填充
      for (const tier of [IMPORTANT, OPERATIONAL, GENERAL]) {
        for (const s of tier) {
          if (remainingBudget <= 0) break;
          selected.push({ item: s.item, relevance: s.relevance, tier: tier === IMPORTANT ? "IMPORTANT" : tier === OPERATIONAL ? "OPERATIONAL" : "GENERAL" });
          remainingBudget--;
        }
      }

      // LLM 语义重排（候选 > 3 且有关键词命中时）
      const matchedCount = selected.filter(s => s.relevance > 0).length;
      let topKnowledge = selected;
      if (matchedCount > 3 && userMsgLower) {
        const reranked = await llmRerankKnowledge(userMsgLower, selected.map(s => ({ item: s.item, mtime: 0, relevance: s.relevance })));
        if (reranked) {
          // 保留分层信息——LLM 重排后按原顺序重新标记 tier
          const tierMap = new Map(selected.map(s => [s.item.label || s.item.fileName, s.tier]));
          topKnowledge = reranked.map(r => ({ item: r.item, relevance: r.relevance, tier: tierMap.get(r.item.label || r.item.fileName) || "GENERAL" }));
          debug(`FRACTAL: LLM 重排知识，${reranked.length} 条中 ${reranked.filter(r => r.relevance > 0).length} 条命中`);
        }
      }

      // 分组推送：同级内共享 ≥1 个 description 关键词的合并
      const tierPrefixes: Record<string, string> = { HIGH: "🔴", IMPORTANT: "🟡", OPERATIONAL: "🟢", GENERAL: "" };
      const pushGroups: Array<{ tier: string; lines: string[] }> = [];
      let lastMergedDesc = ""; // 追踪组内最后一个项的 description，用于关键词比对

      for (const s of topKnowledge) {
        const k = s.item;
        const desc = (k as any).human_description || k.description;
        const mp = memoryPaths[parseInt((k as any).memPathIndex, 10)] || MEMORIES_DIR;
        const subDir = (k as any).human_description !== undefined ? "triggers" : "blocks";
        const filePath = `${mp}/${subDir}/${(k as any).fileName}`.replace(HOME, "~");
        const tag = s.relevance > 0 ? " [相关]" : "";
        const line = `- **${desc}**${tag} → \`${filePath}\``;

        // 尝试合入上一组（同 tier 且与组内最后一条共享关键词）
        const lastGroup = pushGroups.length > 0 ? pushGroups[pushGroups.length - 1] : null;
        const descKeywords = extractKeywords(desc);
        const lastKeywords = lastGroup ? extractKeywords(lastMergedDesc) : [];
        const shared = descKeywords.filter(dk => lastKeywords.includes(dk)).length;

        if (lastGroup && lastGroup.tier === s.tier && shared >= 2) {
          lastGroup.lines.push(line);
          lastMergedDesc = desc;
        } else {
          pushGroups.push({ tier: s.tier, lines: [line] });
          lastMergedDesc = desc;
        }
      }

      // 注入分组知识索引
      if ((isNudgeTurn || matchedCount > 0) && pushGroups.length > 0) {
        const truncated = scored.length - topKnowledge.length;
        const prefixMap: Record<string, string> = { HIGH: "🔴 硬约束（不受截断保护外的预算限制）", IMPORTANT: "🟡 重要知识", OPERATIONAL: "🟢 参考知识", GENERAL: "其他知识" };

        for (const group of pushGroups) {
          const label = prefixMap[group.tier] || group.tier;
          output.system.push(`\n### ${label}\n${group.lines.join("\n")}\n`);
        }
        if (truncated > 0) {
          output.system.push(`\n> （共 ${scored.length} 条知识，已按权重分层注入 ${topKnowledge.length} 条。其余用 read 工具按需读取）\n`);
        }
      }

      // ---- PageOut 衰减：注入集会中的命中项重置计数，未入选的递增累计 ----
      {
        const injectedLabels = new Set(topKnowledge.map(s => (s.item as any).label || (s.item as any).fileName));
        const decayState = readDecayState();
        // 命中项：重置计数
        for (const label of injectedLabels) {
          if (decayState.missedRounds[label]) decayState.missedRounds[label] = 0;
        }
        // 未入选项：构建衰减列表
        const decayCandidates: Array<{ label: string; memPath: string; category: string }> = [];
        for (const s of scored) {
          const label = (s.item as any).label || (s.item as any).fileName;
          if (!injectedLabels.has(label)) {
            decayCandidates.push({
              label,
              memPath: (s.item as any).memPathIndex || "0",
              category: (s.item as any).category || "reference",
            });
          }
        }
        saveDecayState(decayState);
        if (decayCandidates.length > 0) {
          decayAndPersist(decayCandidates, memoryPaths);
        }
      }

      // 注入 auto habits（已确认的习惯，仅 nudge turn 注入）
      // 改为指令语气：这不是观察结论，是 LLM 必须照做的默认行为
      if (isNudgeTurn && autoHabits.length > 0) {
        const triggerTexts = autoHabits.map(t =>
          `**[默认行为] ${t.human_description}**\n${t.content}`
        ).join("\n\n");
        output.system.push(
          `\n## 默认行为（无需确认，直接执行）\n以下是你的默认行为规则——像肌肉记忆一样，触发场景时自动照做：\n\n${triggerTexts}\n`
        );
      }

      // 注入 suggest habits（观察中的习惯，仅 nudge turn 注入）
      if (isNudgeTurn && suggestHabits.length > 0) {
        const triggerTexts = suggestHabits.map(t =>
          `**[待观察的习惯] ${t.human_description}**\n${t.content}`
        ).join("\n\n");
        output.system.push(
          `\n## 待观察的习惯\n你偶尔在以下场景做这些事，还不够确定，仅供参考：\n\n${triggerTexts}\n`
        );
      }

      if (triggers.length > 0) {
        const skipped = (!isNudgeTurn && matchedCount === 0) ? " (间隔跳过注入)" : (!isNudgeTurn && matchedCount > 0 ? ` (关键词命中${matchedCount}条，立即注入)` : "");
        const trimInfo = scored.length > topKnowledge.length ? ` 截断${scored.length - topKnowledge.length}条` : "";
        const matchInfo = matchedCount > 0 ? ` 命中${matchedCount}条` : "";
        debug(`FRACTAL: 注入 ${autoHabits.length} 个已确认 + ${suggestHabits.length} 个观察中 + ${knowledgeItems.length} 个元知识→展示${topKnowledge.length}${matchInfo}${trimInfo}${skipped}`);
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

      // 触发线 2 扩展：无反馈环检测 → 通过 system.transform 注入提醒（下一轮生效）
      if (!isLinePaused("2")) {
        const nfs = readNoFeedbackState();
        if (nfs.consecutiveTurns >= NO_FEEDBACK_THRESHOLD) {
          const warning = `\n## ⚠️ 分形：缺少反馈环\n连续 ${nfs.consecutiveTurns} 轮修改代码但未执行测试。按照结构化调试流程，先建立反馈环再修复（Phase 1）。在下一轮修改代码前，先跑一次相关测试建立"能变红"的反馈环。\n`;
          output.system.push(warning);
          debug(`触发线2扩展: system.transform 注入无反馈环警告，consecutiveTurns=${nfs.consecutiveTurns}`);
          // 注入后重置计数，避免连续警告
          nfs.consecutiveTurns = 0;
          saveNoFeedbackState(nfs);
        }
      }

      // 中文思考：独立 system message，最高 recency，不受 core-rules 大块稀释
      output.system.push("\n以中文思考，除非用户要求，否则回答也使用中文。\n");
    },

    /**
     * 双通道注入：在用户消息到达时注入警告（同轮可见，比 system.transform 更即时）
     *
     * 数据流：event hook（触发线2/4）→ pendingWarnings 队列 → chat.message 注入 → 清空
     * 与 system.transform 的频率逻辑互补：
     *   - chat.message：每轮用户消息都注入 pending warnings（即时反馈，不做节流）
     *   - system.transform：knowledge/habits 按 NUDGE_INTERVAL 节流（减少 prompt 污染）
     */
    "chat.message": async (
      _input: unknown,
      output: { parts?: Array<{ type: string; text?: string; synthetic?: boolean }> }
    ) => {
      _fractalDebug("HOOK: chat.message fired");
      // 捕获用户消息文本（用于知识注入关键词匹配）
      const userText = (output.parts || [])
        .filter(p => p.type === "text" && !p.synthetic)
        .map(p => p.text || "")
        .join(" ");
      if (userText) lastUserMessage = userText;

      if (pendingWarnings.length > 0) {
        const warningText = `\n[分形 Guardian] ${pendingWarnings.join(" | ")}\n`;
        if (output.parts) {
          output.parts.unshift({ type: "text", text: warningText, synthetic: true });
        }
        debug(`双通道注入: chat.message 注入 ${pendingWarnings.length} 条警告`);
        pendingWarnings = []; // 一次性消费
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

        try {
          const props = event.properties as Record<string, unknown> | undefined;
          const sessionID = props?.sessionID as string | undefined;
          // OpenCode 事件中 role/content/parts 嵌套在 info 对象内
          const info = props?.info as Record<string, unknown> | undefined;

          // 触发线 4：检测 websearch 工具调用（在助手消息的 parts 中查找）
          if (info?.role === "assistant" && Array.isArray(info?.parts)) {
            for (const p of info.parts as Array<Record<string, unknown>>) {
              if (p?.type === "tool_call" && WEBSEARCH_TOOLS.test(String(p?.tool || ""))) {
                websearchCalledThisTurn = true;
                debug(`触发线4: 检测到联网查证 → ${p.tool}`);
                // 不 break——同一条消息可能同时有 websearch 和 bash
              }
              // 触发线 2 扩展：检测 bash 执行（作为"反馈环存在"的证据）
              if (p?.type === "tool_call" && /^bash$/i.test(String(p?.tool || ""))) {
                bashCalledThisTurn = true;
                debug(`触发线2扩展: 检测到 bash 执行 → 反馈环存在`);
              }
            }
          }

          // 触发线 4：用户新消息 → 重置本轮标志 + 衰减计数器
          if (info?.role === "user") {
            // 上轮有断言但本轮是新的用户消息 → 上一轮结束，检查是否需要衰减
            if (!assertionDetectedThisTurn) {
              decayCounter(sessionID || "");
            }

            // 触发线 2 扩展：用户新消息 → 处理上一轮的反馈环状态
            const nfs = readNoFeedbackState();
            // 跨会话重置
            if (nfs.lastSessionId && nfs.lastSessionId !== (sessionID || "")) {
              nfs.consecutiveTurns = 0;
              nfs.lastSessionId = sessionID || "";
            }
            // 上轮有 edit 但无 bash → 递增；有 bash → 重置；无 edit → 保持
            if (editsThisTurn > 0 && !bashCalledThisTurn) {
              nfs.consecutiveTurns++;
              debug(`触发线2扩展: consecutiveTurns=${nfs.consecutiveTurns}（上轮 ${editsThisTurn} 次 edit，无 bash）`);
            } else if (bashCalledThisTurn) {
              nfs.consecutiveTurns = 0;
              debug(`触发线2扩展: 上轮有 bash → 重置计数`);
            }
            saveNoFeedbackState(nfs);

            websearchCalledThisTurn = false;
            assertionDetectedThisTurn = false;
            bashCalledThisTurn = false;
            editsThisTurn = 0;
            debug(`触发线4: 新用户消息 → 重置本轮标志`);
          }

          // 触发线 4：扫描 assistant 输出 → 分级计数而非简单标记
          if (info?.role === "assistant" && typeof info?.content === "string") {
            const content = info.content as string;
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
        editsThisTurn++; // 触发线 2 扩展：累计本轮编辑次数
        logEvent(event);
        tryTriggerMatch(event.properties);
      }

      // V2.0：三层漏斗 — glob 预筛选 → LLM 语义判断 → prompt 注入（不 await）
      function tryTriggerMatch(props?: Record<string, unknown>) {
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
          lines.push("## 默认行为（跨会话持久，无需确认）");
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
