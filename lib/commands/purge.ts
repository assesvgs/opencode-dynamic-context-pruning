import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import type { PluginConfig } from "../config"
import { sendIgnoredMessage } from "../ui/notification"
import { getCurrentParams } from "../token-utils"
import { buildCompressedBlockGuidance } from "../prompts/extensions/nudge"
import { isIgnoredUserMessage } from "../messages/query"

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
    client: any
    state: SessionState
    config: PluginConfig
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

export async function handlePurgeTriggerCommand(ctx: PurgeCommandContext): Promise<string> {
    const { state, config } = ctx

    const compressedBlockGuidance =
        config.compress.mode === "message" ? "" : buildCompressedBlockGuidance(state)

    const sections = [PURGE_TRIGGER_PROMPT, compressedBlockGuidance]
    return sections.filter(Boolean).join("\n\n")
}

export function applyPendingPurgeTrigger(
    state: SessionState,
    messages: WithParts[],
    logger: Logger,
): void {
    const pending = state.pendingManualTrigger
    if (!pending) {
        return
    }

    if (!state.sessionId || pending.sessionId !== state.sessionId) {
        state.pendingManualTrigger = null
        return
    }

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.info.role !== "user" || isIgnoredUserMessage(msg)) {
            continue
        }

        for (const part of msg.parts) {
            if (part.type !== "text" || part.ignored || part.synthetic) {
                continue
            }

            part.text = pending.prompt
            state.pendingManualTrigger = null
            logger.debug("Applied purge prompt", { sessionId: pending.sessionId })
            return
        }
    }

    state.pendingManualTrigger = null
}
