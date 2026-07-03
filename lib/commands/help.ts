/**
 * DCP Help command handler.
 * Shows available DCP commands and their descriptions.
 */

import type { Logger } from "../logger"
import type { PluginConfig } from "../config"
import type { SessionState, WithParts } from "../state"
import { compressPermission } from "../compress-permission"
import { sendIgnoredMessage } from "../ui/notification"
import { getCurrentParams } from "../token-utils"
import { t, type Lang } from "../i18n"

export interface HelpCommandContext {
    client: any
    state: SessionState
    config: PluginConfig
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

function getTuiCommands(lang: Lang): [string, string][] {
    return [
        [`DCP ${t("Context", lang)}`, t("Show token usage breakdown for current session", lang)],
        [`DCP ${t("Stats", lang)}`, t("Show DCP pruning statistics", lang)],
        [`DCP ${t("Help", lang)}`, t("Show this help in a modal", lang)],
    ]
}

function getToolCommands(lang: Lang): Record<string, [string, string]> {
    return {
        compress: ["/dcp-compress [focus]", t("Trigger DCP manual compression", lang)],
        context: ["/dcp context", t("Show token usage breakdown for current session", lang)],
        stats: ["/dcp stats", t("Show DCP pruning statistics", lang)],
        sweep: ["/dcp sweep [n]", t("Prune tool outputs since last user message", lang)],
        manual: ["/dcp manual [on|off]", t("Toggle manual mode on/off", lang)],
        purge: ["/dcp purge", t("Aggressive cleanup: delete or compress any content", lang)],
        decompress: ["/dcp decompress <n>", t("Restore selected compression", lang)],
        recompress: ["/dcp recompress <n>", t("Re-apply a user-decompressed compression", lang)],
    }
}

function getVisibleCommands(
    state: SessionState,
    config: PluginConfig,
    lang: Lang,
): [string, string][] {
    const commands = [...getTuiCommands(lang)]

    if (compressPermission(state, config) === "deny") {
        return commands
    }

    const toolCommands = getToolCommands(lang)
    commands.push(toolCommands.compress)
    commands.push(toolCommands.context)
    commands.push(toolCommands.stats)
    commands.push(toolCommands.sweep)
    commands.push(toolCommands.manual)
    commands.push(toolCommands.purge)
    commands.push(toolCommands.decompress)
    commands.push(toolCommands.recompress)

    return commands
}

export function formatHelpMessage(state: SessionState, config: PluginConfig, lang: Lang): string {
    const commands = getVisibleCommands(state, config, lang)
    const colWidth = Math.max(...commands.map(([cmd]) => cmd.length)) + 4
    const lines: string[] = []

    lines.push("╭─────────────────────────────────────────────────────────────────────────╮")
    lines.push(`│${t("DCP Commands", lang).padStart(49)}${"│".padStart(50)}`)
    lines.push("╰─────────────────────────────────────────────────────────────────────────╯")
    lines.push("")
    lines.push(
        `  ${t("Manual mode:", lang).padEnd(colWidth)}${t(state.manualMode ? "ON" : "OFF", lang)}`,
    )
    lines.push("")
    lines.push(`  ${t("Open the command palette for DCP modal commands.", lang)}`)
    lines.push(
        `  ${t("Use /dcp-compress [focus] when you want DCP to ask the model to run compression.", lang)}`,
    )
    lines.push("")
    for (const [cmd, desc] of commands) {
        lines.push(`  ${cmd.padEnd(colWidth)}${desc}`)
    }
    lines.push("")

    return lines.join("\n")
}

export async function handleHelpCommand(ctx: HelpCommandContext): Promise<void> {
    const { client, state, logger, sessionId, messages } = ctx

    const { config } = ctx
    const lang = config.lang
    const message = formatHelpMessage(state, config, lang)

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(client, sessionId, message, params, logger)

    logger.info("Help command executed")
}
