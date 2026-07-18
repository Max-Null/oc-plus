/**
 * 分形 Plugin for OpenCode — v3.1
 *
 * 四层触发线 Guardian Agent：
 * - 触发线 1：文件写入匹配 trigger（glob→LLM→prompt）
 * - 触发线 2：连续无进展循环（滑动窗口→模板注入）
 * - 触发线 4：主动联网查证（断言检测→分级计数器→system.transform 注入）
 *
 * 三层记忆架构：
 * - 全局：~/.config/opencode/memories/
 * - 个人项目级：~/.config/opencode/project/<hash>/memories/
 * - 共享项目级：<项目>/.opencode/memories/
 *
 * 核心功能：
 * 1. system.transform：注入 blocks + triggers + 联网查证规则到 system prompt
 * 2. event：记录事件 + 断言检测 + websearch 追踪 + trigger 匹配
 * 3. 分析触发：新会话启动时检查增量，调用 LLM 自主学习用户习惯
 */
interface PluginInput {
    client: any;
    directory: string;
}
export declare const FractalPlugin: (input: PluginInput, _options?: Record<string, unknown>) => Promise<{
    /**
     * 会话启动时：
     * 1. 检查事件增量，触发分析（分析模式）
     * 2. 注入 blocks + triggers 到 system prompt
     */
    "experimental.chat.system.transform": (_input: unknown, output: {
        system: string[];
    }) => Promise<void>;
    /**
     * 双通道注入：在用户消息到达时注入警告（同轮可见，比 system.transform 更即时）
     *
     * 数据流：event hook（触发线2/4）→ pendingWarnings 队列 → chat.message 注入 → 清空
     * 与 system.transform 的频率逻辑互补：
     *   - chat.message：每轮用户消息都注入 pending warnings（即时反馈，不做节流）
     *   - system.transform：knowledge/habits 按 NUDGE_INTERVAL 节流（减少 prompt 污染）
     */
    "chat.message": (_input: unknown, output: {
        parts?: Array<{
            type: string;
            text?: string;
            synthetic?: boolean;
        }>;
    }) => Promise<void>;
    /**
     * 监听事件：记录用户交互
     */
    event: (input: {
        event: {
            type: string;
            properties?: Record<string, unknown>;
        };
    }) => Promise<void>;
    /**
     * 会话压缩时注入记忆，防丢失
     */
    "experimental.session.compacting": (_input: unknown, output: {
        context: string[];
    }) => Promise<void>;
}>;
export default FractalPlugin;
