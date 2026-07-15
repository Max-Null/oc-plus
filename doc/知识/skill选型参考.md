# Skill 选型参考

> 生成时间：2026-07-15 | 环境：Oh My OpenCode Slim | 技能总数：35

---

## 一、技能总览（按来源分组）

### 1.1 Anthropic 原始技能（Apache 2.0）

由 Anthropic 为 Claude Code 创建的官方技能，oh-my-opencode-slim 从上游收录。

| 技能 | 用途 | 触发场景 |
|------|------|---------|
| `algorithmic-art` | p5.js 生成艺术（流场、粒子系统） | 用户要求"用代码创作艺术""生成艺术""流场""粒子系统" |
| `canvas-design` | 海报/设计稿等静态视觉作品（.png/.pdf） | "创建海报""设计一个作品""做张图" |
| `internal-comms` | 内部通讯撰写（状态报告/领导层更新/FAQ/事件报告） | "写周报""写项目更新""起草公告""写事件报告" |
| `mcp-builder` | MCP Server 开发（Python FastMCP / Node MCP SDK） | "开发 MCP Server""接入外部 API""创建 MCP 工具" |
| `slack-gif-creator` | Slack 优化动画 GIF（尺寸/帧率约束） | "做个 Slack GIF""给 Slack 做动画""表情包 GIF" |
| `theme-factory` | 为幻灯片/文档/网页应用预置主题（10套色彩+字体） | "换个主题""应用配色""统一样式" |
| `web-artifacts-builder` | 复杂 HTML 组件构建（React + Tailwind + shadcn/ui） | "做个交互页面""复杂前端组件" |
| `webapp-testing` | Playwright 本地 Web 应用测试（截图/调试/日志） | "测试前端功能""截浏览器截图""调试 UI" |

### 1.2 MiniMaxAI 独立发布（MIT）

MiniMaxAI 发布的文档生成三件套，oh-my-opencode-slim 收录。

| 技能 | 用途 | 触发场景 |
|------|------|---------|
| `minimax-docx` | Word 文档创建/编辑/格式化（OpenXML SDK） | "生成 Word 报告""填充合同模板""格式化 docx" |
| `minimax-pdf` | 高质量 PDF 生成/填充/重排版（token 化设计系统） | "生成精美 PDF""做简历 PDF""重排版文档" |
| `minimax-xlsx` | Excel 创建/读取/编辑/公式验证 | "生成 Excel""分析表格""做数据透视表""财务模型" |

### 1.3 社区个人贡献（MIT）

| 技能 | 用途 | 作者 | 触发场景 |
|------|------|------|---------|
| `agent-skill-creator` | 从工作流描述创建跨平台 Agent Skill | Francy Lisboa Charuto | "创建 Agent""自动化工作流""定制 Skill""导出技能" |
| `pptx-generator` | PPT 生成/编辑/读取（PptxGenJS + XML 工作流） | 社区贡献 | "生成 PPT""做幻灯片""修改 PPT""提取 PPT 文字" |

### 1.4 oh-my-opencode-slim 自建（协议未声明）

oh-my-opencode-slim 项目自身创建的编排/辅助类技能。

| 技能 | 用途 | 触发场景 |
|------|------|---------|
| `clonedeps` | 将项目依赖源码克隆到本地供 OpenCode 检查 | "克隆依赖""查看 SDK 源码""调试库内部实现" |
| `codemap` | 为不熟悉的仓库生成层级代码地图（高成本） | "了解这个仓库""生成代码地图""画项目结构" |
| `deepwork` | 大型高风险多阶段编码工作流编排 | "大规模重构""跨系统迁移""多阶段项目" |
| `doc-coauthoring` | 结构化协同撰写文档（提案/技术规格/决策记录） | "写设计文档""起草提案""写技术方案""PRD" |
| `oh-my-opencode-slim` | 配置和调优 opencode 自身（agents/models/prompts） | "调整 Agent""换模型""改 prompt""优化配置" |
| `reflect` | 回顾工作模式，识别重复摩擦，建议可复用改进 | "回顾最近工作""优化工作流""有什么可改进的" |
| `release-smoke-test` | oh-my-opencode-slim 发布前冒烟测试 | "测试发布候选版""验证插件包" |
| `simplify` | 简化代码提升可读性，不改变行为 | "简化代码""重构可读性""减少复杂度" |
| `verification-planning` | 非平凡编码工作的验证计划制定 | "制定测试计划""验证方案""怎么测试这个改动" |
| `worktrees` | Git worktree 管理，为复杂/并行工作提供隔离编码通道 | "并行开发""隔离实验""worktree 管理" |

### 1.5 用户自定义技能（协议未声明）

个人创建的开发效率工具集（mxy- 前缀系列）。

