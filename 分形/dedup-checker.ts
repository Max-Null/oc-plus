/**
 * 分形 — 事后记忆去重审查器 V1
 *
 * 在记忆保存后定期扫描 blocks/ 和 triggers/，用关键词初筛 + LLM 精确对比找出疑似重复的记忆。
 * 两阶段设计：
 *   阶段 1 — 关键词 Jaccard 重叠率（快速过滤，零 token）
 *   阶段 2 — LLM 语义对比（精确判断，仅在疑似重复时调一次）
 *
 * 触发时机：每 N 轮 system.transform 自动执行（独立于创建层去重，不依赖创建事件追踪）。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const MEMORIES_DIR = path.join(HOME, ".config", "opencode", "memories");
const DEDUP_STATE_FILE = path.join(MEMORIES_DIR, ".dedup-last-check.json");
const DEDUP_CHECK_INTERVAL = 15; // 缩短间隔，配合事件驱动触发

// ============================================================
// 类型
// ============================================================

export interface DedupState {
  lastCheckTurn: number;        // 上次检查的 turnCounter
  lastCheckTime: string;        // ISO 时间戳
  totalCompared: number;        // 总对比次数
  duplicatesFound: number;      // 发现的重复对数
}

export interface DedupResult {
  itemA: { fileName: string; label: string; memPath: string; content: string; type: "block" | "trigger" };
  itemB: { fileName: string; label: string; memPath: string; content: string; type: "block" | "trigger" };
  keywordOverlap: number;       // 关键词重叠率 (0-1)
}

// ============================================================
// 状态管理
// ============================================================

export function readDedupState(): DedupState {
  try {
    if (fs.existsSync(DEDUP_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(DEDUP_STATE_FILE, "utf-8"));
    }
  } catch { /* 静默 */ }
  return { lastCheckTurn: 0, lastCheckTime: "", totalCompared: 0, duplicatesFound: 0 };
}

export function writeDedupState(state: DedupState): void {
  try { fs.writeFileSync(DEDUP_STATE_FILE, JSON.stringify(state, null, 2), "utf-8"); } catch { /* 静默 */ }
}

// ============================================================
// 关键词提取（复刻 fractal.ts 中的 extractKeywords 逻辑）
// ============================================================

function extractKeywords(text: string): string[] {
  // 中英文分词：中文按 2-3 字符滑动窗口，英文按空格分词
  const words = new Set<string>();
  const lowerText = text.toLowerCase();

  // 英文单词（≥3 字母）
  const enWords = lowerText.match(/[a-z]{3,}/g);
  if (enWords) enWords.forEach(w => words.add(w));

  // 中文滑动窗口（2-3 字符）
  const cnChars = lowerText.replace(/[^\u4e00-\u9fa5]/g, "");
  for (let i = 0; i < cnChars.length - 1; i++) {
    words.add(cnChars.slice(i, i + 2));
  }
  for (let i = 0; i < cnChars.length - 2; i++) {
    words.add(cnChars.slice(i, i + 3));
  }

  return [...words].filter(w => w.length >= 2);
}

// ============================================================
// 阶段 1：关键词重叠率初筛（快速，零 token）
// ============================================================

function keywordOverlap(textA: string, textB: string): number {
  const kwA = extractKeywords(textA);
  const kwB = extractKeywords(textB);
  if (kwA.length === 0 || kwB.length === 0) return 0;

  const setA = new Set(kwA);
  const intersection = kwB.filter(k => setA.has(k)).length;
  const union = new Set([...kwA, ...kwB]).size;

  return intersection / union; // Jaccard 相似度
}

const KEYWORD_THRESHOLD = 0.4; // 关键词重叠率达到 40% 才进入阶段 2

// ============================================================
// 阶段 2：LLM 精确对比
// ============================================================

interface MemoryItem {
  fileName: string;
  label: string;
  description: string;
  human_description?: string;
  content: string;
  memPath: string;
  type: "block" | "trigger";
}

/**
 * 读取所有记忆项（全局 + 项目级）
 * @param projectDir 项目根目录（可选，用于加载 project 级别 memories）
 */
