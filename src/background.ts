type CrawlerState = {
  runActive: boolean
  targetCount: number
  currentCount: number
  completedCount: number
  delayMs: number
  waitingForCompletion: boolean
  page1TabId: number | null
}

const DEFAULT_STATE: CrawlerState = {
  runActive: false,
  targetCount: 2,
  currentCount: 0,
  completedCount: 0,
  delayMs: 1000,
  waitingForCompletion: false,
  page1TabId: null
}

const STATE_KEY = "crawlerState"
const PAGE2_URL =
  "https://buyin.jinritemai.com/dashboard/merch-picking-library/shop-detail"
const PAGE3_URL = "https://buyin.jinritemai.com/mpa/pigeonIM"

let state: CrawlerState = { ...DEFAULT_STATE }
let nextTimer: ReturnType<typeof setTimeout> | null = null

type LogMessage = {
  type: "log"
  source: "page1" | "page2" | "page3" | "background"
  level: "log" | "warn" | "error"
  message: string
  data?: unknown
}

const logLocal = (
  level: LogMessage["level"],
  message: string,
  data?: unknown,
  forward = true
) => {
  const prefix = "[crawler][background]"
  if (level === "error") {
    console.error(prefix, message, data ?? "")
    if (forward) {
      void sendToPage1({
        type: "log",
        source: "background",
        level,
        message,
        data
      })
    }
    return
  }
  if (level === "warn") {
    console.warn(prefix, message, data ?? "")
    if (forward) {
      void sendToPage1({
        type: "log",
        source: "background",
        level,
        message,
        data
      })
    }
    return
  }
  console.log(prefix, message, data ?? "")
  if (forward) {
    void sendToPage1({
      type: "log",
      source: "background",
      level,
      message,
      data
    })
  }
}

const loadState = async () => {
  try {
    const stored = await chrome.storage.local.get(STATE_KEY)
    if (stored && stored[STATE_KEY]) {
      state = { ...DEFAULT_STATE, ...stored[STATE_KEY] }
    }
  } catch {
    state = { ...DEFAULT_STATE }
  }
}

const persistState = async () => {
  await chrome.storage.local.set({ [STATE_KEY]: state })
}

const sendToPage1 = async (payload: unknown) => {
  if (!state.page1TabId) return
  try {
    await chrome.tabs.sendMessage(state.page1TabId, payload)
  } catch (error) {
    const message = String(error)
    if (!message.includes("Receiving end does not exist")) {
      state.page1TabId = null
      await persistState()
    }
  }
}

const broadcastState = async () => {
  await sendToPage1({ type: "state/update", state })
}

const shouldTriggerNext = () => {
  return state.runActive && state.currentCount < state.targetCount
}

loadState().then(() => {
  persistState()
})

chrome.tabs.onCreated.addListener((tab) => {
  if (!state.runActive) return
  if (tab.url?.startsWith(PAGE2_URL)) {
    logLocal("log", "tab created page2", { tabId: tab.id })
  }
  if (tab.url?.startsWith(PAGE3_URL)) {
    logLocal("log", "tab created page3", { tabId: tab.id })
  }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!state.runActive) return
  if (!changeInfo.url) return
  if (changeInfo.url.startsWith(PAGE2_URL)) {
    logLocal("log", "tab updated page2", { tabId, url: changeInfo.url })
  }
  if (changeInfo.url.startsWith(PAGE3_URL)) {
    logLocal("log", "tab updated page3", { tabId, url: changeInfo.url })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    switch (message?.type) {
      case "state/get": {
        sendResponse({ state })
        return
      }
      case "page1/ready": {
        if (sender.tab?.id) {
          state.page1TabId = sender.tab.id
          await persistState()
        }
        logLocal("log", "page1 ready", { tabId: sender.tab?.id })
        await broadcastState()
        sendResponse({ ok: true })
        return
      }
      case "run/start": {
        if (sender.tab?.id) {
          state.page1TabId = sender.tab.id
        }
        state.runActive = true
        state.targetCount =
          typeof message.targetCount === "number"
            ? message.targetCount
            : state.targetCount
        state.delayMs =
          typeof message.delayMs === "number"
            ? message.delayMs
            : state.delayMs
        state.currentCount = 0
        state.completedCount = 0
        state.waitingForCompletion = false
        if (nextTimer) {
          clearTimeout(nextTimer)
          nextTimer = null
        }
        logLocal("log", "run start", {
          targetCount: state.targetCount,
          delayMs: state.delayMs
        })
        await persistState()
        await broadcastState()
        sendResponse({ ok: true })
        return
      }
      case "run/stop": {
        state.runActive = false
        state.waitingForCompletion = false
        if (nextTimer) {
          clearTimeout(nextTimer)
          nextTimer = null
        }
        logLocal("warn", "run stop")
        await persistState()
        await broadcastState()
        sendResponse({ ok: true })
        return
      }
      case "progress/current": {
        if (!state.runActive) {
          sendResponse({ ok: false })
          return
        }
        state.currentCount = Math.min(
          state.currentCount + 1,
          state.targetCount
        )
        state.waitingForCompletion = false
        logLocal("log", "progress current", {
          currentCount: state.currentCount
        })
        await persistState()
        await broadcastState()
        sendResponse({ ok: true })
        return
      }
      case "progress/completed": {
        if (!state.runActive) {
          sendResponse({ ok: false })
          return
        }
        state.completedCount = Math.min(
          state.completedCount + 1,
          state.targetCount
        )
        state.waitingForCompletion = false
        logLocal("log", "progress completed", {
          completedCount: state.completedCount
        })
        if (state.completedCount >= state.targetCount) {
          state.runActive = false
          logLocal("log", "run finished")
        }
        await persistState()
        await broadcastState()
        sendResponse({ ok: true })
        return
      }
      case "log": {
        const logMessage = message as LogMessage
        logLocal(
          logMessage.level,
          `[${logMessage.source}] ${logMessage.message}`,
          logMessage.data,
          false
        )
        if (logMessage.source !== "page1") {
          await sendToPage1(logMessage)
        }
        sendResponse({ ok: true })
        return
      }
      case "page1/open-page2": {
        if (typeof message.url === "string") {
          logLocal("log", "open page2", { url: message.url })
          await chrome.tabs.create({ url: message.url, active: true })
        }
        sendResponse({ ok: true })
        return
      }
      default: {
        sendResponse({ ok: false })
      }
    }
  }

  handle()
  return true
})
