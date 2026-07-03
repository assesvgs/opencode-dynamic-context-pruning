import type { SessionState, WithParts, CompressionBlock } from "../state"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"
import { isMessageCompacted } from "../state/utils"
import { createSyntheticUserMessage, replaceBlockIdsWithBlocked } from "./utils"
import { getLastUserMessage } from "./query"
import type { UserMessage } from "@opencode-ai/sdk/v2"

const PRUNED_TOOL_OUTPUT_REPLACEMENT =
    "[Output removed to save context - information superseded or no longer needed]"
const PRUNED_TOOL_ERROR_INPUT_REPLACEMENT = "[input removed due to failed tool call]"
const PRUNED_QUESTION_INPUT_REPLACEMENT = "[questions removed - see output for user's answers]"

export const prune = (
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void => {
    filterCompressedRanges(state, logger, config, messages)
    applyPendingReplacements(state, logger, messages)
    // pruneFullTool(state, logger, messages)
    pruneToolOutputs(state, logger, messages)
    pruneToolInputs(state, logger, messages)
    pruneToolErrors(state, logger, messages)
}

const pruneFullTool = (state: SessionState, logger: Logger, messages: WithParts[]): void => {
    const messagesToRemove: string[] = []

    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        const partsToRemove: string[] = []

        for (const part of parts) {
            if (part.type !== "tool") {
                continue
            }

            if (!state.prune.tools.has(part.callID)) {
                continue
            }
            if (part.tool !== "edit" && part.tool !== "write") {
                continue
            }

            partsToRemove.push(part.callID)
        }

        if (partsToRemove.length === 0) {
            continue
        }

        msg.parts = parts.filter(
            (part) => part.type !== "tool" || !partsToRemove.includes(part.callID),
        )

        if (msg.parts.length === 0) {
            messagesToRemove.push(msg.info.id)
        }
    }

    if (messagesToRemove.length > 0) {
        const result = messages.filter((msg) => !messagesToRemove.includes(msg.info.id))
        messages.length = 0
        messages.push(...result)
    }
}

const pruneToolOutputs = (state: SessionState, logger: Logger, messages: WithParts[]): void => {
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type !== "tool") {
                continue
            }
            if (!state.prune.tools.has(part.callID)) {
                continue
            }
            if (part.state.status !== "completed") {
                continue
            }
            if (part.tool === "question" || part.tool === "edit" || part.tool === "write") {
                continue
            }

            part.state.output = PRUNED_TOOL_OUTPUT_REPLACEMENT
        }
    }
}

const pruneToolInputs = (state: SessionState, logger: Logger, messages: WithParts[]): void => {
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type !== "tool") {
                continue
            }

            if (!state.prune.tools.has(part.callID)) {
                continue
            }
            if (part.state.status !== "completed") {
                continue
            }
            if (part.tool !== "question") {
                continue
            }

            if (part.state.input?.questions !== undefined) {
                part.state.input.questions = PRUNED_QUESTION_INPUT_REPLACEMENT
            }
        }
    }
}

const pruneToolErrors = (state: SessionState, logger: Logger, messages: WithParts[]): void => {
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type !== "tool") {
                continue
            }
            if (!state.prune.tools.has(part.callID)) {
                continue
            }
            if (part.state.status !== "error") {
                continue
            }

            // Prune all string inputs for errored tools
            const input = part.state.input
            if (input && typeof input === "object") {
                for (const key of Object.keys(input)) {
                    if (typeof input[key] === "string") {
                        input[key] = PRUNED_TOOL_ERROR_INPUT_REPLACEMENT
                    }
                }
            }
        }
    }
}

