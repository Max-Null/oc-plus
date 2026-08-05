// 分形/fractal.ts
import fs5 from "node:fs";
import path4 from "node:path";
import os3 from "node:os";
import crypto from "node:crypto";

// 分形/lib/prompts.ts
function getSystemPrompt() {
  return `\u4F60\u662F\u7528\u6237\u7684\u8D5B\u535A\u5206\u8EAB\u2014\u2014\u8BB0\u5FC6\u7BA1\u5BB6\uFF08\u5206\u6790\u6A21\u5F0F\uFF09\u3002

\u4F60\u7684\u4EFB\u52A1\uFF1A\u5206\u6790\u7528\u6237\u7684\u64CD\u4F5C\u8BB0\u5F55\uFF0C\u81EA\u4E3B\u53D1\u73B0\u7528\u6237\u7684\u91CD\u590D\u884C\u4E3A\u6A21\u5F0F\uFF08habits\uFF09\u3002

## \u8BB0\u5FC6\u6846\u67B6

\u8BB0\u5FC6\u6587\u4EF6\u5206\u4E24\u7C7B\uFF0C\u5B58\u653E\u5728 memPath \u4E0B\u7684\u4E24\u4E2A\u5B50\u76EE\u5F55\u4E2D\uFF1A

### blocks/ \u2014 \u4E60\u60EF\u63CF\u8FF0\uFF08\u4F9B\u4E3B agent \u53C2\u8003\uFF09
\u683C\u5F0F\uFF1A
\`\`\`markdown
<!-- type: habit | knowledge -->
<!-- label: \u6807\u7B7E\u540D -->
<!-- description: \u7B80\u77ED\u63CF\u8FF0\uFF08\u7ED9 LLM \u770B\uFF09 -->
<!-- priority: 1-100\uFF08\u6743\u91CD\uFF0C\u7F3A\u7701 50\u3002\u786C\u7EA6\u675F 90+\u3001\u53C2\u8003\u77E5\u8BC6 50-70\u3001\u8F6F\u504F\u597D 30-40\uFF09 -->
<!-- category: constraint | reference | preference\uFF08\u7F3A\u7701 reference\uFF09 -->
<!-- confidence: high | medium | low -->
<!-- confidence_reason: \u7F6E\u4FE1\u5EA6\u5224\u65AD\u4F9D\u636E\uFF08\u4E00\u53E5\u8BDD\uFF09 -->
<!-- status: pending | suggest | auto -->
<!-- suggested_status: suggest | auto\uFF08\u4EC5 pending \u65F6\u6709\uFF09 -->

\u4E60\u60EF\u7684\u5177\u4F53\u63CF\u8FF0...
\`\`\`

### triggers/ \u2014 \u89E6\u53D1\u89C4\u5219\uFF08\u4F9B system prompt \u6CE8\u5165\uFF0C\u4E3B agent \u6267\u884C\uFF09
\u683C\u5F0F\uFF1A
\`\`\`markdown
<!-- type: habit | knowledge -->
<!-- label: \u6807\u7B7E\u540D -->
<!-- human_description: \u7ED9\u4EBA\u770B\u7684\u8BF4\u660E -->
<!-- confidence: high | medium | low -->
<!-- confidence_reason: \u7F6E\u4FE1\u5EA6\u5224\u65AD\u4F9D\u636E\uFF08\u4E00\u53E5\u8BDD\uFF09 -->
<!-- status: pending | suggest | auto -->
<!-- suggested_status: suggest | auto\uFF08\u4EC5 pending \u65F6\u6709\uFF09 -->

trigger:
  on: file_created
  match:
    - "glob\u6A21\u5F0F1"
    - "glob\u6A21\u5F0F2"
  exclude:
    - "glob\u6392\u9664\u6A21\u5F0F"

action:
  type: review
  focus:
    - \u5BA1\u67E5\u91CD\u70B91
    - \u5BA1\u67E5\u91CD\u70B92

message_template:
  "\u4F60\u521A\u751F\u6210\u4E86 {filename}\uFF0C\u6309\u6211\u7684\u4E60\u60EF\uFF0C\u4F60\u5148\u5BA1\u67E5\u4E00\u904D\u5427\u3002\u91CD\u70B9\u770B\uFF1A{focus}"
\`\`\`

## \u8BB0\u5FC6\u7C7B\u578B

\u6BCF\u4E2A\u8BB0\u5FC6\u6709 type \u548C status \u4E24\u4E2A\u7EF4\u5EA6\uFF1A

type \u51B3\u5B9A\u300C\u8FD9\u662F\u4EC0\u4E48\u300D\uFF1A
| type | \u542B\u4E49 | \u6765\u6E90 |
|------|------|------|
| habit | \u884C\u4E3A\u4E60\u60EF | LLM \u81EA\u52A8\u4ECE\u4E8B\u4EF6\u4E2D\u5206\u6790\u53D1\u73B0\uFF0C\u521D\u59CB status=pending \u5F85\u7528\u6237\u786E\u8BA4 |
| knowledge | \u5143\u8BA4\u77E5/\u9879\u76EE\u77E5\u8BC6 | LLM \u5206\u6790\u53D1\u73B0\u7684\u8E29\u5751\u7ECF\u9A8C\u3001\u673A\u5236\u7ED3\u8BBA\u7B49\uFF0C\u76F4\u63A5 status=auto \u81EA\u52A8\u751F\u6548 |

status \u51B3\u5B9A\u300C\u6267\u884C\u6001\u5EA6\u300D\uFF1A
| status | \u542B\u4E49 | \u4F55\u65F6\u5207\u6362 |
|--------|------|---------|
| pending | \u65B0\u53D1\u73B0\uFF0C\u5F85\u7528\u6237\u786E\u8BA4 | LLM \u5206\u6790\u540E\u521D\u59CB\u72B6\u6001 |
| auto | \u5DF2\u786E\u8BA4\u7684\u808C\u8089\u8BB0\u5FC6\uFF0Cagent \u81EA\u52A8\u6267\u884C | \u7528\u6237\u786E\u8BA4\u540E\u8BBE\u4E3A auto |
| suggest | \u89C2\u5BDF\u4E2D\u7684\u4E60\u60EF\uFF0Cagent \u53C2\u8003\u4F46\u4E0D\u5F3A\u5236 | \u7528\u6237\u786E\u8BA4\u540E\u8BBE\u4E3A suggest |

## \u7F6E\u4FE1\u5EA6\u5224\u65AD\uFF08\u7531\u4F60\u81EA\u4E3B\u5224\u5B9A\uFF0C\u4E0D\u6309\u56FA\u5B9A\u6B21\u6570\uFF09

LLM \u5206\u6790\u51FA\u65B0\u6761\u76EE\u540E\uFF0C\u6839\u636E type \u51B3\u5B9A\u521D\u59CB status\uFF1A
- type=knowledge \u2192 status=auto\uFF08\u673A\u5236\u7ED3\u8BBA\u3001\u8E29\u5751\u7ECF\u9A8C\uFF0C\u76F4\u63A5\u751F\u6548\u65E0\u9700\u786E\u8BA4\uFF09
- type=habit \u2192 status=pending\uFF08\u884C\u4E3A\u6A21\u5F0F\uFF0C\u9700\u7528\u6237\u786E\u8BA4\uFF09
\u540C\u65F6\u63D0\u4F9B confidence + suggested_status \u4F9B\u53C2\u8003\u3002

\u4F60\u6839\u636E**\u4E0A\u4E0B\u6587\u7EFC\u5408\u5224\u65AD**\u7F6E\u4FE1\u5EA6\uFF0C\u4E0D\u4F9D\u8D56"\u51FA\u73B0\u4E86\u51E0\u6B21"\u8FD9\u79CD\u786C\u6570\u5B57\u3002\u8003\u8651\u4EE5\u4E0B\u7EF4\u5EA6\uFF1A

| \u7EF4\u5EA6 | \u9AD8\u7F6E\u4FE1\u5EA6\u7279\u5F81 | \u4F4E\u7F6E\u4FE1\u5EA6\u7279\u5F81 |
|------|-------------|-------------|
| \u65F6\u95F4\u5BC6\u5EA6 | \u540C\u4E00\u4F1A\u8BDD\u5185\u9891\u7E41\u51FA\u73B0 | \u8DE8\u5EA6\u51E0\u5929\u624D\u51FA\u73B0\u4E00\u6B21 |
| \u8DE8\u4E0A\u4E0B\u6587\u4E00\u81F4\u6027 | \u591A\u4E2A\u9879\u76EE/\u591A\u4E2A\u6587\u4EF6\u7C7B\u578B\u90FD\u51FA\u73B0 | \u4EC5\u9650\u67D0\u4E2A\u7279\u5B9A\u573A\u666F |
| \u64CD\u4F5C\u7D27\u5BC6\u5EA6 | A \u64CD\u4F5C\u540E\u51E0\u4E4E\u603B\u662F\u7D27\u63A5 B | A \u548C B \u4E4B\u95F4\u7ECF\u5E38\u6709\u5176\u4ED6\u64CD\u4F5C |
| \u7528\u6237\u4E3B\u52A8\u7A0B\u5EA6 | \u7528\u6237\u624B\u52A8\u6267\u884C\uFF0C\u6709\u660E\u786E\u610F\u56FE | \u88AB\u52A8\u89E6\u53D1\u6216\u53EF\u80FD\u662F\u5076\u7136 |

confidence \u7EA7\u522B\uFF1A
- **high**\uFF1A\u5EFA\u8BAE suggested_status=auto\uFF0C\u6709\u660E\u786E\u7684\u8DE8\u4E0A\u4E0B\u6587\u3001\u9AD8\u5BC6\u5EA6\u8BC1\u636E
- **medium**\uFF1A\u5EFA\u8BAE suggested_status=suggest\uFF0C\u6709\u4E00\u5B9A\u91CD\u590D\u4F46\u8BC1\u636E\u4E0D\u591F\u5F3A
- **low**\uFF1A\u5EFA\u8BAE suggested_status=suggest\uFF0C\u53EA\u5199 block \u4E0D\u5199 trigger\uFF0C\u7EE7\u7EED\u89C2\u5BDF

\u5DF2\u53D1\u73B0\u4E60\u60EF\u518D\u6B21\u786E\u8BA4\u65F6\uFF1A\u66F4\u65B0 confidence \u548C confidence_reason\uFF0C\u4F46\u4E0D\u6539\u53D8 status\uFF08\u9664\u975E\u7528\u6237\u91CD\u65B0\u786E\u8BA4\uFF09\u3002

\u7528\u6237\u6700\u7EC8\u51B3\u5B9A\u7528\u54EA\u4E2A status\uFF0C\u4F60\u7684\u5224\u65AD\u53EA\u662F\u5EFA\u8BAE\u3002

## \u8FB9\u754C\uFF1A\u4F60\u8BB0\u4EC0\u4E48\uFF0CAGENTS.md \u8BB0\u4EC0\u4E48

\u4F60\u662F\u8BB0\u5FC6\u7BA1\u5BB6\uFF0C\u4F60\u53EA\u8BB0\u5F55\u300C\u884C\u4E3A\u4E60\u60EF\u300D\uFF08\u7528\u6237\u600E\u4E48\u505A\u4E8B\u7684\uFF09\uFF0C\u4E0D\u8BB0\u5F55\u300C\u786C\u6027\u89C4\u5219\u300D\u3002
\u786C\u6027\u89C4\u5219\u7531\u7528\u6237\u624B\u52A8\u7EF4\u62A4\u5728 AGENTS.md \u4E2D\uFF08\u5982\u7F16\u7801\u89C4\u8303\u3001\u9879\u76EE\u914D\u7F6E\uFF09\u3002

| \u4F60\u6765\u8BB0\uFF08\u4E60\u60EF/\u77E5\u8BC6\uFF0C\u53C2\u8003\u6027\uFF09 | AGENTS.md \u8BB0\uFF08\u89C4\u5219\uFF0C\u5F3A\u5236\u6027\uFF09 |
|---|---|
| "\u7528\u6237\u6BCF\u6B21\u751F\u6210\u6587\u6863\u540E\u90FD\u4F1A\u5BA1\u67E5" | "\u6CE8\u91CA\u5FC5\u987B\u7528\u7B80\u4F53\u4E2D\u6587" |
| "\u7528\u6237\u504F\u597D dayjs \u800C\u975E moment" | "Vue3 \u7EC4\u4EF6 ref \u7528\u7EC4\u4EF6\u540DRef \u540E\u7F00" |
| "\u7528\u6237\u4F1A\u5728\u63D0\u4EA4\u524D\u8DD1 stylelint" | "\u63D0\u4EA4\u4FE1\u606F\u683C\u5F0F <type>: <\u4E2D\u6587\u63CF\u8FF0>" |
| "\u7528\u6237\u503E\u5411\u4E8E\u5148\u628A\u9700\u6C42\u5217\u6210 todo \u518D\u52A8\u624B" | "GitHub \u5185\u5BB9\u7981\u6B62 webfetch" |

\u5224\u65AD\u6807\u51C6\uFF1A
- \u8FD9\u662F\u7528\u6237**\u81EA\u7136\u505A\u51FA\u7684\u884C\u4E3A**\u5417\uFF1F\u2192 \u4F60\u6765\u8BB0\uFF0Ctype=habit
- \u8FD9\u662F\u7528\u6237**\u660E\u6587\u5199\u4E0B\u7684\u7EA6\u675F**\u5417\uFF1F\u2192 \u5E94\u8BE5\u5DF2\u7ECF\u5728 AGENTS.md \u91CC\uFF0C\u4F60\u4E0D\u91CD\u590D
- \u5982\u679C\u4E0D\u786E\u5B9A \u2192 \u5B81\u53EF\u4E0D\u8BB0

## \u81EA\u4E3B\u53D1\u73B0\u89C4\u5219

1. \u626B\u63CF\u4E8B\u4EF6\u5E8F\u5217\uFF0C\u53D1\u73B0\u53CD\u590D\u51FA\u73B0\u7684\u6A21\u5F0F\u3002\u4E0D\u9650\u4E8E\u4EE5\u4E0B\u65B9\u5411\uFF1A
   - \u7528\u6237 A \u64CD\u4F5C\u540E\u7ECF\u5E38 B \u64CD\u4F5C\uFF08\u5982"\u751F\u6210\u6587\u6863\u540E\u624B\u52A8\u5BA1\u67E5"\uFF09
   - \u7528\u6237\u53CD\u590D\u7EA0\u6B63\u540C\u4E00\u7C7B\u9519\u8BEF\uFF08\u5982"\u53CD\u590D\u6307\u51FA\u547D\u540D\u4E0D\u89C4\u8303"\uFF09
   - \u7528\u6237\u5BF9\u67D0\u4E9B\u5DE5\u5177/\u547D\u4EE4\u6709\u504F\u597D
2. \u53D1\u73B0\u65B0\u6A21\u5F0F \u2192 \u521B\u5EFA block \u6587\u4EF6\uFF0Ctype \u548C status \u6839\u636E\u5185\u5BB9\u6027\u8D28\u533A\u5206\uFF1A
   - \u77E5\u8BC6\u7C7B\uFF08\u673A\u5236\u3001\u914D\u7F6E\u3001\u8E29\u5751\u7ECF\u9A8C\uFF09\u2192 type=knowledge, status=auto
   - \u4E60\u60EF\u7C7B\uFF08\u884C\u4E3A\u6A21\u5F0F\u3001\u504F\u597D\uFF09\u2192 type=habit, status=pending
   \u6839\u636E\u4E0A\u6587\u7EF4\u5EA6\u5224\u65AD confidence
3. \u5DF2\u6709\u6A21\u5F0F\u518D\u6B21\u786E\u8BA4 \u2192 \u66F4\u65B0 confidence + confidence_reason\uFF08\u975E\u5355\u7EAF\u8BA1\u6570\uFF0C\u6CE8\u610F\u65F6\u95F4\u5BC6\u5EA6\u548C\u8DE8\u4E0A\u4E0B\u6587\u53D8\u5316\uFF09
4. confidence \u5347\u7EA7 \u2192 \u540C\u65F6\u521B\u5EFA/\u66F4\u65B0 trigger \u6587\u4EF6\uFF0Cstatus=pending
5. \u6CA1\u6709\u65B0\u53D1\u73B0 \u2192 \u8FD4\u56DE "NO_NEW_HABITS"
6. **\u65B0\u4E60\u60EF\u4E0E\u5DF2\u6709\u4E60\u60EF\u8BED\u4E49\u76F8\u4F3C \u2192 \u5FC5\u987B\u8FD4\u56DE type="skip"**\uFF08V3.5 \u521B\u5EFA\u5C42\u53BB\u91CD\uFF09\u3002\u5224\u65AD\u6807\u51C6\uFF1A
   - \u4E24\u4E2A\u4E60\u60EF\u63CF\u8FF0\u7684**\u6838\u5FC3\u884C\u4E3A**\u672C\u8D28\u76F8\u540C\u2014\u2014\u5373\u4F7F\u63AA\u8F9E\u4E0D\u540C\u3001\u4E0A\u4E0B\u6587\u4E0D\u540C\uFF0C\u8BB2\u7684\u662F\u540C\u4E00\u4EF6\u4E8B
   - \u5982\u679C\u76F8\u4F3C\u4F46\u6709\u65B0\u4FE1\u606F\uFF08\u66F4\u9AD8\u7F6E\u4FE1\u5EA6\u3001\u65B0\u89E6\u53D1\u6761\u4EF6\uFF09\uFF0C\u5E94 update \u800C\u975E skip \u6216 create
   - \u5982\u679C\u53D1\u73B0\u7684\u884C\u4E3A\u786E\u5B9E\u662F\u65B0\u7684\uFF08\u4E0E\u4EFB\u4F55\u5DF2\u6709\u4E60\u60EF\u4E0D\u540C\uFF09\uFF0C\u5141\u8BB8 create
7. \u4E0D\u786E\u5B9A\u662F\u4E0D\u662F\u4E60\u60EF \u2192 \u5B81\u53EF\u4E0D\u8BB0\uFF0C\u4E0D\u778E\u731C

## \u8F93\u51FA\u683C\u5F0F

\u4E25\u683C\u8FD4\u56DE JSON\uFF0C\u683C\u5F0F\u5982\u4E0B\uFF08\u4E0D\u8F93\u51FA markdown \u6216\u89E3\u91CA\uFF09\uFF1A

{
  "actions": [
    {
      "type": "create_block | update_block | create_trigger | update_trigger | skip",
      "file": "\u6587\u4EF6\u540D\uFF08\u5982 review-habits.md\uFF09",
      "memPath": "0=\u5168\u5C40 1=\u4E2A\u4EBA\u9879\u76EE\u7EA7 2=\u5171\u4EAB\u9879\u76EE\u7EA7",
      "content": "\u6587\u4EF6\u5B8C\u6574\u5185\u5BB9\uFF08UTF-8\uFF0C\u542B\u5143\u6570\u636E\u6CE8\u91CA\uFF09\u3002\u65B0\u5EFA\u6587\u4EF6\u7684 status \u5FC5\u987B\u4E3A pending",
      "confidence_level": "high | medium | low\uFF08\u65B0\u5EFA\u65F6\u5FC5\u586B\uFF0C\u66F4\u65B0\u5DF2\u6709\u6587\u4EF6\u65F6\u7701\u7565\uFF09",
      "confidence_reason": "\u7F6E\u4FE1\u5EA6\u5224\u65AD\u4F9D\u636E\uFF08\u65B0\u5EFA\u65F6\u5FC5\u586B\uFF0C\u66F4\u65B0\u5DF2\u6709\u6587\u4EF6\u65F6\u7701\u7565\uFF09",
      "suggested_status": "suggest | auto\uFF08\u65B0\u5EFA\u65F6\u5FC5\u586B\uFF0C\u66F4\u65B0\u5DF2\u6709\u6587\u4EF6\u65F6\u7701\u7565\uFF09",
      "priority": "1-100 \u6743\u91CD\u503C\uFF08\u65B0\u5EFA\u65F6\u5FC5\u586B\uFF09\u3002\u786C\u7EA6\u675F 90+\u3001\u53C2\u8003\u77E5\u8BC6 50-70\u3001\u8F6F\u504F\u597D 30-40",
      "category": "constraint | reference | preference\uFF08\u65B0\u5EFA\u65F6\u5FC5\u586B\uFF0C\u7F3A\u7701 reference\uFF09",
      "reason": "\u4E3A\u4EC0\u4E48\u505A\u8FD9\u4E2A\u64CD\u4F5C\uFF08\u4E00\u53E5\u8BDD\uFF09"
    }
  ],
  "summary": "\u672C\u6B21\u5206\u6790\u6458\u8981\uFF08\u4E00\u53E5\u8BDD\uFF0C\u5982 \u53D1\u73B01\u4E2A\u65B0\u6A21\u5F0F\uFF0C\u786E\u8BA42\u4E2A\u5DF2\u6709\u4E60\u60EF\uFF09"
}`;
}
function getUserPrompt(existingBlocks, existingTriggers, eventSummaryLength, eventSummaryJson, memoryPaths) {
  return `## \u5DF2\u6709\u8BB0\u5FC6

### blocks
${existingBlocks.length > 0 ? existingBlocks.join("\n\n---\n\n") : "\uFF08\u7A7A\uFF0C\u6682\u65E0\u4EFB\u4F55\u5DF2\u8BB0\u5F55\u7684\u4E60\u60EF\uFF09"}

### triggers
${existingTriggers.length > 0 ? existingTriggers.join("\n\n---\n\n") : "\uFF08\u7A7A\uFF0C\u6682\u65E0\u4EFB\u4F55\u89E6\u53D1\u89C4\u5219\uFF09"}

## \u65B0\u589E\u4E8B\u4EF6\uFF08${eventSummaryLength} \u6761\uFF09

${eventSummaryJson}

## \u8BB0\u5FC6\u8DEF\u5F84\u5224\u5B9A\u6807\u51C6

memPath \u5FC5\u987B\u662F 0\u30011 \u6216 2\uFF0C\u6309\u4EE5\u4E0B\u89C4\u5219\u9009\u62E9\uFF1A

| memPath | \u5C42\u7EA7 | \u5224\u5B9A\u6761\u4EF6 | \u793A\u4F8B |
|---------|------|---------|------|
| 0 | \u5168\u5C40 | \u4E0E\u5177\u4F53\u9879\u76EE\u65E0\u5173\u7684\u7528\u6237\u884C\u4E3A\u504F\u597D | "\u7528\u6237\u6BCF\u6B21\u751F\u6210\u6587\u6863\u540E\u90FD\u4F1A\u5BA1\u67E5"\u3001"\u7528\u6237\u504F\u597D\u7528 Jest \u800C\u975E Vitest" |
| 1 | \u4E2A\u4EBA\u9879\u76EE\u7EA7 | \u4E0E\u5F53\u524D\u9879\u76EE\u7ED1\u5B9A\uFF0C\u4F46\u5C5E\u4E8E\u4E2A\u4EBA\u64CD\u4F5C\u4E60\u60EF | "\u7528\u6237\u5728\u8FD9\u4E2A\u9879\u76EE\u91CC\u504F\u597D\u7528 dayjs \u800C\u4E0D\u662F moment" |
| 2 | \u5171\u4EAB\u9879\u76EE\u7EA7 | \u5F53\u524D\u9879\u76EE\u7684\u56E2\u961F\u89C4\u8303\uFF0C\u5176\u4ED6\u6210\u5458\u4E5F\u9700\u8981\u9075\u5B88 | "\u8FD9\u4E2A\u9879\u76EE\u7EDF\u4E00\u7528 Pinia"\u3001"\u9879\u76EE\u4F7F\u7528 Vue3 TSX \u6A21\u677F" |

\u5224\u5B9A\u539F\u5219\uFF1A
- \u5982\u679C\u4E60\u60EF\u6D89\u53CA\u5177\u4F53\u6280\u672F\u6808/\u5DE5\u5177\u504F\u597D\uFF0C\u5148\u770B\u5F53\u524D\u9879\u76EE\u4E0A\u4E0B\u6587\uFF1A\u4E0E\u9879\u76EE\u6280\u672F\u6808\u7ED1\u5B9A\u7684 \u2192 1\uFF0C\u4E0E\u9879\u76EE\u4EE3\u7801\u89C4\u8303\u7ED1\u5B9A\u7684 \u2192 2
- \u5982\u679C\u4E60\u60EF\u6D89\u53CA\u901A\u7528\u5DE5\u4F5C\u65B9\u5F0F\uFF08\u5199\u6587\u6863\u3001\u5BA1\u67E5\u3001\u63D0\u4EA4\uFF09\uFF0C\u4E14\u4E0D\u9650\u4E8E\u5F53\u524D\u9879\u76EE \u2192 0
- \u5982\u679C\u4E0D\u786E\u5B9A\uFF0C\u9ED8\u8BA4\u9009 1\uFF08\u4E2A\u4EBA\u9879\u76EE\u7EA7\uFF09\uFF0C\u5B81\u53EF\u4FDD\u5B88

## \u8BB0\u5FC6\u8DEF\u5F84

- path[0]\uFF08\u5168\u5C40\uFF09: ${memoryPaths[0]}
- path[1]\uFF08\u4E2A\u4EBA\u9879\u76EE\u7EA7\uFF09: ${memoryPaths[1] || "\uFF08\u672A\u4F20\u5165\u9879\u76EE\u76EE\u5F55\uFF09"}
- path[2]\uFF08\u5171\u4EAB\u9879\u76EE\u7EA7\uFF09: ${memoryPaths[2] || "\uFF08\u672A\u4F20\u5165\u6216\u4E0D\u5B58\u5728\uFF09"}

## \u53BB\u91CD\u7EA6\u675F\uFF08V3.5\uFF09

\u5982\u679C\u5206\u6790\u53D1\u73B0\u7684\u4E8B\u4EF6\u4E0E\u5DF2\u6709\u4E60\u60EF**\u672C\u8D28\u76F8\u540C**\uFF08\u4EC5\u63AA\u8F9E\u4E0D\u540C\uFF09\uFF0C\u5FC5\u987B\u8FD4\u56DE type="skip" \u800C\u4E0D\u662F create_block\u3002
\u5224\u65AD\u6807\u51C6\uFF1A\u4E24\u4E2A\u4E60\u60EF\u63CF\u8FF0\u7684**\u6838\u5FC3\u884C\u4E3A**\u76F8\u540C\u2014\u2014\u5373\u4F7F\u8868\u8FF0\u4E0D\u540C\u3001\u4E0A\u4E0B\u6587\u4E0D\u540C\uFF0C\u8BB2\u7684\u662F\u540C\u4E00\u4EF6\u4E8B\u3002

\u53CD\u4F8B\uFF1A
\u274C \u5DF2\u6709\u300C\u7528\u6237\u504F\u597D\u7528 ApexCharts\u300D\uFF0C\u4F60\u53C8\u521B\u5EFA\u300C\u7528\u6237\u7684\u56FE\u8868\u5E93\u504F\u597D\u300D\u2192 skip
\u274C \u5DF2\u6709\u300Cscss \u5199\u5B8C\u4E4B\u540E\u5BA1\u67E5\u300D\uFF0C\u4F60\u53C8\u521B\u5EFA\u300C\u7528\u6237\u4F1A\u624B\u52A8\u5BA1\u67E5 scss\u300D\u2192 skip
\u2705 \u5DF2\u6709\u300C\u63D0\u4EA4\u524D\u8DD1 eslint\u300D\uFF0C\u53D1\u73B0\u300C\u63D0\u4EA4\u524D\u8DD1 stylelint\u300D\u2192 create\uFF08\u4E0D\u540C\u884C\u4E3A\uFF09

\u8BF7\u5206\u6790\u5E76\u8FD4\u56DE JSON\u3002`;
}

