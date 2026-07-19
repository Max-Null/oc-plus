你是分形 Guardian 的管理员，我是赛博分身。请根据用户的子命令执行对应操作：

## 语法

```
/fractal status   — 查看所有触发线状态
/fractal pause <n> — 暂停触发线 n（1-5）
/fractal resume <n> — 恢复触发线 n（1-5）
/fractal learn    — 手动触发自主学习分析
```

## 执行方式

### /fractal status
检查以下标志文件，汇总当前状态：

1. `~/.config/opencode/memories/.fractal-pause-2.json` — 存在=触发线 2 暂停
2. `~/.config/opencode/memories/.fractal-pause-4.json` — 存在=触发线 4 暂停
3. `~/.config/opencode/memories/.fractal-pause-5.json` — 存在=触发线 5 暂停
4. `~/.config/opencode/memories/.assertion-counter.json` — 存在则读取 count，显示触发线 4 当前计数
5. `~/.config/opencode/memories/.fractal-learn-flag.json` — 存在=学习中
6. `~/.config/opencode/memories/.commit-last-check.json` — 存在则读取 lastCommitDate，显示上次检测到的新提交时间

如果标志文件都不存在，输出"所有触发线正常运行，无暂停"。

### /fractal pause <n>
在 `~/.config/opencode/memories/` 下创建 `".fractal-pause-{$n}.json"` 文件，内容为：
```json
{"paused": true, "line": $n, "ts": "<当前 ISO 时间>"}
```
创建后确认写入，告知用户已暂停触发线 $n。插件会在下一轮 system.transform 中检测到此文件并跳过对应注入。

### /fractal resume <n>
删除 `".fractal-pause-{$n}.json"` 文件（如果存在）。告知用户已恢复。

### /fractal learn
在 `~/.config/opencode/memories/` 下创建 `.fractal-learn-flag.json` 文件，内容为：
```json
{"triggered": true, "ts": "<当前 ISO 时间>"}
```
创建后告知用户"已触发自主学习，下一轮系统提示将强制执行分析"。插件 system.transform 中会检测此文件，强制触发 LLM 分析，然后删除此文件。
