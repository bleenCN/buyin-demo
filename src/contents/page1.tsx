import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { createRuntimeLogger } from "~core/logging/logger"
import {
  MessageType,
  type CrawlerState,
  type LogMessage,
  type Page3CaptureMessage,
  type RuntimeAckResponse,
  type RuntimeStateResponse
} from "~core/protocol/messages"
import { extractShopIds, resolveCaptureGroup } from "~domain/capture/parsers"
import type { GroupedCaptures, Page3CaptureRecord } from "~domain/capture/types"
import { ShopQueueController } from "~domain/run/queue-controller"
import { sendRuntimeMessage } from "~services/runtime/messenger"
import { injectFetchHook } from "~services/injection/script-injector"
import { DraggblePannel } from "~ui/draggble-pannel"

export const config: PlasmoCSConfig = {
  matches: ["https://buyin.jinritemai.com/dashboard/merch-picking-library*"]
}

export const getStyle = (): HTMLStyleElement => {
  const baseFontSize = 16
  let updatedCssText = cssText.replaceAll(":root", ":host(plasmo-csui)")
  const remRegex = /([\d.]+)rem/g
  updatedCssText = updatedCssText.replace(remRegex, (_match, remValue) => {
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

const EMPTY_CAPTURES: GroupedCaptures = {
  contact: null,
  detail: null
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

const formatJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const isPage1Location = (locationLike: Location) => {
  const { pathname, hash, href } = locationLike
  const isPage1Path =
    pathname === "/dashboard/merch-picking-library" ||
    pathname === "/dashboard/merch-picking-library/"
  const isShopDetailPath =
    href.includes("/dashboard/merch-picking-library/shop-detail") ||
    hash.includes("merch-picking-library/shop-detail")
  return isPage1Path && !isShopDetailPath
}

const PlasmoOverlay = () => {
  const logger = useMemo(() => createRuntimeLogger("page1"), [])

  const [state, setState] = useState<CrawlerState>(DEFAULT_STATE)
  const [shouldRender, setShouldRender] = useState(false)
  const [targetInput, setTargetInput] = useState("2")
  const [delayInput, setDelayInput] = useState("1000")
  const [status, setStatus] = useState("")
  const [page3Captures, setPage3Captures] = useState<GroupedCaptures>(EMPTY_CAPTURES)

  const stateRef = useRef(state)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = useRef(new ShopQueueController())
  const isProcessingRef = useRef(false)

  const updateFromState = useCallback((next: CrawlerState) => {
    // 统一状态落点，避免 UI 状态和后台状态漂移
    stateRef.current = next
    setState(next)
    setTargetInput(String(next.targetCount))
    setDelayInput(String(next.delayMs))
  }, [])

  const scheduleNextOpen = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void processQueue()
    }, Math.max(0, stateRef.current.delayMs))
  }, [])

  const processQueue = useCallback(async () => {
    const current = stateRef.current
    if (!current.runActive) return
    if (current.currentCount >= current.targetCount) {
      logger.log("target reached, stop processing")
      return
    }
    if (isProcessingRef.current) return

    const nextShopId = queueRef.current.dequeue()
    if (!nextShopId) {
      logger.warn("queue empty, waiting for list data")
      return
    }

    isProcessingRef.current = true
    const page2Url = `${PAGE2_BASE_URL}?shop_id=${encodeURIComponent(nextShopId)}`
    const openResult = await sendRuntimeMessage<RuntimeAckResponse>({
      type: MessageType.OpenUrl,
      url: page2Url
    })
    if (!openResult.ok || !openResult.response?.ok) {
      logger.error("open page2 failed", openResult.error ?? openResult.response)
      isProcessingRef.current = false
      return
    }

    const progressResult = await sendRuntimeMessage<RuntimeAckResponse>({
      type: MessageType.ProgressCurrent
    })
    if (!progressResult.ok || !progressResult.response?.ok) {
      logger.error(
        "progress current failed",
        progressResult.error ?? progressResult.response
      )
      isProcessingRef.current = false
      return
    }

    logger.log("opened page2 with shop_id", { shopId: nextShopId })
    setStatus("Opened page2")
    isProcessingRef.current = false
    scheduleNextOpen()
  }, [logger, scheduleNextOpen])

  useEffect(() => {
    if (!chrome?.runtime?.id) return

    if (!isPage1Location(window.location)) {
      setShouldRender(false)
      return
    }
    setShouldRender(true)

    void sendRuntimeMessage<RuntimeAckResponse>({ type: MessageType.Page1Ready })
    logger.log("page1 ready")

    void sendRuntimeMessage<RuntimeStateResponse>({ type: MessageType.StateGet }).then(
      (result) => {
        if (!result.ok || !result.response?.state) {
          logger.error("state get failed", result.error)
          return
        }
        updateFromState(result.response.state)
      }
    )

    injectFetchHook({
      elementId: INJECTED_SCRIPT_ID,
      onLoad: () => logger.log("page1 hook injected"),
      onError: (event) => logger.error("page1 hook inject failed", String(event))
    })

    const onWindowMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== INJECTED_SCRIPT_ID) return
      if (!data.url || typeof data.url !== "string") return
      if (!data.url.includes(LIST_URL_SUBSTRING)) return

      const unique = queueRef.current.addShopIds(extractShopIds(data.body))
      if (unique.length === 0) return
      if (stateRef.current.runActive) {
        logger.log("queue loaded", { count: queueRef.current.size() })
        void processQueue()
      }
    }

    const onRuntimeMessage = (
      message:
        | { type: typeof MessageType.StateUpdate; state: CrawlerState }
        | LogMessage
        | Page3CaptureMessage
    ) => {
      if (!message) return

      if (message.type === MessageType.StateUpdate && message.state) {
        updateFromState(message.state)
        return
      }

      if (message.type === MessageType.Page3Capture) {
        const group = resolveCaptureGroup(message.payload.url)
        if (!group) return
        const record: Page3CaptureRecord = {
          ...message.payload,
          id: `${message.payload.time}-${Math.random().toString(16).slice(2)}`
        }
        setPage3Captures((prev) => ({
          ...prev,
          [group]: record
        }))
        return
      }

      if (message.type === MessageType.Log) {
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

    window.addEventListener("message", onWindowMessage)
    chrome.runtime.onMessage.addListener(onRuntimeMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage)
      window.removeEventListener("message", onWindowMessage)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [logger, processQueue, updateFromState])

  const canStart = useMemo(() => {
    const target = Number.parseInt(targetInput, 10)
    return Number.isFinite(target) && target > 0
  }, [targetInput])

  const startRun = async () => {
    if (!canStart) return

    const target = Number.parseInt(targetInput, 10)
    const delay = Number.parseInt(delayInput, 10)
    const nextDelay = Number.isFinite(delay) && delay >= 0 ? delay : 1000

    updateFromState({
      ...stateRef.current,
      runActive: true,
      targetCount: target,
      currentCount: 0,
      completedCount: 0,
      delayMs: nextDelay,
      waitingForCompletion: false
    })

    const result = await sendRuntimeMessage<RuntimeAckResponse>({
      type: MessageType.RunStart,
      targetCount: target,
      delayMs: nextDelay
    })
    if (!result.ok || !result.response?.ok) {
      logger.error("run start failed", result.error ?? result.response)
      return
    }

    // 运行开始时只清理瞬时状态，保持 cache 以支持列表已加载场景
    queueRef.current.resetForRun()
    queueRef.current.loadQueueFromCache()
    setPage3Captures(EMPTY_CAPTURES)
    setStatus("Running")
    logger.log("run start click", { target, delay: nextDelay })

    if (queueRef.current.hasItems()) {
      logger.log("queue loaded from cache", { count: queueRef.current.size() })
      void processQueue()
    } else {
      logger.warn("waiting for list request")
    }
  }

  const stopRun = async () => {
    const result = await sendRuntimeMessage<RuntimeAckResponse>({
      type: MessageType.RunStop
    })
    if (!result.ok || !result.response?.ok) {
      logger.error("run stop failed", result.error ?? result.response)
      return
    }

    setStatus("Stopped")
    isProcessingRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    logger.warn("run stop click")
  }

  if (!shouldRender) return null

  return (
    <DraggblePannel top={200} right={80} className="plasmo-px-3 plasmo-py-2">
      <div className="plasmo-text-sm plasmo-font-semibold plasmo-text-slate-800">
        Crawler
      </div>

      <div className="plasmo-mt-2 plasmo-text-xs plasmo-text-slate-600">Target</div>
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
        {(["contact", "detail"] as const).map((group) => {
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
