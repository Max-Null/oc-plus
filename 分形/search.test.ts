/**
 * V4 BM25Index 测试
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { BM25Index, SearchDoc } from "./search.js";

function doc(path: string, title: string, desc: string, body: string = ""): SearchDoc {
  return { filePath: path, fileName: path.split("/").pop() || path, title, description: desc, body };
}

// ============================================================
describe("BM25Index — 基本索引", () => {
  it("空索引返回空", () => {
    const idx = new BM25Index();
    assert.deepStrictEqual(idx.search("hello"), []);
  });

  it("精确搜索单文档", () => {
    const idx = new BM25Index();
    idx.index(doc("n1.md", "Java SQL N+1", "避免 N+1 查询", "Hibernate ORM..."));
    const r = idx.search("sql");
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].doc.fileName, "n1.md");
  });

  it("TF 高的放在前面", () => {
    const idx = new BM25Index();
    idx.index(doc("a.md", "SQL入门", "简介", ""));
    idx.index(doc("b.md", "SQL专家", "SQL SQL SQL SQL SQL 深入", ""));
    const r = idx.search("sql");
    assert.ok(r.length >= 2);
    // BM25 带 TF 饱和，b.md 命中次数多 → 分数高
    assert.strictEqual(r[0].doc.fileName, "b.md");
  });
});

// ============================================================
describe("BM25Index — CJK 2-gram", () => {
  it("精确中文词匹配", () => {
    const idx = new BM25Index();
    idx.index(doc("slow.md", "慢查询优化", "慢查询排查指南", ""));
    idx.index(doc("cache.md", "缓存策略", "Redis 缓存", ""));
    const r = idx.search("慢查询");
    assert.strictEqual(r.length, 1); // 仅 slow.md 有"慢查询"2-gram
    assert.strictEqual(r[0].doc.fileName, "slow.md");
  });

  it("部分中文片段匹配（N-gram 功劳）", () => {
    const idx = new BM25Index();
    idx.index(doc("perf.md", "性能优化", "Java 后端性能优化", "包含响应变慢的排查"));
    idx.index(doc("deploy.md", "部署流程", "自动部署", ""));
    // "性能慢" → 2-gram: "性能", "能慢" → "性能"命中 perf.md
    const r = idx.search("性能慢");
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].doc.fileName, "perf.md");
  });

  it("英文词匹配中文描述", () => {
    const idx = new BM25Index();
    idx.index(doc("mem.md", "Java 内存泄漏", "排查 memory leak 方法", ""));
    idx.index(doc("rust.md", "Rust 入门", "编程语言教程", ""));
    const r = idx.search("memory");
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].doc.fileName, "mem.md");
  });
});

// ============================================================
describe("BM25Index — 增量更新", () => {
  it("同路径 index → 更新不重复", () => {
    const idx = new BM25Index();
    idx.index(doc("a.md", "旧标题", "旧描述", ""));
    idx.index(doc("a.md", "新标题", "新描述", ""));
    assert.strictEqual(idx.size, 1); // 不是 2
    const r = idx.search("新标题");
    assert.strictEqual(r.length, 1);
  });

  it("rebuild 清空旧索引", () => {
    const idx = new BM25Index();
    idx.index(doc("old.md", "旧文档", "应该被清掉", ""));
    idx.rebuild([
      doc("n1.md", "新文档", "新内容", ""),
      doc("n2.md", "另文档", "另内容", ""),
    ]);
    assert.strictEqual(idx.size, 2);
    // "旧" 这个词在新文档中不存在
    const r = idx.search("旧");
    assert.strictEqual(r.length, 0);
  });

  it("remove 彻底删除", () => {
    const idx = new BM25Index();
    idx.index(doc("a.md", "独一无二的标签A", "XYZ12345", ""));
    idx.index(doc("b.md", "其他文档", "无关描述", ""));
    assert.strictEqual(idx.size, 2);
    idx.remove("a.md");
    assert.strictEqual(idx.size, 1);
    // "XYZ12345" 这个唯一词不应再存在于索引中
    const r = idx.search("XYZ12345");
    assert.strictEqual(r.length, 0);
  });
});

// ============================================================
describe("BM25Index — P1 验收", () => {
  it("\"sql\" 精确命中 \"java-sql-n-plus-1\"", () => {
    const idx = new BM25Index();
    idx.index(doc("java-sql-n-plus-1.md", "Java SQL N+1 优化", "避免 N+1 查询", ""));
    idx.index(doc("cache.md", "缓存策略", "Redis 缓存", ""));
    const r = idx.search("sql");
    assert.ok(r.length >= 1);
    assert.strictEqual(r[0].doc.fileName, "java-sql-n-plus-1.md");
  });

  it("搜索延迟 < 5ms（100 篇文档，100 次搜索）", () => {
    const idx = new BM25Index();
    for (let i = 0; i < 100; i++) {
      idx.index(doc(`b${i}.md`, `标题${i}`, `描述${i}`, `正文abcdefghijklmnopqrstuvwxyz`));
    }
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) idx.search("描述 标题 正文", 5);
    const avg = (performance.now() - t0) / 100;
    console.log(`  BM25 平均延迟: ${avg.toFixed(4)}ms`);
    assert.ok(avg < 5, `预期 <5ms，实际 ${avg.toFixed(2)}ms`);
  });
});