function loadAllMemories(projectDir?: string): MemoryItem[] {
  const items: MemoryItem[] = [];
  const statusDirs = ["pending", "auto", "suggest"];

  // 全局 memories
  const globalRoots = [
    [path.join(MEMORIES_DIR, "blocks"), path.join(MEMORIES_DIR, "triggers")],
  ];
  // 项目级 memories（如果 projectDir 存在）
  if (projectDir) {
    const projectMemories = path.join(projectDir, ".opencode", "memories");
    if (fs.existsSync(projectMemories)) {
      const projectBlocks = path.join(projectMemories, "blocks");
      const projectTriggers = path.join(projectMemories, "triggers");
      if (fs.existsSync(projectBlocks) || fs.existsSync(projectTriggers)) {
        globalRoots.push([projectBlocks, projectTriggers]);
      }
    }
  }

  for (const [blocksDir, triggersDir] of globalRoots) {
    for (const [rootDir, type] of [[blocksDir, "block"] as const, [triggersDir, "trigger"] as const] as const) {
    // 子目录
    for (const sd of statusDirs) {
      const dir = path.join(rootDir, sd);
      if (!fs.existsSync(dir)) continue;
      try {
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".md"))) {
          const content = fs.readFileSync(path.join(dir, f), "utf-8");
          const item = parseMemoryFile(f, path.join(dir, f).replace(HOME, "~"), content, type);
          if (item) items.push(item);
        }
      } catch { /* */ }
    }
    // 扁平目录（旧结构兼容）
    if (fs.existsSync(rootDir)) {
      try {
        for (const f of fs.readdirSync(rootDir).filter(f => f.endsWith(".md"))) {
          const content = fs.readFileSync(path.join(rootDir, f), "utf-8");
          const item = parseMemoryFile(f, path.join(rootDir, f).replace(HOME, "~"), content, type);
          if (item && !items.some(e => e.fileName === item.fileName && e.memPath === item.memPath)) {
            items.push(item);
          }
        }
      } catch { /* */ }
    }
  }
  }

  return items;
}

function parseMemoryFile(fileName: string, memPath: string, content: string, type: "block" | "trigger"): MemoryItem | null {
  const labelMatch = content.match(/<!-- label:\s*(.+?)\s*-->/);
  const descMatch = content.match(/<!-- description:\s*(.+?)\s*-->/);
  const humanDescMatch = content.match(/<!-- human_description:\s*(.+?)\s*-->/);

  const label = labelMatch?.[1] || fileName.replace(".md", "");
  const description = descMatch?.[1] || humanDescMatch?.[1] || "";

  if (!description) return null;

  return { fileName, label, description, human_description: humanDescMatch?.[1], content, memPath, type };
}

/**
 * 构建 LLM 去重检查 prompt
 */
function buildDedupPrompt(a: MemoryItem, b: MemoryItem): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `你是记忆去重审查员。判断以下两个记忆块是否描述的是同一个习惯或知识点。

判断标准：
- 核心行为/核心知识点相同 → 是（即使表述不同、措辞不同）。
- 核心行为/核心知识点不同 → 否。
- 如果不确定 → 否（宁可漏掉，不误判）。

回答格式：只回答一个 JSON：
{ "duplicate": true/false, "reason": "一句话说明为什么" }`;

  const userPrompt = `记忆 A (${a.type} / ${a.fileName}):
描述: ${a.description}
内容摘要: ${a.content.slice(0, 500)}

记忆 B (${b.type} / ${b.fileName}):
描述: ${b.description}
内容摘要: ${b.content.slice(0, 500)}`;

  return { systemPrompt, userPrompt };
}

/**
 * 调用 LLM API 做精确对比
 */
async function callLLMForDedup(
  a: MemoryItem, b: MemoryItem,
  apiConfig: { baseURL: string; apiKey: string; primaryModel: string }
): Promise<{ duplicate: boolean; reason: string } | null> {
  const { systemPrompt, userPrompt } = buildDedupPrompt(a, b);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${apiConfig.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.primaryModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 200,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return { duplicate: Boolean(parsed.duplicate), reason: parsed.reason || "" };
  } catch {
    return null;
  }
}

// ============================================================
// 主入口：执行去重检查
// ============================================================

/**
 * 执行一轮去重检查。
 * @param turnCounter 当前轮数
 * @param forceCheck 强制执行（无视间隔阈值）
 * @param apiConfig LLM API 配置（如果为 null，只做阶段 1 初筛不做 LLM 调用）
 * @param debugLog 调试日志回调
 * @returns 发现的疑似重复列表
 */
