import * as XLSX from "xlsx"

import {
  MessageType,
  type CrawlerState,
  type LogLevel,
  type LogMessage
} from "~core/protocol/messages"
import {
  extractContactFields,
  extractDetailFields,
  extractShopIdFromUrl,
  resolveCaptureGroup
} from "~domain/capture/parsers"
import {
  getAllShopRecords,
  getShopRecord,
  putShopRecord
} from "~services/storage/indexeddb"

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
      const group = resolveCaptureGroup(message.payload?.url ?? "")
      const shopIdFromUrl =
        typeof message.payload?.url === "string"
          ? extractShopIdFromUrl(message.payload.url)
          : null
      if (!group || !shopIdFromUrl) {
        sendResponse({ ok: true })
        return
      }

      const fields =
        group === "contact"
          ? extractContactFields(message.payload.body)
          : extractDetailFields(message.payload.body)

      const existing = await getShopRecord(shopIdFromUrl)
      const merged = {
        ...(existing ?? {}),
        ...fields,
        shop_id: shopIdFromUrl,
        updated_at: Date.now()
      }
      await putShopRecord(merged)

      await deps.sendToPage1(message)
      sendResponse({ ok: true })
      return
    }
    case MessageType.ExportXlsx: {
      try {
        const records = await getAllShopRecords()
        const headerMap: Record<string, string> = {
          shop_id: "商铺ID",
          shop_name: "商铺名称",
          experience_score: "店铺体验分数",
          product_experience_score: "商品体验分数",
          logistics_score: "物流体验分数",
          shop_service_score: "商家服务分数",
          coo_kol_num: "合作达人数量",
          sales: "销量",
          avg_cos_ratio: "平均佣金率",
          phone: "电话",
          wechat: "微信号",
          updated_at: "更新时间"
        }
        const preferred = [
          "shop_id",
          "shop_name",
          "experience_score",
          "product_experience_score",
          "logistics_score",
          "shop_service_score",
          "coo_kol_num",
          "sales",
          "avg_cos_ratio",
          "phone",
          "wechat",
          "updated_at"
        ]
        const dynamicKeys = Array.from(
          new Set(records.flatMap((record) => Object.keys(record)))
        )
          .filter((key) => !preferred.includes(key))
          .sort((a, b) => a.localeCompare(b))
        const columns = [...preferred, ...dynamicKeys]
        const rows = records.map((record) => {
          const row: Record<string, unknown> = {}
          for (const key of columns) {
            let value = record[key]
            if (key === "updated_at" && typeof value === "number") {
              value = new Date(value).toLocaleString()
            }
            const header = headerMap[key] ?? key
            row[header] = value ?? null
          }
          return row
        })
        const headerLabels = columns.map((key) => headerMap[key] ?? key)
        const sheet = XLSX.utils.json_to_sheet(rows, { header: headerLabels })
        const book = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(book, sheet, "shops")
        const base64 = XLSX.write(book, { type: "base64", bookType: "xlsx" })
        const now = new Date()
        const pad = (value: number) => String(value).padStart(2, "0")
        const filename = `crawler-shops-${now.getFullYear()}${pad(
          now.getMonth() + 1
        )}${pad(now.getDate())}-${pad(now.getHours())}${pad(
          now.getMinutes()
        )}${pad(now.getSeconds())}.xlsx`
        const url =
          "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," +
          base64
        await chrome.downloads.download({
          url,
          filename,
          conflictAction: "uniquify"
        })
        await deps.sendToPage1({ type: MessageType.ExportResult, ok: true })
        sendResponse({ ok: true })
      } catch (error) {
        const messageText = String(error)
        await deps.sendToPage1({
          type: MessageType.ExportResult,
          ok: false,
          error: messageText
        })
        sendResponse({ ok: false, error: messageText })
      }
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
