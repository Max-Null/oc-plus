/**
 * 分形知识引擎 — TAP13 测试
 *
 * BM25 基本索引 + CJK 2-gram + 增量更新 + P1 验收 + 引擎集成测试
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { BM25Index, type SearchDoc } from "./bm25.js";
import { KnowledgeEngine, type BlockMeta } from "./engine.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function doc(filePath: string, title: string, desc: string, body: string = ""): SearchDoc {
  return { filePath, fileName: filePath.split("/").pop() || filePath, title, description: desc, body };
}

// ============================================================
// Suite 1: BM25Index — 基本索引
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
    assert.strictEqual(r[0].doc.fileName, "b.md");
  });
});

// ============================================================
// Suite 2: CJK 2-gram
// ============================================================
describe("BM25Index — CJK 2-gram", () => {
  it("精确中文词匹配", () => {
    const idx = new BM25Index();
    idx.index(doc("slow.md", "慢查询优化", "慢查询排查指南", ""));
    idx.index(doc("cache.md", "缓存策略", "Redis 缓存", ""));
    const r = idx.search("慢查询");
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].doc.fileName, "slow.md");
  });

  it("部分中文片段匹配（N-gram 功劳）", () => {
    const idx = new BM25Index();
    idx.index(doc("perf.md", "性能优化", "Java 后端性能优化", "包含响应变慢的排查"));
    idx.index(doc("deploy.md", "部署流程", "自动部署", ""));
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
// Suite 3: 增量更新
// ============================================================
describe("BM25Index — 增量更新", () => {
  it("同路径 index → 更新不重复", () => {
    const idx = new BM25Index();
    idx.index(doc("a.md", "旧标题", "旧描述", ""));
    idx.index(doc("a.md", "新标题", "新描述", ""));
    assert.strictEqual(idx.size, 1);
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
    const r = idx.search("XYZ12345");
    assert.strictEqual(r.length, 0);
  });
});

// ============================================================
// Suite 4: P1 验收
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

// ============================================================
// Suite 5: KnowledgeEngine 集成
// ============================================================
describe("KnowledgeEngine — 引擎集成", () => {
  let tmpDir: string;

  function setupTmpDir() {
    tmpDir = path.join(os.tmpdir(), `ke-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  function teardownTmpDir() {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }

  function writeBlock(name: string, label: string, desc: string, body: string = "", status: string = "auto") {
    const content = `<!-- type: knowledge --><!-- status: ${status} --><!-- label: ${label} --><!-- description: ${desc} -->\n\n${body}`;
    fs.writeFileSync(path.join(tmpDir, name), content, "utf-8");
  }

  it("扫描空目录 → 0 文档", () => {
    setupTmpDir();
    try {
      const engine = new KnowledgeEngine([tmpDir]);
      engine.init();
      assert.strictEqual(engine.stats().totalBlocks, 0);
      assert.strictEqual(engine.list().length, 0);
      assert.deepStrictEqual(engine.search("test"), []);
    } finally {
      teardownTmpDir();
    }
  });

  it("扫描含 md 目录 → 正确解析元数据", () => {
    setupTmpDir();
    try {
      writeBlock("java-sql.md", "Java SQL N+1", "避免 N+1 查询", "正文内容");
      writeBlock("cache.md", "缓存策略", "Redis 缓存", "");

      const engine = new KnowledgeEngine([tmpDir]);
      engine.init();

      const stats = engine.stats();
      assert.strictEqual(stats.totalBlocks, 2);
      assert.strictEqual(stats.indexed, 2);

      const list = engine.list();
      assert.strictEqual(list.length, 2);
      // 不假设排序（fs.readdirSync 顺序随 OS）
      const sqlBlock = list.find(b => b.label === "Java SQL N+1");
      assert.ok(sqlBlock, "应找到 Java SQL N+1");
      assert.strictEqual(sqlBlock!.body, "正文内容");
    } finally {
      teardownTmpDir();
    }
  });

  it("无 description 的 block 不参与搜索", () => {
    setupTmpDir();
    try {
      writeBlock("empty.md", "空描述", "", "正文");
      writeBlock("has.md", "有描述", "有描述内容", "");

      const engine = new KnowledgeEngine([tmpDir]);
      engine.init();

      const stats = engine.stats();
      assert.strictEqual(stats.totalBlocks, 2);
      assert.strictEqual(stats.indexed, 1);

      const r = engine.search("描述", 5);
      assert.strictEqual(r.length, 1);
      assert.strictEqual(r[0].doc.label, "有描述");
    } finally {
      teardownTmpDir();
    }
  });

  it("多目录合并 → 全局同名覆盖项目级", () => {
    const tmpDir2 = path.join(os.tmpdir(), `ke-test-${Date.now()}-global`);
    try {
      setupTmpDir();
      fs.mkdirSync(tmpDir2, { recursive: true });

      writeBlock("readme.md", "README", "项目级描述", "项目正文");
      const globalBlock = path.join(tmpDir2, "readme-global.md");
      fs.writeFileSync(globalBlock, "<!-- type: knowledge --><!-- status: auto --><!-- label: README --><!-- description: 全局级描述 -->\n\n全局正文", "utf-8");

      const engine = new KnowledgeEngine([tmpDir, tmpDir2]);
      engine.init();

      assert.strictEqual(engine.stats().totalBlocks, 1);
      const list = engine.list();
      assert.strictEqual(list[0].description, "全局级描述");
    } finally {
      teardownTmpDir();
      try { fs.rmSync(tmpDir2, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it("refresh 重建索引 → 新文件可搜，旧文件消失", () => {
    setupTmpDir();
    try {
      writeBlock("old.md", "独一无二的旧标签", "旧描述内容", "旧正文");
      const engine = new KnowledgeEngine([tmpDir]);
      engine.init();

      let r = engine.search("独一无二", 5);
      assert.strictEqual(r.length, 1);

      fs.rmSync(path.join(tmpDir, "old.md"));
      writeBlock("new.md", "替换后的新标签", "新描述内容", "新正文");
      engine.refresh();

      r = engine.search("独一无二", 5);
      assert.strictEqual(r.length, 0);
      r = engine.search("替换后", 5);
      assert.strictEqual(r.length, 1);
    } finally {
      teardownTmpDir();
    }
  });

  it("search 不存在的词 → 返回空数组", () => {
    setupTmpDir();
    try {
      writeBlock("test.md", "测试", "测试描述", "测试正文");
      const engine = new KnowledgeEngine([tmpDir]);
      engine.init();

      const r = engine.search("xyznotexist12345", 5);
      assert.deepStrictEqual(r, []);
    } finally {
      teardownTmpDir();
    }
  });

  it("KnowledgeEngine.scanDir 静态方法可用", () => {
    setupTmpDir();
    try {
      writeBlock("a.md", "A", "A desc", "");
      writeBlock("b.md", "B", "B desc", "");
      const entries = KnowledgeEngine.scanDir(tmpDir);
      assert.strictEqual(entries.length, 2);
    } finally {
      teardownTmpDir();
    }
  });

  it("KnowledgeEngine.parseMeta 静态方法可用", () => {
    const content = "<!-- type: knowledge --><!-- status: auto --><!-- label: Test -->\n\n正文";
    const meta = KnowledgeEngine.parseMeta(content);
    assert.notStrictEqual(meta, null);
    assert.strictEqual(meta!.type, "knowledge");
    assert.strictEqual(meta!.label, "Test");
  });
});