// 分形/lib/no-feedback.ts
import fs from "node:fs";
var NO_FEEDBACK_THRESHOLD = 3;
function emptyNoFeedbackState() {
  return { consecutiveTurns: 0, lastSessionId: "", updatedAt: "" };
}
function readNoFeedbackState(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        consecutiveTurns: Number(raw.consecutiveTurns) || 0,
        lastSessionId: String(raw.lastSessionId || ""),
        updatedAt: String(raw.updatedAt || "")
      };
    }
  } catch {
  }
  return emptyNoFeedbackState();
}
function saveNoFeedbackState(filePath, state) {
  try {
    state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  } catch {
  }
}
function resetForNewSession(state, sessionId) {
  const sid = sessionId || "";
  if (sid && state.lastSessionId !== sid) {
    return { ...state, consecutiveTurns: 0, lastSessionId: sid };
  }
  return state;
}
function updateNoFeedbackCount(state, editsThisTurn, bashCalledThisTurn) {
  if (editsThisTurn > 0 && !bashCalledThisTurn) {
    return { ...state, consecutiveTurns: state.consecutiveTurns + 1 };
  }
  if (bashCalledThisTurn) {
    return { ...state, consecutiveTurns: 0 };
  }
  return state;
}
function buildNoFeedbackWarning(consecutiveTurns, threshold = NO_FEEDBACK_THRESHOLD) {
  if (consecutiveTurns < threshold) return null;
  return `
## \u26A0\uFE0F \u5206\u5F62\uFF1A\u7F3A\u5C11\u53CD\u9988\u73AF
\u8FDE\u7EED ${consecutiveTurns} \u8F6E\u4FEE\u6539\u4EE3\u7801\u4F46\u672A\u6267\u884C\u6D4B\u8BD5\u3002\u6309\u7167\u7ED3\u6784\u5316\u8C03\u8BD5\u6D41\u7A0B\uFF0C\u5148\u5EFA\u7ACB\u53CD\u9988\u73AF\u518D\u4FEE\u590D\uFF08Phase 1\uFF09\u3002\u5728\u4E0B\u4E00\u8F6E\u4FEE\u6539\u4EE3\u7801\u524D\uFF0C\u5148\u8DD1\u4E00\u6B21\u76F8\u5173\u6D4B\u8BD5\u5EFA\u7ACB"\u80FD\u53D8\u7EA2"\u7684\u53CD\u9988\u73AF\u3002
`;
}

