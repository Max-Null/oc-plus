---
name: mxy-agents-migrate
description: >-
  AGENTS.md 记忆迁移——将场景触发的知识迁移到分形记忆块，精简 AGENTS.md 保留核心硬约束。
  支持初次迁移、增量审核、试运行三种模式。
  触发词：迁移记忆、AGENTS.md 转记忆、精简 AGENTS.md、记忆瘦身、检查记忆迁移增量。
---

# /mxy-agents-migrate — AGENTS.md → 分形记忆迁移

## 概念

AGENTS.md 内容分两类，分类依据是**文本特征**（不是语义判断）：

| 类 | 文本特征 | 目标 |
|----|---------|------|
| **硬约束** | 含"必须/不得/禁止/强制执行"；描述无条件行为规则（语言/注释/编码风格/查证要求） | 留在 AGENTS.md |
| **场景触发** | 含文件路径、工具名、git 命令、特定语法（Mermaid/MCP）；含"当…时/遇到…时"；是参考型内容而非行为规则 | 迁移到记忆块 |

**反例**：不要靠"这个知识每次都需要吗"来判断——LLM 不知道什么知识需要什么不需要。只看文本含不含场景标记词。

分形记忆是三阶检索系统：n-gram 关键词 → 双向语义向量 → LLM 多选重排。它检查最近 N 轮对话上下文，在 system.transform 中动态注入匹配的记忆块。

## 场景指纹（⭐⭐⭐ 核心）

记忆块的 `description` 字段不是人类可读摘要，是**分形检索的匹配指纹**。写不好 = 知识丢了。

### 指纹构造规则

从被迁移的 AGENTS.md 原文中提取以下元素，用 `|` 分隔拼接：

| 提取源 | 方法 | 示例 |
|--------|------|------|
| 章节标题中的名词 | 直接提取 | `文档目录` |
| 文中出现的目录/文件路径 | 去掉项目前缀，保留特征部分 | `doc/设计/` `doc/原型/` |
| 文中出现的工具/系统名 | 保留原名 | `GitHub MCP` `Mermaid` `git` |
| 文中出现的动词+宾语组合 | 用原文短语 | `合并冲突` `提交信息格式` |
| 文中出现的 `>` 引用块中的 CLI 命令 | 提取命令名 | `git pull` `git stash` |

**拼接格式**：

```
<!-- description: 文档目录结构 | doc/设计/ | doc/原型/ | 设计方案 | 原型文档 | 写文档 -->
<!-- description: GitHub 内容获取 | GitHub MCP | webfetch | github.com | github_ | PR | Issue -->
<!-- description: Mermaid 语法 | sequenceDiagram | flowchart | 时序图 | 流程图 | 图表 -->
<!-- description: git 合并冲突 | 合并冲突 | git merge | git diff | 冲突标记 | 三路合并 -->
```

### 指纹验证（必须执行）

写完 description 后，自问：如果一段对话出现以下任一关键词，这个记忆块应该被召回吗？

- 如果 YES → description 已覆盖这个关键词 ✅
- 如果 NO → 这个关键词不需要加入
- 如果"应该召回但 description 没有" → 补充

## 增量检测（A+B 互备）

### 方案 A：迁移日志（主）

精简后的 AGENTS.md 顶部保留迁移日志注释块。这是增量的判断基线。

```html
<!-- ⚠️ 以下内容已迁移到分形记忆，此注释块不可删除 -->
<!-- 迁移时间: 2025-07-21 | 迁移行数: 60 | 记忆块数: 7 -->
<!--   - oc-memory-write-format → ~/.config/opencode/memories/blocks/oc-memory-write-format.md -->
<!--   - vue3-coding-conventions → ~/.config/opencode/memories/blocks/vue3-coding-conventions.md -->
<!--   - scss-coding-style → ~/.config/opencode/memories/blocks/scss-coding-style.md -->
<!--   - mermaid-syntax → ~/.config/opencode/memories/blocks/mermaid-syntax.md -->
<!--   - git-operations → ~/.config/opencode/memories/blocks/git-operations.md -->
<!--   - doc-directory-structure → .opencode/memories/blocks/doc-directory-structure.md -->
<!--   - github-content-access → ~/.config/opencode/memories/blocks/github-content-access.md -->
```

