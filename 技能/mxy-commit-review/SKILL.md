---
name: mxy-commit-review
description: 代码审查 + 修复问题 + 二次审查 + 生成提交信息 + 提交并推送，完整的提交前工作流。自适应 Java/Python/Vue3 项目
---

请严格执行以下步骤，不得跳过任何一步。每步完成后简要告知用户当前进度。

## 步骤 0：识别项目类型

执行以下命令，根据项目特征文件自动判断技术栈（可能是组合）：

```bash
ls pom.xml build.gradle build.gradle.kts 2>/dev/null && echo "JAVA" || true
ls requirements.txt pyproject.toml setup.py Pipfile 2>/dev/null && echo "PYTHON" || true
ls package.json 2>/dev/null && echo "NODE" || true
```

再检查改动文件的后缀名辅助判断：

```bash
git diff --name-only HEAD 2>/dev/null || git diff --name-only --staged
```

根据检测结果启用对应的审查检查点：

| 特征文件 | 判定 | 启用检查集 |
|----------|------|-----------|
| `pom.xml` / `build.gradle` | Java 后端 | Java |
| `requirements.txt` / `pyproject.toml` | Python 项目 | Python |
| `package.json` + `*.vue` 改动 | Vue3 前端 | Vue3 |
| `package.json` + `*.ts`/`*.tsx`（无 `*.vue`） | TypeScript 项目 | Vue3（通用前端子集） |
| 以上特征文件混合存在 | 多技术栈项目 | 根据改动文件后缀匹配对应检查集 |

向用户确认识别结果（如"检测到 Java + Vue3 混合项目，本次改动涉及 Java 文件 3 个、Vue 文件 2 个"），然后继续。

## 步骤 1：获取改动信息

```bash
git status
```

```bash
git diff --staged
```

```bash
git diff
```

```bash
git branch --show-current
```

若无任何改动（工作区干净），告知用户"当前没有需要提交的改动"并终止流程。

## 步骤 2：初次审查（原始改动）

对全部改动（staged + unstaged），按以下五维度框架审查。每个维度先检查**通用项**，再根据步骤 0 识别的技术栈检查**特定项**。

### 2.1 正确性

#### 通用
- 逻辑错误、空指针/null/undefined/None 访问、边界条件遗漏、竞态条件
- 类型使用是否正确、API/函数返回值是否正确处理
- 异常/错误处理是否完整（不吞异常、有兜底逻辑）

#### Java
- NPE 风险：Stream/Collection 操作前是否判空、Optional 是否正确解包、`getById()` / `getOne()` 返回值是否判空
- 事务边界：`@Transactional` 方法中是否有不必要的远程调用、自调用失效问题
- 并发安全：`HashMap` vs `ConcurrentHashMap`、`SimpleDateFormat` 线程安全问题
- 资源释放：IO 流/连接是否在 finally 或 try-with-resources 中关闭
- **DTO/Entity 类型一致性**：DTO 字段类型是否与 Entity 对应字段一致？不一致时 MyBatis TypeHandler 可能匹配失败（如 `LocalDate` vs `Date`、`Long` vs `Integer`）。`LambdaUpdateWrapper.set()` 接受 Object 可编译通过，风险在运行时才暴露

#### Python
- None 访问：字典 key 不存在、对象属性不存在时的默认值处理
- 可变默认参数：函数参数默认值是否用了 `[]` / `{}`（应使用 `None`）
- 异步陷阱：`async` 函数内是否有同步阻塞调用、协程是否正确 `await`
- 类型安全：动态类型场景下的类型假设是否安全、是否有类型守卫

#### Vue3
- 响应式丢失：`reactive` 对象解构、`props` 解构是否丢失响应式
- 异步间隙：`await` 后 DOM 状态是否仍有效（组件是否已卸载）
- 模板安全：`v-if`/`v-for` 优先级、`v-model` 双向绑定是否正确
- 生命周期：`onMounted` 中的异步操作是否在 `onUnmounted` 中取消

### 2.2 安全性

#### 通用
- 敏感信息泄露（日志/错误消息/返回值中泄露 token/密码/key）
- 用户输入未校验、未转义
- URL 参数/路径中的敏感数据处理

#### Java
- SQL 注入：MyBatis `${}` vs `#{}`、JDBC 拼接 SQL
- SSRF：用户可控的 URL 请求是否有白名单校验
- 反序列化：是否接收不可信来源的序列化对象
- 权限控制：Controller 是否缺少 `@PreAuthorize` / 权限注解
- 敏感配置：`application.yml` 中的密码是否硬编码