const filterCompressedRanges = (
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void => {
    if (
        state.prune.messages.byMessageId.size === 0 &&
        state.prune.messages.activeByAnchorMessageId.size === 0
    ) {
        return
    }

    const result: WithParts[] = []

    for (const msg of messages) {
        const msgId = msg.info.id

        // Check if there's a summary to inject at this anchor point
        const blockId = state.prune.messages.activeByAnchorMessageId.get(msgId)
        const summary =
            blockId !== undefined ? state.prune.messages.blocksById.get(blockId) : undefined
        if (summary) {
            const rawSummaryContent = (summary as { summary?: unknown }).summary
            if (
                summary.active !== true ||
                typeof rawSummaryContent !== "string" ||
                rawSummaryContent.length === 0
            ) {
                logger.warn("Skipping malformed compress summary", {
                    anchorMessageId: msgId,
                    blockId: (summary as { blockId?: unknown }).blockId,
                })
            } else {
                // Find user message for variant and as base for synthetic message
                const msgIndex = messages.indexOf(msg)
                const userMessage = getLastUserMessage(messages, msgIndex)

                if (userMessage) {
                    const userInfo = userMessage.info as UserMessage
                    const summaryContent =
                        config.compress.mode === "message"
                            ? replaceBlockIdsWithBlocked(rawSummaryContent)
                            : rawSummaryContent
                    const summarySeed = `${summary.blockId}:${summary.anchorMessageId}`
                    result.push(
                        createSyntheticUserMessage(userMessage, summaryContent, summarySeed),
                    )

                    logger.info("Injected compress summary", {
                        anchorMessageId: msgId,
                        summaryLength: summaryContent.length,
                    })
                } else {
                    logger.warn("No user message found for compress summary", {
                        anchorMessageId: msgId,
                    })
                }
            }
        }

        // Skip messages that are in the prune list
        const pruneEntry = state.prune.messages.byMessageId.get(msgId)
        if (pruneEntry && pruneEntry.activeBlockIds.length > 0) {
            continue
        }

        // Normal message, include it
        result.push(msg)
    }

    // Replace messages array contents
    messages.length = 0
    messages.push(...result)
}

const applyPendingReplacements = (
    state: SessionState,
    logger: Logger,
    messages: WithParts[],
): void => {
    const plans = state.prune.pendingReplacements
    if (!plans || plans.length === 0) return

    const skipIds = new Set<string>()
    for (const plan of plans) {
        let inRange = false
        for (const msg of messages) {
            if (msg.info.id === plan.startMessageId) inRange = true
            if (inRange) skipIds.add(msg.info.id)
            if (msg.info.id === plan.endMessageId) break
        }
    }
    for (const plan of plans) {
        skipIds.delete(plan.startMessageId)
    }

    const result: WithParts[] = []
    for (const msg of messages) {
        const msgId = msg.info.id
        const plan = plans.find((p) => p.startMessageId === msgId)

        if (plan) {
            for (const blockId of plan.consumedBlockIds) {
                const block = state.prune.messages.blocksById.get(blockId)
                if (block && block.active) {
                    block.active = false
                    block.deactivatedAt = Date.now()
                    state.prune.messages.activeBlockIds.delete(blockId)
                }
            }

            const msgIndex = messages.indexOf(msg)
            const userMessage = getLastUserMessage(messages, msgIndex)
            if (userMessage) {
                result.push(createSyntheticUserMessage(userMessage, plan.replacementText))
            }
            continue
        }

        if (skipIds.has(msgId)) continue
        result.push(msg)
    }

    // Register blocks for persistence across turns
    for (const plan of plans) {
        const blockId = state.prune.messages.nextBlockId++
        const runId = state.prune.messages.nextRunId++

        const rangeMessageIds: string[] = []
        const rangeToolIds: string[] = []
        let inRange = false
        for (const msg of messages) {
            if (msg.info.id === plan.startMessageId) inRange = true
            if (inRange) {
                rangeMessageIds.push(msg.info.id)
                for (const part of msg.parts || []) {
                    if (part.type === "tool" && part.callID) {
                        rangeToolIds.push(part.callID)
                    }
                }
            }
            if (msg.info.id === plan.endMessageId) break
        }

        state.prune.messages.blocksById.set(blockId, {
            blockId,
            runId,
            active: true,
            deactivatedByUser: false,
            compressedTokens: 0,
            summaryTokens: Math.ceil(plan.replacementText.length / 4),
            durationMs: 0,
            mode: "range",
            topic: "purge", // pendingReplacements only comes from purge tool
            batchTopic: "purge",
            startId: plan.startMessageId,
            endId: plan.endMessageId,
            anchorMessageId: plan.startMessageId,
            compressMessageId: "",
            compressCallId: undefined,
            includedBlockIds: plan.consumedBlockIds ?? [],
            consumedBlockIds: plan.consumedBlockIds ?? [],
            parentBlockIds: [],
            directMessageIds: rangeMessageIds,
            directToolIds: rangeToolIds,
            effectiveMessageIds: rangeMessageIds,
            effectiveToolIds: rangeToolIds,
            createdAt: Date.now(),
            summary: plan.replacementText,
        })
        state.prune.messages.activeBlockIds.add(blockId)
        state.prune.messages.activeByAnchorMessageId.set(plan.startMessageId, blockId)

        for (const msgId of rangeMessageIds) {
            if (msgId === plan.startMessageId) continue
            const entry = state.prune.messages.byMessageId.get(msgId) ?? {
                tokenCount: 0,
                allBlockIds: [],
                activeBlockIds: [],
            }
            entry.activeBlockIds = entry.activeBlockIds.filter(
                (id) => state.prune.messages.blocksById.get(id)?.active !== false,
            )
            entry.allBlockIds = entry.activeBlockIds.slice()
            entry.allBlockIds.push(blockId)
            entry.activeBlockIds.push(blockId)
            state.prune.messages.byMessageId.set(msgId, entry)
        }
    }

    messages.length = 0
    messages.push(...result)
    state.prune.pendingReplacements = []
}
