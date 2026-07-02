import { tool } from "@opencode-ai/plugin"
import type { ToolContext } from "./types"
import { PURGE } from "../prompts/purge"
import { RANGE_FORMAT_EXTENSION, MESSAGE_FORMAT_EXTENSION } from "../prompts/extensions/tool"
import { createCompressRangeTool } from "./range"
import { createCompressMessageTool } from "./message"

export function createPurgeTool(ctx: ToolContext): ReturnType<typeof tool> {
    const isMessageMode = ctx.config.compress.mode === "message"

    const internal = isMessageMode ? createCompressMessageTool(ctx) : createCompressRangeTool(ctx)

    const formatExtension = isMessageMode ? MESSAGE_FORMAT_EXTENSION : RANGE_FORMAT_EXTENSION

    return tool({
        description: PURGE + formatExtension,
        args: internal.args,
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
