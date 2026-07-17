# oc-plus 项目计划

> 状态：进行中 · 最后更新：2026-07-17

## 一、当前版本概览

| 模块 | 版本 | 状态 |
|------|------|------|
| 双星系统 | V3.4 | ✅ skill感知 + 修改审查 + agents-priority |
| 记忆管家 | V2.0 | ✅ 插件签名升级 + event hook 触发器匹配 |
| AGENTS.md | — | ✅ 持续维护 |
| CC 规则隔离 | — | ✅ |

---

## 二、记忆管家 — 待办

### 2.1 试运行验证（2026-07-17 结果）

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 插件加载 | ✅ | system.transform 正常触发，debug.log 有日志 |
| system.transform 注入 | ✅ | 规则和记忆已注入 system prompt |
| event hook 记录事件 | ✅ | events.log 已累积 40MB（4135 条） |
| LLM 自主学习 | ✅ **已修复并验证** | 连通性测试 HTTP 200 + 端到端测试 JSON 正常；`last-analysis.json` 已清零，重启 OC 即触发分析 |
| `/memories` 命令 | ⚠️ | CLI 脚本已部署、命令已配置，但模板有中文乱码 |
| 回应模式 | ⚠️ | 规则已注入但未实际验证效果 |

**修复内容**（V1.3.1）：
- `getApiConfig()` 中去掉 model 的 `my-deepseek:` 前缀，分析任务强制用 flash 模型
- API 调用增加 `thinking: { type: "disabled" }` 节省 token
- 增强错误日志：记录 HTTP 响应体前 500 字符
- 新增 `test-analyze.mjs` 端到端测试脚本（直接调 API 验证分析流程）
- 已通过连通性测试（HTTP 200）和端到端测试（JSON 正常返回）

### 2.2 替代升级路径 ✅ 已完成（2026-07-17）

**升级内容**（V2.0）：
1. ✅ `MemoriesPlugin` 签名从 `(ctx?)` 改为标准 `(input: PluginInput, options?) => Promise<Hooks>`
2. ✅ system.transform 中移除硬编码的「写完文件后调助理」规则（保留元知识记录和习惯确认）
3. ✅ event hook 中监听 `file.edited` / `tool.execute.after` → 解析 trigger 文件 glob 规则 → `client.session.promptAsync()` 注入消息
4. ✅ 回应逻辑不再依赖 task tool 调用助理，改由 event hook 自动触发

### 2.3 理想升级路径 📋

当 opencode SDK 支持 `client.agent.invoke({ agent: "助理", ... })` 时：

- 分析模式从 TypeScript fetch → 纯 agent 定义
- 分析逻辑与代码完全分离
- 不再需要 `prompts.ts`，prompt 直接写在 助理.md 的分析模式 section 中

---

## 三、双星系统 — 待办

### 3.1 V3.4 — skill 感知 + 修改审查（✅ 已完成 2026-07-17）

- [x] 双星 agent 新增 skill 感知：执行任务前先检查 available_skills
- [x] 双星 agent 新增修改审查：改前计划 + 改后验证
- [x] agents-priority 插件：确保 AGENTS.md 中文规范不被 omo-slim 英文 prompt 淹没
- [x] deploy.ps1 支持项目级记忆目录 + agents-priority 部署

### 3.2 V3.5 — 记忆集成优化

- [ ] 双星 agent prompt 中增加「参考记忆管家」指引：决策前检查 blocks/ 中是否有相关习惯
- [ ] 观察记忆管家 V1.3.1 LLM 分析修复后，blocks/ 和 triggers/ 的生成质量和频率
- [ ] 如果 triggers/ 生成了 auto 级别的习惯，验证双星是否正确执行

### 3.3 V4.0 — 深度集成方向

- [ ] **记忆驱动工作流**：双星启动时主动读取 blocks/ 中的知识记忆，作为决策上下文
- [ ] **自动化习惯执行**：auto 状态的习惯直接成为双星的默认行为，不再通过 question 工具确认
- [ ] **双星自身习惯学习**：observability — 记录双星的决策链（为什么选这个方案），用于回溯和优化
- [ ] **工匠 LSP 深度使用**：工匠目前有 LSP 权限但使用偏基础，补充 goToDefinition / callHierarchy 等用法的具体指导

### 3.4 已知问题

- [ ] opencode.json 中 `/memories` 命令 template 有中文乱码（PowerShell GBK 编码问题）

---

## 四、项目基础设施 — 待办

- [x] `doc/计划/README.md` 完善索引
- [x] 部署脚本 `deploy.ps1` 覆盖记忆管家 CLI 脚本和 prompts.ts
- [x] README.md 中记忆管家版本号更新为 V1.3
- [ ] 修复 opencode.json 中 `/memories` 命令模板乱码 => 转为 UTF-8
