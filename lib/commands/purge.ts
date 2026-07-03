import type { SessionState } from "../state"
import type { PluginConfig } from "../config"
import { buildCompressedBlockGuidance } from "../prompts/extensions/nudge"
import { t, type Lang } from "../i18n"

const PURGE_TRIGGER_PROMPT = [
    "<purge triggered manually>",
    "This is an AGGRESSIVE cleanup pass. NO CONTENT IS EXEMPT.",
    "",
    "For every message and tool result in the selected range, decide:",
    "- COMPLETELY USELESS (no value for the rest of the session)",
    "  -> summary: [purged]",
    "- MINIMAL VALUE (one line is enough to remember what happened)",
    "  -> summary: one-line description",
    "- STILL ACTIVE AND NEEDED",
    "  -> do NOT include this content in the compression range",
    "",
    "NOTE: You can also select previously compressed blocks (e.g. b1, b2, b5).",
    "      These are references to already-summarized sections.",
    "      If they are no longer needed, include their bN and write 'summary: [purged]'.",
    "",
    "Do NOT write exhaustive summaries. Be ruthless.",
    "Use the compress tool now. Return after compress with a brief explanation.",
].join("\n")

const ZH_PURGE_TRIGGER_PROMPT = [
    "<手动触发彻底清理>",
    "这是激进的清理操作。没有内容被豁免。",
    "",
    "对于选定范围内的每条消息和工具结果，决定：",
    "- 完全无用（对后续会话没有价值）",
    "  -> summary: [purged]",
    "- 价值极低（一行足以记住发生了什么）",
    "  -> summary: 一行描述",
    "- 仍活跃且需要",
    "  -> 不要将此内容包含在压缩范围中",
    "",
    "注意：你也可以选中之前已经压缩过的块（如 b1, b2, b5）。",
    "     这些是之前压缩生成的摘要块。如果不再需要，直接选中并写 summary: [purged]。",
    "",
    "不要写详细的摘要。要果断。",
    "现在使用压缩工具。压缩完成后返回简要说明。",
].join("\n")

export interface PurgeCommandContext {
    state: SessionState
    config: PluginConfig
}

export async function handlePurgeTriggerCommand(ctx: PurgeCommandContext): Promise<string> {
    const { state, config } = ctx
    const lang = config.compress.lang

    const compressedBlockGuidance =
        config.compress.mode === "message" ? "" : buildCompressedBlockGuidance(state)

    const basePrompt = lang === "zh" ? ZH_PURGE_TRIGGER_PROMPT : PURGE_TRIGGER_PROMPT
    const sections = [basePrompt, compressedBlockGuidance]
    return sections.filter(Boolean).join("\n\n")
}