增量检测：对比当前 AGENTS.md 和迁移日志中列出的记忆块主题——AGENTS.md 中出现了新章节/新内容但日志中无对应记忆块 = 增量。

### 方案 B：记忆目录反向匹配（容错）

迁移日志被误删时，扫描记忆目录，提取每个 `.md` 的 `description` 中首个关键词段（第一个 `|` 之前），在 AGENTS.md 中搜索该关键词。搜不到 = 该内容已迁移；搜到 = AGENTS.md 仍有残留（可能是日志丢失后的同步问题）。

### 增量审核流程

```
1. 读 AGENTS.md 全文 → 优先找迁移日志注释块
2. 日志存在：
   a. 提取日志中的记忆块主题列表
   b. diff AGENTS.md 当前文本和日志主题 → 标记新增章节
   c. 仅对新增章节做分类和迁移建议
3. 日志不存在（被误删）：
   a. 扫描记忆目录，提取 description 关键词
   b. 反向匹配 AGENTS.md，标记已迁移的残留内容（建议清理）
   c. 标记 AGENTS.md 中未被任何记忆块覆盖的新内容（建议迁移）
4. 输出增量报告 + 建议操作
```

## 工作流

### 模式 1：初次迁移

```
1. 读 ~/.config/opencode/AGENTS.md 全文
2. 逐章按分类规则标记：硬约束(H) / 场景触发(S) / 混合需拆分(M)
3. 对 S 和 M 中的场景部分：
   a. 判断目标目录（全局 vs 项目级，见下）
   b. 生成记忆块文件名
   c. 构造场景指纹 description
   d. 写记忆块正文（事实→原则→反例→结论，≤15行）
4. 生成精简版 AGENTS.md（仅保留 H + M 中的硬约束部分）
   - 顶部追加迁移日志注释块
   - 保留原章节顺序
5. 展示变更摘要（不允许写盘）：
   | 类别 | 数量 | 说明 |
   |------|------|------|
   | 保留 | N 节 | 硬约束，留在 AGENTS.md |
   | 迁移 | M 节 | 场景触发，生成 M 个记忆块 |
   | 拆分 | K 节 | 含混合内容，部分保留部分迁移 |
   | 精简率 | X% | 原 L1 行 → 精简后 L2 行 |
6. **必须调用 question 工具**确认："以上变更摘要，是否执行？"
   选项：执行迁移 / 试运行（只展示不写盘） / 取消
```

### 模式 1.5：迁移前审查（硬约束，不可跳过）

展示完整迁移内容后、用户确认「执行迁移」时，**必须先审查再写盘**。

审查三个维度：

#### 维度一：指纹覆盖检查

对每个记忆块的 `description`，逐条验证：

| 检查项 | 方法 |
|--------|------|
| 是否覆盖了原文中所有文件路径？ | grep 原文中的 `/` 路径 → 确认 description 有对应关键词 |
| 是否覆盖了原文中所有工具/系统名？ | grep 原文中的大写驼峰词（Mermaid/GitHub/MCP）→ 确认 description 有 |
| 是否覆盖了触发该规则的动词短语？ | 从章节标题和首句提取动作词 → 确认 description 有 |
| 是否有过宽泛的通用词？ | 如 `style`/`CSS` → 标注为低风险，不阻塞但记录 |

#### 维度二：内容完整性检查

对照原 AGENTS.md 原文，逐块确认：

- 每个「原则」是否能在原文中找到对应行？
- 原文中的每个关键规则是否至少出现在一个记忆块中？
- 精简版 AGENTS.md 是否漏掉了任何硬约束行？

#### 维度三：等效性检查

- 精简后的 AGENTS.md + 所有记忆块 ≈ 原 AGENTS.md 的完整行为
- 记忆块的结论行是否足够指导 LLM 在召回后正确执行？
- 「主动告知用户」类副作用规则是否被保留？