#### Python
- 命令注入：`os.system()` / `subprocess` 参数是否来自用户输入
- 代码注入：`eval()` / `exec()` 的使用是否必要且安全
- 反序列化：`pickle.load()` 是否处理不可信数据
- LangChain 工具参数注入：Agent tool 的输入是否经校验
- API Key 管理：模型 API key 是否硬编码或打印到日志

#### Vue3
- XSS：`v-html` / `innerHTML` / `document.write()` 的内容是否来自用户
- Token 泄露：`localStorage` 中的 token 是否在 XSS 攻击面内
- URL 敏感参数：`token`/`code` 是否在跳转/分享时泄露到外部
- 依赖安全：npm 包是否有已知漏洞（不检查 CVE 数据库，仅关注代码中不安全用法）

### 2.3 性能

#### 通用
- 不必要的循环/嵌套循环、可缓存但重复计算的值
- 内存泄漏风险（未清理的定时器/监听器/订阅/Observer）

#### Java
- N+1 查询：循环内调用 Mapper/Repository、未使用批量查询
- 大事务：事务方法内包含外部 IO 调用、邮件发送等长时间操作
- 缓存缺失：热点数据是否缺少本地缓存/Redis 缓存
- Stream 滥用：简单循环用 Stream 反而降低可读性和性能

#### Python
- 同步阻塞：`requests` 等同步 IO 在 async 上下文中阻塞事件循环
- LLM 调用效率：LangChain 链中是否有重复/冗余的模型调用
- 生成器使用：大数据集是否用生成器而非一次性加载到内存
- 线程安全：多线程下共享状态的锁粒度是否合理

#### Vue3
- 响应式开销：`computed` vs `watch` 选择是否合理、是否深层 watch 大对象
- 组件渲染：大列表是否缺少虚拟滚动、是否不必要的重渲染
- DOM 操作：是否直接操作 DOM 而非使用 Vue 模板机制
- 资源清理：`setInterval`/`addEventListener`/`ResizeObserver` 是否在 `onUnmounted` 清理

### 2.4 可读性

#### 通用
- 命名是否清晰准确（变量/函数/类名反映其职责）
- 注释是否缺少或过时（重点解释 WHY，不解释 WHAT）
- 结构是否合理（函数/类长度、单一职责）

#### Java
- 分层职责：Controller 是否包含业务逻辑、Service 是否越界处理 HTTP 层事务
- 魔法值：硬编码的数字/字符串是否应提取为常量或枚举
- 异常处理：是否滥用 `catch (Exception e)`、异常消息是否有用
- Lombok 使用：`@Data` 是否过度暴露、`@Builder` 是否适合该场景
- **注入风格一致性**：新增字段的依赖注入注解（`@Autowired` / `@Resource`）是否与类中已有字段一致
- **注释-代码一致性**：注释中描述的逻辑（如"脱敏某字段"）是否与代码实现一致（是否真的操作了该字段）；修改代码时是否同步更新了关联注释

#### Python
- 函数复杂度：单函数是否过长（> 50 行应拆分）
- 类型注解：公开函数/方法是否有类型注解和 docstring
- LangChain/Graph 命名：节点名/边名/tool 名是否反映其语义而非技术细节
- 导入规范：是否存在 `import *`、循环导入风险

#### Vue3
- 编码约定：是否符合项目 AGENTS.md 的硬约束（组件 ref 命名、自适应弹窗模式等）
- 模板复杂度：模板中是否有复杂的三元表达式/内联逻辑（应抽 computed）
- 文件结构：`<script setup>` 中变量/函数/生命周期是否按逻辑分组
- Props/Emits：是否使用 TypeScript 类型定义而非运行时校验

### 2.5 复用性

#### 通用
- 是否存在重复代码（同一文件内或跨文件的相似逻辑块）
- 是否应该抽取公共函数/方法/组件

#### Java
- 工具类：是否有分散在各 Service 中的相同工具逻辑
- 跨 Service 查询：是否有重复的数据库查询/组装逻辑
- DTO 转换：是否有重复的 Entity→VO 转换代码

#### Python
- Prompt 复用：是否有重复的 prompt 模板字符串
- Tool 定义：是否有可复用但内联定义的 LangChain tool
- 数据管道：是否有重复的数据清洗/转换逻辑

#### Vue3
- 重复造轮子：是否重复实现了项目已有 hooks/utils/store/api
- 组件复用：是否有可抽取为通用组件的重复 UI 模式
- 业务逻辑：hooks 和 store 中是否有重复的状态管理逻辑

