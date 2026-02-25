import type { PlasmoCSConfig } from "plasmo"
import { useEffect } from "react"

import { injectScript } from "~lib/inject-script"
import { simulateClick } from "~lib/simulate-click"

export const config: PlasmoCSConfig = {
  matches: [
    "https://buyin.jinritemai.com/dashboard/merch-picking-library/shop-detail*"
  ]
}

type LogMessage = {
  type: "log"
  source: "page1" | "page2" | "page3" | "background"
  level: "log" | "warn" | "error"
  message: string
  data?: unknown
}

const INJECTED_SCRIPT_ID = "plasmo-page2-fetch-hook"
const ACCOUNT_URL_SUBSTRING = "/connection/pc/im/account"
const PAGE3_BASE_URL = "https://buyin.jinritemai.com/mpa/pigeonIM"
const PAGE2_CLICK_SELECTOR =
  "div.index_module__basicAction____8ec2 > div:nth-child(2) > button"
const CLICK_POLL_MS = 250
const CLICK_TIMEOUT_MS = 5000
const ENABLED_TIMEOUT_MS = 8000
const AUTO_CLOSE_DELAY_MS = 3000

const extractBuyinId = (body: unknown): string | null => {
  if (!body || typeof body !== "object") return null
  const parsed = body as { data?: { buyin_account_id?: string | number } }
  const buyinId = parsed.data?.buyin_account_id
  if (buyinId === undefined || buyinId === null) return null
  return String(buyinId)
}

const waitForSelector = (selector: string, timeoutMs: number) => {
  const start = Date.now()
  return new Promise<Element | null>((resolve) => {
    const tryFind = () => {
      const target = document.querySelector(selector)
      if (target) {
        resolve(target)
        return
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null)
        return
      }
      window.setTimeout(tryFind, CLICK_POLL_MS)
    }
    tryFind()
  })
}

const waitForEnabled = (target: Element, timeoutMs: number) => {
  const start = Date.now()
  return new Promise<boolean>((resolve) => {
    const tryCheck = () => {
      const button = target as HTMLButtonElement
      const ariaDisabled = target.getAttribute("aria-disabled") === "true"
      const disabled =
        "disabled" in button ? Boolean(button.disabled) : ariaDisabled
      if (!disabled && !ariaDisabled) {
        resolve(true)
        return
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false)
        return
      }
      window.setTimeout(tryCheck, CLICK_POLL_MS)
    }
    tryCheck()
  })
}

const Page2Content = () => {
  useEffect(() => {
    if (!chrome?.runtime?.id) return

    const logToBackground = (
      level: LogMessage["level"],
      message: string,
      data?: unknown
    ) => {
      const payload: LogMessage = {
        type: "log",
        source: "page2",
        level,
        message,
        data
      }
      console[level]("[crawler][page2]", message, data ?? "")
      chrome.runtime.sendMessage(payload)
    }

    const openedBuyinIds = new Set<string>()
    let closeScheduled = false
    const clickGuardKey = "__crawler_page2_clicked__"

    const onWindowMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== "plasmo-fetch-hook") return
      if (data.type !== "fetch" && data.type !== "xhr") return
      if (typeof data.url !== "string" || !data.url.includes(ACCOUNT_URL_SUBSTRING)) {
        return
      }

      const buyinId = extractBuyinId(data.body)
      if (!buyinId) {
        logToBackground("warn", "account hook matched but buyinId missing", {
          url: data.url
        })
        return
      }
      if (openedBuyinIds.has(buyinId)) {
        logToBackground("log", "skip duplicate buyinId", { buyinId })
        return
      }
      openedBuyinIds.add(buyinId)
      const url = `${PAGE3_BASE_URL}?buyinId=${encodeURIComponent(buyinId)}`
      chrome.runtime.sendMessage({ type: "page1/open-page2", url }, (response) => {
        if (chrome.runtime.lastError) {
          logToBackground("error", "open page3 failed", {
            error: chrome.runtime.lastError.message,
            buyinId
          })
          return
        }
        if (!response?.ok) {
          logToBackground("warn", "open page3 response not ok", response)
          return
        }
        logToBackground("log", "opened page3 with buyinId", { buyinId })
        if (!closeScheduled) {
          closeScheduled = true
          chrome.runtime.sendMessage({
            type: "tab/close-self",
            delayMs: AUTO_CLOSE_DELAY_MS
          })
          logToBackground("log", "page2 will close in 3s")
        }
      })
    }

    chrome.runtime.sendMessage({ type: "state/get" }, (response) => {
      if (chrome.runtime.lastError) {
        logToBackground("error", "state get failed", {
          error: chrome.runtime.lastError.message
        })
        return
      }
      if (!response?.state?.runActive) {
        logToBackground("warn", "skip page2 hook: run inactive")
        return
      }

      if ((window as unknown as Record<string, boolean>)[clickGuardKey]) {
        logToBackground("warn", "skip click: already clicked in this tab")
        return
      }

      ;(async () => {
        const target = await waitForSelector(PAGE2_CLICK_SELECTOR, CLICK_TIMEOUT_MS)
        if (!target) {
          logToBackground("warn", "page2 button selector not found", {
            selector: PAGE2_CLICK_SELECTOR
          })
          return
        }

        const enabled = await waitForEnabled(target, ENABLED_TIMEOUT_MS)
        if (!enabled) {
          logToBackground("warn", "page2 button still disabled", {
            selector: PAGE2_CLICK_SELECTOR
          })
          return
        }

        try {
          ;(window as unknown as Record<string, boolean>)[clickGuardKey] = true
          if (target instanceof HTMLElement) {
            target.scrollIntoView({ block: "center" })
            target.click()
            logToBackground("log", "page2 element.click() fired")
          }
          simulateClick({ document, selector: PAGE2_CLICK_SELECTOR })
          logToBackground("log", "page2 button clicked")
        } catch (error) {
          ;(window as unknown as Record<string, boolean>)[clickGuardKey] = false
          logToBackground("error", "page2 click failed", String(error))
        }
      })()

      const scriptUrl = chrome.runtime.getURL("assets/fetch-hook.js")
      injectScript({
        elementId: INJECTED_SCRIPT_ID,
        src: scriptUrl,
        onLoad: () => {
          logToBackground("log", "page2 hook injected")
        },
        onError: (event) => {
          logToBackground("error", "page2 hook inject failed", String(event))
        }
      })
      window.addEventListener("message", onWindowMessage)
      logToBackground("log", "page2 account listener ready")
    })

    return () => {
      window.removeEventListener("message", onWindowMessage)
    }
  }, [])

  return null
}

export default Page2Content