输出审查报告格式：

```
## 迁移审查报告

| 记忆块 | 指纹覆盖 | 内容完整性 | 等效性 | 问题 |
|--------|---------|-----------|--------|------|
| xxx | ✅ | ✅ | ✅ | — |
| yyy | ⚠️ 缺 X | ✅ | ✅ | 建议追加 X |

### 阻断项：0  建议修复项：N

结论：[可以直接迁移 / 建议先修 N 个问题再迁]
```

7. **必须调用 question 工具**二次确认：
   "审查完成，共修复 N 个问题。是否写入磁盘？"
   选项：写入 / 取消
8. 确认后写盘：
   a. 修复审查中发现的 ⚠️ 问题（直接改记忆块正文和 description）
   b. 写记忆块到目标目录
   c. 写精简版 AGENTS.md

### 模式 2：增量审核（默认模式）

当 AGENTS.md 已有迁移日志注释块时自动选择此模式。

```
1. 读 AGENTS.md + 扫描记忆目录
2. 执行增量检测（A+B 互备）
3. 输出增量报告：
   | 类型 | 章节 | 当前状态 | 建议操作 |
   |------|------|---------|---------|
   | 新增 | 第X节 | AGENTS.md 有此章但日志无记录 | 生成新记忆块 |
   | 残留 | 第Y节 | 记忆有此内容但 AGENTS.md 未删除 | 从 AGENTS.md 清理 |
4. **必须调用 question 工具**确认
```

### 模式 3：试运行

用户说"试运行"或"先看看效果"时启用。流程同初次迁移，但步骤 6 改为只展示精简版 AGENTS.md 全文预览和所有记忆块内容预览，不写盘。

## 输出路径

| 内容特征 | 目标目录 | 示例 |
|---------|---------|------|
| 仅涉及 oc-plus 项目（含"OC""分形""双星"等） | `.opencode/memories/blocks/` | 项目结构约定 |
| 涉及 OC 通用机制或跨项目可用 | `~/.config/opencode/memories/blocks/` | Mermaid 语法、GitHub MCP 用法 |
| 不确定 → **问用户** | — | — |

## 记忆块格式

对齐分形插件 `lib/prompts.ts` 的标准格式：

```markdown
<!-- type: knowledge -->
<!-- label: 标签名（用于系统去重，缺省时用文件名） -->
<!-- status: auto -->
<!-- description: 关键词1 | 关键词2 | 关键词3 -->
<!-- confidence: high | medium | low（可选） -->
<!-- confidence_reason: 置信度判断依据（可选） -->
<!-- suggested_status: suggest | auto（仅 pending 时有） -->

**事实**：这条规则描述的现象或数据是什么
**原则**：什么时候用、怎么用
**反例**：❌ 错误做法 → ✅ 正确做法（如有）
**结论**：记住的要点一句话
```

硬约束：
- 正文 ≤ 15 行
- 必填元数据：`type` / `label` / `status` / `description`
- `description` 用 `|` 分隔的关键词指纹，不用自然语言摘要
- 正文结构用加粗标记：`**事实**：` `**原则**：` `**反例**：` `**结论**：`
- 分形 `parseMeta` 仅解析前 150 字符，元数据行不宜过长
- 文件名小写英文 + 连字符，禁止中文

## 注意事项

- **不重复迁移**：写记忆块前检查目标目录是否已有同名/o文件，如有 → 标记为"可能重复，需用户确认"
- **等效性检查**：迁移后，原 AGENTS.md 中每条场景触发规则必须在某个记忆块的正文中找到对应内容。不丢规则。
- **迁移日志不可删**：精简后的 AGENTS.md 顶部注释块是增量检测基线，在精简版正文前追加注释说明其重要性
- **记忆块文件名必须英文**：用小写英文 + 连字符，禁止中文文件名。兼容性和 grep 均可达。
- **不迁移硬约束**：如果分类有争议（某个章节同时含有路径和"必须"），倾向保留在 AGENTS.md