### 2.6 跨边界检查（模板/脚本/样式耦合）—— Vue3 强制

**此步骤是硬约束，不得跳过。** 修改 Vue 文件时，变更往往跨越 `<template>` / `<script>` / `<style>` 三个边界。必须执行以下检查：

1. **函数绑定完整性**：git diff 中每处从 `<script>` 删除（`-` 行）的函数/变量/import，grep 全文件确认 `<template>` 中无残留引用（`@click="deletedFn"`、`:prop="deletedVar"`、`v-if="deletedImport"` 等）。遗漏将导致运行时 `undefined is not a function` 崩溃。
2. **Emits/Events 一致性**：子组件新增/修改/删除的 emit，检查所有父组件引用处是否同步更新。`defineEmits` 定义与 `$emit()` / `emits:` 声明的调用不匹配会导致事件静默丢失。
3. **Expose 引用一致性**：父组件模板中通过 `ref="xxxRef"` 调用子组件暴露的方法（`xxxRef.value?.method()`），若子组件删除了该方法，grep 父组件确认已清理。遗留引用在运行时静默失败（`?.` 返回 undefined）或抛 TypeError。
4. **动画前提检查**：若改动涉及 `<Transition>` 或 CSS transition/animation（如 `fade-enter`/`fade-leave`），检查触发条件：`v-if` 在 `<Transition>` 的**直接子元素**上而非外层容器；`:key` 变化而非 class 切换的场景需确认 transition mode 设置。
5. **Teleported 组件的 v-if 陷阱**：使用 `<Teleport to="body">` 的组件，若父组件用 `v-if` 包裹该组件而非内部控制显隐，`<Transition>` 包裹的 leave 动画不会触发（组件从 DOM 直接移除，无过渡）。正确做法：父组件始终渲染组件，通过 prop 控制组件内 `<Transition>` 下的 `v-if`。
6. **定时器 ID 捕获**：所有 `setTimeout` / `setInterval` 返回值必须赋值给变量（不能丢弃），并在 `onUnmounted` / `cleanup()` 中对称清理。
7. **Props/Emit 类型修改影响面**：若组件新增/删除 prop 或 emit，grep 所有使用该组件的地方确认 props 传值一致、事件处理器存在。

### 审查输出格式

对每个发现，标注：
- **严重程度**（高：运行时必崩溃/安全漏洞；中：潜在 bug/性能问题；低：风格/可读性）
- **具体文件和行号**
- **问题描述**
- **修复建议**

## 步骤 3：汇总审查结果

将审查发现的问题汇总为表格：

| # | 严重程度 | 维度 | 文件 | 问题描述 | 修复建议 |
|---|---------|------|------|---------|---------|
| 1 | 高 | 正确性 | xxx.vue:42 | 空指针风险 | 添加可选链 |

若发现问题，执行以下步骤：

> ⚠️ 必须调用 `question` 工具询问用户。输出纯文本选项流程会卡死。

**必须调用 `question` 工具**询问用户如何处理，提供以下选项：

| 选项 | 标签 | 描述 |
|------|------|------|
| 1 | 修复全部 | 修复高、中、低所有严重度问题 |
| 2 | 修复中高 | 修复高、中严重度问题，低严重度跳过 |
| 3 | 仅修复高危 | 只修复高严重度问题，中低跳过 |
| 4 | 跳过修复 | 不修复任何问题，直接生成提交信息 |

用户选择"Other"可自定义修复策略（如"修复高+第3项中"）。

若用户选择"跳过修复"，直接跳到步骤 6 生成提交信息。

**若零问题**（高=0, 中=0, 低=0），跳过步骤 4-5，直接跳到步骤 6 生成提交信息。

## 步骤 4：修复问题

### 4.1 修复策略

- **高严重度**：立即修复，修复后简要说明改动内容
- **中严重度**：逐项修复，修复后简要说明改动内容
- **低严重度**：仅当用户步骤 3 选择"修复全部"时自动修复；否则在提交信息 body 中以"待后续优化"标注

### 4.2 修复原则

- 只修复审查发现的问题，**不改变原有功能逻辑**
- 优先复用项目已有的工具函数、公共类、hooks 和编码模式
- 修复代码风格对齐项目现有代码（注释语言、命名风格、格式约定）
- 如果某个问题修复有不确定性，标注"需人工确认"并跳过

## 步骤 5：二次审查（完整回归检查）

**二次审查不只是审查修复 diff，而是对修复后的完整改动进行回归检查。** 本次审查的缺陷直接反馈给步骤 2 的检查清单，驱动清单持续改进。

### 5.1 获取完整改动

