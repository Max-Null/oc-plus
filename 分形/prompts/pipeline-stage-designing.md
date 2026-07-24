# 设计阶段启动指令

行为前门对齐完成后，注入到 system.transform 的设计阶段启动 prompt。

## 触发条件

`AlignmentContext` 已提取 → `state.currentStage === "designing"` → system.transform 注入。

## Prompt 模板

根据 `taskType` 和 `complexity` 生成差异化指令：

### web-app 任务

```markdown
行为前门对齐完成。现在进入**设计阶段**。

任务类型：Web 应用 | 复杂度：{complexity}

请使用 `mxy-design-doc` skill 为「{feature}」创建设计方案。

产出要求：
- 设计方案文档（doc/设计/{feature}.md）：技术架构 + 组件树 + 接口定义 + 数据模型 + 测试策略
- 原型文档（doc/原型/{feature}.md）：页面结构 + 交互流程 + 状态说明

{如果 complexity === "simple"：功能简单，1-2 段要点即可，不需要完整模板。}

完成后输出「### 设计完成」信号。
```

### plugin 任务

```markdown
行为前门对齐完成。现在进入**设计阶段**。

任务类型：插件/工具 | 复杂度：{complexity}

请使用 `mxy-design-doc` skill 为「{feature}」创建设计方案。

产出要求：
- 设计方案文档（doc/设计/{feature}.md）：模块架构 + 接口定义 + 配置项 + 测试策略
- 无需原型文档

{如果 complexity === "simple"：功能简单，1-2 段要点即可，不需要完整模板。}

完成后输出「### 设计完成」信号。
```

### document 任务

```markdown
行为前门对齐完成。现在进入**设计阶段**。

任务类型：文档 | 复杂度：{complexity}

请为「{feature}」规划文档结构：

产出要求：
- 确定大纲（章节层级）
- 确定每节要点（1-2 句摘要）
- 确定需要的参考源（如代码、API 文档等）

产出文件：doc/设计/{feature}.md（以大纲 + 要点形式）

完成后输出「### 设计完成」信号。
```

### ppt 任务

```markdown
行为前门对齐完成。现在进入**设计阶段**。

任务类型：PPT | 复杂度：{complexity}

请为「{feature}」规划演示文稿结构：

产出要求：
- 确定页数和每页主题
- 确定每页的内容类型（标题页/数据图表/对比表/总结页）
- 确定视觉风格方向（色系、字体建议）

产出文件：doc/设计/{feature}.md（以页结构 + 内容类型形式）

完成后输出「### 设计完成」信号。
```

### data 任务

```markdown
行为前门对齐完成。现在进入**设计阶段**。

任务类型：数据分析 | 复杂度：{complexity}

请为「{feature}」规划分析方案：

产出要求：
- 确定分析维度（按什么分组、对比什么）
- 确定图表类型（折线/柱状/饼图/散点）
- 确定数据源路径和格式

产出文件：doc/设计/{feature}.md（以分析计划 + 图表清单形式）

完成后输出「### 设计完成」信号。
```
