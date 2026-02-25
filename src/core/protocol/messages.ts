export const MessageType = {
  StateGet: "state/get",
  StateUpdate: "state/update",
  RunStart: "run/start",
  RunStop: "run/stop",
  ProgressCurrent: "progress/current",
  ProgressCompleted: "progress/completed",
  OpenUrl: "open/url",
  OpenLegacy: "page1/open-page2",
  TabCloseSelf: "tab/close-self",
  Page1Ready: "page1/ready",
  Page3Capture: "page3/capture",
  Log: "log"
} as const

export type CrawlerState = {
  runActive: boolean
  targetCount: number
  currentCount: number
  completedCount: number
  delayMs: number
  waitingForCompletion: boolean
  page1TabId: number | null
}

export type LogLevel = "log" | "warn" | "error"
export type LogSource = "page1" | "page2" | "page3" | "background"

export type LogMessage = {
  type: typeof MessageType.Log
  source: LogSource
  level: LogLevel
  message: string
  data?: unknown
}

export type Page3CapturePayload = {
  requestType: "xhr" | "fetch"
  url: string
  method: string
  status: number
  body: unknown
  time: number
}

export type Page3CaptureMessage = {
  type: typeof MessageType.Page3Capture
  payload: Page3CapturePayload
}

export type OpenUrlMessage = {
  type: typeof MessageType.OpenUrl | typeof MessageType.OpenLegacy
  url: string
  active?: boolean
}

export type RuntimeStateResponse = {
  state: CrawlerState
}

export type RuntimeAckResponse = {
  ok: boolean
}
