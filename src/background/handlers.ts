import {
  MessageType,
  type CrawlerState,
  type LogLevel,
  type LogMessage
} from "~core/protocol/messages"

type SendResponse = (response?: unknown) => void

type HandlerDeps = {
  getState: () => CrawlerState
  setState: (updater: (prev: CrawlerState) => CrawlerState) => Promise<void>
  persistState: () => Promise<void>
  broadcastState: () => Promise<void>
  sendToPage1: (payload: unknown) => Promise<void>
  logLocal: (level: LogLevel, message: string, data?: unknown) => Promise<void>
  openUrlInNewTab: (url: string, active?: boolean) => Promise<void>
  closeSenderTabLater: (
    sender: chrome.runtime.MessageSender,
    delayMs?: number
  ) => Promise<boolean>
}

export const handleRuntimeMessage = async (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
  deps: HandlerDeps
) => {
  switch (message?.type) {
    case MessageType.StateGet: {
      sendResponse({ state: deps.getState() })
      return
    }
    case MessageType.Page1Ready: {
      if (sender.tab?.id) {
        await deps.setState((prev) => ({ ...prev, page1TabId: sender.tab!.id! }))
      }
      await deps.logLocal("log", "page1 ready", { tabId: sender.tab?.id })
      await deps.broadcastState()
      sendResponse({ ok: true })
      return
    }
    case MessageType.RunStart: {
      await deps.setState((prev) => ({
        ...prev,
        page1TabId: sender.tab?.id ?? prev.page1TabId,
        runActive: true,
        targetCount:
          typeof message.targetCount === "number"
            ? message.targetCount
            : prev.targetCount,
        delayMs: typeof message.delayMs === "number" ? message.delayMs : prev.delayMs,
        currentCount: 0,
        completedCount: 0,
        waitingForCompletion: false
      }))
      const next = deps.getState()
      await deps.logLocal("log", "run start", {
        targetCount: next.targetCount,
        delayMs: next.delayMs
      })
      await deps.broadcastState()
      sendResponse({ ok: true })
      return
    }
    case MessageType.RunStop: {
      await deps.setState((prev) => ({
        ...prev,
        runActive: false,
        waitingForCompletion: false
      }))
      await deps.logLocal("warn", "run stop")
      await deps.broadcastState()
      sendResponse({ ok: true })
      return
    }
    case MessageType.ProgressCurrent: {
      const curr = deps.getState()
      if (!curr.runActive) {
        sendResponse({ ok: false })
        return
      }
      await deps.setState((prev) => ({
        ...prev,
        currentCount: Math.min(prev.currentCount + 1, prev.targetCount),
        waitingForCompletion: false
      }))
      await deps.logLocal("log", "progress current", {
        currentCount: deps.getState().currentCount
      })
      await deps.broadcastState()
      sendResponse({ ok: true })
      return
    }
    case MessageType.ProgressCompleted: {
      const curr = deps.getState()
      if (!curr.runActive) {
        sendResponse({ ok: false })
        return
      }
      await deps.setState((prev) => {
        const completedCount = Math.min(prev.completedCount + 1, prev.targetCount)
        return {
          ...prev,
          completedCount,
          runActive: completedCount >= prev.targetCount ? false : prev.runActive,
          waitingForCompletion: false
        }
      })
      await deps.logLocal("log", "progress completed", {
        completedCount: deps.getState().completedCount
      })
      if (!deps.getState().runActive) {
        await deps.logLocal("log", "run finished")
      }
      await deps.broadcastState()
      sendResponse({ ok: true })
      return
    }
    case MessageType.OpenUrl:
    case MessageType.OpenLegacy: {
      if (typeof message.url === "string") {
        await deps.logLocal("log", "open url", {
          url: message.url,
          active: message.active
        })
        await deps.openUrlInNewTab(message.url, message.active)
      }
      sendResponse({ ok: true })
      return
    }
    case MessageType.Page3Capture: {
      await deps.sendToPage1(message)
      sendResponse({ ok: true })
      return
    }
    case MessageType.TabCloseSelf: {
      const ok = await deps.closeSenderTabLater(sender, message.delayMs)
      sendResponse({ ok })
      return
    }
    case MessageType.Log: {
      const logMessage = message as LogMessage
      const logText = `[${logMessage.source}] ${logMessage.message}`
      await deps.logLocal(logMessage.level, logText, logMessage.data)
      if (logMessage.source !== "page1") {
        await deps.sendToPage1(logMessage)
      }
      sendResponse({ ok: true })
      return
    }
    default: {
      sendResponse({ ok: false })
    }
  }
}
