import { tool } from "@opencode-ai/plugin"
import type { ToolContext } from "./types"
import { PURGE } from "../prompts/purge"
import { RANGE_FORMAT_EXTENSION } from "../prompts/extensions/tool"
import { buildSchema } from "./range"
import { createCompressRangeTool } from "./range"

export function createPurgeTool(ctx: ToolContext): ReturnType<typeof tool> {
    const internal = createCompressRangeTool(ctx)

    return tool({
        description: PURGE + RANGE_FORMAT_EXTENSION,
        args: buildSchema(),
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
