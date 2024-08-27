package ee.carlrobert.codegpt.actions

import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction.createSimpleExpiring
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import ee.carlrobert.codegpt.CodeGPTBundle
import ee.carlrobert.codegpt.completions.llama.LlamaModel.findByHuggingFaceModel
import ee.carlrobert.codegpt.completions.llama.LlamaServerAgent
import ee.carlrobert.codegpt.completions.llama.LlamaServerStartupParams
import ee.carlrobert.codegpt.settings.GeneralSettings
import ee.carlrobert.codegpt.settings.service.ServiceType.LLAMA_CPP
import ee.carlrobert.codegpt.settings.service.llama.LlamaSettings
import ee.carlrobert.codegpt.settings.service.llama.LlamaSettings.*
import ee.carlrobert.codegpt.settings.service.llama.form.ServerProgressPanel
import ee.carlrobert.codegpt.ui.OverlayUtil.showNotification
import ee.carlrobert.codegpt.ui.OverlayUtil.stickyNotification
import java.util.function.Consumer

private const val STARTING = "settingsConfigurable.service.llama.progress.startingServer"
private const val RUNNING = "settingsConfigurable.service.llama.progress.serverRunning"
private const val STOPPING = "settingsConfigurable.service.llama.progress.stoppingServer"
private const val STOPPED = "settingsConfigurable.service.llama.progress.serverStopped"
private const val START = "settingsConfigurable.service.llama.stopServer.opposite"
private const val STOP = "settingsConfigurable.service.llama.startServer.opposite"

/**
 * Start or stop server (if selected model exists) showing notifications
 */
abstract class LlamaServerToggleActions(
    private val startServer: Boolean
) : DumbAwareAction() {
    companion object {
        fun expireOtherNotification(start: Boolean) {
            getAction(start).apply {
                this.notification?.expire()
                this.notification = null
            }
        }

        private fun getAction(start: Boolean) = ActionManager.getInstance().getAction(getId(start)) as LlamaServerToggleActions

        private fun getId(start: Boolean) = if (start) "statusbar.stopServer" else "statusbar.startServer"
    }

    var notification: Notification? = null

    override fun actionPerformed(e: AnActionEvent) {
        (GeneralSettings.getCurrentState().selectedService == LLAMA_CPP).takeIf { it } ?: return
        notification?.expire()
        expireOtherNotification(startServer)
        val llamaServerAgent = service<LlamaServerAgent>()
        val serverName = LlamaSettings.getInstance().state.huggingFaceModel.let { findByHuggingFaceModel(it).toString(it) }
        if (startServer) {
            start(serverName, llamaServerAgent)
        } else {
            stop(serverName, llamaServerAgent)
        }
    }

    private fun start(serverName: String, llamaServerAgent: LlamaServerAgent) {
        notification = stickyNotification(formatMsg(STARTING, serverName),
            createSimpleExpiring(CodeGPTBundle.get(STOP)) { stop(serverName, llamaServerAgent) })
        val serverProgressPanel = ServerProgressPanel()
        llamaServerAgent.setActiveServerProgressPanel(serverProgressPanel)
        val settings = LlamaSettings.getInstance().state
        llamaServerAgent.startAgent(
            LlamaServerStartupParams(
                LlamaSettings.getInstance().actualModelPath,
                settings.contextSize,
                settings.threads,
                settings.serverPort,
                getAdditionalParametersList(settings.additionalParameters),
                getAdditionalParametersList(settings.additionalBuildParameters),
                getAdditionalEnvironmentVariablesMap(settings.additionalEnvironmentVariables)
            ),
            serverProgressPanel,
            {
                notification?.expire()
                notification = notification(RUNNING, false, serverName, llamaServerAgent)
            },
            {
                Consumer<ServerProgressPanel> { _: ServerProgressPanel ->
                    notification?.expire()
                    notification = notification(STOPPED, true, serverName, llamaServerAgent)
                }
            })
    }

    private fun stop(serverName: String, llamaServerAgent: LlamaServerAgent) {
        notification = showNotification(formatMsg(STOPPING, serverName))
        llamaServerAgent.stopAgent()
        notification?.expire()
        notification = notification(STOPPED, true, serverName, llamaServerAgent)
    }

    private fun notification(id: String, nextStart: Boolean, serverName: String, llamaServerAgent: LlamaServerAgent) =
        showNotification(formatMsg(id, serverName),
            createSimpleExpiring(CodeGPTBundle.get(if (nextStart) START else STOP)) {
                if (nextStart) start(serverName, llamaServerAgent) else stop(serverName, llamaServerAgent)
            })

    // "Starting server..." -> "Starting server: CodeLlama 7B 4-bit ..."
    // "Stopped server"     -> "Stopped server: CodeLlama 7B 4-bit"
    private fun formatMsg(id: String, serverName: String): String {
        val msg = CodeGPTBundle.get(id)
        val points = msg.endsWith("...")
        return msg.let { if (points) it.substringBeforeLast("...") else it } + ": " + serverName + (if (points) " ..." else "")
    }

    override fun update(e: AnActionEvent) {
        val llamaRunnable = isRunnable(LlamaSettings.getInstance().state.huggingFaceModel)
        val serverRunning = llamaRunnable && service<LlamaServerAgent>().isServerRunning
        val toggle = llamaRunnable && serverRunning != startServer
        e.presentation.isVisible = toggle
        e.presentation.isEnabled = toggle
    }

    override fun getActionUpdateThread(): ActionUpdateThread {
        return ActionUpdateThread.BGT
    }
}

class StartServerAction : LlamaServerToggleActions(true)

class StopServerAction : LlamaServerToggleActions(false)
