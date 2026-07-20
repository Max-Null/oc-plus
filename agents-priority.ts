/**
 * agents-priority Plugin for OpenCode
 *
 * 确保 AGENTS.md（中文规范：语言规范、注释策略等）始终位于 system prompt 最前面。
 * 当其他插件/机制在 system prompt 前插入内容时，本插件将 AGENTS.md 挪回首位。
 *
 * 机制：experimental.chat.system.transform hook 后执行。
 * 检查 system[0] 中 AGENTS.md 标记行位置——若不在首位，则将其前置。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const AGENTS_MD = path.join(HOME, ".config", "opencode", "AGENTS.md");

// 从 AGENTS.md 读取文件首行作为定位标记
function getMarker(): string {
  try {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    const firstLine = content.split("\n").find((l) => l.trim().length > 0);
    return firstLine?.trim() || "# opencode 行为准则";
  } catch {
    return "# opencode 行为准则";
  }
}

export default {
  "experimental.chat.system.transform": async (
    _input: unknown,
    output: { system: string[] }
  ) => {
    if (output.system.length === 0) return;

    const marker = getMarker();
    const idx = output.system[0].indexOf(marker);

    // idx === -1：没找到 AGENTS.md（异常情况，不动）
    // idx === 0：AGENTS.md 已经在最前面（不需要动）
    // idx > 0：AGENTS.md 被其他内容压在下面了，把它挪到最前面
    if (idx > 0) {
      const before = output.system[0].substring(0, idx).trimEnd();
      const agentsAndAfter = output.system[0].substring(idx);
      output.system[0] = agentsAndAfter + "\n\n" + before;
    }
  },
};
