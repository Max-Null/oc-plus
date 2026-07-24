<!-- type: knowledge --><!-- status: pending -->
<!-- description: OC-plus pipeline V2/V3 方向，V1 完成后展开 -->

## OC-plus Pipeline V2/V3 方向

### V2 — 非编程任务流水线模板

V1 统一使用编程任务模板（`pipeline-stage-designing.md` 只管 web-app/plugin）。V2 为 document/ppt/data 三类非编程任务提供专用阶段模板：

- **document 任务**（"写产品方案"）：DESIGNING = 确定大纲 + 章节要点。IMPLEMENTING = 逐节写 + 插图。DELIVERING = 格式审查。
- **ppt 任务**（"做 Q2 汇报 PPT"）：DESIGNING = 确定页数 + 每页主题。IMPLEMENTING = 逐页生成。DELIVERING = 视觉一致性检查。
- **data 任务**（"分析销售数据"）：DESIGNING = 确定分析维度 + 图表类型。IMPLEMENTING = 写查询 + 生成图表。DELIVERING = 数据准确性校验。

### V3 — 智能介入 vs 全程陪伴

当前 V1 流水线假设用户全程参与（每阶段有人确认）。V3 探索：哪些阶段可以纯自动？（如 simple 复杂度的 PLAN 阶段，Agent 自己拆 3 步计划，不打断用户）

### 其他开放项

- V5 设计文档 LLM 版同步：设计文档更新后自动重提取到 blocks/ 的完整实现
- 流水线面板在 GUI 中的可视化展示
- 对齐共识的质量自评（Agent 在输出时标注"我对这些决策的确定性：高/中/低"）