```bash
git diff  # 获取修复后的完整改动（包含原始改动 + 修复改动）
```

同时获取 git diff 中所有**被删除的符号**（函数名/变量名/import 名/emit 名）：

```bash
# 从 diff 中提取所有被删除的函数/变量/import 名称（- 行中的标识符）
git diff | grep -E '^-\s*(function|const|let|var|import)\s+\w+|^-\s*\}\s*\)|^-\s*@\w+="\w+"' || true
```

### 5.2 跨边界回归扫描（硬约束）

**对步骤 5.1 中提取的每个被删除的符号**，在全工作区搜索其引用：

- **函数/方法名**：`grep -rn "函数名" --include="*.vue" --include="*.ts" --include="*.tsx"` → 所有残留引用均为高严重度
- **import 的组件/模块名**：grep 模板中该组件的使用（如 `<ComponentName`）是否已清理
- **emit 事件名**：grep 父组件中 `@event-name` 是否与子组件新 emit 定义一致

### 5.3 修复有效性与副作用检查

对每项修复回答以下三个问题：

#### 问题一：修复是否真正解决了原始问题？

- 对照步骤 3 汇总表中每个已修复项的"修复建议"，验证实际修复代码是否达到预期效果
- 如果实际修复方式与建议不同，需说明差异并判断是否同样有效

#### 问题二：修复是否引入了新问题？

用与步骤 2 相同的六维度（含 2.6 跨边界检查）重新审查完整改动。重点关注：

| 维度 | 修复场景下重点关注的检查点 |
|------|--------------------------|
| 正确性 | 空值兜底是否过度、条件判断是否写反、新增边界值是否正确、定时器 ID 是否已捕获 |
| 安全性 | 修复代码中是否引入新的用户输入拼接、是否新增了敏感数据的日志输出 |
| 性能 | 修复代码中是否引入不必要的循环/重复计算、是否在循环内创建对象/函数 |
| 可读性 | 修复代码是否有注释说明 WHY、临时变量命名是否清晰 |
| 复用性 | 修复代码中是否重复实现了项目已有的工具方法 |
| 跨边界 | 是否新增了模板-脚本不一致、emit/event 不匹配、Transition v-if 位置错误、定时器泄漏 |

#### 问题三：修复是否改变了原有功能逻辑？

- 检查修复是否意外修改了函数签名、返回值类型、副作用执行顺序
- 检查修复是否影响了其他依赖该代码的调用方
- 对于 Java：是否改变了接口契约或事务边界
- 对于 Python：是否改变了函数返回类型（影响下游类型假设）
- 对于 Vue3：是否改变了组件 props/emits 接口

### 5.4 框架特定陷阱检查表

修复完成后，对照以下表逐项检查（根据项目类型启用对应列）：

| # | 陷阱 | Java | Python | Vue3 | 说明 |
|---|------|------|--------|------|------|
| T1 | 模板事件残留 | — | — | ✅ | 删除 script 中函数后，template 中 `@click/@keydown/@submit="fn"` 是否已清理 |
| T2 | Transition v-if 外置 | — | — | ✅ | 父组件 `v-if` 在 Teleported 组件上 → leave 动画永不触发；应内部 v-if |
| T3 | 定时器 ID 未捕获 | ✅ | ✅ | ✅ | `setTimeout/setInterval` 返回值必须赋值变量，cleanup 中对称清除 |
| T4 | emit 定义与调用不同步 | — | — | ✅ | 子组件 defineEmits 新增/删除事件，父组件 @event 是否同步更新 |
| T5 | 条件竞争窗口 | ✅ | ✅ | ✅ | `await` 后的状态检查字段可能已被异步重置，需确认重置逻辑的时序 |
| T6 | 事务边界外 IO | ✅ | — | — | `@Transactional` 内是否有远程调用/消息发送等长时间阻塞操作 |
| T7 | 异步上下文阻塞 | — | ✅ | — | async 函数内是否调用了同步阻塞的 IO（如 `requests.get`） |
| T8 | Teleported 组件挂载 | — | — | ✅ | Teleport to body 的组件，cleanup 是否在 onUnmounted 中执行（组件卸载不影响 body 中 DOM） |
| T9 | DTO-Entity 类型失配 | ✅ | — | — | DTO 字段类型（如 `LocalDate`）与 Entity（如 `Date`）不一致，MyBatis TypeHandler 运行时匹配失败；`LambdaUpdateWrapper.set(Object)` 编译期不报错 |

### 5.5 二次审查结果

