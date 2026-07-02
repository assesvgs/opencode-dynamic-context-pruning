import { tool } from "@opencode-ai/plugin"
import type { ToolContext } from "./types"
import { PURGE } from "../prompts/purge"
import { RANGE_FORMAT_EXTENSION } from "../prompts/extensions/tool"
import { createCompressRangeTool } from "./range"

export function createPurgeTool(ctx: ToolContext): ReturnType<typeof tool> {
    const internal = createCompressRangeTool(ctx)

    return tool({
        description: PURGE + RANGE_FORMAT_EXTENSION,
        args: {
            topic: tool.schema
                .string()
                .describe("Short label (3-5 words) for display - e.g., 'Auth System Exploration'"),
            content: tool.schema
                .array(
                    tool.schema.object({
                        startId: tool.schema
                            .string()
                            .describe(
                                "Message or block ID marking the beginning of range (e.g. m0001, b2)",
                            ),
                        endId: tool.schema
                            .string()
                            .describe(
                                "Message or block ID marking the end of range (e.g. m0012, b5)",
                            ),
                        summary: tool.schema.string().describe("Summary or [purged] to delete"),
                    }),
                )
                .describe(
                    "One or more ranges to compress, each with start/end boundaries and a summary",
                ),
        },
        async execute(args, toolCtx) {
            ctx.state.purgeMode = true
            try {
                return await internal.execute(args, toolCtx)
            } finally {
                ctx.state.purgeMode = false
            }
        },
    })
}
