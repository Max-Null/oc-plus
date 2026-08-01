/**
 * 语义向量索引 — TAP13 测试（V4 P2+P3）
 *
 * 测试范围：
 * - rrfFuse 纯函数：融合排序、权重、topK、空输入
 * - VectorIndex：用 mock extractor 验证 embed/add/search 流程（不依赖真实模型）
 * - KnowledgeEngine.searchHybrid：向量就绪 → 融合；未就绪 → 降级 BM25
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { VectorIndex, rrfFuse } from "./vector.js";
import { KnowledgeEngine, type BlockMeta } from "./engine.js";
import { BM25Index, type SearchDoc } from "./bm25.js";

// ============================================================
// mock extractor：确定性伪向量（文本 hash → 384 维单位向量）
// 模拟 transformers.js pipeline 的最小接口：fn(text, opts) → { data }
// ============================================================

function fakeExtractor(text: string): { data: Float32Array } {
  // 确定性 hash：让相同文本得到相同向量
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  const v = new Float32Array(384);
  for (let i = 0; i < 384; i++) v[i] = Math.sin(h * (i + 1)) * 0.1; // 伪随机分量
  // 归一化
  let norm = 0;
  for (let i = 0; i < 384; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 384; i++) v[i] /= norm;
  return { data: v };
}

/** 构造一个已挂载 mock extractor 的 VectorIndex */
function makeMockVectorIndex(): VectorIndex {
  const idx = new VectorIndex();
  // 通过 (idx as any).extractor 注入 mock —— 测试专用，绕过私有字段
  (idx as unknown as { extractor: unknown }).extractor = fakeExtractor as never;
  return idx;
}

// ============================================================
// Suite 1: rrfFuse — RRF 融合
// ============================================================
describe("rrfFuse — RRF 融合", () => {
  it("两路结果按 RRF 融合排序", () => {
    const bm25 = [{ filePath: "a.md" }, { filePath: "b.md" }];
    const vec = [{ filePath: "b.md" }, { filePath: "c.md" }];
    const fused = rrfFuse(bm25, vec, 5);
    // b.md 两路都出现 → 分数最高
    assert.strictEqual(fused[0].filePath, "b.md");
    // a.md 只在一路第 1 → 高于只在一路第 2 的 c.md
    assert.ok(fused.find(f => f.filePath === "a.md")!.score > fused.find(f => f.filePath === "c.md")!.score);
  });

  it("BM25 权重高于向量（同 rank 时 BM25 优先）", () => {
    const bm25 = [{ filePath: "a.md" }];
    const vec = [{ filePath: "b.md" }];
    const fused = rrfFuse(bm25, vec, 5);
    assert.ok(fused.find(f => f.filePath === "a.md")!.score > fused.find(f => f.filePath === "b.md")!.score);
  });

  it("topK 截断", () => {
    const bm25 = [{ filePath: "a.md" }, { filePath: "b.md" }, { filePath: "c.md" }];
    const fused = rrfFuse(bm25, [], 2);
    assert.strictEqual(fused.length, 2);
  });

  it("空输入返回空", () => {
    assert.deepStrictEqual(rrfFuse([], [], 5), []);
  });
});