| 技能 | 用途 | 触发场景 |
|------|------|---------|
| `mxy-commit-review` | 代码审查→修复→二次审查→提交信息→推送 | "提交代码""审查代码""提交前检查" |
| `mxy-design-doc` | 生成/更新功能设计方案文档和产品原型文档 | "写设计方案""设计文档""原型文档""出方案" |
| `mxy-git-pull` | 拉取当前分支最新代码并总结变更内容 | "拉代码""拉取最新""更新代码" |
| `mxy-organize-code` | 函数/变量增加注释并按标准分层重新排序 | "整理代码""代码排序""补注释" |
| `mxy-organize-scss` | stylelint 诊断 SCSS + 修复 + 中文注释 | "整理样式""规范 SCSS""补样式注释" |
| `mxy-pptx-slim` | 压缩 PPTX 中视频/GIF/PNG，显著减小体积 | "PPT 太大了""压缩 PPT""PPT 瘦身" |
| `mxy-update-docs` | 根据项目实际更新 AGENTS.md 并同步 README.md | "更新项目文档""同步 README" |
| `mxy-upgrade-vue3` | Vue2 Options API → Vue3 `<script setup lang="ts">` 迁移 | "升级 Vue3""迁移 Vue2 代码""转换 Options API" |

### 1.6 教学示例（agent-skill-creator 内置）

| 技能 | 用途 | 协议 | 触发场景 |
|------|------|------|---------|
| `pr-blocker-summarizer` | PR 阻塞情况站会摘要 | MIT | "汇总 PR""PR 阻塞报告" |
| `stock-analyzer` | 股票/ETF 技术分析（RSI/MACD/布林带） | 未声明 | "分析股票""技术指标""交易信号" |
| `weekly-crm-report` | CRM 周报清洗和区域销售汇总 | MIT | "清洗 CRM""区域销售汇总""周报生成" |

### 1.7 系统内建

| 技能 | 用途 | 协议 | 触发场景 |
|------|------|------|---------|
| `customize-opencode` | 编辑 opencode 自身配置（agents/skills/MCP/权限） | 内建 | "配置 opencode""添加 Agent""修改权限规则" |

---

## 二、按场景快速选型

### 前端开发

| 场景 | 推荐技能 |
|------|---------|
| Vue 组件代码整理 | `mxy-organize-code` |
| Vue2 → Vue3 升级 | `mxy-upgrade-vue3` |
| SCSS 规范整理 | `mxy-organize-scss` |
| UI 复杂组件开发 | `web-artifacts-builder` |
| 前端交互测试 | `webapp-testing` |

### 文档/产出物

| 场景 | 推荐技能 |
|------|---------|
| 技术设计方案 | `mxy-design-doc` |
| 技术提案/决策记录 | `doc-coauthoring` |
| Word 报告/合同 | `minimax-docx` |
| 精美 PDF/简历 | `minimax-pdf` |
| Excel 数据/模型 | `minimax-xlsx` |
| PPT 演示 | `pptx-generator` |
| PPT 压缩瘦身 | `mxy-pptx-slim` |
| 项目文档同步 | `mxy-update-docs` |

### Git / 代码管理

| 场景 | 推荐技能 |
|------|---------|
| 拉取并总结代码 | `mxy-git-pull` |
| 代码审查+提交 | `mxy-commit-review` |
| 并行开发/隔离实验 | `worktrees` |

### 工程与架构

| 场景 | 推荐技能 |
|------|---------|
| 大规模重构 | `deepwork` |
| 代码可读性优化 | `simplify` |
| 验证方案制定 | `verification-planning` |
| 了解陌生仓库 | `codemap` |
| 查看依赖源码 | `clonedeps` |
| 配置调优 opencode | `oh-my-opencode-slim` |
| 工作流回顾优化 | `reflect` |

### 工具开发

| 场景 | 推荐技能 |
|------|---------|
| 定制 Agent Skill | `agent-skill-creator` |
| 开发 MCP Server | `mcp-builder` |

### 设计/视觉

| 场景 | 推荐技能 |
|------|---------|
| 海报/静态设计 | `canvas-design` |
| 代码生成艺术 | `algorithmic-art` |
| 视觉主题应用 | `theme-factory` |
| Slack GIF | `slack-gif-creator` |

---

## 三、协议分布

| 协议 | 数量 | 技能 |
|------|------|------|
| Apache 2.0 | 8 | algorithmic-art, canvas-design, internal-comms, mcp-builder, slack-gif-creator, theme-factory, web-artifacts-builder, webapp-testing |
| MIT | 7 | agent-skill-creator, minimax-docx, minimax-pdf, minimax-xlsx, pptx-generator, pr-blocker-summarizer, weekly-crm-report |
| 内建 | 1 | customize-opencode |
| 未声明 | 19 | clonedeps, codemap, deepwork, doc-coauthoring, mxy-commit-review, mxy-design-doc, mxy-git-pull, mxy-organize-code, mxy-organize-scss, mxy-pptx-slim, mxy-update-docs, mxy-upgrade-vue3, oh-my-opencode-slim, reflect, release-smoke-test, simplify, stock-analyzer, verification-planning, worktrees |
