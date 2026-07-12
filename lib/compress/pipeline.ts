import type { WithParts } from "../state"
import { ensureSessionInitialized, refreshManualMode } from "../state"
import { saveSessionState } from "../state/persistence"
import { assignMessageRefs } from "../message-ids"
import { isIgnoredUserMessage } from "../messages/query"
import { deduplicate, purgeErrors } from "../strategies"
import { getCurrentParams, getCurrentTokenUsage } from "../token-utils"
import { sendCompressNotification, sendIgnoredMessage } from "../ui/notification"
import { t, tn, type Lang } from "../i18n"
import type { ToolContext } from "./types"
import { buildSearchContext, fetchSessionMessages } from "./search"
import type { SearchContext } from "./types"
import { applyPendingCompressionDurations } from "./timing"

interface RunContext {
    ask(input: {
        permission: string
        patterns: string[]
        always: string[]
        metadata: Record<string, unknown>
    }): Promise<void>
    metadata(input: { title: string }): void
    sessionID: string
}

export interface NotificationEntry {
    blockId: number
    runId: number
    summary: string
    summaryTokens: number
}

export interface PreparedSession {
    rawMessages: WithParts[]
    searchContext: SearchContext
}

async function sendLocalPurgeNotification(
    ctx: ToolContext,
    toolCtx: RunContext,
    batchTopic: string | undefined,
    pendingCount: number,
    params: any,
): Promise<void> {
    if (ctx.config.pruneNotification === "off") return

    const lang = ctx.config.lang as Lang
    const msg =
        `▣ DCP | ${t("Purge", lang)}${batchTopic ? ` — ${batchTopic}` : ""}` +
        `\n${t("→ Items:", lang)} ${tn("{n} ranges purged", lang, pendingCount)}`

    if (ctx.config.pruneNotificationType === "toast") {
        await ctx.client.tui.showToast({
            body: {
                title: t("DCP: Purge Notification", lang),
                message: msg,
                variant: "info",
                duration: 5000,
            },
        })
    } else {
        await sendIgnoredMessage(ctx.client, toolCtx.sessionID, msg, params, ctx.logger)
    }
}

export async function prepareSession(
    ctx: ToolContext,
    toolCtx: RunContext,
    title: string,
): Promise<PreparedSession> {
    await refreshManualMode(ctx.state, toolCtx.sessionID, ctx.logger, ctx.config.manualMode.enabled)

    if (
        ctx.state.manualMode &&
        ctx.state.manualMode !== "compress-pending" &&
        ctx.state.manualMode !== "trigger-pending"
    ) {
        throw new Error(
            "Manual mode: compress/purge blocked. Do not retry until `<compress triggered manually>` appears in user context.",
        )
    }

    await toolCtx.ask({
        permission: "compress",
        patterns: ["*"],
        always: ["*"],
        metadata: {},
    })

    toolCtx.metadata({ title })

    const rawMessages = await fetchSessionMessages(ctx.client, toolCtx.sessionID)

    await ensureSessionInitialized(
        ctx.client,
        ctx.state,
        toolCtx.sessionID,
        ctx.logger,
        rawMessages,
        ctx.config.manualMode.enabled,
    )

    assignMessageRefs(ctx.state, rawMessages)

    deduplicate(ctx.state, ctx.logger, ctx.config, rawMessages)
    purgeErrors(ctx.state, ctx.logger, ctx.config, rawMessages)

    return {
        rawMessages,
        searchContext: buildSearchContext(ctx.state, rawMessages),
    }
}

export async function finalizeSession(
    ctx: ToolContext,
    toolCtx: RunContext,
    rawMessages: WithParts[],
    entries: NotificationEntry[],
    batchTopic: string | undefined,
): Promise<void> {
    ctx.state.manualMode = ctx.state.manualMode ? "active" : false
    applyPendingCompressionDurations(ctx.state)
    await saveSessionState(ctx.state, ctx.logger)

    const params = getCurrentParams(ctx.state, rawMessages, ctx.logger)
    const sessionMessageIds = rawMessages
        .filter((msg) => !isIgnoredUserMessage(msg))
        .map((msg) => msg.info.id)

    const pendingCount = ctx.state.prune.pendingReplacements?.length ?? 0
    if (pendingCount > 0) {
        await sendLocalPurgeNotification(ctx, toolCtx, batchTopic, pendingCount, params)
    } else {
        await sendCompressNotification(
            ctx.client,
            ctx.logger,
            ctx.config,
            ctx.state,
            toolCtx.sessionID,
            entries,
            batchTopic,
            sessionMessageIds,
            params,
        )
    }
}