// ============================================================
// Suite 2: VectorIndex — 语义向量索引（mock extractor）
// ============================================================
describe("VectorIndex — 语义向量索引", () => {
  it("未挂载模型时 ready=false，搜索返回空", async () => {
    const idx = new VectorIndex();
    assert.strictEqual(idx.ready, false);
    const hits = await idx.search("anything");
    assert.deepStrictEqual(hits, []);
  });

  it("rebuild 后 size 正确", async () => {
    const idx = makeMockVectorIndex();
    await idx.rebuild([
      { filePath: "a.md", text: "数据库慢查询优化" },
      { filePath: "b.md", text: "前端性能优化" },
    ]);
    assert.strictEqual(idx.size, 2);
  });

  it("语义相近文本得分高于无关文本", async () => {
    const idx = makeMockVectorIndex();
    await idx.rebuild([
      { filePath: "n1.md", text: "API 接口响应慢 数据库 N+1 查询 性能优化" },
      { filePath: "ui.md", text: "页面布局 CSS 样式 组件设计" },
    ]);
    // "接口太慢" 与 n1.md 文本更接近
    const hits = await idx.search("API 接口太慢", 2);
    assert.ok(hits.length >= 1);
    assert.strictEqual(hits[0].filePath, "n1.md");
  });

  it("embed 返回 384 维向量", async () => {
    const idx = makeMockVectorIndex();
    const v = await idx.embed("测试文本");
    assert.ok(v);
    assert.strictEqual(v!.length, 384);
  });
});

// ============================================================
// Suite 3: KnowledgeEngine.searchHybrid — 融合搜索
// ============================================================
describe("KnowledgeEngine.searchHybrid — 融合搜索", () => {
  function makeEngine(blocks: BlockMeta[]): KnowledgeEngine {
    const engine = new KnowledgeEngine([]);
    engine.feedBlocks(blocks);
    return engine;
  }

  function block(fileName: string, label: string, desc: string): BlockMeta {
    return { fileName, relPath: fileName, status: "auto", type: "knowledge", label, description: desc, priority: 50, body: "" };
  }

  it("未挂载向量 → 降级 BM25（同步路径）", async () => {
    const engine = makeEngine([
      block("n1.md", "N+1 查询", "Java SQL N+1 优化"),
      block("ui.md", "UI 组件", "前端组件设计"),
    ]);
    const r = await engine.searchHybrid("sql", 5);
    assert.strictEqual(r[0].doc.fileName, "n1.md");
    assert.strictEqual(engine.stats().vectorReady, false);
  });

  it("挂载向量就绪 → 融合结果包含语义补充", async () => {
    const engine = makeEngine([
      block("n1.md", "N+1 查询", "Java SQL N+1 查询优化 数据库性能"),
      block("cache.md", "缓存", "Redis 缓存策略 性能"),
      block("ui.md", "UI 组件", "前端组件设计 CSS"),
    ]);
    const vIdx = makeMockVectorIndex();
    // 向量索引内容与 blocks 一致
    await vIdx.rebuild([
      { filePath: "n1.md", text: "N+1 查询 Java SQL 数据库性能" },
      { filePath: "cache.md", text: "Redis 缓存策略 性能" },
      { filePath: "ui.md", text: "前端组件设计 CSS" },
    ]);
    engine.setVectorIndex(vIdx);
    assert.strictEqual(engine.stats().vectorReady, true);

    // 查询"数据库慢了"：BM25 可能零命中，向量语义兜底
    const r = await engine.searchHybrid("数据库慢了", 5);
    assert.ok(r.length > 0, "融合搜索应有结果");
    // n1.md（数据库性能相关）应在前列
    assert.strictEqual(r[0].doc.fileName, "n1.md");
  });

  it("向量模型加载失败 → 自动降级 BM25", async () => {
    const engine = makeEngine([
      block("n1.md", "N+1 查询", "Java SQL N+1 优化"),
    ]);
    // 挂载一个 ready=false 的 VectorIndex（模拟模型加载失败）
    const vIdx = new VectorIndex();
    engine.setVectorIndex(vIdx);
    assert.strictEqual(engine.stats().vectorReady, false);
    const r = await engine.searchHybrid("sql", 5);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].doc.fileName, "n1.md");
  });

  it("stats().vectorReady 反映向量状态", async () => {
    const engine = makeEngine([block("a.md", "A", "desc a")]);
    assert.strictEqual(engine.stats().vectorReady, false);
    const vIdx = makeMockVectorIndex();
    engine.setVectorIndex(vIdx);
    assert.strictEqual(engine.stats().vectorReady, true);
  });
});
