import type { PlasmoCSConfig } from "plasmo"
import { useEffect } from "react"

import { createRuntimeLogger } from "~core/logging/logger"
import {
  MessageType,
  type Page3CaptureMessage,
  type RuntimeAckResponse,
  type RuntimeStateResponse
} from "~core/protocol/messages"
import { injectFetchHook } from "~services/injection/script-injector"
import { sendRuntimeMessage } from "~services/runtime/messenger"
import { simulateClick } from "~lib/simulate-click"

export const config: PlasmoCSConfig = {
  matches: ["https://buyin.jinritemai.com/mpa/pigeonIM*"]
}

const INJECTED_SCRIPT_ID = "plasmo-fetch-hook"
const AUTO_CLICK_SELECTOR =
  "div.SideTabs_side_hsIdm.WorkStation_rightSide_eYMei > div:nth-child(1) > div:nth-child(1)"
const AUTO_CLICK_POLL_MS = 250
const AUTO_CLICK_TIMEOUT_MS = 5000
const AUTO_CLOSE_DELAY_MS = 3000
const ALLOWED_URL_SUBSTRINGS = [
  "/connection/pc/im/shop/contact",
  "/connection/pc/im/shop/detail"
]

const shouldCollectUrl = (url: string) => {
  return ALLOWED_URL_SUBSTRINGS.some((allowed) => url.includes(allowed))
}

const Page3Content = () => {
  const logger = createRuntimeLogger("page3")

  useEffect(() => {
    if (!chrome?.runtime?.id) return

    let cleanup = () => {}

    void sendRuntimeMessage<RuntimeStateResponse>({ type: MessageType.StateGet }).then(
      async (result) => {
        if (!result.ok || !result.response?.state) {
          logger.error("state get failed", result.error)
          return
        }
        if (!result.response.state.runActive) {
          logger.warn("skip: run inactive")
          return
        }

        logger.log("page3 start")
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

          const captureMessage: Page3CaptureMessage = {
            type: MessageType.Page3Capture,
            payload: {
              requestType: data.type === "xhr" ? "xhr" : "fetch",
              url: data.url,
              method: typeof data.method === "string" ? data.method : "GET",
              status: typeof data.status === "number" ? data.status : 0,
              body: data.body,
              time: typeof data.time === "number" ? data.time : Date.now()
            }
          }
          void sendRuntimeMessage<RuntimeAckResponse>(captureMessage)

          if (data.url.includes("/connection/pc/im/shop/contact")) {
            found.contact = true
          }
          if (data.url.includes("/connection/pc/im/shop/detail")) {
            found.detail = true
          }

          // 关键完成条件：两个接口都捕获到才算完成
          if (!completedSent && found.contact && found.detail) {
            completedSent = true
            logger.log("requests matched, send completed")
            void sendRuntimeMessage<RuntimeAckResponse>({
              type: MessageType.ProgressCompleted
            })
            void sendRuntimeMessage<RuntimeAckResponse>({
              type: MessageType.TabCloseSelf,
              delayMs: AUTO_CLOSE_DELAY_MS
            })
            logger.log("page3 will close in 3s")
          }
        }

        window.addEventListener("message", handler)
        injectFetchHook({
          elementId: INJECTED_SCRIPT_ID,
          onLoad: () => {
            logger.log("script loaded")
            const start = Date.now()
            const tryClick = () => {
              const target = document.querySelector(AUTO_CLICK_SELECTOR)
              if (target) {
                simulateClick({ document, selector: AUTO_CLICK_SELECTOR })
                logger.log("auto click ok")
                return
              }
              if (Date.now() - start >= AUTO_CLICK_TIMEOUT_MS) {
                logger.warn("auto click timeout")
                return
              }
              window.setTimeout(tryClick, AUTO_CLICK_POLL_MS)
            }
            window.setTimeout(tryClick, 3000)
          },
          onError: (event) => logger.error("script load failed", String(event))
        })

        cleanup = () => {
          window.removeEventListener("message", handler)
        }
      }
    )

    return () => cleanup()
  }, [logger])

  return null
}

export default Page3Content
