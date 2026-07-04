import type { SessionState } from "../state"
import type { PluginConfig } from "../config"
import { buildCompressedBlockGuidance } from "../prompts/extensions/nudge"
import { t, type Lang } from "../i18n"

const PURGE_TRIGGER_PROMPT = [
    "<purge triggered manually>",
    "Replace a completed conversation section with a self-contained summary card.",
    "",
    "Select a range of messages that represent a completed task.",
    "Write a concise summary card that replaces them:",
    "- What was the task goal?",
    "- What data was read/processed?",
    "- What was the final output?",
    "- (Optional) Which large tool outputs have been removed and can be re-read if needed.",
    "",
    "The summary card CANNOT be empty. If a section has no value, pick a smaller range.",
    "",
    "You can also select old compressed blocks (b1, b2, etc.) to replace them.",
    "Old blocks replaced this way are aggressively compressed — this is different from compress, and can be restored via decompress.",
    "",
    "Use the purge tool now. Return after with a brief explanation.",
].join("\n")

const ZH_PURGE_TRIGGER_PROMPT = [
    "<手动触发替换清理>",
    "选中一段已完成的任务对话，将其替换为一段自包含的总结卡片。",
    "",
    "卡片应说明：",
    "- 任务目标",
    "- 读取/处理了哪些数据",
    "- 最终输出是什么",
    "- （可选）哪些工具输出的具体内容已被删除，可重新读取",
    "",
    "摘要卡不能为空。如果范围内没有值得保留的内容，缩小范围。",
    "",
    "也可以选中旧的 (bN) 压缩块一并替换。",
    "旧块被替换后不可恢复——这和使用 compress 不同。",
    "",
    "现在调用 purge 工具。完成后返回简要说明。",
].join("\n")

export interface PurgeCommandContext {
    state: SessionState
    config: PluginConfig
}

export async function handlePurgeTriggerCommand(ctx: PurgeCommandContext): Promise<string> {
    const { state, config } = ctx
    const lang = config.lang

    const compressedBlockGuidance =
        config.compress.mode === "message" ? "" : buildCompressedBlockGuidance(state)

    const basePrompt = lang === "zh" ? ZH_PURGE_TRIGGER_PROMPT : PURGE_TRIGGER_PROMPT
    const sections = [basePrompt, compressedBlockGuidance]
    return sections.filter(Boolean).join("\n\n")
}
