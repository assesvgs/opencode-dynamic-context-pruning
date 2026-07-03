import { tool } from "@opencode-ai/plugin"
import type { ToolContext, PurgeToolArgs } from "./types"
import { finalizeSession, prepareSession } from "./pipeline"

export function createSmartPurgeTool(ctx: ToolContext): ReturnType<typeof tool> {
    return tool({
        description: `Replace a range of completed conversation with a self-contained summary card.`,
        args: {
            topic: tool.schema.string().describe("Short label for this batch"),
            content: tool.schema
                .array(
                    tool.schema.object({
                        startId: tool.schema
                            .string()
                            .describe("mNNNN or bN (old block can also be selected)"),
                        endId: tool.schema.string().describe("mNNNN or bN"),
                        replacement: tool.schema
                            .string()
                            .min(1, "Summary card cannot be empty")
                            .describe("Self-contained summary text"),
                        compactTools: tool.schema
                            .array(tool.schema.string())
                            .optional()
                            .describe("Tool call IDs whose output to mark as removed"),
                    }),
                )
                .min(1),
        },
        async execute(args, toolCtx) {
            const input = args as PurgeToolArgs

            for (const entry of input.content) {
                if (!entry.replacement || entry.replacement.trim().length === 0) {
                    throw new Error(
                        `replacement for range ${entry.startId}..${entry.endId} cannot be empty`,
                    )
                }
            }

            const { rawMessages, searchContext } = await prepareSession(
                ctx,
                toolCtx,
                `Purge: ${input.topic}`,
            )

            const { resolveRanges, validateNonOverlapping } = await import("./range-utils")
            const resolvedPlans = resolveRanges(
                {
                    topic: input.topic,
                    content: input.content.map((e) => ({
                        startId: e.startId,
                        endId: e.endId,
                        summary: e.replacement,
                    })),
                },
                searchContext,
                ctx.state,
            )
            validateNonOverlapping(resolvedPlans)

            const plans: Array<{
                startMessageId: string
                endMessageId: string
                replacementText: string
                compactToolCallIds: string[]
                consumedBlockIds: number[]
            }> = []

            for (let i = 0; i < resolvedPlans.length; i++) {
                const plan = resolvedPlans[i]
                const entry = input.content[i]
                plans.push({
                    startMessageId:
                        plan.selection.startReference.anchorMessageId ??
                        plan.selection.messageIds[0],
                    endMessageId: plan.selection.messageIds[plan.selection.messageIds.length - 1],
                    replacementText: entry.replacement,
                    compactToolCallIds: entry.compactTools ?? [],
                    consumedBlockIds: plan.selection.requiredBlockIds,
                })
            }

            ctx.state.prune.pendingReplacements = plans

            await finalizeSession(ctx, toolCtx, rawMessages, [], input.topic)
            return `Purged ${plans.length} range(s) into summary card${input.topic ? `: ${input.topic}` : ""}.`
        },
    })
}
