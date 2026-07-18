# OC 上下文精简方案对比

> 验证日期：2026-07-18

## 社区插件

| 插件 | Stars | 周下载 | 核心思路 | 维护状态 |
|------|-------|--------|---------|---------|
| [DCP](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning) | 2,260 | 19K | 模型调用 compress 工具自主裁剪，支持 range/message 两种模式 | ⚠️ 开发放缓，新功能转向 Sleev |
| [ACP](https://github.com/ranxianglei/opencode-acp) | — | 2.3K | DCP 硬分支，35 bug 修复，"市场上最好的上下文管理" | ✅ 活跃（2026.7 仍在更新） |
| [Sleev](https://sleev.ai) | — | — | DCP 作者的进化版，本地代理层（CC/Codex/OC 通用） | ✅ 推荐新用户使用 |
| [opencode-context-compress](https://github.com/AidenGeunGeun/opencode-context-compress) | 2 | — | 纯手动触发，用户控制何时压缩 | 小众 |

## DCP/ACP 工作方式

```
上下文接近阈值（默认 100K token）
  ↓
模型收到压缩提示（nudge）
  ↓
模型调用 compress 工具
  ↓
压缩指定区间 → 存为摘要块
  ↓
原始内容被替换为占位符（不丢，存在插件存储中）
  ↓
后续 LLM 请求只拿到精简后的上下文
```

关键特性：
- **模型自主决定**何时压缩、压缩什么（不是固定 token 触发）
- **非破坏性**：原始消息保留在 OC 存储中，可 `/acp decompress` 恢复
- **支持嵌套压缩**：压缩的摘要可以被再次压缩
- **保护机制**：可配置保护特定 tool 输出不被裁剪
- **token 消耗**：100 万窗口的模型实际只用 20-30 万 token（ACP 自称）

## 学术前沿（2026.6）

- **SelfCompact**：模型决定何时压缩 + 轻量 rubric。不比固定阈值差，token 成本降 30-70%
- **"lost in compaction"**：即使 5% 压缩也损失 7pp recall。注意力容量是瓶颈，不是压缩质量
- **Claude Code**：5 种压缩机制（auto、partial、sub-agent、microcompact=无 LLM、跨会话共享）

## 对我们项目的意义

V2.0 三层漏斗 + DCP/ACP 可以互补：
- DCP/ACP 解决**上下文膨胀**（token 层面）
- V2.0 解决**行为纠偏**（决策层面）
- 两个层面互不冲突，可以同时使用

## 社区反馈的 Trade-off

**短会话/小任务**：激进裁剪导致 LLM "降智"——原始上下文中的细节被过早压缩，模型失去精确信息，只能依赖模糊摘要推理。代价 > 收益。

**长会话/复杂任务**：上下文自然膨胀到数十万 token，"lost in the middle"效应加剧，不裁剪反而更差。压缩丢掉的 7pp recall 远小于注意力稀释带来的损失。收益 > 代价。

**启示**：上下文精简不应一刀切——短会话不裁剪，长会话动态启用。这需要一个判断机制（会话长度阈值、任务复杂度评估），恰好是 guardian agent 可以承担的职责。
