import { MessageType, type CrawlerState, type LogLevel } from "~core/protocol/messages"
import { handleRuntimeMessage } from "~background/handlers"
import {
  loadStateFromStorage,
  persistStateToStorage
} from "~background/state-store"

const PAGE2_URL =
  "https://buyin.jinritemai.com/dashboard/merch-picking-library/shop-detail"
const PAGE3_URL = "https://buyin.jinritemai.com/mpa/pigeonIM"

let state: CrawlerState

const getState = () => state

const setState = async (updater: (prev: CrawlerState) => CrawlerState) => {
  state = updater(state)
  await persistStateToStorage(state)
}

const sendToPage1 = async (payload: unknown) => {
  if (!state.page1TabId) return
  try {
    await chrome.tabs.sendMessage(state.page1TabId, payload)
  } catch (error) {
    const message = String(error)
    if (!message.includes("Receiving end does not exist")) {
      state = { ...state, page1TabId: null }
      await persistStateToStorage(state)
    }
  }
}

const logLocal = async (level: LogLevel, message: string, data?: unknown) => {
  const prefix = "[crawler][background]"
  if (level === "error") {
    console.error(prefix, message, data ?? "")
  } else if (level === "warn") {
    console.warn(prefix, message, data ?? "")
  } else {
    console.log(prefix, message, data ?? "")
  }
  await sendToPage1({
    type: MessageType.Log,
    source: "background",
    level,
    message,
    data
  })
}

const broadcastState = async () => {
  await sendToPage1({
    type: MessageType.StateUpdate,
    state
  })
}

const openUrlInNewTab = async (url: string, active?: boolean) => {
  await chrome.tabs.create({
    url,
    active: typeof active === "boolean" ? active : false
  })
}

const closeSenderTabLater = async (
  sender: chrome.runtime.MessageSender,
  delayMs?: number
) => {
  const tabId = sender.tab?.id
  if (!tabId) return false
  setTimeout(async () => {
    try {
      await chrome.tabs.remove(tabId)
    } catch {
      return
    }
  }, typeof delayMs === "number" ? Math.max(0, delayMs) : 0)
  return true
}

void loadStateFromStorage().then(async (loaded) => {
  state = loaded
  await persistStateToStorage(state)
})

chrome.tabs.onCreated.addListener((tab) => {
  if (!state?.runActive) return
  if (tab.url?.startsWith(PAGE2_URL)) {
    void logLocal("log", "tab created page2", { tabId: tab.id })
  }
  if (tab.url?.startsWith(PAGE3_URL)) {
    void logLocal("log", "tab created page3", { tabId: tab.id })
  }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!state?.runActive || !changeInfo.url) return
  if (changeInfo.url.startsWith(PAGE2_URL)) {
    void logLocal("log", "tab updated page2", { tabId, url: changeInfo.url })
  }
  if (changeInfo.url.startsWith(PAGE3_URL)) {
    void logLocal("log", "tab updated page3", { tabId, url: changeInfo.url })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleRuntimeMessage(message, sender, sendResponse, {
    getState,
    setState,
    persistState: async () => persistStateToStorage(state),
    broadcastState,
    sendToPage1,
    logLocal,
    openUrlInNewTab,
    closeSenderTabLater
  })
  return true
})
