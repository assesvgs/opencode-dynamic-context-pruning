/** @jsxImportSource @opentui/solid */

import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { registerCommands } from "./lib/tui/commands"
import { loadConfig } from "./lib/tui/data"
import { openPanelModal } from "./lib/tui/modals"
import { t } from "./lib/i18n"

const tui: TuiPluginModule["tui"] = async (api) => {
    const config = loadConfig(api)
    if (!config.enabled || !config.commands.enabled) return

    registerCommands(api, [
        {
            title: t("DCP", config.lang),
            name: "dcp.panel",
            description: t("Open DCP panel", config.lang),
            slashName: "dcp-panel",
            run: () => openPanelModal(api, config),
        },
    ])
}

export default {
    id: "opencode-dcp",
    tui,
} satisfies TuiPluginModule