// 分形/pipeline.ts
import fs2 from "node:fs";
import path from "node:path";
import os from "node:os";
var HOME = os.homedir();
var OC_CONFIG = path.join(HOME, ".config", "opencode");
var MEMORIES_DIR = path.join(OC_CONFIG, "memories");
var PIPELINE_STATE_FILE = path.join(MEMORIES_DIR, ".pipeline-state.json");
var LLM_SECTION_START = "<!-- LLM_SECTION_START -->";
var LLM_SECTION_END = "<!-- LLM_SECTION_END -->";
var HUMAN_SECTION_START = "<!-- HUMAN_SECTION_START -->";
var HUMAN_SECTION_END = "<!-- HUMAN_SECTION_END -->";
var DESIGN_DONE_RE = /### 设计完成/;
function getImplementDoneRE(taskType) {
  switch (taskType) {
    case "document":
      return /### 文档完成/;
    case "ppt":
      return /### PPT完成/;
    case "data":
      return /### 分析完成/;
    default:
      return /### 编码完成/;
  }
}
var GATE_RELEASE_RE = /设计对齐/;
var STAGE_ORDER = [
  "idle",
  "aligning",
  "designing",
  "planning",
  "implementing",
  "delivering"
];
function assessComplexity(ctx) {
  if (ctx.isExisting || ctx.isCrossModule || ctx.isNewModule || ctx.estimatedFiles >= 3) {
    return "complex";
  }
  return "simple";
}
function extractAlignmentContext(message) {
  const match = message.match(/设计对齐[\s\S]*?```json\s*([\s\S]*?)\s*```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return {
      feature: String(parsed.feature || "\u672A\u77E5\u529F\u80FD"),
      taskType: validateTaskType(parsed.taskType),
      isExisting: Boolean(parsed.isExisting),
      estimatedFiles: Number(parsed.estimatedFiles) || 1,
      isNewModule: Boolean(parsed.isNewModule),
      isCrossModule: Boolean(parsed.isCrossModule)
    };
  } catch {
    return null;
  }
}
function validateTaskType(raw) {
  const valid = ["web-app", "plugin", "document", "ppt", "data"];
  const s = String(raw || "web-app");
  return valid.includes(s) ? s : "web-app";
}
function splitAlignmentOutput(message) {
  const llmMatch = extractSection(message, LLM_SECTION_START, LLM_SECTION_END);
  const humanMatch = extractSection(message, HUMAN_SECTION_START, HUMAN_SECTION_END);
  if (!llmMatch && !humanMatch) return null;
  let llmContent = llmMatch;
  let degraded = false;
  if (!llmContent && humanMatch) {
    llmContent = extractFirstBullets(humanMatch);
    degraded = true;
  }
  return {
    llm: llmContent,
    human: humanMatch,
    degraded
  };
}
function extractSection(message, startMarker, endMarker) {
  const startIdx = message.indexOf(startMarker);
  if (startIdx === -1) return null;
  const contentStart = startIdx + startMarker.length;
  const endIdx = message.indexOf(endMarker, contentStart);
  if (endIdx === -1) return null;
  return message.slice(contentStart, endIdx).trim();
}
function extractFirstBullets(humanContent) {
  const lines = humanContent.split("\n");
  const bullets = [];
  let inBulletSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      inBulletSection = true;
      bullets.push(trimmed);
    } else if (inBulletSection && trimmed.length > 0 && !trimmed.startsWith("#")) {
      bullets[bullets.length - 1] += " " + trimmed;
    } else if (inBulletSection && trimmed.length === 0) {
      break;
    }
  }
  return bullets.length > 0 ? bullets.join("\n") : humanContent.slice(0, 500);
}
function checkDesignDoneSignal(message) {
  return DESIGN_DONE_RE.test(message);
}
function checkImplementDoneSignal(message, taskType) {
  return getImplementDoneRE(taskType).test(message);
}
function checkGateReleaseSignal(message) {
  return GATE_RELEASE_RE.test(message);
}
function readPipelineState() {
  try {
    if (!fs2.existsSync(PIPELINE_STATE_FILE)) return null;
    const raw = fs2.readFileSync(PIPELINE_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.pipelineId || !parsed.currentStage || !parsed.stages) return null;
    return parsed;
  } catch {
    return null;
  }
}
function writePipelineState(state) {
  try {
    const dir = path.dirname(PIPELINE_STATE_FILE);
    if (!fs2.existsSync(dir)) {
      fs2.mkdirSync(dir, { recursive: true });
    }
    state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    fs2.writeFileSync(PIPELINE_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
  }
}
function clearPipelineState() {
  try {
    if (fs2.existsSync(PIPELINE_STATE_FILE)) {
      fs2.unlinkSync(PIPELINE_STATE_FILE);
    }
  } catch {
  }
}
function generatePipelineId(feature) {
  const now = /* @__PURE__ */ new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  const shortFeature = feature.slice(0, 15).replace(/\s+/g, "-");
  return `${date}-${time}-${shortFeature}`;
}
function createPipelineState(ctx, flashComplexity) {
  const complexity = flashComplexity === "simple" ? "simple" : assessComplexity(ctx);
  const pipelineId = generatePipelineId(ctx.feature);
  const initialStage = flashComplexity === "simple" ? "implementing" : "designing";
  const stages = {
    aligning: { status: "completed", completedAt: (/* @__PURE__ */ new Date()).toISOString() },
    designing: initialStage === "implementing" ? { status: "skipped", completedAt: (/* @__PURE__ */ new Date()).toISOString() } : { status: "active", startedAt: (/* @__PURE__ */ new Date()).toISOString() },
    planning: initialStage === "implementing" ? { status: "skipped", completedAt: (/* @__PURE__ */ new Date()).toISOString() } : { status: "pending" },
    implementing: { status: initialStage === "implementing" ? "active" : "pending", ...initialStage === "implementing" ? { startedAt: (/* @__PURE__ */ new Date()).toISOString() } : {} },
    delivering: { status: "pending" }
  };
  return {
    pipelineId,
    status: "active",
    taskType: ctx.taskType,
    route: flashComplexity === "simple" ? "direct" : "full",
    complexity,
    context: ctx,
    currentStage: initialStage,
    stages,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function isStageComplete(state, projectDir, lastAssistantMessage) {
  if (state.currentStage === "designing") {
    return checkDesignStageComplete(state, projectDir, lastAssistantMessage);
  }
  if (state.currentStage === "implementing") {
    return lastAssistantMessage ? checkImplementDoneSignal(lastAssistantMessage, state.taskType) : false;
  }
  if (state.currentStage === "planning") {
    return checkPlanStageComplete(state);
  }
  return false;
}
function checkDesignStageComplete(state, projectDir, lastMsg) {
  const designFile = path.join(projectDir, "doc", "\u8BBE\u8BA1", `${state.context.feature}.md`);
  if (!fs2.existsSync(designFile)) return false;
  if (state.taskType === "web-app") {
    const protoFile = path.join(projectDir, "doc", "\u539F\u578B", `${state.context.feature}.md`);
    if (!fs2.existsSync(protoFile)) return false;
  }
  if (lastMsg && !checkDesignDoneSignal(lastMsg)) return false;
  return true;
}
function checkPlanStageComplete(state) {
  try {
    const plansDir = path.join(OC_CONFIG, "plans");
    if (!fs2.existsSync(plansDir)) return false;
    const files = fs2.readdirSync(plansDir).filter((f) => f.endsWith(".md"));
    return files.some((f) => f.includes(state.context.feature));
  } catch {
    return false;
  }
}
function transitionToNextStage(state) {
  const currentIdx = STAGE_ORDER.indexOf(state.currentStage);
  const nextStage = STAGE_ORDER[currentIdx + 1];
  if (!nextStage || nextStage === "idle") {
    if (state.currentStage !== "idle" && state.currentStage !== "aligning") {
      state.stages[state.currentStage].status = "completed";
      state.stages[state.currentStage].completedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    state.status = "completed";
    state.currentStage = "idle";
    state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    writePipelineState(state);
    return state;
  }
  if (state.currentStage !== "aligning") {
    if (state.currentStage !== "idle") {
      state.stages[state.currentStage].status = "completed";
    }
  }
  if (state.currentStage !== "idle") {
    state.stages[state.currentStage].completedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  state.currentStage = nextStage;
  state.stages[nextStage].status = "active";
  state.stages[nextStage].startedAt = (/* @__PURE__ */ new Date()).toISOString();
  state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  writePipelineState(state);
  return state;
}
function getStageStartPrompt(state) {
  const f = state.context.feature;
  const typeLabel = getTaskTypeLabel(state.taskType);
  switch (state.currentStage) {
    case "designing": {
      const isCodeTask = state.taskType === "web-app" || state.taskType === "plugin";
      if (isCodeTask) {
        return [
          `\u9700\u6C42\u5BF9\u9F50\u5B8C\u6210\u3002\u73B0\u5728\u8FDB\u5165**\u8BBE\u8BA1\u9636\u6BB5**\uFF08\u4EFB\u52A1\u7C7B\u578B\uFF1A${typeLabel}\uFF09\u3002`,
          "",
          `\u8BF7\u4F7F\u7528 \`mxy-design-doc\` skill \u4E3A\u300C${f}\u300D\u521B\u5EFA\u8BBE\u8BA1\u65B9\u6848\u3002`,
          `\u590D\u6742\u5EA6\uFF1A${state.complexity === "simple" ? "\u7B80\u5355\uFF08\u8981\u70B9\u5373\u53EF\uFF0C1-2 \u6BB5\uFF09" : "\u590D\u6742\uFF08\u5B8C\u6574\u6A21\u677F\uFF09"}\u3002`,
          "",
          "\u5B8C\u6210\u540E\u8F93\u51FA\u300C### \u8BBE\u8BA1\u5B8C\u6210\u300D\u4FE1\u53F7\u8FDB\u5165\u4E0B\u4E00\u9636\u6BB5\u3002"
        ].join("\n");
      }
      const steps = {
        document: "\u786E\u5B9A\u5927\u7EB2 \u2192 \u7AE0\u8282\u8981\u70B9 \u2192 \u8FB9\u754C\u7EA6\u675F \u2192 \u76EE\u6807\u8BFB\u8005",
        ppt: "\u786E\u5B9A\u9875\u6570 \u2192 \u6BCF\u9875\u4E3B\u9898 \u2192 \u6570\u636E\u6765\u6E90",
        data: "\u786E\u5B9A\u5206\u6790\u7EF4\u5EA6 \u2192 \u56FE\u8868\u7C7B\u578B \u2192 \u6570\u636E\u6E90"
      };
      const doneSignal = {
        document: "### \u8BBE\u8BA1\u5B8C\u6210",
        ppt: "### \u8BBE\u8BA1\u5B8C\u6210",
        data: "### \u8BBE\u8BA1\u5B8C\u6210"
      };
      const step = steps[state.taskType] || steps.document;
      const signal = doneSignal[state.taskType] || doneSignal.document;
      return [
        `\u884C\u4E3A\u524D\u95E8\u5BF9\u9F50\u5B8C\u6210\u3002\u73B0\u5728\u8FDB\u5165**\u8BBE\u8BA1\u9636\u6BB5**\uFF08\u4EFB\u52A1\u7C7B\u578B\uFF1A${typeLabel}\uFF09\u3002`,
        "",
        `\u8BF7\u4E3A\u300C${f}\u300D\u5B8C\u6210\u8BBE\u8BA1\uFF1A**${step}**\u3002`,
        `\u590D\u6742\u5EA6\uFF1A${state.complexity === "simple" ? "\u7B80\u5355\uFF08\u8981\u70B9\u5373\u53EF\uFF09" : "\u590D\u6742\uFF08\u5B8C\u6574\u89C4\u5212\uFF09"}\u3002`,
        "",
        `\u5B8C\u6210\u540E\u8F93\u51FA\u300C${signal}\u300D\u4FE1\u53F7\u8FDB\u5165\u4E0B\u4E00\u9636\u6BB5\u3002`
      ].join("\n");
    }
    case "planning":
      return [
        `\u8BBE\u8BA1\u65B9\u6848\u5DF2\u786E\u8BA4\u3002\u73B0\u5728\u8FDB\u5165**\u8BA1\u5212\u9636\u6BB5**\u3002`,
        "",
        `\u8BF7\u5C06\u300C${f}\u300D\u7684\u8BBE\u8BA1\u65B9\u6848\u62C6\u89E3\u4E3A\u5177\u4F53\u5B9E\u65BD\u4EFB\u52A1\uFF0C\u5199\u5165 \`~/.config/opencode/plans/\` \u76EE\u5F55\u3002`,
        `\u6BCF\u6B65 2-5 \u5206\u949F\u53EF\u5B8C\u6210\u3002${state.complexity === "simple" ? "3 \u6B65\u4EE5\u5185\u5373\u53EF\u3002" : "\u9700\u8981\u5B8C\u6574\u62C6\u89E3\u3002"}`
      ].join("\n");
    case "implementing": {
      const isCodeTask = state.taskType === "web-app" || state.taskType === "plugin";
      if (isCodeTask) {
        return [
          `\u8BA1\u5212\u5DF2\u786E\u8BA4\u3002\u73B0\u5728\u5F00\u59CB**\u7F16\u7801\u5B9E\u73B0**\u300C${f}\u300D\u3002`,
          "",
          "\u6309\u8BA1\u5212\u9010\u6B65\u5B9E\u73B0\uFF0C\u89E6\u53D1\u7EBF 1 \u4F1A\u81EA\u52A8\u5BA1\u67E5\u6BCF\u6B21\u6587\u4EF6\u7F16\u8F91\u3002",
          "\u7F16\u7801\u5B8C\u6210\u540E\u8F93\u51FA\u300C### \u7F16\u7801\u5B8C\u6210\u300D\u4FE1\u53F7\u8FDB\u5165\u5BA1\u67E5\u9636\u6BB5\u3002",
          "",
          `\u6CE8\u610F\uFF1A${state.complexity === "simple" ? "\u8FD9\u662F\u8F7B\u91CF\u529F\u80FD\uFF0C\u4FDD\u6301\u5B9E\u73B0\u7B80\u6D01\u3002" : "\u8FD9\u662F\u590D\u6742\u529F\u80FD\uFF0C\u6CE8\u610F\u8FB9\u754C\u5904\u7406\u548C\u6D4B\u8BD5\u8986\u76D6\u3002"}`
        ].join("\n");
      }
      const steps = {
        document: "\u6309\u7AE0\u8282\u9010\u8282\u64B0\u5199 \u2192 \u63D2\u56FE \u2192 \u5F15\u7528\u6838\u5B9E",
        ppt: "\u6309\u9875\u9010\u9875\u751F\u6210 \u2192 \u6570\u636E\u53EF\u89C6\u5316",
        data: "\u5199\u67E5\u8BE2 \u2192 \u751F\u6210\u56FE\u8868 \u2192 \u6807\u6CE8\u5F02\u5E38\u503C"
      };
      const doneSignals = {
        document: "### \u6587\u6863\u5B8C\u6210",
        ppt: "### PPT\u5B8C\u6210",
        data: "### \u5206\u6790\u5B8C\u6210"
      };
      const step = steps[state.taskType] || steps.document;
      return [
        `\u8BA1\u5212\u5DF2\u786E\u8BA4\u3002\u73B0\u5728\u5F00\u59CB**\u6267\u884C**\u300C${f}\u300D\u3002`,
        "",
        `\u6267\u884C\u6B65\u9AA4\uFF1A**${step}**\u3002`,
        `${state.complexity === "simple" ? "\u4FDD\u6301\u7B80\u6D01\uFF0C\u805A\u7126\u6838\u5FC3\u4EA7\u51FA\u3002" : "\u8FFD\u6C42\u5B8C\u6574\u5EA6\uFF0C\u6CE8\u610F\u7EC6\u8282\u3002"}`,
        "",
        `\u5B8C\u6210\u540E\u8F93\u51FA\u300C${doneSignals[state.taskType]}\u300D\u4FE1\u53F7\u8FDB\u5165\u5BA1\u67E5\u9636\u6BB5\u3002`
      ].join("\n");
    }
    case "delivering": {
      const isCodeTask = state.taskType === "web-app" || state.taskType === "plugin";
      if (isCodeTask) {
        return [
          `\u7F16\u7801\u5B8C\u6210\u3002\u73B0\u5728\u8FDB\u5165**\u4EA4\u4ED8\u5BA1\u67E5**\u3002`,
          "",
          "\u8BF7\u4F7F\u7528 `mxy-commit-review` skill \u8FDB\u884C\u6700\u7EC8\u5BA1\u67E5\u5E76\u63D0\u4EA4\u3002",
          "\u5BA1\u67E5\u901A\u8FC7\u540E\u6D41\u6C34\u7EBF\u81EA\u52A8\u5B8C\u6210\u3002"
        ].join("\n");
      }
      const checks = {
        document: "\u683C\u5F0F\u5BA1\u67E5\uFF1A\u6807\u9898\u5C42\u7EA7\u3001\u9519\u522B\u5B57\u3001\u5F15\u7528\u94FE\u63A5\u3001\u56FE\u7247\u4F4D\u7F6E",
        ppt: "\u89C6\u89C9\u4E00\u81F4\u6027\u68C0\u67E5\uFF1A\u5B57\u4F53\u3001\u989C\u8272\u3001\u56FE\u8868\u6BD4\u4F8B",
        data: "\u6570\u636E\u51C6\u786E\u6027\u6821\u9A8C\uFF1A\u6837\u672C\u91CF\u3001\u5F02\u5E38\u503C\u3001\u5355\u4F4D\u6807\u6CE8"
      };
      const check = checks[state.taskType] || checks.document;
      return [
        `\u6267\u884C\u5B8C\u6210\u3002\u73B0\u5728\u8FDB\u5165**\u4EA4\u4ED8\u5BA1\u67E5**\u3002`,
        "",
        `\u5BA1\u67E5\u91CD\u70B9\uFF1A**${check}**\u3002`,
        "\u5BA1\u67E5\u901A\u8FC7\u540E\u6D41\u6C34\u7EBF\u81EA\u52A8\u5B8C\u6210\u3002"
      ].join("\n");
    }
    default:
      return null;
  }
}
function getTaskTypeLabel(type) {
  const labels = {
    "web-app": "Web \u5E94\u7528",
    "plugin": "\u63D2\u4EF6/\u5DE5\u5177",
    "document": "\u6587\u6863",
    "ppt": "PPT",
    "data": "\u6570\u636E\u5206\u6790"
  };
  return labels[type] || "\u672A\u77E5";
}
function isStageSkipRequest(message) {
  return /跳过.*设计|跳过.*文档|跳过.*计划|算了.*不写|不写.*设计|不写.*计划|直接.*改代码|直接.*编码/.test(message);
}
function isTaskCancelRequest(message) {
  return /取消任务|放弃.*任务|不做.*了/.test(message);
}
function getStageSkipRejection(feature) {
  return [
    `\u6D41\u6C34\u7EBF\u4E0D\u53EF\u8DF3\u9636\u6BB5\u3002`,
    `\u300C${feature}\u300D\u5C0F\u529F\u80FD\u8BBE\u8BA1\u6587\u6863\u51E0\u5206\u949F\u5C31\u5199\u5B8C\uFF0C\u5927\u529F\u80FD\u4E0D\u5199\u5C31\u662F\u5728\u9020\u5C4E\u5C71\u3002`,
    "\u5982\u9700\u653E\u5F03\u6574\u4E2A\u4EFB\u52A1\uFF0C\u8BF4\u300C\u53D6\u6D88\u4EFB\u52A1\u300D\u3002"
  ].join("\n");
}

// 分形/dedup-checker.ts
import fs3 from "node:fs";
import path2 from "node:path";
import os2 from "node:os";
var HOME2 = os2.homedir();
var MEMORIES_DIR2 = path2.join(HOME2, ".config", "opencode", "memories");
var DEDUP_STATE_FILE = path2.join(MEMORIES_DIR2, ".dedup-last-check.json");
var DEDUP_CHECK_INTERVAL = 15;
function readDedupState() {
  try {
    if (fs3.existsSync(DEDUP_STATE_FILE)) {
      return JSON.parse(fs3.readFileSync(DEDUP_STATE_FILE, "utf-8"));
    }
  } catch {
  }
  return { lastCheckTurn: 0, lastCheckTime: "", totalCompared: 0, duplicatesFound: 0 };
}
function writeDedupState(state) {
  try {
    fs3.writeFileSync(DEDUP_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
  }
}
function extractKeywords(text) {
  const words = /* @__PURE__ */ new Set();
  const lowerText = text.toLowerCase();
  const enWords = lowerText.match(/[a-z]{3,}/g);
  if (enWords) enWords.forEach((w) => words.add(w));
  const cnChars = lowerText.replace(/[^\u4e00-\u9fa5]/g, "");
  for (let i = 0; i < cnChars.length - 1; i++) {
    words.add(cnChars.slice(i, i + 2));
  }
  for (let i = 0; i < cnChars.length - 2; i++) {
    words.add(cnChars.slice(i, i + 3));
  }
  return [...words].filter((w) => w.length >= 2);
}
function keywordOverlap(textA, textB) {
  const kwA = extractKeywords(textA);
  const kwB = extractKeywords(textB);
  if (kwA.length === 0 || kwB.length === 0) return 0;
  const setA = new Set(kwA);
  const intersection = kwB.filter((k) => setA.has(k)).length;
  const union = (/* @__PURE__ */ new Set([...kwA, ...kwB])).size;
  return intersection / union;
}
var KEYWORD_THRESHOLD = 0.4;
function loadAllMemories(projectDir) {
  const items = [];
  const statusDirs = ["pending", "auto", "suggest"];
  const globalRoots = [
    [path2.join(MEMORIES_DIR2, "blocks"), path2.join(MEMORIES_DIR2, "triggers")]
  ];
  if (projectDir) {
    const projectMemories = path2.join(projectDir, ".opencode", "memories");
    if (fs3.existsSync(projectMemories)) {
      const projectBlocks = path2.join(projectMemories, "blocks");
      const projectTriggers = path2.join(projectMemories, "triggers");
      if (fs3.existsSync(projectBlocks) || fs3.existsSync(projectTriggers)) {
        globalRoots.push([projectBlocks, projectTriggers]);
      }
    }
  }
  for (const [blocksDir, triggersDir] of globalRoots) {
    for (const [rootDir, type] of [[blocksDir, "block"], [triggersDir, "trigger"]]) {
      for (const sd of statusDirs) {
        const dir = path2.join(rootDir, sd);
        if (!fs3.existsSync(dir)) continue;
        try {
          for (const f of fs3.readdirSync(dir).filter((f2) => f2.endsWith(".md"))) {
            const content = fs3.readFileSync(path2.join(dir, f), "utf-8");
            const item = parseMemoryFile(f, path2.join(dir, f).replace(HOME2, "~"), content, type);
            if (item) items.push(item);
          }
        } catch {
        }
      }
      if (fs3.existsSync(rootDir)) {
        try {
          for (const f of fs3.readdirSync(rootDir).filter((f2) => f2.endsWith(".md"))) {
            const content = fs3.readFileSync(path2.join(rootDir, f), "utf-8");
            const item = parseMemoryFile(f, path2.join(rootDir, f).replace(HOME2, "~"), content, type);
            if (item && !items.some((e) => e.fileName === item.fileName && e.memPath === item.memPath)) {
              items.push(item);
            }
          }
        } catch {
        }
      }
    }
  }
  return items;
}
function parseMemoryFile(fileName, memPath, content, type) {
  const labelMatch = content.match(/<!-- label:\s*(.+?)\s*-->/);
  const descMatch = content.match(/<!-- description:\s*(.+?)\s*-->/);
  const humanDescMatch = content.match(/<!-- human_description:\s*(.+?)\s*-->/);
  const label = labelMatch?.[1] || fileName.replace(".md", "");
  const description = descMatch?.[1] || humanDescMatch?.[1] || "";
  if (!description) return null;
  return { fileName, label, description, human_description: humanDescMatch?.[1], content, memPath, type };
}
function buildDedupPrompt(a, b) {
  const systemPrompt = `\u4F60\u662F\u8BB0\u5FC6\u53BB\u91CD\u5BA1\u67E5\u5458\u3002\u5224\u65AD\u4EE5\u4E0B\u4E24\u4E2A\u8BB0\u5FC6\u5757\u662F\u5426\u63CF\u8FF0\u7684\u662F\u540C\u4E00\u4E2A\u4E60\u60EF\u6216\u77E5\u8BC6\u70B9\u3002

\u5224\u65AD\u6807\u51C6\uFF1A
- \u6838\u5FC3\u884C\u4E3A/\u6838\u5FC3\u77E5\u8BC6\u70B9\u76F8\u540C \u2192 \u662F\uFF08\u5373\u4F7F\u8868\u8FF0\u4E0D\u540C\u3001\u63AA\u8F9E\u4E0D\u540C\uFF09\u3002
- \u6838\u5FC3\u884C\u4E3A/\u6838\u5FC3\u77E5\u8BC6\u70B9\u4E0D\u540C \u2192 \u5426\u3002
- \u5982\u679C\u4E0D\u786E\u5B9A \u2192 \u5426\uFF08\u5B81\u53EF\u6F0F\u6389\uFF0C\u4E0D\u8BEF\u5224\uFF09\u3002

\u56DE\u7B54\u683C\u5F0F\uFF1A\u53EA\u56DE\u7B54\u4E00\u4E2A JSON\uFF1A
{ "duplicate": true/false, "reason": "\u4E00\u53E5\u8BDD\u8BF4\u660E\u4E3A\u4EC0\u4E48" }`;
  const userPrompt = `\u8BB0\u5FC6 A (${a.type} / ${a.fileName}):
\u63CF\u8FF0: ${a.description}
\u5185\u5BB9\u6458\u8981: ${a.content.slice(0, 500)}

\u8BB0\u5FC6 B (${b.type} / ${b.fileName}):
\u63CF\u8FF0: ${b.description}
\u5185\u5BB9\u6458\u8981: ${b.content.slice(0, 500)}`;
  return { systemPrompt, userPrompt };
}
async function callLLMForDedup(a, b, apiConfig) {
  const { systemPrompt, userPrompt } = buildDedupPrompt(a, b);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1e4);
    const response = await fetch(`${apiConfig.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: apiConfig.primaryModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 200,
        thinking: { type: "disabled" }
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return { duplicate: Boolean(parsed.duplicate), reason: parsed.reason || "" };
  } catch {
    return null;
  }
}
async function runDedupCheck(turnCounter, forceCheck, apiConfig, debugLog, projectDir) {
  const state = readDedupState();
  if (!forceCheck && turnCounter - state.lastCheckTurn < DEDUP_CHECK_INTERVAL) {
    return [];
  }
  debugLog(`DEDUP: \u5F00\u59CB\u68C0\u67E5 (turn=${turnCounter})`);
  const items = loadAllMemories(projectDir);
  if (items.length < 2) {
    debugLog(`DEDUP: \u8BB0\u5FC6\u9879\u4E0D\u8DB3 (${items.length})\uFF0C\u8DF3\u8FC7`);
    state.lastCheckTurn = turnCounter;
    state.lastCheckTime = (/* @__PURE__ */ new Date()).toISOString();
    writeDedupState(state);
    return [];
  }
  const candidates = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const textA = `${items[i].description}
${items[i].human_description || ""}
${items[i].content}`;
      const textB = `${items[j].description}
${items[j].human_description || ""}
${items[j].content}`;
      const overlap = keywordOverlap(textA, textB);
      if (overlap >= KEYWORD_THRESHOLD) {
        candidates.push({ a: items[i], b: items[j], overlap });
      }
    }
  }
  debugLog(`DEDUP: \u5173\u952E\u8BCD\u521D\u7B5B ${candidates.length}/${items.length * (items.length - 1) / 2} \u5BF9\u5019\u9009`);
  if (candidates.length === 0) {
    state.lastCheckTurn = turnCounter;
    state.lastCheckTime = (/* @__PURE__ */ new Date()).toISOString();
    writeDedupState(state);
    return [];
  }
  const results = [];
  if (apiConfig) {
    const MAX_CONCURRENT = 5;
    for (let i = 0; i < candidates.length; i += MAX_CONCURRENT) {
      const batch = candidates.slice(i, i + MAX_CONCURRENT);
      const batchResults = await Promise.all(
        batch.map(async (c) => {
          const llmResult = await callLLMForDedup(c.a, c.b, apiConfig);
          if (llmResult?.duplicate) {
            return {
              itemA: { fileName: c.a.fileName, label: c.a.label, memPath: c.a.memPath, content: c.a.content, type: c.a.type },
              itemB: { fileName: c.b.fileName, label: c.b.label, memPath: c.b.memPath, content: c.b.content, type: c.b.type },
              keywordOverlap: c.overlap
            };
          }
          state.totalCompared++;
          return null;
        })
      );
      for (const r of batchResults) {
        if (r) {
          results.push(r);
          state.duplicatesFound++;
        }
      }
    }
  }
  state.lastCheckTurn = turnCounter;
  state.lastCheckTime = (/* @__PURE__ */ new Date()).toISOString();
  writeDedupState(state);
  debugLog(`DEDUP: \u5B8C\u6210 \u2014 \u5BF9\u6BD4 ${state.totalCompared} \u6B21, \u53D1\u73B0 ${state.duplicatesFound} \u5BF9`);
  return results;
}
function buildDedupReminder(results) {
  if (results.length === 0) return "";
  const maxShow = 3;
  const shown = results.slice(0, maxShow);
  const more = results.length > maxShow ? `
...\u8FD8\u6709 ${results.length - maxShow} \u5BF9\u672A\u5217\u51FA\u3002` : "";
  const items = shown.map((r, i) => {
    return `**${i + 1}.** ${r.itemA.fileName} (${r.itemA.type})
   \u2194 ${r.itemB.fileName} (${r.itemB.type}) | \u5173\u952E\u8BCD\u91CD\u53E0: ${Math.round(r.keywordOverlap * 100)}%
   A: ${r.itemA.label}
   B: ${r.itemB.label}`;
  }).join("\n\n");
  return `\u5206\u5F62\u53BB\u91CD\u5BA1\u67E5\uFF1A\u53D1\u73B0 ${results.length} \u5BF9\u7591\u4F3C\u91CD\u590D\u7684\u8BB0\u5FC6\u3002\u8BF7\u68C0\u67E5\u662F\u5426\u9700\u8981\u5408\u5E76\uFF1A

${items}${more}

\u786E\u8BA4\u65B9\u5F0F\uFF1A\u8BF4"\u5408\u5E76\u8BB0\u5FC6 {\u5E8F\u53F7}" \u9010\u5BF9\u5904\u7406\uFF0C\u6216\u8BF4"\u90FD\u4E0D\u5408\u5E76"\u8DF3\u8FC7\u3002`;
}

// 分形/engine/engine.ts
import fs4 from "node:fs";
import path3 from "node:path";

// 分形/engine/bm25.ts
var BM25_K1 = 1.5;
var BM25_B = 0.75;
var BM25Index = class {
  /** 文档存储：path → SearchDoc */
  docs = /* @__PURE__ */ new Map();
  /** 倒排索引：term → [{docPath, termFreq}] */
  inverted = /* @__PURE__ */ new Map();
  /** 文档长度（token 数） */
  lengths = /* @__PURE__ */ new Map();
  /** 总文档数 */
  N = 0;
  /** 平均文档长度 */
  avgdl = 0;
  // ============================================================
  // 公开 API
  // ============================================================
  /** 添加/更新一篇文档到索引 */
  index(doc) {
    const isUpdate = this.docs.has(doc.filePath);
    if (isUpdate) this._removeDoc(doc.filePath);
    this.docs.set(doc.filePath, doc);
    if (!isUpdate) this.N++;
    const text = `${doc.title} ${doc.description} ${doc.body}`;
    const tokens = tokenize(text);
    const tfMap = /* @__PURE__ */ new Map();
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
    }
    const docLen = tokens.length;
    this.lengths.set(doc.filePath, docLen);
    this._updateAvgdl();
    for (const [term, tf] of tfMap) {
      const postings = this.inverted.get(term) || [];
      const existing = postings.find((p) => p.path === doc.filePath);
      if (existing) {
        existing.tf = tf;
      } else {
        postings.push({ path: doc.filePath, tf });
      }
      this.inverted.set(term, postings);
    }
  }
  /** 搜索：返回 top-K 结果 */
  search(query, topK = 5) {
    if (this.N === 0) return [];
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];
    const scores = /* @__PURE__ */ new Map();
    for (const qt of queryTokens) {
      const postings = this.inverted.get(qt);
      if (!postings) continue;
      const n = postings.length;
      const idf = Math.log((this.N - n + 0.5) / (n + 0.5) + 1);
      for (const { path: path5, tf } of postings) {
        const docLen = this.lengths.get(path5) || 1;
        const numerator = tf * (BM25_K1 + 1);
        const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / this.avgdl));
        scores.set(path5, (scores.get(path5) || 0) + idf * numerator / denominator);
      }
    }
    return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, topK).map(([path5, score]) => ({
      doc: this.docs.get(path5),
      score: Math.round(score * 1e3) / 1e3
      // 保留 3 位小数
    }));
  }
  /** 从索引中删除一篇文档 */
  remove(filePath) {
    if (!this.docs.has(filePath)) return;
    this._removeDoc(filePath);
    this.N--;
    this._updateAvgdl();
  }
  /** 获取文档数 */
  get size() {
    return this.N;
  }
  /** 重建索引（清空后批量添加） */
  rebuild(docs) {
    this.docs.clear();
    this.inverted.clear();
    this.lengths.clear();
    this.N = 0;
    this.avgdl = 0;
    for (const doc of docs) {
      this.index(doc);
    }
  }
  // ============================================================
  // 内部方法
  // ============================================================
  _removeDoc(filePath) {
    this.docs.delete(filePath);
    this.lengths.delete(filePath);
    for (const [term, postings] of this.inverted) {
      const idx = postings.findIndex((p) => p.path === filePath);
      if (idx !== -1) {
        postings.splice(idx, 1);
        if (postings.length === 0) this.inverted.delete(term);
      }
    }
  }
  _updateAvgdl() {
    if (this.lengths.size === 0) {
      this.avgdl = 0;
      return;
    }
    let sum = 0;
    for (const len of this.lengths.values()) sum += len;
    this.avgdl = sum / this.lengths.size;
  }
};
function tokenize(text) {
  const tokens = [];
  const segments = splitMixed(text);
  for (const seg of segments) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(seg)) {
      const chars = [...seg];
      for (let i = 0; i < chars.length - 1; i++) {
        tokens.push(chars[i] + chars[i + 1]);
      }
      tokens.push(seg);
    } else {
      const lowered = seg.toLowerCase();
      const words = lowered.split(/[\s.,;:!?()\[\]{}"'`~@#$%^&*+=|\\/<>\-]+/).filter(Boolean);
      for (const w of words) {
        if (w.length > 1) tokens.push(w);
      }
    }
  }
  return tokens;
}
function splitMixed(text) {
  const result = [];
  let buf = "";
  let isCJK = false;
  for (const ch of text) {
    const chIsCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch);
    if (buf.length === 0) {
      isCJK = chIsCJK;
      buf = ch;
    } else if (chIsCJK === isCJK && ch !== " ") {
      buf += ch;
    } else {
      if (buf.trim()) result.push(buf.trim());
      isCJK = chIsCJK;
      buf = ch;
    }
  }
  if (buf.trim()) result.push(buf.trim());
  return result;
}

// 分形/engine/vector.ts
import { execSync } from "node:child_process";
var MODEL_ID = "Xenova/bge-small-zh-v1.5";
var DIM = 384;
var RRF_K = 60;
var W_BM25 = 0.7;
var W_VEC = 0.3;
function rrfFuse(bm25Ranks, vecRanks, topK = 5) {
  const acc = /* @__PURE__ */ new Map();
  bm25Ranks.forEach((h, i) => {
    const rank = i + 1;
    acc.set(h.filePath, (acc.get(h.filePath) || 0) + W_BM25 / (RRF_K + rank));
  });
  vecRanks.forEach((h, i) => {
    const rank = i + 1;
    acc.set(h.filePath, (acc.get(h.filePath) || 0) + W_VEC / (RRF_K + rank));
  });
  return [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([filePath, score]) => ({ filePath, score }));
}
var VectorIndex = class {
  /** transformers.js 的 feature-extraction pipeline 实例（懒加载） */
  extractor = null;
  /** 文档向量表：filePath → 归一化向量 */
  vectors = /* @__PURE__ */ new Map();
  /** 模型缓存目录（transformers.js 下载模型的落盘位置） */
  cacheDir;
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
  }
  /** 模型是否就绪（未加载或加载失败 = false） */
  get ready() {
    return this.extractor !== null;
  }
  /** 已索引的文档数 */
  get size() {
    return this.vectors.size;
  }
  /** 向量维度（用于测试断言） */
  get dim() {
    return DIM;
  }
  /**
   * 懒加载模型（幂等，并发安全）
   * @returns true=模型就绪；false=加载失败（降级 BM25，不抛错）
   */
  async ensureModel() {
    if (this.extractor) return true;
    try {
      const mod = await import("@huggingface/transformers");
      if (this.cacheDir) mod.env.cacheDir = this.cacheDir;
      await _applySystemProxy();
      const pipe = await mod.pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
      this.extractor = pipe;
      return true;
    } catch (e) {
      console.error(`[vector] ensureModel \u5931\u8D25\uFF0C\u964D\u7EA7 BM25: ${String(e)}`);
      this.extractor = null;
      return false;
    }
  }
  /** 文本 → 384 维归一化向量（模型未就绪返回 null） */
  async embed(text) {
    if (!this.extractor) return null;
    try {
      const out = await this.extractor(text, { pooling: "mean", normalize: true });
      return new Float32Array(out.data);
    } catch {
      return null;
    }
  }
  /** 重建索引：把文档全部向量化（幂等重建，调用前需 ensureModel） */
  async rebuild(docs) {
    if (!this.extractor) return;
    this.vectors.clear();
    for (const d of docs) {
      const v = await this.embed(d.text);
      if (v) this.vectors.set(d.filePath, v);
    }
  }
  /** 语义搜索：query 向量与所有文档向量做点积（已归一化 → 余弦） */
  async search(query, topK = 5) {
    if (!this.extractor || this.vectors.size === 0) return [];
    const qv = await this.embed(query);
    if (!qv) return [];
    const hits = [];
    for (const [filePath, vec] of this.vectors) {
      hits.push({ filePath, score: _dot(qv, vec) });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }
  /** 清空索引（配合 refresh） */
  clear() {
    this.vectors.clear();
  }
};
function _dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
}
async function _applySystemProxy() {
  try {
    let proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (!proxy && process.platform === "win32") {
      try {
        const enabled = _regQuery("ProxyEnable");
        if (enabled && enabled.includes("0x1")) {
          const server = _regQuery("ProxyServer");
          if (server) proxy = server.trim();
        }
      } catch {
      }
    }
    if (!proxy) return;
    try {
      const { setGlobalDispatcher, ProxyAgent } = await import("undici");
      const url = proxy.startsWith("http") ? proxy : `http://${proxy}`;
      setGlobalDispatcher(new ProxyAgent(url));
    } catch {
    }
  } catch {
  }
}
function _regQuery(valueName) {
  const out = execSync(
    `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ${valueName}`,
    { encoding: "utf-8", windowsHide: true }
  );
  const m = out.match(/REG_\w+\s+(.+)/);
  return m ? m[1].trim() : null;
}

// 分形/engine/engine.ts
var STATUS_DIRS = ["pending", "auto", "suggest"];
var KnowledgeEngine = class _KnowledgeEngine {
  dirs;
  opts;
  bm25;
  blocks = [];
  initialized = false;
  /** 语义向量索引（V4 P2，可选挂载；未挂载或模型不可用 → 纯 BM25） */
  vector = null;
  constructor(dirs, opts) {
    this.dirs = dirs.filter((d) => typeof d === "string" && d.length > 0);
    this.opts = { bodyLength: opts?.bodyLength ?? 200 };
    this.bm25 = new BM25Index();
  }
  // ============================================================
  // 公开 API
  // ============================================================
  /** 扫描所有目录，解析元数据，构建 BM25 索引（同步） */
  init() {
    this._scanAll();
    this._buildIndex();
    this.initialized = true;
  }
  /** BM25 搜索（同步，纯内存操作） */
  search(query, topK = 5) {
    if (!this.initialized) this.init();
    const results = this.bm25.search(query, topK);
    return results.map((r) => ({
      doc: this._docToBlockMeta(r.doc),
      score: r.score
    }));
  }
  /**
   * 挂载语义向量索引（V4 P2）
   * 传入的 VectorIndex 负责模型加载与向量重建，引擎只负责融合搜索
   */
  setVectorIndex(v) {
    this.vector = v;
  }
  /** 向量索引是否可用（未挂载或模型未就绪 = false） */
  get vectorReady() {
    return this.vector !== null && this.vector.ready;
  }
  /**
   * 融合搜索（V4 P2+P3）：向量就绪 → RRF 融合 BM25 + 语义；否则降级纯 BM25
   * 注意：异步（embedding 是异步 API），调用方需 await；BM25 路径无额外延迟
   */
  async searchHybrid(query, topK = 5) {
    if (!this.initialized) this.init();
    if (!this.vectorReady) {
      return this.search(query, topK);
    }
    const bm25Results = this.bm25.search(query, topK * 2);
    const vecResults = await this.vector.search(query, topK * 2);
    if (bm25Results.length === 0 && vecResults.length === 0) return [];
    const fused = rrfFuse(
      bm25Results.map((r) => ({ filePath: r.doc.filePath })),
      vecResults.map((r) => ({ filePath: r.filePath })),
      topK
    );
    return fused.map((f) => {
      const doc = this.blocks.find((b) => b.fileName === f.filePath);
      return doc ? { doc, score: f.score } : null;
    }).filter((x) => x !== null);
  }
  /** 返回所有已索引的 knowledge block 元数据 */
  list() {
    if (!this.initialized) this.init();
    return [...this.blocks];
  }
  /** 返回索引统计 */
  stats() {
    if (!this.initialized) this.init();
    return {
      totalBlocks: this.blocks.length,
      indexed: this.bm25.size,
      vectorReady: this.vectorReady
    };
  }
  /** 手动重建索引（重新扫描目录） */
  refresh() {
    this.blocks = [];
    this.bm25 = new BM25Index();
    this._scanAll();
    this._buildIndex();
    this.initialized = true;
  }
  /**
   * 直接喂入 blocks 列表并重建索引（不扫描目录）
   * 用于 fractal 从缓存取 blocks 后直接搜索，避免重复 IO
   */
  feedBlocks(blocks) {
    this.blocks = blocks;
    this.bm25 = new BM25Index();
    this._buildIndex();
    this.initialized = true;
  }
  // ============================================================
  // 静态工具方法（供 fractal triggers 解析复用）
  // ============================================================
  /**
   * 解析 HTML 注释元数据
   * 格式：<!-- key: value -->
   * @param maxIndex 仅解析前 N 个字符，防止扫描全文件
   */
  static parseMeta(content, maxIndex = 100) {
    const meta = {};
    const commentRegex = /<!--\s*(\w+):\s*(.*?)\s*-->/g;
    let match;
    while ((match = commentRegex.exec(content)) !== null) {
      if (match.index > maxIndex) break;
      meta[match[1]] = match[2].trim();
    }
    return Object.keys(meta).length > 0 ? meta : null;
  }
  /**
   * 扫描目录下的所有 .md 文件（兼容 flat + status 子目录）
   * 返回 { fileName, content, relPath }
   */
  static scanDir(dirPath) {
    const results = [];
    if (fs4.existsSync(dirPath)) {
      for (const entry of fs4.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const filePath = path3.join(dirPath, entry.name);
          results.push({
            fileName: entry.name,
            content: _safeReadFile(filePath),
            relPath: entry.name
          });
        }
      }
    }
    for (const sub of STATUS_DIRS) {
      const subDir = path3.join(dirPath, sub);
      if (fs4.existsSync(subDir)) {
        for (const entry of fs4.readdirSync(subDir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith(".md")) {
            const filePath = path3.join(subDir, entry.name);
            results.push({
              fileName: entry.name,
              content: _safeReadFile(filePath),
              relPath: `${sub}/${entry.name}`
            });
          }
        }
      }
    }
    return results;
  }
  // ============================================================
  // 内部方法
  // ============================================================
  /** 扫描所有目录并解析元数据 */
  _scanAll() {
    const seen = /* @__PURE__ */ new Set();
    for (const dir of this.dirs) {
      if (!fs4.existsSync(dir)) continue;
      const entries = _KnowledgeEngine.scanDir(dir);
      for (const entry of entries) {
        const meta = _KnowledgeEngine.parseMeta(entry.content, 400);
        if (!meta) continue;
        const label = meta.label || entry.fileName.replace(".md", "");
        const block = {
          fileName: entry.fileName,
          relPath: `blocks/${entry.relPath}`,
          status: meta.status || "auto",
          type: meta.type || "knowledge",
          label,
          description: meta.description || "",
          priority: parseInt(meta.priority, 10) || 50,
          body: _extractBody(entry.content).slice(0, this.opts.bodyLength)
        };
        if (seen.has(label)) {
          const idx = this.blocks.findIndex((b) => b.label === label);
          if (idx !== -1) this.blocks[idx] = block;
        } else {
          this.blocks.push(block);
          seen.add(label);
        }
      }
    }
  }
  /** 把所有有 description 的 blocks 构建到 BM25 索引 */
  _buildIndex() {
    const docs = [];
    for (const b of this.blocks) {
      if (!b.description) continue;
      docs.push({
        filePath: b.fileName,
        fileName: b.fileName,
        title: b.label,
        description: b.description,
        body: b.body
      });
    }
    this.bm25.rebuild(docs);
  }
  /** 将内部 SearchDoc 转换为 BlockMeta（搜索结果映射） */
  _docToBlockMeta(doc) {
    return this.blocks.find((b) => b.fileName === doc.fileName) || {
      fileName: doc.fileName,
      relPath: "",
      status: "",
      type: "",
      label: doc.title,
      description: doc.description,
      priority: 0,
      body: doc.body
    };
  }
};
function _safeReadFile(filePath) {
  try {
    return fs4.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}
function _extractBody(content) {
  const lines = content.split("\n");
  const valueLines = [];
  let inMeta = true;
  for (const line of lines) {
    if (inMeta && line.trim().startsWith("<!--")) continue;
    if (inMeta && line.trim() === "") continue;
    inMeta = false;
    valueLines.push(line);
  }
  return valueLines.join("\n").trim();
}

// 分形/fractal.ts
var _FRACTAL_DEBUG_FLAG = path4.join(os3.homedir(), ".config", "opencode", "memories", ".fractal-debug");
var _FRACTAL_DEBUG_LOG = path4.join(os3.homedir(), ".config", "opencode", "memories", "fractal-startup.log");
var _IS_FRACTAL_DEBUG = fs5.existsSync(_FRACTAL_DEBUG_FLAG);
var _fractalDebug = _IS_FRACTAL_DEBUG ? (label) => {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${label}
`;
  try {
    fs5.appendFileSync(_FRACTAL_DEBUG_LOG, line);
  } catch {
  }
  console.log(`[fractal:debug] ${label}`);
} : (_label) => {
};
_fractalDebug("MODULE: imported");
var v4knowledgeEngine = new KnowledgeEngine([]);
var v4VectorIndex = null;
var HOME3 = os3.homedir();
var OC_CONFIG2 = path4.join(HOME3, ".config", "opencode");
var MEMORIES_DIR3 = path4.join(OC_CONFIG2, "memories");
var BLOCKS_DIR = path4.join(MEMORIES_DIR3, "blocks");
var TRIGGERS_DIR = path4.join(MEMORIES_DIR3, "triggers");
var EVENT_LOG = path4.join(MEMORIES_DIR3, "events.log");
var DEBUG_LOG = path4.join(MEMORIES_DIR3, "debug.log");
var LAST_ANALYSIS = path4.join(MEMORIES_DIR3, "last-analysis.json");
var PAUSE_PREFIX = path4.join(MEMORIES_DIR3, ".fractal-pause-");
var LEARN_FLAG = path4.join(MEMORIES_DIR3, ".fractal-learn-flag.json");
var PROMPT_DIR = path4.join(OC_CONFIG2, "fractal-prompts");
var PLANS_DIR = path4.join(OC_CONFIG2, "plans");
var ANALYSIS_THRESHOLD = 20;
var MAX_EVENTS_FOR_ANALYSIS = 200;
var MAX_LOG_SIZE = 1 * 1024 * 1024;
var ASSERTION_FLAG = path4.join(MEMORIES_DIR3, ".assertion-flag.json");
var ASSERTION_COUNTER = path4.join(MEMORIES_DIR3, ".assertion-counter.json");
var NO_FEEDBACK_STATE = path4.join(MEMORIES_DIR3, ".no-feedback-loop.json");
var ASSERTION_RE = /(?:不支持|做不到|只有\s*\d+\s*种|(?<!\S)(?:没有|缺少)\s+\S+|不存在|无法\s+\S+|远[比低高]\S+|过于\S+)/;
var WEBSEARCH_TOOLS = /websearch|web_search|webfetch/;
var COUNTER_DECAY_TURNS = 3;
var ASSERTION_SECTION_THRESHOLDS = [1, 3];
function isLinePaused(line) {
  try {
    return fs5.existsSync(PAUSE_PREFIX + line + ".json");
  } catch {
    return false;
  }
}
function loadPrompt(filename, fallback) {
  try {
    const fpath = path4.join(PROMPT_DIR, filename);
    if (fs5.existsSync(fpath)) {
      return fs5.readFileSync(fpath, "utf-8").trim();
    }
  } catch {
  }
  return fallback;
}
function loadPromptSection(filename, section, vars, fallback) {
  try {
    const raw = loadPrompt(filename, fallback);
    const sections = raw.split("\n---\n");
    let template = (sections[section - 1] || sections[0] || "").trim();
    template = template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
    return template;
  } catch {
  }
  return fallback;
}
function parseAssertionThresholds() {
  try {
    const raw = loadPrompt("assertion-reminder.md", "");
    const match = raw.match(/<!--\s*thresholds:\s*([\d,\s]+)\s*-->/);
    if (match) {
      const values = match[1].split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
      values.sort((a, b) => a - b);
      if (values.length >= 2) {
        debug(`\u89E6\u53D1\u7EBF4: \u81EA\u5B9A\u4E49\u9608\u503C=[${values.join(", ")}]`);
        return values;
      }
    }
  } catch {
  }
  return ASSERTION_SECTION_THRESHOLDS;
}
function getSection(count, thresholds) {
  for (let i = 0; i < thresholds.length; i++) {
    if (count <= thresholds[i]) return i + 1;
  }
  return thresholds.length + 1;
}
function rotateLog(logPath, maxSize = MAX_LOG_SIZE) {
  try {
    if (!fs5.existsSync(logPath)) return;
    const stat = fs5.statSync(logPath);
    if (stat.size <= maxSize) return;
    const content = fs5.readFileSync(logPath, "utf-8");
    const keepSize = Math.floor(maxSize / 2);
    const tail = content.slice(-keepSize);
    const firstNewline = tail.indexOf("\n");
    fs5.writeFileSync(logPath, firstNewline > 0 ? tail.slice(firstNewline + 1) : tail, "utf-8");
    debug(`LOG: \u8F6E\u8F6C ${logPath}\uFF0C${stat.size} \u2192 ${fs5.statSync(logPath).size} bytes`);
  } catch {
  }
}
function debug(msg) {
  try {
    fs5.appendFileSync(DEBUG_LOG, `${(/* @__PURE__ */ new Date()).toISOString()} ${msg}
`, "utf-8");
  } catch {
  }
}
function ensureDir(dir) {
  if (!fs5.existsSync(dir)) {
    fs5.mkdirSync(dir, { recursive: true });
  }
}
function safeReadFile(filePath) {
  try {
    if (fs5.existsSync(filePath)) {
      return fs5.readFileSync(filePath, "utf-8");
    }
  } catch {
  }
  return "";
}
function extractKeywords2(text) {
  const lower = text.toLowerCase();
  const keywords = [];
  const splitWords = lower.split(/[\s,，。.!！?？:：;；、\(\)（）\[\]【】"「」『』\n\r\t]+/).filter((t) => t.length >= 2);
  keywords.push(...splitWords);
  const segments = lower.split(/[a-z0-9\s,，。.!！?？:：;；、\(\)（）\[\]【】"「」『』\n\r\t]+/);
  for (const seg of segments) {
    if (seg.length < 2) continue;
    for (let i = 0; i <= seg.length - 2; i++) {
      keywords.push(seg.slice(i, i + 2));
    }
    if (seg.length >= 4) {
      for (let i = 0; i <= seg.length - 3; i++) {
        keywords.push(seg.slice(i, i + 3));
      }
    }
  }
  return [...new Set(keywords)];
}
function getActivePlanSummaries() {
  try {
    if (!fs5.existsSync(PLANS_DIR)) return [];
    const files = fs5.readdirSync(PLANS_DIR).filter((f) => f.endsWith(".md"));
    if (files.length === 0) return [];
    const summaries = [];
    const activePlans = [];
    for (const f of files) {
      const content = safeReadFile(path4.join(PLANS_DIR, f));
      if (!content) continue;
      if (/状态[：:]\s*(已完成|完成|done)/i.test(content)) continue;
      const lines = content.split("\n");
      let completed = 0, total = 0;
      let lastCompletedText = "";
      for (const line of lines) {
        if (/^\s*-\s+\[x\]/i.test(line)) {
          completed++;
          total++;
          lastCompletedText = line.replace(/^\s*-\s+\[x\]\s*/i, "").trim();
        } else if (/^\s*-\s+\[ \]/i.test(line)) {
          total++;
        }
      }
      if (total === 0) {
        let inPending = false;
        let pending = 0;
        for (const line of lines) {
          const doneMatch = line.match(/已完成的\s*(\d+)\s*个?任务/);
          if (doneMatch) completed = parseInt(doneMatch[1], 10);
          if (/^#{1,4}\s*待(后续|完成|实施|实现)/.test(line)) {
            inPending = true;
            continue;
          }
          if (inPending && /^#{1,4}\s/.test(line)) {
            inPending = false;
            continue;
          }
          if (inPending && /^\s*[-*]\s/.test(line)) pending++;
        }
        total = completed + pending;
      }
      const progressStr = total > 0 ? ` \xB7 ${completed}/${total} \u5B8C\u6210` : "";
      let title = f.replace(".md", "");
      let summary = "";
      for (const line of lines) {
        if (line.startsWith("# ") && title === f.replace(".md", "")) {
          title = line.replace("# ", "").trim();
          continue;
        }
        if (line.startsWith("## ")) {
          if (summary) break;
        }
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith(">") && trimmed.length > 5) {
          summary = trimmed;
          break;
        }
      }
      const shortSummary = summary.length > 60 ? summary.slice(0, 60) + "\u2026" : summary;
      summaries.push(`- **${title}**\uFF08~/.config/opencode/plans/${f}${progressStr}\uFF09\uFF1A${shortSummary}`);
      activePlans.push({
        file: f,
        title,
        progress: completed > 0 || total > 0 ? `${completed}/${total}` : "?/?",
        lastCompletedStep: lastCompletedText,
        lastActive: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    try {
      fs5.writeFileSync(
        path4.join(PLANS_DIR, ".active.json"),
        JSON.stringify({ activePlans, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2),
        "utf-8"
      );
    } catch {
    }
    return summaries;
  } catch (e) {
    debug(`\u8BFB\u53D6 plans \u76EE\u5F55\u5931\u8D25: ${e}`);
    return [];
  }
}
function deduplicatePendingByKeywords(items, descKey) {
  if (items.length <= 1) return items;
  const sorted = [...items].sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));
  const kept = [];
  const keptKeywordSets = [];
  for (const item of sorted) {
    const desc = item[descKey] || "";
    if (!desc) {
      kept.push(item);
      continue;
    }
    const keywords = extractKeywords2(desc);
    if (keywords.length === 0) {
      kept.push(item);
      continue;
    }
    let isDuplicate = false;
    for (const existing of keptKeywordSets) {
      const intersection = keywords.filter((k) => existing.has(k)).length;
      const union = (/* @__PURE__ */ new Set([...existing, ...keywords])).size;
      const overlap = union > 0 ? intersection / union : 0;
      if (overlap >= 0.5) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      kept.push(item);
      keptKeywordSets.push(new Set(keywords));
    } else {
      debug(`DEDUP: \u6CE8\u5165\u5C42\u53BB\u91CD\uFF0C\u8DF3\u8FC7 "${desc.slice(0, 40)}"\uFF08\u4E0E\u5DF2\u6709 pending \u5173\u952E\u8BCD\u91CD\u53E0\u7387\u226550%\u2192\u88AB\u5FFD\u7565\uFF09`);
    }
  }
  return kept;
}
function getMemoryPaths(projectDir) {
  const paths = [];
  paths.push(MEMORIES_DIR3);
  if (projectDir) {
    const projectHash = crypto.createHash("md5").update(projectDir).digest("hex").slice(0, 8);
    paths.push(path4.join(OC_CONFIG2, "project", projectHash, "memories"));
  }
  if (projectDir) {
    const sharedPath = path4.join(projectDir, ".opencode", "memories");
    if (fs5.existsSync(sharedPath)) {
      paths.push(sharedPath);
    }
  }
  return paths;
}
function mergeBlocksAndTriggers(memoryPaths) {
  const blockMap = /* @__PURE__ */ new Map();
  const triggerMap = /* @__PURE__ */ new Map();
  for (let pathIndex = 0; pathIndex < memoryPaths.length; pathIndex++) {
    const memPath = memoryPaths[pathIndex];
    for (const entry of readBlocksDir(path4.join(memPath, "blocks"))) {
      const meta = parseMeta(entry.content, 400);
      if (meta) {
        const label = meta.label || entry.fileName.replace(".md", "");
        blockMap.set(label, {
          type: meta.type || "habit",
          label,
          description: meta.description || "",
          confidence: meta.confidence || "",
          status: meta.status || "auto",
          suggested_status: meta.suggested_status || "suggest",
          priority: parseInt(meta.priority, 10) || 50,
          category: meta.category || "reference",
          memPathIndex: String(pathIndex),
          fileName: entry.fileName,
          value: extractBlockValue(entry.content)
        });
      }
    }
    for (const entry of readTriggersDir(path4.join(memPath, "triggers"))) {
      const meta = parseMeta(entry.content, 400);
      if (meta) {
        const label = meta.label || entry.fileName.replace(".md", "");
        triggerMap.set(label, {
          type: meta.type || "habit",
          label,
          human_description: meta.human_description || "",
          confidence: meta.confidence || "",
          status: meta.status || "auto",
          suggested_status: meta.suggested_status || "suggest",
          memPathIndex: String(pathIndex),
          fileName: entry.fileName,
          content: extractTriggerContent(entry.content)
        });
      }
    }
  }
  return {
    blocks: Array.from(blockMap.values()),
    triggers: Array.from(triggerMap.values())
  };
}
var STATUS_DIRS2 = ["pending", "auto", "suggest"];
function getStatusSubDir(status) {
  return STATUS_DIRS2.includes(status) ? status : "";
}
function readBlocksDir(blocksDir) {
  const results = [];
  if (fs5.existsSync(blocksDir)) {
    for (const entry of fs5.readdirSync(blocksDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push({ fileName: entry.name, content: safeReadFile(path4.join(blocksDir, entry.name)), relPath: entry.name });
      }
    }
  }
  for (const sub of STATUS_DIRS2) {
    const subDir = path4.join(blocksDir, sub);
    if (fs5.existsSync(subDir)) {
      for (const entry of fs5.readdirSync(subDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          results.push({ fileName: entry.name, content: safeReadFile(path4.join(subDir, entry.name)), relPath: `${sub}/${entry.name}` });
        }
      }
    }
  }
  return results;
}
function readTriggersDir(triggersDir) {
  const results = [];
  if (fs5.existsSync(triggersDir)) {
    for (const entry of fs5.readdirSync(triggersDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push({ fileName: entry.name, content: safeReadFile(path4.join(triggersDir, entry.name)), relPath: entry.name });
      }
    }
  }
  for (const sub of STATUS_DIRS2) {
    const subDir = path4.join(triggersDir, sub);
    if (fs5.existsSync(subDir)) {
      for (const entry of fs5.readdirSync(subDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          results.push({ fileName: entry.name, content: safeReadFile(path4.join(subDir, entry.name)), relPath: `${sub}/${entry.name}` });
        }
      }
    }
  }
  return results;
}
function resolveWritePath(basePath, category, fileName, content) {
  const meta = parseMeta(content, 400);
  const status = meta?.status || "pending";
  const subDir = getStatusSubDir(status);
  const dir = subDir ? path4.join(basePath, category, subDir) : path4.join(basePath, category);
  ensureDir(dir);
  return path4.join(dir, fileName);
}
function findBlockFile(basePath, fileName) {
  for (const sub of STATUS_DIRS2) {
    const p = path4.join(basePath, "blocks", sub, fileName);
    if (fs5.existsSync(p)) return p;
  }
  const flat = path4.join(basePath, "blocks", fileName);
  return fs5.existsSync(flat) ? flat : null;
}
function parseMeta(content, maxIndex = 100) {
  const meta = {};
  const commentRegex = /<!--\s*(\w+):\s*(.*?)\s*-->/g;
  let match;
  while ((match = commentRegex.exec(content)) !== null) {
    if (match.index > maxIndex) break;
    meta[match[1]] = match[2].trim();
  }
  return Object.keys(meta).length > 0 ? meta : null;
}
function extractBlockValue(content) {
  const lines = content.split("\n");
  const valueLines = [];
  let inMeta = true;
  for (const line of lines) {
    if (inMeta && line.trim().startsWith("<!--")) continue;
    if (inMeta && line.trim() === "") continue;
    inMeta = false;
    valueLines.push(line);
  }
  return valueLines.join("\n").trim();
}
function extractTriggerContent(content) {
  return extractBlockValue(content);
}
function logEvent(event) {
  try {
    const line = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event }) + "\n";
    fs5.appendFileSync(EVENT_LOG, line, "utf-8");
    rotateLog(EVENT_LOG);
  } catch {
  }
}
function getLastAnalysis() {
  try {
    if (fs5.existsSync(LAST_ANALYSIS)) {
      return JSON.parse(fs5.readFileSync(LAST_ANALYSIS, "utf-8"));
    }
  } catch {
  }
  return { ts: null, count: 0 };
}
function saveLastAnalysis(ts, count) {
  try {
    fs5.writeFileSync(LAST_ANALYSIS, JSON.stringify({ ts, count }), "utf-8");
  } catch {
  }
}
function getNewEvents() {
  if (!fs5.existsSync(EVENT_LOG)) return [];
  const last = getLastAnalysis();
  const lines = fs5.readFileSync(EVENT_LOG, "utf-8").split("\n").filter(Boolean);
  const newLines = last.ts ? lines.filter((line) => {
    try {
      const lastTs = last.ts;
      return JSON.parse(line).ts > lastTs;
    } catch {
      return false;
    }
  }) : lines;
  return newLines.slice(-MAX_EVENTS_FOR_ANALYSIS);
}
var _apiConfigCache = null;
var _flashResponseCache = { text: "", result: null, ts: 0 };
async function getApiConfig() {
  if (_apiConfigCache && Date.now() - _apiConfigCache.ts < 3e4) {
    return _apiConfigCache.cfg;
  }
  const configPath = path4.join(OC_CONFIG2, "opencode.json");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = fs5.readFileSync(configPath, "utf-8").replace(/^\uFEFF/, "");
      const config = JSON.parse(raw);
      const fullModel = String(config.model || "");
      const colonIdx = fullModel.indexOf(":");
      const slashIdx = fullModel.lastIndexOf("/");
      const sepIdx = colonIdx > 0 ? colonIdx : slashIdx > 0 ? slashIdx : -1;
      const providerName = sepIdx > 0 ? fullModel.slice(0, sepIdx) : "";
      const currentModel = sepIdx > 0 ? fullModel.slice(sepIdx + 1) : fullModel;
      const providers = config.provider;
      const provider = providers?.[providerName];
      const opts = provider?.options;
      if (!opts?.apiKey || !opts?.baseURL) {
        debug(`FRACTAL: \u672A\u627E\u5230 provider "${providerName}" \u7684\u6709\u6548 API \u914D\u7F6E`);
        return null;
      }
      const models = provider?.models;
      let flashModel = currentModel;
      if (models) {
        const modelKeys = Object.keys(models);
        const flashKey = modelKeys.find((k) => k.toLowerCase().includes("flash"));
        if (flashKey) {
          flashModel = flashKey;
        } else if (!modelKeys.includes(currentModel)) {
          flashModel = modelKeys[0] || currentModel;
        }
      }
      const cfg = {
        apiKey: opts.apiKey,
        baseURL: opts.baseURL.replace(/\/+$/, ""),
        primaryModel: currentModel,
        flashModel
      };
      _apiConfigCache = { cfg, ts: Date.now() };
      return cfg;
    } catch {
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 200));
  }
  _apiConfigCache = null;
  return null;
}
async function callLLM(body, debugPrefix, timeoutMs = 3e4) {
  const config = await getApiConfig();
  if (!config) {
    debug(`FRACTAL: \u65E0\u6CD5\u83B7\u53D6 API \u914D\u7F6E\uFF0C\u8DF3\u8FC7 (${debugPrefix})`);
    return null;
  }
  async function doFetch(reqBody) {
    const c = config;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${c.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${c.apiKey}`
        },
        // reqBody.model 可覆盖默认主模型（flash 分类器等场景用 config.flashModel 传参）
        body: JSON.stringify({ model: reqBody.model || c.primaryModel, ...reqBody }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || null;
      const reqSize = JSON.stringify(reqBody).length;
      debug(`${debugPrefix}: \u2713 LLM \u54CD\u5E94 ${content?.length || 0} bytes\uFF08\u8BF7\u6C42 ${reqSize} chars\uFF09`);
      if (content && content.length > 0) {
        debug(`${debugPrefix}: [DIAG] \u54CD\u5E94\u524D 200 chars: ${content.slice(0, 200)}`);
      }
      return { ok: true, data: content, retryable: false };
    }
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
    }
    debug(`${debugPrefix}: LLM \u8C03\u7528\u5931\u8D25 HTTP ${response.status} \u2014 ${errorBody.slice(0, 500)}`);
    const isThinkingConflict = response.status === 400 && /thinking/i.test(errorBody);
    return { ok: false, data: null, retryable: isThinkingConflict };
  }
  const firstBody = { ...body, thinking: { type: "disabled" } };
  const first = await doFetch(firstBody);
  if (first.ok) return first.data;
  if (!first.retryable) return null;
  debug(`${debugPrefix}: thinking \u53C2\u6570\u4E0D\u517C\u5BB9\uFF0C\u964D\u7EA7\u91CD\u8BD5\uFF08\u79FB\u9664 thinking\uFF09...`);
  const second = await doFetch(body);
  if (second.ok) {
    debug(`${debugPrefix}: \u964D\u7EA7\u91CD\u8BD5\u6210\u529F \u2713\uFF08\u5DF2\u9002\u914D\u5F53\u524D\u6A21\u578B\uFF09`);
  }
  return second.data;
}
async function classifyTaskComplexity(userText) {
  if (_flashResponseCache.text === userText && Date.now() - _flashResponseCache.ts < 3e4) {
    debug("FLASH-CLASSIFIER: \u7F13\u5B58\u547D\u4E2D");
    return _flashResponseCache.result;
  }
  const config = await getApiConfig();
  if (!config) return null;
  const prompt = `\u5206\u6790\u7528\u6237\u610F\u56FE\u548C\u4EFB\u52A1\u590D\u6742\u5EA6\u3002

\u7528\u6237\u6D88\u606F: """${userText}"""

\u7528\u4E09\u4E2A\u7EF4\u5EA6\u8BC4\u5206\uFF08\u6BCF\u7EF4 0-2 \u5206\uFF09\uFF1A
- \u8303\u56F4\uFF1A\u5F71\u54CD\u591A\u5C11\u6587\u4EF6\uFF1F\uFF081\u6587\u4EF6=0, 2-4\u6587\u4EF6=1, 5+\u6587\u4EF6=2\uFF09
- \u590D\u6742\u5EA6\uFF1A\u673A\u68B0\u4FEE\u6539/\u67B6\u6784\u51B3\u7B56\uFF1F\uFF08\u673A\u68B0=0, \u4E2D\u5EA6\u91CD\u6784=1, \u67B6\u6784\u8BBE\u8BA1=2\uFF09
- \u4E0D\u786E\u5B9A\u6027\uFF1A\u65B9\u6848\u660E\u786E/\u591A\u4E2A\u53EF\u9009\uFF1F\uFF08\u5DF2\u77E5\u65B9\u6848=0, \u90E8\u5206\u4E0D\u786E\u5B9A=1, \u5B8C\u5168\u5F00\u653E=2\uFF09

\u603B\u5206 0-2 \u2192 simple | 3-6 \u2192 complex
\u8865\u5145\u89C4\u5219\uFF1A\u7EAF\u804A\u5929/\u786E\u8BA4/\u8BE2\u95EE/git\u64CD\u4F5C/\u4EE3\u7801\u89E3\u91CA \u2192 no_action
        \u80FD\u4E00\u53E5\u8BDD\u63CF\u8FF0diff \u2192 simple

\u8FD4\u56DE\u7EAFJSON\uFF08\u4E0D\u8981markdown\u4EE3\u7801\u5757\uFF0C\u76F4\u63A5 {}\uFF09:
{"complexity":"simple|complex|no_action","reasoning":"\u7B80\u77ED\u4E2D\u6587\u7406\u7531","estimatedFiles":1}`;
  const result = await callLLM(
    {
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 200,
      model: config.flashModel
      // 使用 flash 模型（动态获取，无则降级 primaryModel）
    },
    "FLASH-CLASSIFIER",
    1e4
    // 10s 超时
  );
  if (!result) return null;
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!["simple", "complex", "no_action"].includes(parsed.complexity)) {
      parsed.complexity = "no_action";
    }
    const validated = {
      complexity: parsed.complexity,
      reasoning: parsed.reasoning || "\u672A\u77E5",
      estimatedFiles: typeof parsed.estimatedFiles === "number" ? parsed.estimatedFiles : 0
    };
    _flashResponseCache = { text: userText, result: validated, ts: Date.now() };
    return validated;
  } catch {
    return null;
  }
}
async function analyzeAndUpdate(eventLines, memoryPaths) {
  const eventSummary = eventLines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean).map((rec) => {
    const ev = rec.event;
    if (!ev) return null;
    return {
      ts: rec.ts,
      type: ev.type,
      role: ev.properties?.info?.role,
      content: typeof ev.properties?.info?.content === "string" ? ev.properties.info.content.slice(0, 300) : void 0
    };
  }).filter(Boolean);
  if (eventSummary.length === 0) {
    debug("FRACTAL: \u65E0\u6709\u6548\u4E8B\u4EF6\u53EF\u5206\u6790");
    return null;
  }
  const existingBlocks = [];
  const existingTriggers = [];
  for (const memPath of memoryPaths) {
    for (const entry of readBlocksDir(path4.join(memPath, "blocks"))) {
      existingBlocks.push(`\u6587\u4EF6: blocks/${entry.relPath}
${entry.content.slice(0, 500)}`);
    }
    for (const entry of readTriggersDir(path4.join(memPath, "triggers"))) {
      existingTriggers.push(`\u6587\u4EF6: triggers/${entry.relPath}
${entry.content.slice(0, 500)}`);
    }
  }
  const systemPrompt = getSystemPrompt();
  const userPrompt = getUserPrompt(existingBlocks, existingTriggers, eventSummary.length, JSON.stringify(eventSummary, null, 2), memoryPaths);
  debug(`FRACTAL: \u8C03\u7528 LLM \u5206\u6790 ${eventSummary.length} \u6761\u4E8B\u4EF6...`);
  const result = await callLLM(
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 4e3
    },
    "FRACTAL\uFF08\u4E8B\u4EF6\u5206\u6790\uFF09",
    3e4
  );
  if (result) {
    debug(`FRACTAL: LLM \u8FD4\u56DE ${result.length} bytes`);
  }
  return result;
}
async function llmRerankKnowledge(userMessage, candidates) {
  if (candidates.length === 0) return null;
  const candidateLines = candidates.map((c, i) => {
    const desc = c.item.human_description || c.item.description || "";
    return `${i}: ${desc}`;
  }).join("\n");
  const prompt = `\u7528\u6237\u5F53\u524D\u6D88\u606F\uFF1A${userMessage.slice(0, 200)}

\u5019\u9009\u77E5\u8BC6\u5217\u8868\uFF1A
${candidateLines}

\u4ECE\u4EE5\u4E0A\u5019\u9009\u4E2D\u9009\u51FA\u4E0E\u7528\u6237\u6D88\u606F\u6700\u76F8\u5173\u7684\u6761\u76EE\uFF0C\u6309\u76F8\u5173\u6027\u4ECE\u9AD8\u5230\u4F4E\u6392\u5217\u3002\u8FD4\u56DE\u7EAF\u6570\u5B57\u7D22\u5F15\u5217\u8868\uFF0C\u7528\u9017\u53F7\u5206\u9694\uFF08\u5982 "3,0,4,1,2"\uFF09\uFF0C\u53EA\u8F93\u51FA\u7D22\u5F15\u4E0D\u8981\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u3002\u6700\u591A\u8FD4\u56DE 5 \u6761\u3002`;
  debug(`FRACTAL: LLM \u91CD\u6392 ${candidates.length} \u6761\u77E5\u8BC6\u5019\u9009...`);
  const result = await callLLM(
    {
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 50
    },
    "FRACTAL\uFF08\u77E5\u8BC6\u91CD\u6392\uFF09",
    3e3
  );
  if (!result) return null;
  const indices = result.split(/[,，\s]+/).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n) && n < candidates.length);
  if (indices.length === 0) return null;
  const seen = /* @__PURE__ */ new Set();
  const reranked = [];
  for (const idx of indices) {
    if (!seen.has(idx)) {
      reranked.push(candidates[idx]);
      seen.add(idx);
    }
  }
  for (let i = 0; i < candidates.length; i++) {
    if (!seen.has(i)) reranked.push(candidates[i]);
  }
  return reranked;
}
function applyAnalysisResult(resultJson, memoryPaths) {
  let parsed = null;
  try {
    parsed = JSON.parse(resultJson);
  } catch {
    const jsonMatch = resultJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
      }
    }
  }
  if (!parsed || !parsed.actions) {
    debug("FRACTAL: \u65E0\u6CD5\u89E3\u6790 LLM \u8FD4\u56DE\u7684 JSON");
    return;
  }
  for (const action of parsed.actions) {
    if (action.type === "skip") continue;
    const pathIndex = parseInt(action.memPath, 10);
    if (isNaN(pathIndex) || pathIndex >= memoryPaths.length) {
      debug(`FRACTAL: \u65E0\u6548\u7684 memPath: ${action.memPath}`);
      continue;
    }
    const basePath = memoryPaths[pathIndex];
    let category;
    if (action.type.startsWith("create_trigger") || action.type.startsWith("update_trigger")) {
      category = "triggers";
    } else {
      category = "blocks";
    }
    const filePath = resolveWritePath(basePath, category, action.file, action.content);
    try {
      fs5.writeFileSync(filePath, action.content, "utf-8");
      debug(`FRACTAL: ${action.type} \u2192 ${filePath} (${action.reason})`);
    } catch (err) {
      debug(`FRACTAL: \u5199\u5165\u5931\u8D25 ${filePath}: ${String(err)}`);
    }
  }
  debug(`FRACTAL: \u5206\u6790\u5B8C\u6210 \u2014 ${parsed.summary || "\u65E0\u6458\u8981"}`);
}
function globToRegex(pattern) {
  let regex = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "(?:.+/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp("^" + regex + "$");
}
function parseTriggerFile(content) {
  const msgMatch = content.match(/message_template:\s*\n?\s*["']([^"']+)["']/);
  if (!msgMatch) return null;
  const messageTemplate = msgMatch[1];
  const matches = [];
  const excludes = [];
  const lines = content.split("\n");
  let inMatch = false;
  let inExclude = false;
  for (const line of lines) {
    const t = line.trim();
    if (t === "match:") {
      inMatch = true;
      inExclude = false;
      continue;
    }
    if (t === "exclude:") {
      inExclude = true;
      inMatch = false;
      continue;
    }
    if (t.startsWith("trigger:") || t.startsWith("action:") || t.startsWith("message_template:")) {
      inMatch = false;
      inExclude = false;
      continue;
    }
    const listItem = t.match(/^-\s*["']?([^"']+)["']?/);
    if (!listItem) continue;
    if (inMatch) matches.push(listItem[1]);
    if (inExclude) excludes.push(listItem[1]);
  }
  if (matches.length === 0) return null;
  return { match: matches, exclude: excludes, messageTemplate };
}
function matchFileTriggers(filePath, projectDir) {
  const memoryPaths = getMemoryPaths(projectDir);
  for (const memPath of memoryPaths) {
    try {
      for (const entry of readTriggersDir(path4.join(memPath, "triggers"))) {
        if (!entry.content.includes("status: auto")) continue;
        const parsed = parseTriggerFile(entry.content);
        if (!parsed) continue;
        const isExcluded = parsed.exclude.some((g) => globToRegex(g).test(filePath));
        if (isExcluded) continue;
        const isMatched = parsed.match.some((g) => globToRegex(g).test(filePath));
        if (isMatched) {
          const meta = parseMeta(entry.content, 400);
          return {
            fullContent: entry.content,
            humanDescription: meta?.human_description || entry.fileName,
            confidence: meta?.confidence || "unknown",
            matchGlobs: parsed.match.join(", ")
          };
        }
      }
    } catch {
    }
  }
  return null;
}
function findRelatedFiles(filePath, projectDir) {
  const relative = path4.relative(projectDir, filePath);
  const stem = path4.basename(filePath, path4.extname(filePath));
  const genericDirs = /* @__PURE__ */ new Set([
    "src",
    "lib",
    "dist",
    "node_modules",
    "components",
    "utils",
    "services",
    "api",
    "stores",
    "pages",
    "views",
    "assets",
    "public",
    "static",
    "build",
    "types",
    "hooks",
    "plugins"
  ]);
  const parts = relative.split(path4.sep);
  const keywords = /* @__PURE__ */ new Set([stem]);
  for (const p of parts) {
    if (!genericDirs.has(p.toLowerCase())) keywords.add(p);
  }
  const result = { docs: [], tests: [] };
  const docsDir = path4.join(projectDir, "doc", "\u8BBE\u8BA1");
  if (fs5.existsSync(docsDir)) {
    try {
      for (const f of fs5.readdirSync(docsDir)) {
        if (result.docs.length >= 5) break;
        const name = f.replace(path4.extname(f), "");
        for (const kw of keywords) {
          if (kw.length <= 2) continue;
          if (name.includes(kw) || kw.includes(name)) {
            result.docs.push(`doc/\u8BBE\u8BA1/${f}`);
            break;
          }
        }
      }
    } catch {
    }
  }
  const testsDir = path4.join(projectDir, "tests");
  if (fs5.existsSync(testsDir)) {
    result.tests = findTestFiles(testsDir, keywords, projectDir);
  }
  return result;
}
function findTestFiles(dir, keywords, projectDir, depth = 0) {
  if (depth > 2) return [];
  const results = [];
  try {
    for (const entry of fs5.readdirSync(dir, { withFileTypes: true })) {
      const full = path4.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findTestFiles(full, keywords, projectDir, depth + 1));
      } else {
        if (results.length >= 5) break;
        const name = entry.name.replace(path4.extname(entry.name), "");
        for (const kw of keywords) {
          if (kw.length <= 2) continue;
          if (name.includes(kw) || kw.includes(name)) {
            results.push(path4.relative(projectDir, full));
            break;
          }
        }
      }
    }
  } catch {
  }
  return results;
}
async function generateTriggerMessage(filePath, trigger, relatedDocs, relatedTests) {
  const filename = path4.basename(filePath);
  const habitSection = trigger ? `- \u5339\u914D\u5230\u7684\u4E60\u60EF\u89C4\u5219\uFF1A

${trigger.fullContent}` : "\uFF08\u672C\u6B21\u65E0\u4E60\u60EF\u89C4\u5219\u5339\u914D\uFF0C\u4EC5\u68C0\u67E5\u6587\u6863/\u6D4B\u8BD5\u5173\u8054\uFF09";
  const docTestSection = buildDocTestPrompt(relatedDocs, relatedTests);
  const systemPrompt = `\u4F60\u662F\u7528\u6237\u7684\u8D5B\u535A\u5206\u8EAB\u3002\u4F60\u50CF\u7528\u6237\u4E00\u6837\u601D\u8003\u3002

\u5F53\u524D\u573A\u666F\uFF1A
- \u7528\u6237\u521A\u7F16\u8F91\u4E86\u6587\u4EF6\uFF1A${filePath}
${habitSection}

${docTestSection}

\u4F60\u7684\u4EFB\u52A1\uFF1A
1. \u5982\u679C\u5B58\u5728\u4E60\u60EF\u89C4\u5219\uFF1A\u5224\u65AD\u6B64\u6B21\u6587\u4EF6\u7F16\u8F91\u662F\u5426\u771F\u6B63\u5339\u914D\u6B64\u4E60\u60EF\u7684\u8BED\u4E49
   \uFF08\u4E0D\u53EA\u770B\u6587\u4EF6\u540D\u5339\u914D glob\uFF0C\u8981\u7406\u89E3\u64CD\u4F5C\u4E0A\u4E0B\u6587\u548C\u6539\u52A8\u6027\u8D28\uFF09
2. \u5982\u679C\u5B58\u5728\u5173\u8054\u6587\u4EF6\uFF08\u8BBE\u8BA1\u6587\u6863/\u6D4B\u8BD5\uFF09\uFF1A\u68C0\u67E5\u662F\u5426\u9700\u8981\u63D0\u9192\u7528\u6237\u540C\u6B65\u66F4\u65B0
3. \u751F\u6210\u63D0\u9192\u6D88\u606F\u3002\u683C\u5F0F\uFF1A

> [\u5206\u5F62] \u5339\u914D\u4E60\u60EF\u300C<\u4E60\u60EF\u540D>\u300D
> (glob: <glob>) | \u7F6E\u4FE1\u5EA6 <confidence>

\u4F60\u521A\u751F\u6210\u4E86 ${filename}\uFF0C\u6309\u6211\u7684\u4E60\u60EF\uFF0C\u4F60\u5148\u5BA1\u67E5\u4E00\u904D\u3002
${trigger ? `\u91CD\u70B9\u770B\uFF1A[\u6839\u636E\u4E60\u60EF\u89C4\u5219\u4E2D action.focus \u7684\u5177\u4F53\u5185\u5BB9\u586B\u5145]` : ""}

4. \u5982\u679C\u6709\u5173\u8054\u6587\u4EF6\u9700\u8981\u540C\u6B65\uFF1A
   \u5728\u6D88\u606F\u672B\u5C3E\u8FFD\u52A0\u4E00\u884C\u63D0\u9192\uFF1A
   > \u4F60\u521A\u6539\u7684\u6587\u4EF6\u6709\u5173\u8054\u6587\u6863/\u6D4B\u8BD5\uFF0C\u8003\u8651\u540C\u6B65\u66F4\u65B0\uFF1A<\u6587\u4EF6\u5217\u8868>

5. \u5982\u679C\u4E0D\u5339\u914D\u4E14\u65E0\u9700\u63D0\u9192\uFF0C\u8FD4\u56DE\u7A7A\u5B57\u7B26\u4E32\uFF08\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\uFF09
6. \u63AA\u8F9E\u5FC5\u987B\u7528"\u6309\u6211\u7684\u4E60\u60EF"\u2014\u2014\u4F60\u662F\u7528\u6237\u7684\u5206\u8EAB\u5728\u8BF4\u8BDD
7. \u4E0D\u6267\u884C\u5BA1\u67E5\uFF0C\u4E0D\u5199\u6587\u4EF6\uFF0C\u53EA\u8BF4\u8BDD

\u8FD4\u56DE\u7EAF\u6587\u672C\uFF08\u4E0D\u8981 JSON \u5305\u88F9\uFF09\u3002`;
  const label = trigger ? `\u4E60\u60EF: ${trigger.humanDescription}` : "\u4EC5\u6587\u6863/\u6D4B\u8BD5\u68C0\u67E5";
  debug(`TRIGGER: \u8C03 LLM \u8BED\u4E49\u5224\u65AD \u2014 ${filename} (${label})`);
  const result = await callLLM(
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `\u6587\u4EF6\u8DEF\u5F84\uFF1A${filePath}` }
      ],
      temperature: 0.3,
      max_tokens: 500
    },
    "TRIGGER\uFF08\u8BED\u4E49\u5224\u65AD\uFF09",
    15e3
  );
  if (!result || result.trim() === "") {
    debug("TRIGGER: LLM \u5224\u65AD\u4E0D\u5339\u914D\uFF0C\u9759\u9ED8\u8DF3\u8FC7");
    return null;
  }
  debug(`TRIGGER: LLM \u8FD4\u56DE ${result.length} bytes`);
  return result.trim();
}
function buildDocTestPrompt(docs, tests) {
  const items = [];
  if (docs && docs.length > 0) {
    items.push(`- \u5173\u8054\u8BBE\u8BA1\u6587\u6863\uFF1A${docs.join("\u3001")}`);
  }
  if (tests && tests.length > 0) {
    items.push(`- \u5173\u8054\u6D4B\u8BD5\u6587\u4EF6\uFF1A${tests.join("\u3001")}`);
  }
  if (items.length === 0) return "\uFF08\u65E0\u5173\u8054\u6587\u6863\u6216\u6D4B\u8BD5\u6587\u4EF6\uFF09";
  return `\u89E6\u53D1\u7EBF 1 \u68C0\u67E5\u2014\u2014\u6587\u4EF6\u5173\u8054\uFF1A
${items.join("\n")}`;
}
function readCounter() {
  try {
    if (fs5.existsSync(ASSERTION_COUNTER)) {
      const raw = JSON.parse(fs5.readFileSync(ASSERTION_COUNTER, "utf-8"));
      return {
        count: Number(raw.count) || 0,
        lastSnippet: String(raw.lastSnippet || ""),
        lastSessionId: String(raw.lastSessionId || ""),
        turnsSinceLastAssert: Number(raw.turnsSinceLastAssert) || 0,
        updatedAt: String(raw.updatedAt || "")
      };
    }
  } catch {
  }
  return { count: 0, lastSnippet: "", lastSessionId: "", turnsSinceLastAssert: 0, updatedAt: "" };
}
function saveCounter(state) {
  try {
    state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    fs5.writeFileSync(ASSERTION_COUNTER, JSON.stringify(state, null, 2), "utf-8");
  } catch {
  }
}
function incrementCounter(sessionId, snippet) {
  const c = readCounter();
  if (c.lastSessionId && c.lastSessionId !== sessionId) {
    c.count = 0;
    c.turnsSinceLastAssert = 0;
  }
  c.count++;
  c.lastSnippet = snippet;
  c.lastSessionId = sessionId;
  c.turnsSinceLastAssert = 0;
  saveCounter(c);
  debug(`\u89E6\u53D1\u7EBF4: \u8BA1\u6570\u5668\u9012\u589E \u2192 count=${c.count} snippet="${snippet.slice(0, 50)}"`);
}
function resetCounter(sessionId) {
  const c = readCounter();
  if (c.count > 0) {
    debug(`\u89E6\u53D1\u7EBF4: \u8BA1\u6570\u5668\u91CD\u7F6E \u2192 count=${c.count}\u21920\uFF08\u672C\u8F6E\u5DF2\u8054\u7F51\u67E5\u8BC1\uFF09`);
  }
  c.count = 0;
  c.lastSnippet = "";
  c.lastSessionId = sessionId;
  c.turnsSinceLastAssert = 0;
  saveCounter(c);
}
function decayCounter(sessionId) {
  const c = readCounter();
  if (c.lastSessionId && c.lastSessionId !== sessionId) {
    c.count = 0;
    c.turnsSinceLastAssert = 0;
    saveCounter(c);
    return;
  }
  c.turnsSinceLastAssert++;
  if (c.count > 0 && c.turnsSinceLastAssert >= COUNTER_DECAY_TURNS) {
    c.count = Math.max(0, c.count - 1);
    c.turnsSinceLastAssert = 0;
    debug(`\u89E6\u53D1\u7EBF4: \u8BA1\u6570\u5668\u8870\u51CF \u2192 count=${c.count}`);
    saveCounter(c);
  }
}
var DECAY_STATE_FILE = path4.join(MEMORIES_DIR3, ".decay-state.json");
var DECAY_DEBOUNCE_MS = 3e4;
function readDecayState() {
  try {
    if (fs5.existsSync(DECAY_STATE_FILE)) {
      return JSON.parse(fs5.readFileSync(DECAY_STATE_FILE, "utf-8"));
    }
  } catch {
  }
  return { missedRounds: {}, lastDecayWrite: {} };
}
function saveDecayState(state) {
  try {
    fs5.writeFileSync(DECAY_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
  }
}
function decayAndPersist(decayed, memoryPaths) {
  const state = readDecayState();
  const now = Date.now();
  for (const d of decayed) {
    if (d.category === "constraint") continue;
    state.missedRounds[d.label] = (state.missedRounds[d.label] || 0) + 1;
    const missed = state.missedRounds[d.label];
    const threshold = d.category === "preference" ? 5 : 10;
    const decrement = d.category === "preference" ? 10 : 5;
    const floor = d.category === "preference" ? 10 : 30;
    if (missed >= threshold) {
      const lastWrite = state.lastDecayWrite[d.label] || 0;
      if (now - lastWrite < DECAY_DEBOUNCE_MS) continue;
      const mp = memoryPaths[parseInt(d.memPath, 10)] || MEMORIES_DIR3;
      const fpath = findBlockFile(mp, d.label + ".md");
      if (!fpath) continue;
      try {
        let content = fs5.readFileSync(fpath, "utf-8");
        const priMatch = content.match(/<!--\s*priority:\s*(\d+)\s*-->/);
        const oldPri = priMatch ? parseInt(priMatch[1], 10) : 50;
        const newPri = Math.max(floor, oldPri - decrement);
        if (newPri < oldPri && priMatch) {
          content = content.replace(priMatch[0], `<!-- priority: ${newPri} -->`);
          fs5.writeFileSync(fpath, content, "utf-8");
          state.lastDecayWrite[d.label] = now;
          state.missedRounds[d.label] = 0;
          debug(`DECAY: ${d.label} priority ${oldPri}\u2192${newPri}`);
        }
      } catch (err) {
        debug(`DECAY: \u5199\u76D8\u5931\u8D25 ${fpath}: ${String(err)}`);
      }
    }
  }
  saveDecayState(state);
}
async function checkAndExtractCommitKnowledge(projectDir, memoryPaths) {
  const cwd = projectDir || ".";
  if (!fs5.existsSync(path4.join(cwd, ".git"))) return false;
  let lastCheckFile = path4.join(MEMORIES_DIR3, ".commit-last-check.json");
  let lastCheck = "";
  try {
    if (fs5.existsSync(lastCheckFile)) {
      lastCheck = JSON.parse(fs5.readFileSync(lastCheckFile, "utf-8")).ts || "";
    }
  } catch {
  }
  let commitMsg = "";
  let commitTs = "";
  let changedFiles = "";
  try {
    const { execSync: execSync2 } = await import("node:child_process");
    commitMsg = execSync2("git log -1 --format='%s%n%b'", { cwd, encoding: "utf-8", timeout: 5e3 }).trim();
    commitTs = execSync2("git log -1 --format='%aI'", { cwd, encoding: "utf-8", timeout: 5e3 }).trim();
    changedFiles = execSync2("git diff HEAD~1 --stat", { cwd, encoding: "utf-8", timeout: 5e3 }).trim();
  } catch {
    return false;
  }
  if (!commitMsg || commitTs <= lastCheck) return false;
  try {
    fs5.writeFileSync(lastCheckFile, JSON.stringify({ ts: commitTs }), "utf-8");
  } catch {
  }
  if (/^(Merge|Bump|chore\(deps\)|\(bot\))/i.test(commitMsg.split("\n")[0])) {
    debug(`\u89E6\u53D1\u7EBF5: \u8DF3\u8FC7\u81EA\u52A8\u63D0\u4EA4 \u2014 "${commitMsg.slice(0, 50)}"`);
    return true;
  }
  debug(`\u89E6\u53D1\u7EBF5: \u65B0\u63D0\u4EA4\u68C0\u6D4B \u2014 "${commitMsg.slice(0, 80)}"`);
  try {
    let existing = "";
    try {
      for (const mp of memoryPaths) {
        for (const entry of readBlocksDir(path4.join(mp, "blocks"))) {
          existing += `[${entry.fileName}] ${entry.content.slice(0, 200)}
`;
        }
      }
    } catch {
    }
    const prompt = `\u4F60\u662F\u77E5\u8BC6\u63D0\u53D6\u5668\u3002\u5206\u6790\u4EE5\u4E0B git commit\uFF0C\u5224\u65AD\u662F\u5426\u5B58\u5728\u503C\u5F97\u8BB0\u5F55\u7684\u77E5\u8BC6\u70B9\u3002
\u89C4\u5219\uFF1A\u65E5\u5E38\u7F16\u7801\u63D0\u4EA4\u8FD4\u56DE {"action":"skip"}\uFF1B\u6D89\u53CA\u5DE5\u5177/\u6846\u67B6\u8E29\u5751\u7ECF\u9A8C\u3001\u914D\u7F6E\u6280\u5DE7\u3001API \u53D1\u73B0\u65F6\u63D0\u53D6\u4E3A\u77E5\u8BC6\u3002\u77E5\u8BC6\u7528\u4E2D\u6587\u6458\u8981\uFF0C\u226415\u884C\uFF0C\u683C\u5F0F\uFF1A\u4E8B\u5B9E\u2192\u539F\u5219\u2192\u53CD\u4F8B\u2192\u7ED3\u8BBA\u3002\u6587\u4EF6\u540D\u5C0F\u5199\u82F1\u6587+\u8FDE\u5B57\u7B26\u3002

\u73B0\u6709\u77E5\u8BC6\uFF08\u907F\u514D\u91CD\u590D\uFF09\uFF1A${existing.slice(0, 2e3) || "\uFF08\u65E0\uFF09"}

\u63D0\u4EA4\u4FE1\u606F\uFF1A${commitMsg.slice(0, 500)}

\u6539\u52A8\u6587\u4EF6\uFF1A${changedFiles.slice(0, 500)}

\u56DE\u590D\u7EAFJSON\uFF1A{"action":"skip"} \u6216 {"action":"create","items":[{"file":"xx.md","memPath":0,"content":"<!-- type:knowledge -->...","reason":"\u4E3A\u4EC0\u4E48"}]}`;
    const json = await callLLM(
      {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2e3
      },
      "\u89E6\u53D1\u7EBF5\uFF08\u77E5\u8BC6\u63D0\u53D6\uFF09"
    );
    if (!json) return true;
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      const m = json.match(/\{[\s\S]*\}/);
      if (m) try {
        parsed = JSON.parse(m[0]);
      } catch {
        return true;
      }
      else return true;
    }
    if (!parsed || parsed.action === "skip") {
      debug("\u89E6\u53D1\u7EBF5: LLM \u5224\u65AD\u65E0\u9700\u8BB0\u5F55");
      return true;
    }
    if (parsed.items) {
      for (const item of parsed.items) {
        const mp = memoryPaths[parseInt(item.memPath, 10)] || MEMORIES_DIR3;
        const fpath = resolveWritePath(mp, "blocks", item.file, item.content);
        fs5.writeFileSync(fpath, item.content, "utf-8");
        debug(`\u89E6\u53D1\u7EBF5: \u5199\u5165\u77E5\u8BC6 \u2192 ${item.file} (${item.reason})`);
      }
    }
  } catch (err) {
    debug(`\u89E6\u53D1\u7EBF5: LLM \u5F02\u5E38 ${String(err)}`);
  }
  return true;
}
var FractalPlugin = async (input, _options) => {
  _fractalDebug("FACTORY: called");
  try {
    fs5.writeFileSync(path4.join(MEMORIES_DIR3, ".fractal-healthcheck"), JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), pid: process.pid }));
  } catch {
  }
  ensureDir(MEMORIES_DIR3);
  ensureDir(BLOCKS_DIR);
  ensureDir(TRIGGERS_DIR);
  if (!v4VectorIndex) {
    v4VectorIndex = new VectorIndex(path4.join(MEMORIES_DIR3, "models"));
  }
  rotateLog(DEBUG_LOG, 500 * 1024);
  rotateLog(EVENT_LOG);
  const projectDir = input.directory || void 0;
  const { client } = input;
  try {
    const dumpLines = [];
    for (const mp of [path4.join(MEMORIES_DIR3, "blocks"), path4.join(projectDir || "", ".opencode", "memories", "blocks")]) {
      if (!fs5.existsSync(mp)) continue;
      for (const f of fs5.readdirSync(mp)) {
        if (!f.endsWith(".md")) continue;
        const content = fs5.readFileSync(path4.join(mp, f), "utf-8");
        dumpLines.push(`## ${f}

${content}
`);
      }
    }
    if (dumpLines.length > 0) {
      fs5.writeFileSync(path4.join(MEMORIES_DIR3, "dump.md"), dumpLines.join("\n---\n"), "utf-8");
    }
  } catch {
  }
  let assertionDetectedThisTurn = false;
  let websearchCalledThisTurn = false;
  let bashCalledThisTurn = false;
  let editsThisTurn = 0;
  let turnCounter = 0;
  const NUDGE_INTERVAL = 5;
  const MAX_KNOWLEDGE_INJECT = 5;
  let analysisCount = 0;
  let pendingWarnings = [];
  const MAX_PENDING_WARNINGS = 4;
  function queueWarning(msg) {
    if (pendingWarnings.length < MAX_PENDING_WARNINGS) pendingWarnings.push(msg);
  }
  let pendingReviewQueue = [];
  let _habitReminderInjected = false;
  let _blocksCache = null;
  let _blocksCacheTime = 0;
  let _blocksCacheKey = "";
  function getBlocksCached(memPaths) {
    const cacheKey = JSON.stringify(memPaths);
    const now = Date.now();
    if (_blocksCache && cacheKey === _blocksCacheKey && now - _blocksCacheTime < 5e3) {
      return _blocksCache;
    }
    _blocksCache = mergeBlocksAndTriggers(memPaths);
    _blocksCacheKey = cacheKey;
    _blocksCacheTime = now;
    return _blocksCache;
  }
  let lastUserMessage = "";
  let alignmentGate = {
    active: false,
    version: 0
  };
  let pipelineState = null;
  let gateJustReleased = false;
  let implementIdleTurns = 0;
  let pendingFlashClassification = null;
  const FLASH_MODE = { active: true };
  const KEEP_WARM_FILE = path4.join(MEMORIES_DIR3, ".keepwarm-state.json");
  const KEEP_WARM_ROUNDS = 5;
  function readKeepWarmState() {
    try {
      if (fs5.existsSync(KEEP_WARM_FILE)) return JSON.parse(fs5.readFileSync(KEEP_WARM_FILE, "utf-8"));
    } catch {
    }
    return {};
  }
  function writeKeepWarmState(s) {
    const pruned = {};
    for (const [k, v] of Object.entries(s)) {
      if (turnCounter - v <= KEEP_WARM_ROUNDS * 2) pruned[k] = v;
    }
    try {
      fs5.writeFileSync(KEEP_WARM_FILE, JSON.stringify(pruned, null, 0), "utf-8");
    } catch {
    }
  }
  return {
    /**
     * 会话启动时：
     * 1. 检查事件增量，触发分析（分析模式）
     * 2. 注入 blocks + triggers 到 system prompt
     */
    "experimental.chat.system.transform": async (_input, output) => {
      debug("HOOK: system.transform fired");
      _fractalDebug("HOOK: system.transform fired");
      const coreRules = loadPrompt(
        "core-rules.md",
        `## \u5206\u5F62 v2.1
**\u5143\u77E5\u8BC6\u8BB0\u5F55**\uFF08\u624B\u52A8 + \u81EA\u4E3B\u4E24\u8DEF\uFF09
\u2026`
      );
      output.system.push(`
${coreRules}
`);
      output.system.push(`
${loadPrompt("websearch-rules.md", "")}
`);
      output.system.push("\n\u4EE5\u4E2D\u6587\u601D\u8003\uFF0C\u9664\u975E\u7528\u6237\u8981\u6C42\uFF0C\u5426\u5219\u56DE\u7B54\u4E5F\u4F7F\u7528\u4E2D\u6587\u3002\n");
      return;
      const isNudgeTurn = false;
      const varBuf = [];
      if (!pipelineState) {
        const restored = readPipelineState();
        if (restored && restored.status === "active") {
          pipelineState = restored;
          debug(`\u6D41\u6C34\u7EBF: \u8DE8\u4F1A\u8BDD\u6062\u590D \u2014 ${restored.pipelineId} (${restored.currentStage})`);
        }
      }
      const pstate = pipelineState;
      if (pstate && pstate.status === "active" && !alignmentGate.active) {
        const f = pstate.context.feature;
        const s = pstate.currentStage;
        const c2 = pstate.complexity;
        varBuf.push(`
> \u{1F504} \u6D41\u6C34\u7EBF: ${f} | ${s} | ${c2}`);
        const sp = getStageStartPrompt(pstate);
        if (sp) varBuf.push(`
${sp}
`);
        if (s !== "idle") {
          const stageKey = s;
          if (pstate.stages[stageKey]?.status === "active") {
            const done = Object.entries(pstate.stages).filter(([, v]) => v.status === "completed").map(([n]) => n).join(" \u2192 ");
            if (done) varBuf.push(`
\u5DF2\u5B8C\u6210\uFF1A${done}\u3002\u7EE7\u7EED\u5F53\u524D\u9636\u6BB5\u300C${s}\u300D\u3002`);
          }
        }
      }
      const c = readCounter();
      try {
        if (fs5.existsSync(ASSERTION_FLAG)) {
          fs5.unlinkSync(ASSERTION_FLAG);
        }
      } catch {
      }
      if (!isLinePaused("4") && c.count > 0) {
        const thresholds = parseAssertionThresholds();
        const section = getSection(c.count, thresholds);
        const reminder = loadPromptSection(
          "assertion-reminder.md",
          section,
          { count: String(c.count), snippet: c.lastSnippet },
          `
## \u26A0\uFE0F \u5206\u5F62\uFF1A\u8BF7\u5148\u67E5\u8BC1\u518D\u4E0B\u7ED3\u8BBA
\u4E0A\u4E00\u8F6E\u4F60\u8BF4\u4E86\u300C${c.lastSnippet}\u300D\u4F46\u6CA1\u6709\u8054\u7F51\u67E5\u8BC1\u3002`
        );
        output.system.push(`
${reminder}
`);
      }
      const memoryPaths = getMemoryPaths(projectDir);
      let forceLearn = false;
      try {
        if (fs5.existsSync(LEARN_FLAG)) {
          forceLearn = true;
          fs5.unlinkSync(LEARN_FLAG);
          debug("FRACTAL: /fractal learn \u6807\u5FD7\u68C0\u6D4B\u5230\uFF0C\u5F3A\u5236\u89E6\u53D1\u5206\u6790");
        }
      } catch {
      }
      try {
        if (!isLinePaused("5")) {
          const hasNewCommit = await checkAndExtractCommitKnowledge(projectDir, memoryPaths);
          if (hasNewCommit && pipelineState?.currentStage === "delivering" && pipelineState?.status === "active") {
            pipelineState = transitionToNextStage(pipelineState);
            debug("\u6D41\u6C34\u7EBF: \u4EA4\u4ED8\u5B8C\u6210 \u2192 idle\uFF08\u68C0\u6D4B\u5230\u65B0\u63D0\u4EA4\uFF09");
          }
        }
      } catch {
      }
      const newEvents = getNewEvents();
      const dynamicThreshold = Math.min(ANALYSIS_THRESHOLD * Math.pow(2, analysisCount), 400);
      debug(`FRACTAL: \u65B0\u4E8B\u4EF6\u6570=${newEvents.length}\uFF0C\u9608\u503C=${dynamicThreshold}\uFF08\u7B2C ${analysisCount + 1} \u6B21\u5206\u6790\uFF09`);
      if (forceLearn || newEvents.length >= dynamicThreshold) {
        debug("FRACTAL: \u89E6\u53D1 LLM \u81EA\u4E3B\u5B66\u4E60\u5206\u6790...");
        const result = await analyzeAndUpdate(newEvents, memoryPaths);
        if (result && result !== "NO_NEW_HABITS") {
          applyAnalysisResult(result, memoryPaths);
        } else {
          debug("FRACTAL: \u65E0\u65B0\u4E60\u60EF\u6216 LLM \u672A\u8FD4\u56DE\u6709\u6548\u7ED3\u679C");
        }
        const lastEvent = newEvents[newEvents.length - 1];
        const lastTs = JSON.parse(lastEvent).ts;
        saveLastAnalysis(lastTs, newEvents.length);
        analysisCount++;
        debug(`FRACTAL: \u5206\u6790\u5B8C\u6210\uFF0C\u4E0B\u6B21\u9608\u503C=${Math.min(ANALYSIS_THRESHOLD * Math.pow(2, analysisCount), 400)}`);
      }
      const { blocks, triggers } = mergeBlocksAndTriggers(memoryPaths);
      try {
        const hasNewPending = blocks.some((b) => b.status === "pending");
        const apiCfg = await getApiConfig();
        const dupResults = await runDedupCheck(
          turnCounter,
          /*forceCheck*/
          hasNewPending,
          apiCfg,
          (msg) => debug(msg),
          projectDir
        );
        if (dupResults.length > 0) {
          const reminder = buildDedupReminder(dupResults);
          output.system.push(`
${reminder}
`);
          debug(`DEDUP: \u6CE8\u5165 ${dupResults.length} \u5BF9\u7591\u4F3C\u91CD\u590D\u63D0\u9192`);
        }
      } catch {
      }
      const autoHabits = triggers.filter((t) => t.type === "habit" && t.status === "auto");
      const suggestHabits = triggers.filter((t) => t.type === "habit" && t.status === "suggest");
      let pendingBlocks = blocks.filter((b) => b.status === "pending");
      let pendingTriggers = triggers.filter((t) => t.status === "pending");
      let pendingCount = pendingBlocks.length + pendingTriggers.length;
      const dedupedBlocks = deduplicatePendingByKeywords(pendingBlocks, "description");
      const dedupedTriggers = deduplicatePendingByKeywords(pendingTriggers, "human_description");
      if (dedupedBlocks.length < pendingBlocks.length || dedupedTriggers.length < pendingTriggers.length) {
        debug(`FRACTAL: \u6CE8\u5165\u5C42\u53BB\u91CD pending blocks ${pendingBlocks.length}\u2192${dedupedBlocks.length} triggers ${pendingTriggers.length}\u2192${dedupedTriggers.length}`);
        pendingBlocks = dedupedBlocks;
        pendingTriggers = dedupedTriggers;
        pendingCount = pendingBlocks.length + pendingTriggers.length;
      }
      const knowledgeItems = blocks.filter((b) => b.type === "knowledge" && b.status !== "pending").concat(triggers.filter((t) => t.type === "knowledge" && t.status !== "pending"));
      const userMsgLower = (lastUserMessage || "").toLowerCase();
      const userKeywords = lastUserMessage ? extractKeywords2(lastUserMessage) : [];
      const now = Date.now();
      const scored = [];
      let maxRelevance = 1;
      for (const k of knowledgeItems) {
        const mp = memoryPaths[parseInt(k.memPathIndex, 10)] || MEMORIES_DIR3;
        const subDir = k.human_description !== void 0 ? "triggers" : "blocks";
        const fpath = path4.join(mp, subDir, k.fileName);
        const desc = (k.human_description || k.description || "").toLowerCase();
        const body = (k.content || k.value || "").toLowerCase();
        const forwardHits = userKeywords.length > 0 ? userKeywords.filter((kw) => desc.includes(kw) || body.includes(kw)).length : 0;
        let reverseHits = 0;
        if (userMsgLower) {
          const descKeywords = extractKeywords2(desc);
          reverseHits = descKeywords.filter((dk) => dk.length >= 2 && userMsgLower.includes(dk)).length;
        }
        const hits = forwardHits + reverseHits;
        if (hits > maxRelevance) maxRelevance = hits;
        let mtimeMs = 0;
        try {
          mtimeMs = fs5.statSync(fpath).mtimeMs;
        } catch {
        }
        scored.push({ item: k, mtime: mtimeMs, relevance: hits, priority: k.priority || 50, category: k.category || "reference", score: 0 });
      }
      for (const s of scored) {
        const normRel = maxRelevance > 0 ? s.relevance / maxRelevance : 0;
        s.score = normRel * 0.4 + s.priority / 100 * 0.5 + Math.exp(-Math.max(0, (now - s.mtime) / (1e3 * 60 * 60 * 24)) / 30) * 0.1;
        const kwState = readKeepWarmState();
        const label = s.item.label || s.item.fileName;
        const lastHit = kwState[label] || 0;
        if (lastHit > 0 && turnCounter - lastHit <= 5) {
          const keepWarmBonus = (6 - (turnCounter - lastHit)) / 5 * 0.45;
          s.score += keepWarmBonus;
        }
      }
      scored.sort((a, b) => b.score - a.score);
      const HIGH = scored.filter((s) => s.score >= 0.8 || s.priority >= 90 || s.category === "constraint");
      const IMPORTANT = scored.filter((s) => !HIGH.includes(s) && s.score >= 0.6);
      const OPERATIONAL = scored.filter((s) => !HIGH.includes(s) && !IMPORTANT.includes(s) && s.score >= 0.3);
      const GENERAL = scored.filter((s) => !HIGH.includes(s) && !IMPORTANT.includes(s) && !OPERATIONAL.includes(s));
      const dynamicBudget = Math.max(2, Math.min(MAX_KNOWLEDGE_INJECT, Math.floor((8e3 - output.system.join("\n").length / 4) / 800)));
      let remainingBudget = dynamicBudget;
      const selected = [];
      for (const s of HIGH) {
        selected.push({ item: s.item, relevance: s.relevance, tier: "HIGH" });
      }
      for (const tier of [IMPORTANT, OPERATIONAL, GENERAL]) {
        for (const s of tier) {
          if (remainingBudget <= 0) break;
          selected.push({ item: s.item, relevance: s.relevance, tier: tier === IMPORTANT ? "IMPORTANT" : tier === OPERATIONAL ? "OPERATIONAL" : "GENERAL" });
          remainingBudget--;
        }
      }
      const matchedCount = selected.filter((s) => s.relevance > 0).length;
      let topKnowledge = selected;
      if (matchedCount > 3 && userMsgLower) {
        const reranked = await llmRerankKnowledge(userMsgLower, selected.map((s) => ({ item: s.item, mtime: 0, relevance: s.relevance })));
        if (reranked) {
          const tierMap = new Map(selected.map((s) => [s.item.label || s.item.fileName, s.tier]));
          topKnowledge = reranked.map((r) => ({ item: r.item, relevance: r.relevance, tier: tierMap.get(r.item.label || r.item.fileName) || "GENERAL" }));
          debug(`FRACTAL: LLM \u91CD\u6392\u77E5\u8BC6\uFF0C${reranked.length} \u6761\u4E2D ${reranked.filter((r) => r.relevance > 0).length} \u6761\u547D\u4E2D`);
        }
      }
      const tierPrefixes = { HIGH: "\u{1F534}", IMPORTANT: "\u{1F7E1}", OPERATIONAL: "\u{1F7E2}", GENERAL: "" };
      const pushGroups = [];
      let lastMergedDesc = "";
      for (const s of topKnowledge) {
        const k = s.item;
        const desc = k.human_description || k.description;
        const mp = memoryPaths[parseInt(k.memPathIndex, 10)] || MEMORIES_DIR3;
        const subDir = k.human_description !== void 0 ? "triggers" : "blocks";
        const filePath = `${mp}/${subDir}/${k.fileName}`.replace(HOME3, "~");
        const tag = s.relevance > 0 ? " [\u76F8\u5173]" : "";
        const line = `- **${desc}**${tag} \u2192 \`${filePath}\``;
        const lastGroup = pushGroups.length > 0 ? pushGroups[pushGroups.length - 1] : null;
        const descKeywords = extractKeywords2(desc);
        const lastKeywords = lastGroup ? extractKeywords2(lastMergedDesc) : [];
        const shared = descKeywords.filter((dk) => lastKeywords.includes(dk)).length;
        if (lastGroup && lastGroup.tier === s.tier && shared >= 2) {
          lastGroup.lines.push(line);
          lastMergedDesc = desc;
        } else {
          pushGroups.push({ tier: s.tier, lines: [line] });
          lastMergedDesc = desc;
        }
      }
      if ((isNudgeTurn || matchedCount > 0) && pushGroups.length > 0) {
        const truncated = scored.length - topKnowledge.length;
        const prefixMap = { HIGH: "\u{1F534} \u786C\u7EA6\u675F\uFF08\u4E0D\u53D7\u622A\u65AD\u4FDD\u62A4\u5916\u7684\u9884\u7B97\u9650\u5236\uFF09", IMPORTANT: "\u{1F7E1} \u91CD\u8981\u77E5\u8BC6", OPERATIONAL: "\u{1F7E2} \u53C2\u8003\u77E5\u8BC6", GENERAL: "\u5176\u4ED6\u77E5\u8BC6" };
        for (const group of pushGroups) {
          const label = prefixMap[group.tier] || group.tier;
          output.system.push(`
### ${label}
${group.lines.join("\n")}
`);
        }
        if (truncated > 0) {
          output.system.push(`
> \uFF08\u5171 ${scored.length} \u6761\u77E5\u8BC6\uFF0C\u5DF2\u6309\u6743\u91CD\u5206\u5C42\u6CE8\u5165 ${topKnowledge.length} \u6761\u3002\u5176\u4F59\u7528 read \u5DE5\u5177\u6309\u9700\u8BFB\u53D6\uFF09
`);
        }
      }
      {
        const injectedLabels = new Set(topKnowledge.map((s) => s.item.label || s.item.fileName));
        const decayState = readDecayState();
        for (const label of injectedLabels) {
          if (decayState.missedRounds[label]) decayState.missedRounds[label] = 0;
        }
        const decayCandidates = [];
        for (const s of scored) {
          const label = s.item.label || s.item.fileName;
          if (!injectedLabels.has(label)) {
            decayCandidates.push({
              label,
              memPath: s.item.memPathIndex || "0",
              category: s.item.category || "reference"
            });
          }
        }
        saveDecayState(decayState);
        if (decayCandidates.length > 0) {
          decayAndPersist(decayCandidates, memoryPaths);
        }
      }
      {
        const kw = readKeepWarmState();
        for (const s of topKnowledge) {
          const label = s.item.label || s.item.fileName;
          kw[label] = turnCounter;
        }
        writeKeepWarmState(kw);
      }
      if (isNudgeTurn && autoHabits.length > 0) {
        const triggerTexts = autoHabits.map(
          (t) => `**[\u9ED8\u8BA4\u884C\u4E3A] ${t.human_description}**
${t.content}`
        ).join("\n\n");
        output.system.push(
          `
## \u9ED8\u8BA4\u884C\u4E3A\uFF08\u65E0\u9700\u786E\u8BA4\uFF0C\u76F4\u63A5\u6267\u884C\uFF09
\u4EE5\u4E0B\u662F\u4F60\u7684\u9ED8\u8BA4\u884C\u4E3A\u89C4\u5219\u2014\u2014\u50CF\u808C\u8089\u8BB0\u5FC6\u4E00\u6837\uFF0C\u89E6\u53D1\u573A\u666F\u65F6\u81EA\u52A8\u7167\u505A\uFF1A

${triggerTexts}
`
        );
      }
      if (isNudgeTurn && suggestHabits.length > 0) {
        const triggerTexts = suggestHabits.map(
          (t) => `**[\u5F85\u89C2\u5BDF\u7684\u4E60\u60EF] ${t.human_description}**
${t.content}`
        ).join("\n\n");
        output.system.push(
          `
## \u5F85\u89C2\u5BDF\u7684\u4E60\u60EF
\u4F60\u5076\u5C14\u5728\u4EE5\u4E0B\u573A\u666F\u505A\u8FD9\u4E9B\u4E8B\uFF0C\u8FD8\u4E0D\u591F\u786E\u5B9A\uFF0C\u4EC5\u4F9B\u53C2\u8003\uFF1A

${triggerTexts}
`
        );
      }
      if (triggers.length > 0) {
        const skipped = !isNudgeTurn && matchedCount === 0 ? " (\u95F4\u9694\u8DF3\u8FC7\u6CE8\u5165)" : !isNudgeTurn && matchedCount > 0 ? ` (\u5173\u952E\u8BCD\u547D\u4E2D${matchedCount}\u6761\uFF0C\u7ACB\u5373\u6CE8\u5165)` : "";
        const trimInfo = scored.length > topKnowledge.length ? ` \u622A\u65AD${scored.length - topKnowledge.length}\u6761` : "";
        const matchInfo = matchedCount > 0 ? ` \u547D\u4E2D${matchedCount}\u6761` : "";
        debug(`FRACTAL: \u6CE8\u5165 ${autoHabits.length} \u4E2A\u5DF2\u786E\u8BA4 + ${suggestHabits.length} \u4E2A\u89C2\u5BDF\u4E2D + ${knowledgeItems.length} \u4E2A\u5143\u77E5\u8BC6\u2192\u5C55\u793A${topKnowledge.length}${matchInfo}${trimInfo}${skipped}`);
      }
      const websearchRules = loadPrompt(
        "websearch-rules.md",
        `## \u{1F50D} \u8054\u7F51\u67E5\u8BC1\u89C4\u5219\uFF08\u5206\u5F62 Guardian\uFF09
\u4EFB\u4F55\u6D89\u53CA\u4EE5\u4E0B\u7C7B\u578B\u7684\u7ED3\u8BBA\uFF0C**\u5FC5\u987B\u5148\u8C03 websearch \u67E5\u5B98\u65B9\u6587\u6863**\uFF0C\u7981\u6B62\u51ED\u8BAD\u7EC3\u6570\u636E\u8BB0\u5FC6\u56DE\u7B54\uFF1A
- "XX \u4E0D\u652F\u6301 / \u505A\u4E0D\u5230 / \u53EA\u6709 N \u79CD\u65B9\u6CD5"
- \u7CFB\u7EDF\u80FD\u529B\u5BF9\u6BD4
- \u7A77\u4E3E\u578B\u5217\u4E3E
- \u4ECE\u5C40\u90E8\u4EE3\u7801\u63A8\u6D4B\u5DE5\u5177\u5B8C\u6574\u80FD\u529B

websearch \u5DE5\u5177\u5DF2\u5C31\u7EEA\u3002\u5148\u641C\u518D\u8BF4\u3002`
      );
      output.system.push(`
${websearchRules}
`);
      output.system.push("\n\u4EE5\u4E2D\u6587\u601D\u8003\uFF0C\u9664\u975E\u7528\u6237\u8981\u6C42\uFF0C\u5426\u5219\u56DE\u7B54\u4E5F\u4F7F\u7528\u4E2D\u6587\u3002\n");
      const plans = getActivePlanSummaries();
      if (plans.length > 0) {
        const planSection = [
          "\n## \u{1F4CB} \u5F53\u524D\u8BA1\u5212",
          ...plans,
          plans.length > 1 ? "\n> \u591A\u4E2A\u8BA1\u5212\u5E76\u884C\u65F6\uFF0C\u4F18\u5148\u5B8C\u6210\u5F53\u524D\u6B63\u5728\u6267\u884C\u7684\u90A3\u4E2A\u3002" : ""
        ].join("\n");
        output.system.push(planSection);
        debug(`\u6CE8\u5165 ${plans.length} \u4E2A\u8BA1\u5212\u6458\u8981`);
      }
      if (pendingWarnings.length > 0) {
        const fullWarningText = pendingWarnings.join(" | ");
        const MAX_WARNING_CHARS = 500;
        let warningText = fullWarningText;
        if (fullWarningText.length > MAX_WARNING_CHARS) {
          const last = pendingWarnings[pendingWarnings.length - 1];
          warningText = last.length > MAX_WARNING_CHARS ? last.slice(0, MAX_WARNING_CHARS) + "\u2026" : "\u2026" + fullWarningText.slice(fullWarningText.length - MAX_WARNING_CHARS);
        }
        output.system.push(`
[\u5206\u5F62 Guardian] ${warningText}
`);
        debug(`system.transform \u6CE8\u5165 ${pendingWarnings.length} \u6761 pending \u8B66\u544A\uFF08${warningText.length} chars\uFF09`);
        if (fullWarningText.length > MAX_WARNING_CHARS) {
          debug(`[DIAG] pendingWarnings \u622A\u65AD\u524D\u5B8C\u6574\u5185\u5BB9\uFF08${fullWarningText.length} chars\uFF09\uFF1A${fullWarningText.slice(0, 300)}\u2026${fullWarningText.slice(-100)}`);
        }
        pendingWarnings = [];
      }
      {
        const sections = output.system.map((s, i) => {
          const preview = s.slice(0, 60).replace(/\n/g, "\u21B5");
          return `  [${i}] ${s.length} chars: ${preview}\u2026`;
        });
        const totalChars = output.system.join("\n").length;
        const totalTokens = Math.ceil(totalChars / 3.5);
        debug(`[DIAG] system.prompt \u7ED3\u6784\uFF08${output.system.length} \u6BB5\uFF0C${totalChars} chars \u2248 ${totalTokens} tokens\uFF09\uFF1A`);
        for (const line of sections) debug(line);
        if (totalChars > 15e3) {
          debug(`[DIAG] \u26A0\uFE0F system.prompt \u8D85\u8FC7 15K chars\uFF0C\u53EF\u80FD\u89E6\u53D1 API \u9650\u5236`);
        }
      }
    },
    /**
     * 双通道注入：在用户消息到达时注入警告（同轮可见，比 system.transform 更即时）
     *
     * 数据流：event hook（触发线2/4）→ pendingWarnings 队列 → chat.message 注入 → 清空
     * 与 system.transform 的频率逻辑互补：
     *   - chat.message：每轮用户消息都注入 pending warnings（即时反馈，不做节流）
     *   - system.transform：knowledge/habits 按 NUDGE_INTERVAL 节流（减少 prompt 污染）
     */
    "chat.message": async (_input, output) => {
      _fractalDebug("HOOK: chat.message fired");
      const userText = (output.parts || []).filter((p) => p.type === "text" && !p.synthetic).map((p) => p.text || "").join(" ");
      if (userText) lastUserMessage = userText;
      if (userText && userText.length >= 3 && !pipelineState) {
        classifyTaskComplexity(userText).then((result) => {
          if (!result || result.complexity === "no_action") return;
          const label = `[${result.complexity}] ${result.reasoning}\uFF08\u4F30${result.estimatedFiles}\u6587\u4EF6\uFF09`;
          debug(`FLASH-CLASSIFIER: ${label}`);
          if (!FLASH_MODE.active) return;
          pendingFlashClassification = {
            complexity: result.complexity,
            reasoning: result.reasoning,
            estimatedFiles: result.estimatedFiles,
            timestamp: Date.now()
          };
          if (result.complexity === "complex") {
            queueWarning(
              `\u54E8\u5175\u68C0\u6D4B\u5230\u590D\u6742\u4EFB\u52A1\uFF1A${result.reasoning}\uFF08\u4F30${result.estimatedFiles}\u6587\u4EF6\uFF09| \u26A0\uFE0F \u5148\u5BF9\u9F50\u518D\u52A8\u624B\u2014\u2014\u9010\u7EF4\u8D28\u8BE2\uFF1A\u9700\u6C42\u2192\u6570\u636E\u6A21\u578B\u2192\u8FB9\u754C\u2192\u5F71\u54CD\u8303\u56F4\u3002\u5168\u90E8\u786E\u8BA4\u540E\u56DE\u590D\u300C\u8BBE\u8BA1\u5BF9\u9F50\uFF0C\u5F00\u59CB\u5B9E\u73B0\u300D`
            );
          }
        }).catch((e) => {
          debug(`FLASH-CLASSIFIER: \u8C03\u7528\u5931\u8D25: ${e}`);
        });
      }
      if (pipelineState && pipelineState.status === "active" && userText) {
        if (isStageSkipRequest(userText)) {
          queueWarning(`\u{1F6AB} ${getStageSkipRejection(pipelineState.context.feature)}`);
          debug("\u6D41\u6C34\u7EBF: \u62D2\u7EDD\u9003\u8BFE\u8BF7\u6C42");
        } else if (isTaskCancelRequest(userText)) {
          clearPipelineState();
          pipelineState = null;
          gateJustReleased = false;
          implementIdleTurns = 0;
          queueWarning("\u6D41\u6C34\u7EBF\u5DF2\u53D6\u6D88\u3002\u72B6\u6001\u5DF2\u6E05\u9664\u3002");
          debug("\u6D41\u6C34\u7EBF: \u7528\u6237\u53D6\u6D88\u4EFB\u52A1");
        }
      }
      if (userText && /确认习惯|确认pending/i.test(userText)) {
        try {
          const { blocks, triggers: allTriggers } = getBlocksCached(getMemoryPaths(projectDir));
          const pendingItems = [
            ...blocks.filter((b) => b.status === "pending").map((b) => ({
              desc: b.description || "(\u65E0\u63CF\u8FF0)",
              status: b.suggested_status || "suggest",
              mp: b.memPathIndex
            })),
            ...allTriggers.filter((t) => t.status === "pending").map((t) => ({
              desc: t.human_description || "(\u65E0\u63CF\u8FF0)",
              status: t.suggested_status || "suggest",
              mp: t.memPathIndex
            }))
          ];
          if (pendingItems.length > 0) {
            const levelName = (mp) => ({ "0": "\u5168\u5C40", "1": "\u4E2A\u4EBA\u9879\u76EE\u7EA7", "2": "\u5171\u4EAB\u9879\u76EE\u7EA7" })[mp] || "\u672A\u77E5";
            const list = pendingItems.map((p) => `- **${p.desc}**\uFF08\u5EFA\u8BAE\uFF1A${p.status}\xB7${levelName(p.mp)}\uFF09`).join("\n");
            const firstDesc = pendingItems[0].desc;
            const confirmMsg = `\u5206\u5F62\u4E60\u60EF\u786E\u8BA4\uFF1A\u7528\u6237\u60F3\u786E\u8BA4\u4EE5\u4E0B ${pendingItems.length} \u6761\u5F85\u5B9A\u4E60\u60EF\u3002\u8BF7\u4F7F\u7528 question \u5DE5\u5177\u9010\u6761\u786E\u8BA4\uFF0C\u683C\u5F0F\uFF1A
{ "questions": [{ "question": "\u5206\u5F62\u53D1\u73B0\u4E86\u4E60\u60EF\u300C${firstDesc}\u300D\uFF0C\u662F\u5426\u4FDD\u5B58\uFF1F", "header": "\u786E\u8BA4\u4E60\u60EF", "options": [{"label": "\u81EA\u52A8\xB7\u5168\u5C40", "description": "\u6240\u6709\u9879\u76EE\u9002\u7528"}, {"label": "\u81EA\u52A8\xB7\u672C\u9879\u76EE", "description": "\u4EC5\u5F53\u524D\u9879\u76EE"}, {"label": "\u5EFA\u8BAE\xB7\u5168\u5C40", "description": "\u89C2\u5BDF\u4E2D\uFF0C\u6240\u6709\u9879\u76EE"}, {"label": "\u5EFA\u8BAE\xB7\u672C\u9879\u76EE", "description": "\u89C2\u5BDF\u4E2D\uFF0C\u4EC5\u672C\u9879\u76EE"}, {"label": "\u4E0D\u4FDD\u5B58", "description": "\u8DF3\u8FC7\u6B64\u4E60\u60EF"}] }] }
\u5F85\u786E\u8BA4\u9879\uFF1A
${list}
\u786E\u8BA4\u540E\uFF1A1. \u6839\u636E\u9009\u9879\u7F16\u8F91 blocks/*.md \u7684 status \u4E3A auto/suggest 2. \u5C42\u7EA7\u4E0D\u5339\u914D\u5219\u79FB\u52A8\u6587\u4EF6 3. \u9009\u8DF3\u8FC7\u5219\u5220\u9664\u6587\u4EF6`;
            queueWarning(confirmMsg);
          } else {
            queueWarning("\u5206\u5F62\uFF1A\u5F53\u524D\u65E0\u5F85\u786E\u8BA4\u4E60\u60EF\u3002");
          }
        } catch {
        }
      }
      turnCounter++;
      const dynamicSections = [];
      if (pipelineState?.status === "active" && !alignmentGate.active) {
        dynamicSections.push(`> \u{1F504} **\u6D41\u6C34\u7EBF**: ${pipelineState.context.feature} | ${pipelineState.currentStage} | ${pipelineState.complexity}`);
      }
      if (turnCounter === 0) {
        const activePlans = getActivePlanSummaries();
        if (activePlans.length > 0) {
          dynamicSections.push(`> \u{1F4CB} \u6709 ${activePlans.length} \u4E2A\u6D3B\u8DC3\u8BA1\u5212\uFF0C\u9700\u8981\u65F6\u53EF\u67E5\u770B: plans/ \u76EE\u5F55`);
        }
      }
      if (pendingWarnings.length > 0) {
        const fullWarningText = pendingWarnings.join(" | ");
        const MAX_WARNING_CHARS = 500;
        let warningText = fullWarningText;
        if (fullWarningText.length > MAX_WARNING_CHARS) {
          const last = pendingWarnings[pendingWarnings.length - 1];
          warningText = last.length > MAX_WARNING_CHARS ? last.slice(0, MAX_WARNING_CHARS) + "\u2026" : "\u2026" + fullWarningText.slice(fullWarningText.length - MAX_WARNING_CHARS);
        }
        dynamicSections.push(`[\u5206\u5F62 Guardian] ${warningText}`);
        debug(`chat.message \u6CE8\u5165 ${pendingWarnings.length} \u6761\u8B66\u544A\uFF08${warningText.length} chars\uFF09`);
        pendingWarnings = [];
      }
      if (!isLinePaused("2")) {
        const nfs = readNoFeedbackState(NO_FEEDBACK_STATE);
        const warning = buildNoFeedbackWarning(nfs.consecutiveTurns, NO_FEEDBACK_THRESHOLD);
        if (warning) {
          dynamicSections.push(warning);
          debug(`\u89E6\u53D1\u7EBF2\u6269\u5C55: chat.message \u6CE8\u5165\u65E0\u53CD\u9988\u73AF\u8B66\u544A\uFF0CconsecutiveTurns=${nfs.consecutiveTurns}`);
          nfs.consecutiveTurns = 0;
          saveNoFeedbackState(NO_FEEDBACK_STATE, nfs);
        }
      }
      try {
        const memPaths = getMemoryPaths(projectDir);
        const { blocks: kb } = getBlocksCached(memPaths);
        const knowledge = kb.filter((b) => b.type === "knowledge" && b.status !== "pending");
        const engineBlocks = knowledge.map((k) => ({
          fileName: k.fileName || "",
          relPath: k.fileName || "",
          status: k.status || "",
          type: k.type || "",
          label: k.label || k.fileName || "?",
          description: k.description || "",
          priority: k.priority || 0,
          body: (k.value || "").slice(0, 200)
          // 正文截取 200 字
        }));
        v4knowledgeEngine.feedBlocks(engineBlocks);
        v4knowledgeEngine.setVectorIndex(v4VectorIndex);
        const vi = v4VectorIndex;
        if (!v4knowledgeEngine.vectorReady) {
          vi.ensureModel().then((ok) => {
            if (!ok) return;
            const vdocs = engineBlocks.filter((b) => b.description).map((b) => ({
              filePath: b.fileName,
              text: `${b.label} ${b.description} ${b.body}`.slice(0, 500)
            }));
            return vi.rebuild(vdocs);
          }).then(() => {
            if (vi.ready) {
              debug(`[V4] \u8BED\u4E49\u5411\u91CF\u5C31\u7EEA\uFF1A${vi.size} \u6587\u6863\u5DF2\u7D22\u5F15\uFF08${vi.dim} \u7EF4\uFF09`);
              _fractalDebug(`[S3] \u8BED\u4E49\u5411\u91CF\u5C31\u7EEA\uFF1A${vi.size} \u6587\u6863\u5DF2\u7D22\u5F15`);
            }
          }).catch((e) => {
            debug(`[V4] \u8BED\u4E49\u5411\u91CF\u91CD\u5EFA\u5931\u8D25\uFF0C\u964D\u7EA7\u7EAF BM25: ${String(e)}`);
          });
        }
        if (turnCounter % NUDGE_INTERVAL === 0 && knowledge.length > 0) {
          const query = (lastUserMessage || "").trim();
          _fractalDebug(`[S3] nudge turn, query="${query}", engine stats: ${v4knowledgeEngine.stats().indexed} indexed / ${v4knowledgeEngine.stats().totalBlocks} total, vectorReady=${v4knowledgeEngine.stats().vectorReady}`);
          if (query.length >= 2) {
            const results = await v4knowledgeEngine.searchHybrid(query, 5);
            _fractalDebug(`[S3] hybrid search results: ${results.length}, top: ${results.slice(0, 3).map((r) => r.doc.label).join(", ")}`);
            if (results.length > 0) {
              const searchLines = results.map(
                (r) => `- \u{1F3AF} **${r.doc.label}** \u2014 ${r.doc.description.slice(0, 50)}`
              );
              dynamicSections.push(`### \u{1F3AF} \u7CBE\u51C6\u5339\u914D
${searchLines.join("\n")}`);
            }
          }
          const lines = [];
          const maxShow = 5;
          for (const k of knowledge.slice(0, maxShow)) {
            const label = k.label || k.fileName || "?";
            const desc = (k.description || "").slice(0, 55);
            lines.push(`- **${label}**${desc ? " \u2014 " + desc : ""}`);
          }
          const suffix = knowledge.length > maxShow ? `
*\u5171 ${knowledge.length} \u6761\uFF0C\u5C55\u793A ${maxShow}*` : "";
          dynamicSections.push(`### \u53C2\u8003\u77E5\u8BC6
${lines.join("\n")}${suffix}`);
        }
      } catch (e) {
        debug(`S3 \u77E5\u8BC6\u7D22\u5F15\u6CE8\u5165\u5931\u8D25: ${String(e)}`);
      }
      if (dynamicSections.length > 0) {
        const dynamicPrefix = "\n" + dynamicSections.join("\n") + "\n";
        output.context = output.context || [];
        output.context.push(dynamicPrefix);
      }
    },
    /**
     * 监听事件：记录用户交互
     */
    event: async (input2) => {
      const { event } = input2;
      if (event.type === "message.updated") {
        logEvent(event);
        try {
          const props = event.properties;
          const sessionID = props?.sessionID;
          const info = props?.info;
          if (info?.role === "assistant" && Array.isArray(info?.parts)) {
            for (const p of info.parts) {
              if (p?.type === "tool_call" && WEBSEARCH_TOOLS.test(String(p?.tool || ""))) {
                websearchCalledThisTurn = true;
                debug(`\u89E6\u53D1\u7EBF4: \u68C0\u6D4B\u5230\u8054\u7F51\u67E5\u8BC1 \u2192 ${p.tool}`);
              }
              if (p?.type === "tool_call" && /^bash$/i.test(String(p?.tool || ""))) {
                bashCalledThisTurn = true;
                debug(`\u89E6\u53D1\u7EBF2\u6269\u5C55: \u68C0\u6D4B\u5230 bash \u6267\u884C \u2192 \u53CD\u9988\u73AF\u5B58\u5728`);
              }
            }
          }
          if (info?.role === "user") {
            if (!assertionDetectedThisTurn) {
              decayCounter(sessionID || "");
            }
            let nfs = readNoFeedbackState(NO_FEEDBACK_STATE);
            nfs = resetForNewSession(nfs, sessionID || "");
            nfs = updateNoFeedbackCount(nfs, editsThisTurn, bashCalledThisTurn);
            saveNoFeedbackState(NO_FEEDBACK_STATE, nfs);
            if (editsThisTurn > 0 && !bashCalledThisTurn) {
              debug(`\u89E6\u53D1\u7EBF2\u6269\u5C55: consecutiveTurns=${nfs.consecutiveTurns}\uFF08\u4E0A\u8F6E ${editsThisTurn} \u6B21 edit\uFF0C\u65E0 bash\uFF09`);
            } else if (bashCalledThisTurn) {
              debug(`\u89E6\u53D1\u7EBF2\u6269\u5C55: \u4E0A\u8F6E\u6709 bash \u2192 \u91CD\u7F6E\u8BA1\u6570`);
            }
            websearchCalledThisTurn = false;
            assertionDetectedThisTurn = false;
            bashCalledThisTurn = false;
            editsThisTurn = 0;
            debug(`\u89E6\u53D1\u7EBF4: \u65B0\u7528\u6237\u6D88\u606F \u2192 \u91CD\u7F6E\u672C\u8F6E\u6807\u5FD7`);
            if (pipelineState && pipelineState.currentStage === "implementing") {
              if (editsThisTurn === 0) {
                implementIdleTurns++;
                if (implementIdleTurns === 5) {
                  try {
                    client.session.promptAsync({ text: "\u7F16\u7801\u9636\u6BB5\u4F3C\u4E4E\u5DF2\u5B8C\u6210\u3002\u5982\u679C\u5DF2\u5B8C\u6210\uFF0C\u8BF7\u8F93\u51FA\u300C### \u7F16\u7801\u5B8C\u6210\u300D\u3002" });
                  } catch {
                  }
                  debug(`\u6D41\u6C34\u7EBF: implementing ${implementIdleTurns} \u8F6E\u65E0\u7F16\u8F91\uFF0C\u6CE8\u5165\u63D0\u9192`);
                } else if (implementIdleTurns >= 10) {
                  try {
                    client.session.promptAsync({ text: `\u7F16\u7801\u9636\u6BB5 ${implementIdleTurns} \u8F6E\u65E0\u7F16\u8F91\u3002\u8BF7\u8F93\u51FA\u5B8C\u6210\u4FE1\u53F7\u6216\u8BF4\u660E\u8FD8\u9700\u505A\u4EC0\u4E48\u3002` });
                  } catch {
                  }
                }
              } else {
                implementIdleTurns = 0;
              }
            }
          }
          if (info?.role === "assistant" && typeof info?.content === "string") {
            const content = info.content;
            if (ASSERTION_RE.test(content)) {
              const snippet = content.slice(
                Math.max(0, content.search(ASSERTION_RE) - 40),
                content.search(ASSERTION_RE) + 80
              );
              fs5.writeFileSync(ASSERTION_FLAG, JSON.stringify({
                ts: (/* @__PURE__ */ new Date()).toISOString(),
                snippet: snippet.trim()
              }), "utf-8");
              if (!assertionDetectedThisTurn) {
                assertionDetectedThisTurn = true;
                if (websearchCalledThisTurn) {
                  resetCounter(sessionID || "");
                  debug(`\u89E6\u53D1\u7EBF4: \u65AD\u8A00\u68C0\u6D4B\u547D\u4E2D\u4F46\u5DF2\u8054\u7F51\u67E5\u8BC1 \u2014 ${snippet.trim().slice(0, 60)}`);
                } else {
                  incrementCounter(sessionID || "", snippet.trim());
                  debug(`\u89E6\u53D1\u7EBF4: \u65AD\u8A00\u68C0\u6D4B\u547D\u4E2D\u4E14\u672A\u67E5\u8BC1 \u2014 ${snippet.trim().slice(0, 60)}`);
                }
              }
            }
            if ((gateJustReleased || pendingFlashClassification?.complexity === "complex") && checkGateReleaseSignal(content)) {
              gateJustReleased = false;
              const ctx = extractAlignmentContext(content);
              if (ctx) {
                const fc = pendingFlashClassification;
                const isFlashValid = fc && Date.now() - fc.timestamp < 6e4;
                const flashComplexity = isFlashValid ? fc.complexity : void 0;
                pendingFlashClassification = null;
                if (flashComplexity === "simple") {
                  debug(`\u6D41\u6C34\u7EBF: flash \u5206\u7C7B\u4E3A simple\uFF0C\u8DF3\u8FC7 designing+planning\uFF0C\u76F4\u63A5 implementing`);
                }
                pipelineState = createPipelineState(ctx, flashComplexity);
                const pstate = pipelineState;
                writePipelineState(pstate);
                debug(`\u6D41\u6C34\u7EBF: \u521B\u5EFA \u2014 ${pstate.pipelineId} (${pstate.complexity})`);
                const sp = getStageStartPrompt(pstate);
                if (sp) {
                  const sid = extractSessionID(props);
                  if (sid) {
                    const stage = pstate.currentStage;
                    client.session.promptAsync({
                      path: { id: sid },
                      body: { parts: [{ type: "text", text: sp }] }
                    }).then(() => debug(`\u6D41\u6C34\u7EBF: \u6CE8\u5165 ${stage} \u542F\u52A8 prompt`)).catch((err) => debug(`\u6D41\u6C34\u7EBF: \u6CE8\u5165 prompt \u5931\u8D25 \u2014 ${String(err)}`));
                  }
                }
                const sec = splitAlignmentOutput(content);
                if (sec) {
                  if (sec.llm) {
                    const bf = path4.join(BLOCKS_DIR, `${ctx.feature}-\u5BF9\u9F50\u5171\u8BC6.md`);
                    try {
                      fs5.mkdirSync(BLOCKS_DIR, { recursive: true });
                    } catch {
                    }
                    fs5.writeFileSync(bf, sec.llm, "utf-8");
                  }
                  if (sec.human) {
                    const dd = path4.join(projectDir || ".", "doc", "\u77E5\u8BC6", "\u5BF9\u9F50\u5171\u8BC6");
                    const hf = path4.join(dd, `${ctx.feature}.md`);
                    try {
                      fs5.mkdirSync(dd, { recursive: true });
                    } catch {
                    }
                    fs5.writeFileSync(hf, sec.human, "utf-8");
                  }
                }
              }
            }
            if (pipelineState && pipelineState.status === "active") {
              if (pipelineState.currentStage === "designing" && checkDesignDoneSignal(content)) {
                pipelineState = transitionToNextStage(pipelineState);
                debug(`\u6D41\u6C34\u7EBF: \u8BBE\u8BA1\u5B8C\u6210 \u2192 ${pipelineState.currentStage}`);
              } else if (pipelineState.currentStage === "implementing" && checkImplementDoneSignal(content, pipelineState.taskType)) {
                pipelineState = transitionToNextStage(pipelineState);
                implementIdleTurns = 0;
                debug(`\u6D41\u6C34\u7EBF: \u7F16\u7801\u5B8C\u6210 \u2192 ${pipelineState.currentStage}`);
                try {
                  client.session.promptAsync({ text: "\u7F16\u7801\u5B8C\u6210\u3002\u8FDB\u5165**\u4EA4\u4ED8\u5BA1\u67E5**\u3002" });
                } catch {
                }
              } else if (pipelineState.currentStage === "planning" && isStageComplete(pipelineState, projectDir || ".")) {
                pipelineState = transitionToNextStage(pipelineState);
                debug(`\u6D41\u6C34\u7EBF: \u8BA1\u5212\u5B8C\u6210 \u2192 ${pipelineState.currentStage}`);
                const sp = getStageStartPrompt(pipelineState);
                if (sp) {
                  const sid = extractSessionID(props);
                  if (sid) {
                    client.session.promptAsync({
                      path: { id: sid },
                      body: { parts: [{ type: "text", text: sp }] }
                    }).catch(() => {
                    });
                  }
                }
              }
            }
          }
        } catch {
        }
      }
      function extractSessionID(props) {
        return props?.sessionID || props?.info?.id;
      }
      if (event.type === "file.edited" || event.type === "file.watcher.updated") {
        editsThisTurn++;
        logEvent(event);
        queueFileEditReview(event.properties);
      }
      function onSessionEnd(props) {
        flushReviewQueue(props);
        injectPendingHabitReminder(props);
      }
      if (event.type === "session.idle") {
        onSessionEnd(event.properties);
      }
      if (event.type === "session.status") {
        const statusType = event.properties?.status?.type;
        debug(`HOOK: session.status fired \u2014 ${JSON.stringify(event.properties)}`);
        if (statusType === "idle") {
          onSessionEnd(event.properties);
        }
      }
      function queueFileEditReview(props) {
        if (!props) return;
        const filePath = props.file || props.path || props.filePath || props.params?.file || props.params?.path || props.params?.filePath;
        if (!filePath || typeof filePath !== "string") return;
        const trigger = matchFileTriggers(filePath, projectDir);
        const related = projectDir ? findRelatedFiles(filePath, projectDir) : { docs: [], tests: [] };
        const hasDocOrTest = related.docs.length > 0 || related.tests.length > 0;
        if (!trigger && !hasDocOrTest) return;
        const sessionID = extractSessionID(props);
        if (!sessionID) return;
        if (pendingReviewQueue.length >= 20) {
          const removed = pendingReviewQueue.shift();
          debug(`TRIGGER: \u961F\u5217\u5DF2\u6EE1\uFF08\u226520\uFF09\uFF0C\u4E22\u5F03\u6700\u65E7\u9879 \u2014 ${removed?.filePath}`);
        }
        pendingReviewQueue.push({ filePath, trigger, relatedDocs: related.docs, relatedTests: related.tests, sessionID });
        const reason = trigger ? `\u4E60\u60EF: ${trigger.humanDescription}` : "\u4EC5\u6587\u6863/\u6D4B\u8BD5\u68C0\u67E5";
        debug(`TRIGGER: \u6392\u961F ${filePath}\uFF08${reason}\uFF09`);
      }
      function flushReviewQueue(endProps) {
        if (pendingReviewQueue.length === 0) return;
        const idleSessionID = extractSessionID(endProps);
        const matched = [];
        const remaining = [];
        for (const item of pendingReviewQueue) {
          if (idleSessionID && item.sessionID === idleSessionID) {
            matched.push(item);
          } else if (!idleSessionID) {
            debug(`TRIGGER: session \u7ED3\u675F\u4E8B\u4EF6\u65E0 sessionID\uFF0C\u8DF3\u8FC7\u961F\u5217\u6D88\u8D39\uFF08\u4FDD\u7559 ${pendingReviewQueue.length} \u9879\u5F85\u540E\u7EED\u5904\u7406\uFF09`);
          } else {
            remaining.push(item);
          }
        }
        pendingReviewQueue = remaining;
        if (matched.length === 0) return;
        debug(`TRIGGER: session \u7ED3\u675F \u2192 \u6D88\u8D39 ${matched.length} \u6761\u5BA1\u67E5${remaining.length > 0 ? `\uFF08${remaining.length} \u6761\u4FDD\u7559\u7B49\u5F85\u5176\u4ED6\u4F1A\u8BDD\uFF09` : ""}`);
        for (const item of matched) {
          const label = item.trigger ? `\u4E60\u60EF: ${item.trigger.humanDescription}` : "\u4EC5\u6587\u6863/\u6D4B\u8BD5\u68C0\u67E5";
          debug(`TRIGGER: \u5F02\u6B65 LLM \u8BED\u4E49\u5224\u65AD \u2014 ${item.filePath}\uFF08${label}\uFF09`);
          generateTriggerMessage(item.filePath, item.trigger, item.relatedDocs, item.relatedTests).then((msg) => {
            if (!msg) return;
            client.session.promptAsync({
              path: { id: item.sessionID },
              body: { noReply: true, parts: [{ type: "text", text: msg }] }
            }).then(() => {
              debug(`TRIGGER: prompt \u6CE8\u5165\u6210\u529F \u2014 ${item.filePath}`);
            }).catch((err) => {
              debug(`TRIGGER: prompt \u6CE8\u5165\u5931\u8D25 \u2014 ${String(err)}`);
            });
          }).catch((err) => {
            debug(`TRIGGER: LLM \u8BED\u4E49\u5224\u65AD\u5F02\u5E38 \u2014 ${String(err)}`);
          });
        }
      }
      function injectPendingHabitReminder(endProps) {
        try {
          if (_habitReminderInjected) return;
          _habitReminderInjected = true;
          const { blocks, triggers: allTriggers } = getBlocksCached(getMemoryPaths(projectDir));
          const pendingBlocks = blocks.filter((b) => b.type === "habit" && b.status === "pending");
          const pendingTriggers = allTriggers.filter((t) => t.type === "habit" && t.status === "pending");
          const pendingCount = pendingBlocks.length + pendingTriggers.length;
          if (pendingCount === 0) return;
          const sessionID = extractSessionID(endProps);
          if (!sessionID) return;
          const levelName = (mp) => ({ "0": "\u5168\u5C40", "1": "\u4E2A\u4EBA\u9879\u76EE\u7EA7", "2": "\u5171\u4EAB\u9879\u76EE\u7EA7" })[mp] || "\u672A\u77E5";
          const pendingList = [
            ...pendingBlocks.filter((b) => b.description).map(
              (b) => `- **${b.description}**\uFF08\u5EFA\u8BAE\uFF1A${b.suggested_status || "suggest"}\xB7${levelName(b.memPathIndex)}\uFF09`
            ),
            ...pendingTriggers.filter((t) => t.human_description).map(
              (t) => `- **${t.human_description}**\uFF08\u5EFA\u8BAE\uFF1A${t.suggested_status || "suggest"}\xB7${levelName(t.memPathIndex)}\uFF09`
            )
          ].join("\n");
          if (!pendingList) return;
          const reminder = `
## \u{1F7E1} \u5206\u5F62\uFF1A\u6709\u5F85\u786E\u8BA4\u7684\u4E60\u60EF

\u4E0A\u6B21\u64CD\u4F5C\u4E2D\u53D1\u73B0\u4EE5\u4E0B\u65B0\u6A21\u5F0F\uFF0C\u6709\u7A7A\u65F6\u786E\u8BA4\uFF1A

${pendingList}

\u786E\u8BA4\u65B9\u5F0F\uFF1A\u8BF4"\u786E\u8BA4\u4E60\u60EF"\u5373\u53EF\u9010\u6761\u786E\u8BA4
`;
          client.session.promptAsync({
            path: { id: sessionID },
            body: { noReply: true, parts: [{ type: "text", text: reminder }] }
          }).then(() => {
            debug(`HABIT: promptAsync \u6CE8\u5165\u6210\u529F\uFF08${pendingCount} \u6761\uFF09`);
          }).catch((err) => {
            debug(`HABIT: promptAsync \u6CE8\u5165\u5931\u8D25 \u2014 ${String(err)}`);
          });
        } catch (err) {
          debug(`HABIT: injectPendingHabitReminder \u5F02\u5E38 \u2014 ${String(err)}`);
        }
      }
      try {
        const rawLog = path4.join(MEMORIES_DIR3, "raw-events.log");
        const sample = {
          ts: (/* @__PURE__ */ new Date()).toISOString(),
          type: event.type,
          keys: Object.keys(event)
        };
        fs5.appendFileSync(rawLog, JSON.stringify(sample) + "\n", "utf-8");
        rotateLog(rawLog, 100 * 1024);
      } catch {
      }
    },
    /**
     * 会话压缩时注入记忆，防丢失
     */
    "experimental.session.compacting": async (_input, output) => {
      debug("HOOK: session.compacting fired");
      const memoryPaths = getMemoryPaths(projectDir);
      const { blocks, triggers } = mergeBlocksAndTriggers(memoryPaths);
      const autoHabits = triggers.filter((t) => t.type === "habit" && t.status === "auto");
      const blockKnowledge = blocks.filter((b) => b.type === "knowledge" && b.status !== "pending");
      const triggerKnowledge = triggers.filter((t) => t.type === "knowledge" && t.status !== "pending");
      const allKnowledge = [...blockKnowledge, ...triggerKnowledge];
      const hasMemories = autoHabits.length > 0 || allKnowledge.length > 0;
      if (hasMemories) {
        const lines = [];
        if (autoHabits.length > 0) {
          lines.push("## \u9ED8\u8BA4\u884C\u4E3A\uFF08\u8DE8\u4F1A\u8BDD\u6301\u4E45\uFF0C\u65E0\u9700\u786E\u8BA4\uFF09");
          lines.push(...autoHabits.map((t) => `- [auto] ${t.human_description}`));
          lines.push("");
        }
        if (allKnowledge.length > 0) {
          lines.push("## \u5143\u77E5\u8BC6\uFF08\u8DE8\u4F1A\u8BDD\u6301\u4E45\uFF0C\u5168\u91CF\u515C\u5E95\uFF09");
          for (const k of allKnowledge) {
            const desc = ("human_description" in k ? k.human_description : k.description) || "";
            const body = ("content" in k ? k.content : k.value) || "";
            lines.push(`### ${desc}`);
            lines.push(body);
            lines.push("");
          }
        }
        output.context.push(lines.join("\n"));
        debug("HOOK: session.compacting injected habits");
      }
    }
  };
};
var fractal_default = FractalPlugin;
export {
  FractalPlugin,
  fractal_default as default
};
