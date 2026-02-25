import type { PlasmoCSConfig } from "plasmo"
import { useEffect } from "react"

import { injectScript } from "~lib/inject-script"
import { simulateClick } from "~lib/simulate-click"

export const config: PlasmoCSConfig = {
  matches: ["https://buyin.jinritemai.com/mpa/pigeonIM*"]
}

type CrawlerState = {
  runActive: boolean
}

type LogMessage = {
  type: "log"
  source: "page1" | "page2" | "page3" | "background"
  level: "log" | "warn" | "error"
  message: string
  data?: unknown
}

const INJECTED_SCRIPT_ID = "plasmo-fetch-hook"
const AUTO_CLICK_SELECTOR =
  "div.SideTabs_side_hsIdm.WorkStation_rightSide_eYMei > div:nth-child(1) > div:nth-child(1)"
const AUTO_CLICK_POLL_MS = 250
const AUTO_CLICK_TIMEOUT_MS = 5000
const ALLOWED_URL_SUBSTRINGS = [
  "/connection/pc/im/shop/contact",
  "/connection/pc/im/shop/detail"
]

const shouldCollectUrl = (url: string) => {
  return ALLOWED_URL_SUBSTRINGS.some((allowed) => url.includes(allowed))
}

const Page3Content = () => {
  useEffect(() => {
    if (!chrome?.runtime?.id) {
      return
    }

    const logToBackground = (
      level: LogMessage["level"],
      message: string,
      data?: unknown
    ) => {
      const payload: LogMessage = {
        type: "log",
        source: "page3",
        level,
        message,
        data
      }
      console[level]("[crawler][page3]", message, data ?? "")
      chrome.runtime.sendMessage(payload)
    }

    let cleanup = () => {}

    chrome.runtime.sendMessage({ type: "state/get" }, (response) => {
      const state: CrawlerState | undefined = response?.state
      if (!state?.runActive) {
        logToBackground("warn", "skip: run inactive")
        return
      }

      logToBackground("log", "page3 start")

      const found = {
        contact: false,
        detail: false
      }
      let completedSent = false

      const handler = (event: MessageEvent) => {
        if (event.source !== window) return

        const data = event.data
        if (!data || data.source !== INJECTED_SCRIPT_ID) return
        if (!shouldCollectUrl(data.url)) return

        if (data.url.includes("/connection/pc/im/shop/contact")) {
          found.contact = true
        }
        if (data.url.includes("/connection/pc/im/shop/detail")) {
          found.detail = true
        }

        if (!completedSent && found.contact && found.detail) {
          completedSent = true
          logToBackground("log", "requests matched, send completed")
          chrome.runtime.sendMessage({ type: "progress/completed" })
        }
      }

      window.addEventListener("message", handler)

      const scriptUrl = chrome.runtime.getURL("assets/fetch-hook.js")
      logToBackground("log", "inject script", { scriptUrl })

      const scheduleAutoClick = () => {
        const start = Date.now()
        const tryClick = () => {
          const target = document.querySelector(AUTO_CLICK_SELECTOR)
          if (target) {
            simulateClick({
              document,
              selector: AUTO_CLICK_SELECTOR
            })
            logToBackground("log", "auto click ok")
            return
          }
          if (Date.now() - start >= AUTO_CLICK_TIMEOUT_MS) {
            logToBackground("warn", "auto click timeout")
            return
          }
          window.setTimeout(tryClick, AUTO_CLICK_POLL_MS)
        }

        window.setTimeout(tryClick, 3000)
      }

      injectScript({
        elementId: INJECTED_SCRIPT_ID,
        src: scriptUrl,
        onLoad: () => {
          logToBackground("log", "script loaded")
          scheduleAutoClick()
        },
        onError: (event) => {
          logToBackground("error", "script load failed", String(event))
        }
      })

      const statusTimeout = window.setTimeout(() => {
        return
      }, 3000)

      cleanup = () => {
        window.removeEventListener("message", handler)
        window.clearTimeout(statusTimeout)
      }
    })

    return () => {
      cleanup()
    }
  }, [])

  return null
}

export default Page3Content
