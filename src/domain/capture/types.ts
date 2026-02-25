import type { Page3CapturePayload } from "~core/protocol/messages"

export type CaptureGroupKey = "contact" | "detail"

export type Page3CaptureRecord = Page3CapturePayload & {
  id: string
}

export type GroupedCaptures = {
  contact: Page3CaptureRecord | null
  detail: Page3CaptureRecord | null
}