```
## 二次审查结果

### 跨边界扫描结果
| 被删除符号 | 残留引用位置 | 严重程度 |
|-----------|-------------|---------|
| handleKeydown | chatDefaul/index.vue:29 | 高 |
（无残留则标注"无残留引用"）

### 确认有效的修复（X 项）
| # | 原始问题 | 修复内容 | 验证结论 |
|---|---------|---------|---------|
| 1 | xxx:42 空指针 | 添加可选链 | ✅ 有效 |

### 需要调整的修复（Y 项）
| # | 原始问题 | 当前修复 | 问题描述 | 调整建议 |
|---|---------|---------|---------|---------|
| 1 | xxx | xxx | 兜底过度 | xxx |

### 跳过的修复（Z 项）
| # | 原始问题 | 跳过原因 |
|---|---------|---------|
| 1 | xxx | 需人工确认 |
```

### 5.6 循环策略

- 如果"需要调整的修复" > 0 或"跨边界扫描"有高严重度残留，回到步骤 4 修复后重新执行步骤 5
- 最多循环 **2 次**。如果 2 次后仍有问题，标注"需人工介入"展示给用户

> 必须通过 `question` 工具询问

**必须调用 `question` 工具**询问"是否继续提交？"（选项：继续提交 / 中止流程）
- 如果所有修复均确认有效（Y = 0，无高严重度残留），继续步骤 6

## 步骤 6：生成提交信息

基于原始改动内容和本次修复内容，生成规范的中文 commit message。

### 格式规范

```
<type>(<scope>): <简短描述>

变更内容：
- <原始改动要点 1>
- <原始改动要点 2>

审查修复：
- <修复项 1>
- <修复项 2>

待后续优化：
- <跳过的低严重度问题（如有）>
```

### type 选择

| type | 适用场景 |
|------|---------|
| feat | 新功能 |
| fix | Bug 修复 |
| refactor | 重构（不改变功能） |
| style | 代码格式、样式调整 |
| docs | 文档变更 |
| chore | 构建/依赖/工具变更 |
| perf | 性能优化 |

### scope 选择

根据改动文件和项目类型自动推断：
- Java 项目：Controller/Service/Mapper 对应的业务模块名（如 `user`, `order`, `payment`）
- Python 项目：模块/包名（如 `agent`, `chain`, `tools`）
- Vue3 项目：业务模块名（如 `helink`, `scbm`, `chat`）

多个 scope 时用逗号分隔。

将生成的 commit message 展示给用户确认。

> 必须通过 `question` 工具询问

**必须调用 `question` 工具**询问，提供以下选项：

| 选项 | 标签 | 描述 |
|------|------|------|
| 1 | 仅提交 | 使用当前提交信息执行 commit，不推送 |
| 2 | 提交并推送 | commit 后立即 push 到远程 |
| 3 | 修改信息 | 我需要调整提交信息内容 |

用户选择"修改信息"后，通过"Other"输入修改内容，按要求调整后重新展示并再次确认。

若用户选择"仅提交"，步骤 7 跳过推送；若选择"提交并推送"，执行完整 7.1-7.3。

## 步骤 7：提交并推送

### 7.1 暂存所有改动

```bash
git add -A
```

### 7.2 提交

**硬约束：禁止使用 `git commit -m` 传递多行消息。** PowerShell/Bash 跨工具引号转义不可靠，必须通过临时文件提交。

使用步骤 6 确认后的 commit message 执行：

```bash
# 1. 用 Write 工具将 commit message 写入 .git/COMMIT_MSG_TMP（路径在 .git 下，不会被 tracked）
# 2. git commit -F .git/COMMIT_MSG_TMP
# 3. rm .git/COMMIT_MSG_TMP
```

**Why:** `git commit -m` 在 PowerShell 中传多行消息时，here-string（`@'...'@`）的 `@` 会污染首行，Bash 中单引号跨行行为不一致。`-F` 读文件是唯一跨 Shell 可靠的提交方式。

### 7.3 推送

```bash
git push origin $BRANCH
```

若推送失败（如远程有新提交），告知用户需要先拉取，并给出建议命令。

## 步骤 8：总结

用中文汇总本次操作结果：

- **项目类型**：步骤 0 识别结果
- **提交 hash**：前 7 位
- **提交分支**：$BRANCH
- **改动文件数**：N 个
- **初次审查**：发现高 N、中 M、低 K 个问题
- **自动修复**：N 个
- **二次审查**：跨边界扫描发现 N 个残留，确认有效 M 个，需调整 P 个（已处理），跳过 Z 个
- **推送结果**：成功 / 失败（含原因）
