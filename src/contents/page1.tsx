import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { injectScript } from "~lib/inject-script"
import { DraggblePannel } from "~ui/draggble-pannel"

export const config: PlasmoCSConfig = {
  matches: ["https://buyin.jinritemai.com/dashboard/merch-picking-library*"]
}

export const getStyle = (): HTMLStyleElement => {
  const baseFontSize = 16

  let updatedCssText = cssText.replaceAll(":root", ":host(plasmo-csui)")
  const remRegex = /([\d.]+)rem/g
  updatedCssText = updatedCssText.replace(remRegex, (match, remValue) => {
    const pixelsValue = parseFloat(remValue) * baseFontSize

    return `${pixelsValue}px`
  })

  const styleElement = document.createElement("style")

  styleElement.textContent = updatedCssText

  return styleElement
}

const LIST_URL_SUBSTRING = "/selection/common/material_list"
const PAGE2_BASE_URL =
  "https://buyin.jinritemai.com/dashboard/merch-picking-library/shop-detail"
const INJECTED_SCRIPT_ID = "plasmo-fetch-hook"

type CrawlerState = {
  runActive: boolean
  targetCount: number
  currentCount: number
  completedCount: number
  delayMs: number
  waitingForCompletion: boolean
}

type LogMessage = {
  type: "log"
  source: "page1" | "page2" | "page3" | "background"
  level: "log" | "warn" | "error"
  message: string
  data?: unknown
}

type Page3CaptureMessage = {
  type: "page3/capture"
  payload: {
    requestType: "xhr" | "fetch"
    url: string
    method: string
    status: number
    body: unknown
    time: number
  }
}

type Page3CaptureRecord = Page3CaptureMessage["payload"] & {
  id: string
}

type GroupedCaptures = {
  contact: Page3CaptureRecord | null
  detail: Page3CaptureRecord | null
}

const formatJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const resolveCaptureGroup = (url: string): keyof GroupedCaptures | null => {
  if (url.includes("/connection/pc/im/shop/contact")) return "contact"
  if (url.includes("/connection/pc/im/shop/detail")) return "detail"
  return null
}

const extractShopIds = (body: unknown): string[] => {
  if (!body || typeof body !== "object") return []
  const data = body as {
    data?: {
      summary_promotions?: Array<{
        base_model?: { shop_info?: { shop_id?: string | number } }
      }>
    }
  }
  const list = data.data?.summary_promotions ?? []
  const ids = list
    .map((item) => item?.base_model?.shop_info?.shop_id)
    .filter((value): value is string | number => value !== undefined)
    .map((value) => String(value))
  return ids
}

