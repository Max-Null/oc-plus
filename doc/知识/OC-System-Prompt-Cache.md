# OC System Prompt 缓存机制

> 基于 OC 源码 `packages/opencode/src/session/llm/request.ts` (commit 55b0211) 分析

## 一、System Prompt 组装流程

```
1. OC 构建初始 system = [agent.prompt, user.system].join("\n")
   → 一个完整的大字符串 S1 (约 15K 字符)

2. Plugin system.transform 被调用
   → output.system.push(核心规则, 门提示, 知识索引, ...)
   → system = [S1, coreRules, gatePrompt, knowledge, ...]

3. OC rejoin 逻辑 (如果 system.length > 2)
   → system = [S1, "coreRules + gatePrompt + knowledge + ..."]
   → 最终两个 system block: [S1(稳定), S2(动态)]
```

**关键代码** (`request.ts:56-78`):

```typescript
const system = [
  [...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
   ...input.system,
   ...(input.user.system ? [input.user.system] : []),
  ].filter((x) => x).join("\n"),  // ← 全部合并为一个大字符串
]

const header = system[0]
yield* input.plugin.trigger("experimental.chat.system.transform", ..., { system })

if (system.length > 2 && system[0] === header) {
  const rest = system.slice(1)
  system.length = 0
  system.push(header, rest.join("\n"))  // ← 插件内容全部合并到 S2
}
```

## 二、DeepSeek 缓存机制

- **字节精确前缀匹配**：第一个字节到第 N 个字节必须完全相同
- **公共前缀检测**：2-3 轮相同的 S1 后，DeepSeek 会将 S1 持久化为独立缓存单元
- **S2 变化**：S2 内容每轮不同不影响 S1 缓存，但需要 S1 先被识别出来
- **最少 1024 tokens**：可靠缓存前缀需要 ≥1024 tokens

## 三、oc-plus 3.7 缓存下降根因

| 版本 | 知识条数 | 注入量 | S2 变化幅度 | 命中率 |
|------|---------|--------|-----------|--------|
| 3.6 | ~14 条 | ~1500 字 | 小 | 98% |
| 3.7 初 | 23 条 | ~3000 字 | 大 | 64% |
| 3.7 精简 | ≤5 条 | ~500 字 | 小 | 待观察 |

**根因**：S2 变化太大，DeepSeek 无法在连续轮次中识别 S1 为公共前缀。精简到 500 字后，S2 足够小，S1 能被检测出来。

## 四、设计原则

1. **Plugin 内容最小化**：每轮注入 ≤500 字符
2. **变勤内容放尾部**：可变内容越多，前缀识别越困难
3. **用 blockquote 而非 heading**：`> ##` 格式不创建新 section，减少 OC 的 section 计数波动
4. **知识索引 nudge 轮注入**：不每轮都注入知识索引

## 五、相关环境变量

当前 OC 版本 (55b0211) 中不存在 `CACHE_STABILIZATION` 标志位。缓存优化通过 prompt 结构设计实现。

## 六、监控方法

查看 `~/.config/opencode/memories/debug.log` 中的 DIAG 行：

```
[DIAG] system.prompt 结构为 14 段，53249 chars ≈ 15214 tokens 预算
[DIAG] system.prompt 超过 15K chars 预算，触发 API 限制
```

观察 sections 数是否稳定在固定值（如 14-15），连续相同即表示缓存命中。
