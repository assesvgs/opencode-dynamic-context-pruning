import type { SessionState } from "../state"
import type { PluginConfig } from "../config"
import { buildCompressedBlockGuidance } from "../prompts/extensions/nudge"

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
    "Do NOT write exhaustive summaries. Be ruthless.",
    "Use the compress tool now. Return after compress with a brief explanation.",
].join("\n")

export interface PurgeCommandContext {
    state: SessionState
    config: PluginConfig
}

export async function handlePurgeTriggerCommand(ctx: PurgeCommandContext): Promise<string> {
    const { state, config } = ctx

    const compressedBlockGuidance =
        config.compress.mode === "message" ? "" : buildCompressedBlockGuidance(state)

    const sections = [PURGE_TRIGGER_PROMPT, compressedBlockGuidance]
    return sections.filter(Boolean).join("\n\n")
}
