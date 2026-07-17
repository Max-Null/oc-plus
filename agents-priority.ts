/**
 * agents-priority Plugin for OpenCode
 *
 * 解决问题：oh-my-opencode-slim 将全英文 orchestrator prompt prepend 到
 * AGENTS.md 之前，导致 AGENTS.md 中的中文规范（语言规范、注释策略等）
 * 被淹没在注意力盲区，模型在 thinking 阶段被推向英文思维。
 *
 * 机制：omo-slim 的 experimental.chat.system.transform hook 执行
 *   output.system[0] = orchestratorPrompt + AGENTS.md
 * 本插件注册在 omo-slim 之后，hook 后执行，将 AGENTS.md 挪回最前面。
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
