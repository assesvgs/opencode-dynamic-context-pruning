import type { Plugin } from "@opencode-ai/plugin"
import { getConfig } from "./lib/config"
import { createCompressMessageTool, createCompressRangeTool, createPurgeTool } from "./lib/compress"
import { t } from "./lib/i18n"
import {
    compressDisabledByOpencode,
    hasExplicitToolPermission,
    type HostPermissionSnapshot,
} from "./lib/host-permissions"
import { Logger } from "./lib/logger"
import { createSessionState } from "./lib/state"
import { PromptStore } from "./lib/prompts/store"
import {
    createChatMessageTransformHandler,
    createCommandExecuteHandler,
    createEventHandler,
    createSystemPromptHandler,
    createTextCompleteHandler,
} from "./lib/hooks"
import { configureClientAuth, isSecureMode } from "./lib/auth"
import { startAutoUpdate } from "./lib/update"

const server: Plugin = (async (ctx) => {
    const config = getConfig(ctx)

    if (!config.enabled) {
        return {}
    }

    const logger = new Logger(config.debug)
    const state = createSessionState()
    const prompts = new PromptStore(logger, ctx.directory, config.experimental.customPrompts)
    const hostPermissions: HostPermissionSnapshot = {
        global: undefined,
        agents: {},
    }

    if (isSecureMode()) {
        configureClientAuth(ctx.client)
        // logger.info("Secure mode detected, configured client authentication")
    }

    logger.info("DCP initialized", {
        strategies: config.strategies,
    })

    startAutoUpdate(ctx, config.autoUpdate)

    const compressToolContext = {
        client: ctx.client,
        state,
        logger,
        config,
        prompts,
    }

    return {
        "experimental.chat.system.transform": createSystemPromptHandler(
            state,
            logger,
            config,
            prompts,
        ),
        "experimental.chat.messages.transform": createChatMessageTransformHandler(
            ctx.client,
            state,
            logger,
            config,
            prompts,
            hostPermissions,
        ) as any,
        "experimental.text.complete": createTextCompleteHandler(),
        "command.execute.before": createCommandExecuteHandler(
            ctx.client,
            state,
            logger,
            config,
            ctx.directory,
            hostPermissions,
        ),
        event: createEventHandler(state, logger),
        tool: {
            ...(config.compress.permission !== "deny" && {
                compress:
                    config.compress.mode === "message"
                        ? createCompressMessageTool(compressToolContext)
                        : createCompressRangeTool(compressToolContext),
                ...(config.compress.autonomousPurge && {
                    purge: createPurgeTool(compressToolContext),
                }),
            }),
        },
        config: async (opencodeConfig) => {
            if (
                config.compress.permission !== "deny" &&
                compressDisabledByOpencode(opencodeConfig.permission)
            ) {
                config.compress.permission = "deny"
            }

            if (config.commands.enabled && config.compress.permission !== "deny") {
                const lang = config.compress.lang
                opencodeConfig.command ??= {}
                opencodeConfig.command["dcp-compress"] = {
                    template: "",
                    description: t("Trigger DCP manual compression", lang),
                }
                const subcommands: [string, string][] = [
                    ["dcp-sweep", t("Prune tool outputs since last user message", lang)],
                    ["dcp-context", t("Show token usage breakdown for current session", lang)],
                    ["dcp-stats", t("Show DCP pruning statistics", lang)],
                    ["dcp-manual", t("Toggle manual mode on/off", lang)],
                    ["dcp-purge", t("Aggressive cleanup: delete or compress any content", lang)],
                    ["dcp-decompress", t("Restore selected compression", lang)],
                    ["dcp-recompress", t("Re-apply a user-decompressed compression", lang)],
                    ["dcp-help", t("Show DCP command help", lang)],
                ]
                for (const [name, desc] of subcommands) {
                    opencodeConfig.command[name] = { template: "", description: desc }
                }
            }

            const toolsToAdd: string[] = []
            if (config.compress.permission !== "deny" && !config.experimental.allowSubAgents) {
                toolsToAdd.push("compress")
                if (config.compress.autonomousPurge) {
                    toolsToAdd.push("purge")
                }
            }

            if (toolsToAdd.length > 0) {
                const existingPrimaryTools = opencodeConfig.experimental?.primary_tools ?? []
                opencodeConfig.experimental = {
                    ...opencodeConfig.experimental,
                    primary_tools: [...existingPrimaryTools, ...toolsToAdd],
                }
            }

            if (!hasExplicitToolPermission(opencodeConfig.permission, "compress")) {
                const permission = opencodeConfig.permission ?? {}
                opencodeConfig.permission = {
                    ...permission,
                    compress: config.compress.permission,
                    ...(config.compress.autonomousPurge && { purge: config.compress.permission }),
                } as typeof permission
            }

            hostPermissions.global = opencodeConfig.permission
            hostPermissions.agents = Object.fromEntries(
                Object.entries(opencodeConfig.agent ?? {}).map(([name, agent]) => [
                    name,
                    agent?.permission,
                ]),
            )
        },
    }
}) satisfies Plugin

export default server
