/**
 * DCP Purge command handler.
 * Forked from manual.ts compress trigger flow.
 * Fully independent — changes here won't affect compress.
 */
import type { SessionState, WithParts } from "../state"
import type { PluginConfig } from "../config"
import { buildCompressedBlockGuidance } from "../prompts/extensions/nudge"

const PURGE_TRIGGER_PROMPT = [
    "<purge triggered manually>",
    "Manual mode trigger received. Use the purge tool — aggressive compression with no content restrictions.",
    "You may select ANY range. No content is protected: all selected messages, tools, and tags will be replaced.",
    "You can also select old compressed blocks (b1, b2, etc.) to replace them.",
    "Purge is restorable via \`decompress\` if needed.",
    "Select a range and replace it with a self-contained summary card.",
    "The summary card CANNOT be empty. If a section has no value, pick a smaller range.",
    "Return after purge with a brief explanation.",
].join("\n\n")

const ZH_PURGE_TRIGGER_PROMPT = [
    "<手动触发替换清理>",
    "手动模式已触发。使用 purge 工具——无任何内容限制的激进压缩。",
    "可以选中任何范围。没有任何内容受保护：所有消息、工具、标签都会被替换。",
    "也可选中旧的压缩块（b1、b2 等）一并替换。",
    "Purge 可通过 \`decompress\` 恢复。",
    "选中一段已完成的任务对话，替换为自包含的总结卡片。",
    "摘要卡不能为空。如果范围内没有值得保留的内容，缩小范围。",
    "完成后返回简要说明。",
].join("\n\n")

export interface PurgeCommandContext {
    state: SessionState
    config: PluginConfig
}

export async function handlePurgeTriggerCommand(
    ctx: PurgeCommandContext,
    userFocus?: string,
): Promise<string> {
    const { state, config } = ctx
    const lang = config.lang

    const compressedBlockGuidance =
        config.compress.mode === "message" ? "" : buildCompressedBlockGuidance(state)

    const basePrompt = lang === "zh" ? ZH_PURGE_TRIGGER_PROMPT : PURGE_TRIGGER_PROMPT
    const sections = [basePrompt, compressedBlockGuidance]
    if (userFocus && userFocus.trim().length > 0) {
        sections.push(`Additional user focus:\n${userFocus.trim()}`)
    }
    return sections.filter(Boolean).join("\n\n")
}