export async function runDedupCheck(
  turnCounter: number,
  forceCheck: boolean,
  apiConfig: { baseURL: string; apiKey: string; primaryModel: string } | null,
  debugLog: (msg: string) => void,
  projectDir?: string,
): Promise<DedupResult[]> {
  const state = readDedupState();

  // 间隔检查（除非 forceCheck）
  if (!forceCheck && turnCounter - state.lastCheckTurn < DEDUP_CHECK_INTERVAL) {
    return [];
  }

  debugLog(`DEDUP: 开始检查 (turn=${turnCounter})`);
  const items = loadAllMemories(projectDir);
  if (items.length < 2) {
    debugLog(`DEDUP: 记忆项不足 (${items.length})，跳过`);
    state.lastCheckTurn = turnCounter;
    state.lastCheckTime = new Date().toISOString();
    writeDedupState(state);
    return [];
  }

  // 阶段 1：关键词初筛
  const candidates: Array<{ a: MemoryItem; b: MemoryItem; overlap: number }> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const textA = `${items[i].description}\n${items[i].human_description || ""}\n${items[i].content}`;
      const textB = `${items[j].description}\n${items[j].human_description || ""}\n${items[j].content}`;
      const overlap = keywordOverlap(textA, textB);
      if (overlap >= KEYWORD_THRESHOLD) {
        candidates.push({ a: items[i], b: items[j], overlap });
      }
    }
  }

  debugLog(`DEDUP: 关键词初筛 ${candidates.length}/${items.length * (items.length - 1) / 2} 对候选`);

  if (candidates.length === 0) {
    state.lastCheckTurn = turnCounter;
    state.lastCheckTime = new Date().toISOString();
    writeDedupState(state);
    return [];
  }

  // 阶段 2：LLM 精确对比（并行执行，限流 5 并发）
  const results: DedupResult[] = [];
  if (apiConfig) {
    const MAX_CONCURRENT = 5;
    for (let i = 0; i < candidates.length; i += MAX_CONCURRENT) {
      const batch = candidates.slice(i, i + MAX_CONCURRENT);
      const batchResults = await Promise.all(
        batch.map(async (c) => {
          const llmResult = await callLLMForDedup(c.a, c.b, apiConfig);
          if (llmResult?.duplicate) {
            return {
              itemA: { fileName: c.a.fileName, label: c.a.label, memPath: c.a.memPath, content: c.a.content, type: c.a.type },
              itemB: { fileName: c.b.fileName, label: c.b.label, memPath: c.b.memPath, content: c.b.content, type: c.b.type },
              keywordOverlap: c.overlap,
            } as DedupResult;
          }
          state.totalCompared++;
          return null;
        })
      );
      for (const r of batchResults) {
        if (r) { results.push(r); state.duplicatesFound++; }
      }
    }
  }

  state.lastCheckTurn = turnCounter;
  state.lastCheckTime = new Date().toISOString();
  writeDedupState(state);

  debugLog(`DEDUP: 完成 — 对比 ${state.totalCompared} 次, 发现 ${state.duplicatesFound} 对`);
  return results;
}

/**
 * 构建去重提醒消息（供 fractal.ts 注入 user prompt）
 */
export function buildDedupReminder(results: DedupResult[]): string {
  if (results.length === 0) return "";

  const maxShow = 3; // 最多显示 3 对，避免 prompt 过长
  const shown = results.slice(0, maxShow);
  const more = results.length > maxShow ? `\n...还有 ${results.length - maxShow} 对未列出。` : "";

  const items = shown.map((r, i) => {
    return (
      `**${i + 1}.** ${r.itemA.fileName} (${r.itemA.type})\n` +
      `   ↔ ${r.itemB.fileName} (${r.itemB.type}) | 关键词重叠: ${Math.round(r.keywordOverlap * 100)}%\n` +
      `   A: ${r.itemA.label}\n` +
      `   B: ${r.itemB.label}`
    );
  }).join("\n\n");

  return (
    `分形去重审查：发现 ${results.length} 对疑似重复的记忆。请检查是否需要合并：\n\n${items}${more}\n\n` +
    `确认方式：说"合并记忆 {序号}" 逐对处理，或说"都不合并"跳过。`
  );
}

/**
 * 获取去重检查间隔（供 fractal.ts 在日志中显示）
 */
export function getCheckInterval(): number {
  return DEDUP_CHECK_INTERVAL;
}
