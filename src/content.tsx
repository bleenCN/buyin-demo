import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useMemo, useState } from "react"

import { CountButton } from "~features/count-button"
import { injectScript } from "~lib/inject-script"
import { DraggblePannel } from "~ui/draggble-pannel"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

/**
 * 生成一个经过调整的 style 元素，使 CSS 能够在 Shadow DOM 中正确工作。
 *
 * Tailwind CSS 依赖于 `rem` 单位，这通常基于根元素（通常是 <html> 或 <body>）的字体大小。
 * 然而，在 Plasmo 使用的 Shadow DOM 中没有本地的根元素，因此 rem 的值会引用当前页面的根字体大小，
 * 这通常会导致样式大小不一致的问题。
 *
 * 为了解决这个问题，我们采取了以下措施：
 * 1. 将 `:root` 选择器替换为 `:host(plasmo-csui)`，以便样式正确地限定在 Shadow DOM 内部。
 * 2. 将所有的 `rem` 单位根据固定的基准字体大小转换为像素值，从而确保无论宿主页面字体大小如何，都能实现一致的样式效果。
 */
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


type HookRecord = {
  id: string
  type: "xhr" | "fetch"
  url: string
  method: string
  status: number
  body: unknown
  time: number
}

const MAX_RECORDS = 50
const INJECTED_SCRIPT_ID = "plasmo-fetch-hook"

const PlasmoOverlay = () => {
  const [records, setRecords] = useState<HookRecord[]>([])

  useEffect(() => {
    console.log("[plasmo-fetch-hook] content init")
    if (!chrome?.runtime?.id) {
      console.warn("[plasmo-fetch-hook] no runtime id; skip injection")
      return
    }
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return

      const data = event.data
      if (!data || data.source !== INJECTED_SCRIPT_ID) return

      if (data.type === "status") {
        console.log(
          "[plasmo-fetch-hook] status",
          data.phase,
          data.detail || ""
        )
      } else {
        console.log("[plasmo-fetch-hook] message received", data.type, data.url)
      }
      setRecords((prev) => {
        const next: HookRecord[] = [
          {
            id: `${data.time}-${Math.random().toString(16).slice(2)}`,
            type: data.type,
            url: data.url,
            method: data.method,
            status: data.status,
            body: data.body,
            time: data.time
          },
          ...prev
        ]

        return next.slice(0, MAX_RECORDS)
      })
    }

    window.addEventListener("message", handler)
    console.log("[plasmo-fetch-hook] listener attached")
    const scriptUrl = chrome.runtime.getURL("assets/fetch-hook.js")
    const injected = injectScript({
      elementId: INJECTED_SCRIPT_ID,
      src: scriptUrl,
      onLoad: () => {
        console.log("[plasmo-fetch-hook] script loaded")
      },
      onError: (event) => {
        console.error("[plasmo-fetch-hook] script load failed", event)
      }
  })
    if (injected) {
      console.log("[plasmo-fetch-hook] inject script", scriptUrl)
      console.log("[plasmo-fetch-hook] script injected")
    }
    
    const statusTimeout = window.setTimeout(() => {
      console.warn("[plasmo-fetch-hook] no status or requests after 3s")
    }, 3000)

    return () => {
      window.removeEventListener("message", handler)
      window.clearTimeout(statusTimeout)
      console.log("[plasmo-fetch-hook] listener removed")
    }
  }, [])

  const renderBody = useMemo(() => {
    return (body: unknown) => {
      if (body === null || body === undefined) return ""
      if (typeof body === "string") {
        return body.length > 1200 ? `${body.slice(0, 1200)}…` : body
      }

      try {
        const text = JSON.stringify(body)
        return text.length > 1200 ? `${text.slice(0, 1200)}…` : text
      } catch {
        return String(body)
      }
    }
  }, [])

  return (
    <DraggblePannel top={200} right={80}>
      <CountButton />
      <div className="plasmo-mt-3 plasmo-w-80 plasmo-max-h-96 plasmo-overflow-auto plasmo-space-y-2 plasmo-text-xs">
        {records.length === 0 ? (
          <div className="plasmo-text-slate-500">
            No matching requests yet.
          </div>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="plasmo-rounded-md plasmo-border plasmo-border-slate-200 plasmo-bg-white plasmo-p-2 plasmo-shadow-sm">
              <div className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-text-[11px] plasmo-text-slate-600">
                <span className="plasmo-font-semibold">
                  {record.method} {record.status}
                </span>
                <span>{new Date(record.time).toLocaleTimeString()}</span>
              </div>
              <div className="plasmo-mt-1 plasmo-break-all plasmo-text-slate-800">
                {record.url}
              </div>
              {record.body ? (
                <pre className="plasmo-mt-1 plasmo-max-h-40 plasmo-overflow-auto plasmo-whitespace-pre-wrap plasmo-text-[11px] plasmo-text-slate-700">
                  {renderBody(record.body)}
                </pre>
              ) : null}
            </div>
          ))
        )}
      </div>
    </DraggblePannel>
  )
}

export default PlasmoOverlay
