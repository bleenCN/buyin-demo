import type { PlasmoCSConfig } from "plasmo"
import { useEffect } from "react"

import { createRuntimeLogger } from "~core/logging/logger"
import {
  MessageType,
  type RuntimeAckResponse,
  type RuntimeStateResponse
} from "~core/protocol/messages"
import { extractBuyinId } from "~domain/capture/parsers"
import { injectFetchHook } from "~services/injection/script-injector"
import { sendRuntimeMessage } from "~services/runtime/messenger"
import { simulateClick } from "~lib/simulate-click"

export const config: PlasmoCSConfig = {
  matches: [
    "https://buyin.jinritemai.com/dashboard/merch-picking-library/shop-detail*"
  ]
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
  const logger = createRuntimeLogger("page2")

  useEffect(() => {
    if (!chrome?.runtime?.id) return

    const openedBuyinIds = new Set<string>()
    let closeScheduled = false
    const clickGuardKey = "__crawler_page2_clicked__"

    const onWindowMessage = async (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== "plasmo-fetch-hook") return
      if (data.type !== "fetch" && data.type !== "xhr") return
      if (typeof data.url !== "string" || !data.url.includes(ACCOUNT_URL_SUBSTRING)) {
        return
      }

      const buyinId = extractBuyinId(data.body)
      if (!buyinId) {
        logger.warn("account hook matched but buyinId missing", { url: data.url })
        return
      }
      if (openedBuyinIds.has(buyinId)) {
        logger.log("skip duplicate buyinId", { buyinId })
        return
      }
      openedBuyinIds.add(buyinId)

      const page3Url = `${PAGE3_BASE_URL}?buyinId=${encodeURIComponent(buyinId)}`
      const openResult = await sendRuntimeMessage<RuntimeAckResponse>({
        type: MessageType.OpenUrl,
        url: page3Url
      })
      if (!openResult.ok || !openResult.response?.ok) {
        logger.error("open page3 failed", {
          error: openResult.error ?? openResult.response,
          buyinId
        })
        return
      }

      logger.log("opened page3 with buyinId", { buyinId })
      if (!closeScheduled) {
        closeScheduled = true
        void sendRuntimeMessage<RuntimeAckResponse>({
          type: MessageType.TabCloseSelf,
          delayMs: AUTO_CLOSE_DELAY_MS
        })
        logger.log("page2 will close in 3s")
      }
    }

    void sendRuntimeMessage<RuntimeStateResponse>({ type: MessageType.StateGet }).then(
      async (result) => {
        if (!result.ok || !result.response?.state) {
          logger.error("state get failed", result.error)
          return
        }
        if (!result.response.state.runActive) {
          logger.warn("skip page2 hook: run inactive")
          return
        }

        if ((window as unknown as Record<string, boolean>)[clickGuardKey]) {
          logger.warn("skip click: already clicked in this tab")
          return
        }

        // 关键业务：先触发页面原生按钮，再监听账户请求拿 buyinId
        const target = await waitForSelector(PAGE2_CLICK_SELECTOR, CLICK_TIMEOUT_MS)
        if (!target) {
          logger.warn("page2 button selector not found", {
            selector: PAGE2_CLICK_SELECTOR
          })
          return
        }

        const enabled = await waitForEnabled(target, ENABLED_TIMEOUT_MS)
        if (!enabled) {
          logger.warn("page2 button still disabled", {
            selector: PAGE2_CLICK_SELECTOR
          })
          return
        }

        try {
          ;(window as unknown as Record<string, boolean>)[clickGuardKey] = true
          if (target instanceof HTMLElement) {
            target.scrollIntoView({ block: "center" })
            target.click()
            logger.log("page2 element.click() fired")
          }
          simulateClick({ document, selector: PAGE2_CLICK_SELECTOR })
          logger.log("page2 button clicked")
        } catch (error) {
          ;(window as unknown as Record<string, boolean>)[clickGuardKey] = false
          logger.error("page2 click failed", String(error))
        }

        injectFetchHook({
          elementId: INJECTED_SCRIPT_ID,
          onLoad: () => logger.log("page2 hook injected"),
          onError: (event) => logger.error("page2 hook inject failed", String(event))
        })
        window.addEventListener("message", onWindowMessage)
        logger.log("page2 account listener ready")
      }
    )

    return () => {
      window.removeEventListener("message", onWindowMessage)
    }
  }, [logger])

  return null
}

export default Page2Content