const PlasmoOverlay = () => {
  const [state, setState] = useState<CrawlerState>({
    runActive: false,
    targetCount: 2,
    currentCount: 0,
    completedCount: 0,
    delayMs: 1000,
    waitingForCompletion: false
  })
  const [shouldRender, setShouldRender] = useState(false)
  const [targetInput, setTargetInput] = useState("2")
  const [delayInput, setDelayInput] = useState("1000")
  const [status, setStatus] = useState("")
  const [page3Captures, setPage3Captures] = useState<GroupedCaptures>({
    contact: null,
    detail: null
  })
  const stateRef = useRef(state)
  const queueRef = useRef<string[]>([])
  const cachedShopIdsRef = useRef<string[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isProcessingRef = useRef(false)
  const seenRef = useRef<Set<string>>(new Set())

  const logToBackground = useCallback(
    (level: LogMessage["level"], message: string, data?: unknown) => {
      const payload: LogMessage = {
        type: "log",
        source: "page1",
        level,
        message,
        data
      }
      console[level]("[crawler][page1]", message, data ?? "")
      chrome.runtime.sendMessage(payload)
    },
    []
  )

  const updateFromState = useCallback((next: CrawlerState) => {
    stateRef.current = next
    setState(next)
    setTargetInput(String(next.targetCount))
    setDelayInput(String(next.delayMs))
  }, [])

  const scheduleNextOpen = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    const delay = stateRef.current.delayMs
    timerRef.current = setTimeout(() => {
      processQueue()
    }, Math.max(0, delay))
  }, [])

  const processQueue = useCallback(() => {
    const current = stateRef.current
    if (!current.runActive) return
    if (current.currentCount >= current.targetCount) {
      logToBackground("log", "target reached, stop processing")
      return
    }
    if (isProcessingRef.current) return
    const next = queueRef.current.shift()
    if (!next) {
      logToBackground("warn", "queue empty, waiting for list data")
      return
    }

    isProcessingRef.current = true
    const url = `${PAGE2_BASE_URL}?shop_id=${encodeURIComponent(next)}`
    chrome.runtime.sendMessage(
      { type: "page1/open-page2", url },
      (response) => {
        if (chrome.runtime.lastError) {
          logToBackground("error", "open page2 failed", {
            error: chrome.runtime.lastError.message
          })
          isProcessingRef.current = false
          return
        }
        if (!response?.ok) {
          logToBackground("warn", "open page2 response not ok", response)
        }
        chrome.runtime.sendMessage(
          { type: "progress/current" },
          (progressResponse) => {
            if (chrome.runtime.lastError) {
              logToBackground("error", "progress current failed", {
                error: chrome.runtime.lastError.message
              })
              isProcessingRef.current = false
              return
            }
            if (!progressResponse?.ok) {
              logToBackground(
                "warn",
                "progress current response not ok",
                progressResponse
              )
            }
            logToBackground("log", "opened page2 with shop_id", {
              shopId: next
            })
            setStatus("Opened page2")
            isProcessingRef.current = false
            scheduleNextOpen()
          }
        )
      }
    )
  }, [logToBackground, scheduleNextOpen])

  useEffect(() => {
    if (!chrome?.runtime?.id) return

    const { pathname, hash, href } = window.location
    const isPage1Path =
      pathname === "/dashboard/merch-picking-library" ||
      pathname === "/dashboard/merch-picking-library/"
    const isShopDetailPath =
      href.includes("/dashboard/merch-picking-library/shop-detail") ||
      hash.includes("merch-picking-library/shop-detail")
    if (!isPage1Path || isShopDetailPath) {
      console.warn("[crawler][page1] guard skip", { pathname, hash, href })
      setShouldRender(false)
      return
    }
    setShouldRender(true)

    chrome.runtime.sendMessage({ type: "page1/ready" })
    logToBackground("log", "page1 ready")

    chrome.runtime.sendMessage({ type: "state/get" }, (response) => {
      if (chrome.runtime.lastError) {
        logToBackground("error", "state get failed", {
          error: chrome.runtime.lastError.message
        })
        return
      }
      if (response?.state) {
        updateFromState(response.state)
      }
    })

    const scriptUrl = chrome.runtime.getURL("assets/fetch-hook.js")
    injectScript({
      elementId: INJECTED_SCRIPT_ID,
      src: scriptUrl,
      onLoad: () => {
        logToBackground("log", "page1 hook injected")
      },
      onError: (event) => {
        logToBackground("error", "page1 hook inject failed", String(event))
      }
    })

    const onWindowMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== INJECTED_SCRIPT_ID) return
      if (!data.url || typeof data.url !== "string") return
      if (!data.url.includes(LIST_URL_SUBSTRING)) return

      const shopIds = extractShopIds(data.body)
      if (shopIds.length === 0) {
        logToBackground("warn", "list hook: no shop ids")
        return
      }

      const unique = shopIds.filter((id) => {
        if (seenRef.current.has(id)) return false
        seenRef.current.add(id)
        return true
      })
      if (unique.length === 0) return

      cachedShopIdsRef.current = [
        ...cachedShopIdsRef.current,
        ...unique
      ].filter((value, index, array) => array.indexOf(value) === index)
      if (stateRef.current.runActive) {
        queueRef.current.push(...unique)
        logToBackground("log", "queue loaded", {
          count: queueRef.current.length
        })
        processQueue()
      }
    }

    window.addEventListener("message", onWindowMessage)

    type IncomingMessage =
      | { type: "state/update"; state: CrawlerState }
      | LogMessage
      | Page3CaptureMessage

    const onMessage = (message: IncomingMessage) => {
      if (!message || !message.type) return
      if (message.type === "state/update" && message.state) {
        updateFromState(message.state)
      }
      if (message.type === "page3/capture") {
        const group = resolveCaptureGroup(message.payload.url)
        if (!group) return
        setPage3Captures((prev) => ({
          ...prev,
          [group]: {
            ...message.payload,
            id: `${message.payload.time}-${Math.random().toString(16).slice(2)}`
          }
        }))
        return
      }
      if (message.type === "log") {
        const prefix = `[crawler][${message.source}]`
        if (message.level === "error") {
          console.error(prefix, message.message, message.data ?? "")
          return
        }
        if (message.level === "warn") {
          console.warn(prefix, message.message, message.data ?? "")
          return
        }
        console.log(prefix, message.message, message.data ?? "")
      }
    }

    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      window.removeEventListener("message", onWindowMessage)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [logToBackground, processQueue, updateFromState])

  const canStart = useMemo(() => {
    const target = Number.parseInt(targetInput, 10)
    return Number.isFinite(target) && target > 0
  }, [targetInput])

  const startRun = async () => {
    if (!canStart) return
    const target = Number.parseInt(targetInput, 10)
    const delay = Number.parseInt(delayInput, 10)
    const nextState: CrawlerState = {
      ...stateRef.current,
      runActive: true,
      targetCount: target,
      currentCount: 0,
      completedCount: 0,
      delayMs: Number.isFinite(delay) && delay >= 0 ? delay : 1000,
      waitingForCompletion: false
    }
    updateFromState(nextState)
    chrome.runtime.sendMessage(
      {
        type: "run/start",
        targetCount: target,
        delayMs: Number.isFinite(delay) && delay >= 0 ? delay : 1000
      },
      (response) => {
        if (chrome.runtime.lastError) {
          logToBackground("error", "run start failed", {
            error: chrome.runtime.lastError.message
          })
          return
        }
        if (!response?.ok) {
          logToBackground("warn", "run start response not ok", response)
        }
      }
    )
    setStatus("Running")
    logToBackground("log", "run start click", { target, delay })
    seenRef.current = new Set()
    queueRef.current = []
    isProcessingRef.current = false
    setPage3Captures({
      contact: null,
      detail: null
    })
    if (cachedShopIdsRef.current.length > 0) {
      queueRef.current = [...cachedShopIdsRef.current]
      logToBackground("log", "queue loaded from cache", {
        count: queueRef.current.length
      })
      processQueue()
    } else {
      logToBackground("warn", "waiting for list request")
    }
  }

  const stopRun = async () => {
    chrome.runtime.sendMessage({ type: "run/stop" }, (response) => {
      if (chrome.runtime.lastError) {
        logToBackground("error", "run stop failed", {
          error: chrome.runtime.lastError.message
        })
        return
      }
      if (!response?.ok) {
        logToBackground("warn", "run stop response not ok", response)
      }
    })
    setStatus("Stopped")
    logToBackground("warn", "run stop click")
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    isProcessingRef.current = false
    queueRef.current = []
  }

  if (!shouldRender) return null

  return (
    <DraggblePannel top={200} right={80} className="plasmo-px-3 plasmo-py-2">
      <div className="plasmo-text-sm plasmo-font-semibold plasmo-text-slate-800">
        Crawler
      </div>
      <div className="plasmo-mt-2 plasmo-text-xs plasmo-text-slate-600">
        Target
      </div>
      <input
        className="plasmo-mt-1 plasmo-w-24 plasmo-rounded-md plasmo-border plasmo-border-slate-200 plasmo-px-2 plasmo-py-1 plasmo-text-xs"
        type="number"
        min={1}
        value={targetInput}
        disabled={state.runActive}
        onChange={(event) => setTargetInput(event.target.value)}
      />
      <div className="plasmo-mt-2 plasmo-text-xs plasmo-text-slate-600">
        Interval (ms)
      </div>
      <input
        className="plasmo-mt-1 plasmo-w-24 plasmo-rounded-md plasmo-border plasmo-border-slate-200 plasmo-px-2 plasmo-py-1 plasmo-text-xs"
        type="number"
        min={0}
        value={delayInput}
        disabled={state.runActive}
        onChange={(event) => setDelayInput(event.target.value)}
      />
      <div className="plasmo-mt-3 plasmo-text-xs plasmo-text-slate-700">
        Target: {state.targetCount}
      </div>
      <div className="plasmo-text-xs plasmo-text-slate-700">
        Current: {state.currentCount}
      </div>
      <div className="plasmo-text-xs plasmo-text-slate-700">
        Completed: {state.completedCount}
      </div>
      <div className="plasmo-text-xs plasmo-text-slate-700">
        Interval: {state.delayMs}ms
      </div>
      <div className="plasmo-mt-3 plasmo-text-xs plasmo-font-semibold plasmo-text-slate-800">
        Page3 Captures
      </div>
      <div className="plasmo-mt-1 plasmo-max-h-48 plasmo-w-80 plasmo-overflow-auto plasmo-space-y-2">
        {(["contact", "detail"] as Array<keyof GroupedCaptures>).map((group) => {
          const item = page3Captures[group]
          return (
            <div
              key={group}
              className="plasmo-rounded-md plasmo-border plasmo-border-slate-200 plasmo-bg-white plasmo-p-2">
              <div className="plasmo-text-[11px] plasmo-font-semibold plasmo-text-slate-700">
                {group}
              </div>
              {!item ? (
                <div className="plasmo-text-[11px] plasmo-text-slate-500">
                  No data yet.
                </div>
              ) : (
                <>
                  <div className="plasmo-text-[11px] plasmo-text-slate-700">
                    {item.requestType.toUpperCase()} {item.method} {item.status}
                  </div>
                  <div className="plasmo-break-all plasmo-text-[11px] plasmo-text-slate-600">
                    {item.url}
                  </div>
                  <pre className="plasmo-mt-1 plasmo-max-h-28 plasmo-overflow-auto plasmo-whitespace-pre-wrap plasmo-text-[11px] plasmo-text-slate-700">
                    {formatJson(item.body)}
                  </pre>
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="plasmo-mt-3 plasmo-flex plasmo-gap-2">
        {state.runActive ? (
          <button
            type="button"
            onClick={stopRun}
            className="plasmo-rounded-md plasmo-bg-rose-500 plasmo-px-3 plasmo-py-1 plasmo-text-xs plasmo-text-white">
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={startRun}
            disabled={!canStart}
            className="plasmo-rounded-md plasmo-bg-emerald-500 plasmo-px-3 plasmo-py-1 plasmo-text-xs plasmo-text-white disabled:plasmo-opacity-50">
            Start
          </button>
        )}
      </div>
      {status ? (
        <div className="plasmo-mt-2 plasmo-text-[11px] plasmo-text-slate-500">
          {status}
        </div>
      ) : null}
    </DraggblePannel>
  )
}

export default PlasmoOverlay
