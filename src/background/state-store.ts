import type { CrawlerState } from "~core/protocol/messages"

export const STATE_KEY = "crawlerState"

export const DEFAULT_STATE: CrawlerState = {
  runActive: false,
  targetCount: 2,
  currentCount: 0,
  completedCount: 0,
  delayMs: 1000,
  waitingForCompletion: false,
  page1TabId: null
}

export const loadStateFromStorage = async (): Promise<CrawlerState> => {
  try {
    const stored = await chrome.storage.local.get(STATE_KEY)
    if (stored && stored[STATE_KEY]) {
      return { ...DEFAULT_STATE, ...stored[STATE_KEY] }
    }
    return { ...DEFAULT_STATE }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export const persistStateToStorage = async (state: CrawlerState) => {
  await chrome.storage.local.set({ [STATE_KEY]: state })
}
