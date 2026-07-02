/** @jsxImportSource @opentui/solid */

import { buildStatsReport } from "../commands/stats"
import type { PluginConfig } from "../config"
import { saveManualModeSetting } from "../state/persistence"
import { loadSessionData, logger } from "./data"
import { ContextDialog, PanelDialog, StatsDialog, StatusDialog } from "./dialogs"
import type { TuiApi } from "./types"
import type { Lang } from "../i18n"
import { t } from "../i18n"

export function showDialog(api: TuiApi, render: () => any) {
    api.ui.dialog.setSize("xlarge")
    api.ui.dialog.replace(render)
}

export function showStatusDialog(api: TuiApi, title: string, eyebrow: string, message: string) {
    showDialog(api, () => (
        <StatusDialog api={api} title={title} eyebrow={eyebrow} message={message} />
    ))
}

export function showError(api: TuiApi, title: string, error: unknown, lang?: Lang) {
    const message = error instanceof Error ? error.message : String(error)
    showStatusDialog(api, title, t("DCP Error", lang ?? "en"), message || t("Command failed.", lang ?? "en"))
}

export function openContextModal(api: TuiApi, config: PluginConfig) {
    runModal(api, t("Context", config.compress.lang), async () => {
        const data = await loadSessionData(api, config)
        if (!data) {
            showStatusDialog(api, "Context", "No session", "Open a session first.")
            return
        }
        showDialog(api, () => (
            <ContextDialog
                api={api}
                state={data.state}
                messages={data.messages}
                onBack={() => openPanelModal(api, config)}
                lang={config.compress.lang}
            />
        ))
    })
}

export function openStatsModal(api: TuiApi, config: PluginConfig) {
    runModal(api, t("Stats", config.compress.lang), async () => {
        const data = await loadSessionData(api, config)
        if (!data) {
            showStatusDialog(api, "Stats", "No session", "Open a session first.")
            return
        }
        const report = await buildStatsReport(data.state, logger)
        showDialog(api, () => (
            <StatsDialog api={api} report={report} onBack={() => openPanelModal(api, config)} lang={config.compress.lang} />
        ))
    })
}

export function openPanelModal(api: TuiApi, config: PluginConfig) {
    runModal(api, "DCP", async () => {
        const data = await loadSessionData(api, config)
        if (!data) {
            showStatusDialog(api, "DCP", "No session", "Open a session first.")
            return
        }
        showDialog(api, () => (
            <PanelDialog
                api={api}
                state={data.state}
                config={config}
                onContext={() => openContextModal(api, config)}
                onStats={() => openStatsModal(api, config)}
                onManual={(enabled) => setManualMode(api, config, data.state.sessionId, enabled)}
                lang={config.compress.lang}
            />
        ))
    })
}

function runModal(api: TuiApi, title: string, task: () => Promise<void>, lang?: Lang) {
    showStatusDialog(api, title, "DCP", t("Loading...", lang ?? "en"))
    void task().catch((error) => showError(api, title, error))
}

async function setManualMode(
    api: TuiApi,
    config: PluginConfig,
    sessionID: string | null | undefined,
    enabled: boolean,
) {
    if (!sessionID) return
    await saveManualModeSetting(sessionID, enabled, logger)
    openPanelModal(api, config)
}
