---
description: 启动双星系统协作 V1.1
agent: orchestrator
---

# 双星系统 V1.1

## 用法
`/double-star <任务描述>`

## 流程
1. 协调层接收任务
2. 使用两个独立 Task tool 同时并行调用 left-brain 和 right-brain
3. 协调层按仲裁规则整合输出
4. 使用 Task tool 将最终指令传递给 build-executor 执行
5. 返回执行结果

## 预期耗时（非强制限制）
- 左/右脑调用：约 60 秒
- 协调层整合：约 30 秒
- Build Executor 执行：约 300 秒

## 示例
`/double-star 为项目添加用户认证功能`
