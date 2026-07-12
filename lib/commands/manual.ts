/**
 * DCP Manual mode command handler.
 * Handles toggling manual mode and triggering individual tool executions.
 *
 * Usage:
 *   /dcp manual [on|off]  - Toggle manual mode or set explicit state
 *   /dcp-compress [focus]  - Trigger manual compress execution
 */

import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import type { PluginConfig } from "../config"
import { sendIgnoredMessage } from "../ui/notification"
import { saveManualModeSetting } from "../state/persistence"
import { getCurrentParams } from "../token-utils"
import { buildCompressedBlockGuidance } from "../prompts/extensions/nudge"
import { isIgnoredUserMessage } from "../messages/query"
import { createSyntheticUserMessage } from "../messages/utils"
import { t, type Lang } from "../i18n"

const MANUAL_MODE_ON = "Manual mode is now ON. Use /dcp-compress to trigger context tools manually."

const MANUAL_MODE_OFF = "Manual mode is now OFF."

const COMPRESS_TRIGGER_PROMPT = [
    "<compress triggered manually>",
    "Manual mode trigger received. You must now use the compress tool.",
    "Find the most significant completed conversation content that can be compressed into a high-fidelity technical summary.",
    "Follow the active compress mode, preserve all critical implementation details, and choose safe targets.",
    "Return after compress with a brief explanation of what content was compressed.",
].join("\n\n")

const ZH_COMPRESS_TRIGGER_PROMPT = [
    "<手动触发压缩>",
    "手动模式已触发。你现在必须使用压缩工具。",
    "查找最重要的已完成对话内容，将其压缩为高保真的技术摘要。",
    "遵循当前的压缩模式，保留所有关键的实现细节，选择安全的压缩目标。",
    "压缩完成后，简要说明压缩了哪些内容。",
].join("\n\n")

const PURGE_TRIGGER_PROMPT = [
    "<purge triggered manually>",
    "Manual mode trigger received. You must now use the purge tool — aggressive compression.",
    "Select a range of messages that represent a completed task and replace them with a self-contained summary card.",
    "The summary card CANNOT be empty. If a section has no value, pick a smaller range.",
    "Unlike compress, purge has no content restrictions: it replaces all selected content regardless of protected tools, tags, or user message settings. Use compress when protections are needed.",
    "Return after purge with a brief explanation.",
].join("\n\n")

const ZH_PURGE_TRIGGER_PROMPT = [
    "<手动触发替换清理>",
    "手动模式已触发。你现在必须使用 purge 工具——激进压缩模式。",
    "选中一段已完成的任务对话，将其替换为一段自包含的总结卡片。",
    "摘要卡不能为空。如果范围内没有值得保留的内容，缩小范围。",
    "与 compress 不同，purge 不受内容保护限制：会替换所选范围内的所有内容（无视 protected tools、标签保护和用户消息保护设置）。需要保护内容时请使用 compress。",
    "完成后返回简要说明。",
].join("\n\n")

function getTriggerPrompt(
    tool: "compress" | "purge",
    state: SessionState,
    config: PluginConfig,
    userFocus?: string,
): string {
    const lang = config.lang
    const base =
        tool === "compress"
            ? lang === "zh"
                ? ZH_COMPRESS_TRIGGER_PROMPT
                : COMPRESS_TRIGGER_PROMPT
            : lang === "zh"
              ? ZH_PURGE_TRIGGER_PROMPT
              : PURGE_TRIGGER_PROMPT
    const compressedBlockGuidance =
        config.compress.mode === "message" ? "" : buildCompressedBlockGuidance(state)

    const sections = [base, compressedBlockGuidance]
    if (userFocus && userFocus.trim().length > 0) {
        sections.push(`Additional user focus:\n${userFocus.trim()}`)
    }

    return sections.join("\n\n")
}

export interface ManualCommandContext {
    client: any
    state: SessionState
    config: PluginConfig
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

export async function handleManualToggleCommand(
    ctx: ManualCommandContext,
    modeArg?: string,
): Promise<void> {
    const { client, state, logger, sessionId, messages, config } = ctx
    const lang = config.lang

    if (modeArg === "on") {
        state.manualMode = "active"
    } else if (modeArg === "off") {
        state.manualMode = false
    } else {
        state.manualMode = state.manualMode ? false : "active"
    }

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(
        client,
        sessionId,
        state.manualMode ? t(MANUAL_MODE_ON, lang) : t(MANUAL_MODE_OFF, lang),
        params,
        logger,
    )
    await saveManualModeSetting(sessionId, !!state.manualMode, logger)

    logger.info("Manual mode toggled", { manualMode: state.manualMode })
}

export async function handleManualTriggerCommand(
    ctx: ManualCommandContext,
    tool: "compress" | "purge",
    userFocus?: string,
): Promise<string | null> {
    return getTriggerPrompt(tool, ctx.state, ctx.config, userFocus)
}

export function applyPendingManualTrigger(
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
            logger.debug("Applied manual prompt", { sessionId: pending.sessionId })
            return
        }
    }

    // Fallback: create a synthetic user message if no suitable user message found.
    // This can happen when the command's output.parts message is filtered out
    // or doesn't have the expected structure.
    const baseMessage = messages.find((m) => m.info.role === "user" || m.info.role === "assistant")
    if (baseMessage) {
        const syntheticMsg = createSyntheticUserMessage(baseMessage, pending.prompt)
        messages.push(syntheticMsg)
        state.pendingManualTrigger = null
        logger.debug("Created synthetic user message for manual trigger", {
            sessionId: pending.sessionId,
        })
        return
    }

    state.pendingManualTrigger = null
}
