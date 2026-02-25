(() => {
  try {
    console.log("[plasmo-fetch-hook] init")

    const postMessage = (payload) => {
      console.log("[plasmo-fetch-hook] postMessage", payload.type, payload.url)
      window.postMessage(
        {
          source: "plasmo-fetch-hook",
          time: Date.now(),
          ...payload
        },
        "*"
      )
    }

    const tryParseJson = (text) => {
      if (typeof text !== "string") return text
      try {
        console.log("[plasmo-fetch-hook] parse json")
        return JSON.parse(text)
      } catch {
        console.log("[plasmo-fetch-hook] parse json failed, fallback to text")
        return text
      }
    }

    const hookXhr = () => {
      try {
        console.log("[plasmo-fetch-hook] install xhr hook")
        const oldOpen = XMLHttpRequest.prototype.open
        const oldSend = XMLHttpRequest.prototype.send

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
          console.log("[plasmo-fetch-hook] xhr open", method, url)
          this.__ext_url = url
          this.__ext_method = method
          return oldOpen.call(this, method, url, ...rest)
        }

        XMLHttpRequest.prototype.send = function (body) {
          console.log(
            "[plasmo-fetch-hook] xhr send",
            this.__ext_method,
            this.__ext_url
          )
          this.addEventListener("load", () => {
            try {
              const url = this.__ext_url || ""
              let text = null

              if (!this.responseType || this.responseType === "text") {
                text = this.responseText
              } else if (this.responseType === "json") {
                text = JSON.stringify(this.response)
              } else if (this.responseType === "") {
                text = this.responseText
              }

              postMessage({
                type: "xhr",
                url,
                method: this.__ext_method || "GET",
                status: this.status,
                body: tryParseJson(text)
              })
            } catch (error) {
              console.log("[plasmo-fetch-hook] xhr error", error)
              postMessage({
                type: "status",
                phase: "xhr-error",
                detail: String(error)
              })
              return
            }
          })

          return oldSend.call(this, body)
        }

        postMessage({ type: "status", phase: "xhr-hooked" })
      } catch (error) {
        console.log("[plasmo-fetch-hook] xhr hook failed", error)
        postMessage({
          type: "status",
          phase: "xhr-hook-failed",
          detail: String(error)
        })
      }
    }

    const hookFetch = () => {
      if (!window.fetch) {
        postMessage({ type: "status", phase: "fetch-missing" })
        return
      }

      try {
        console.log("[plasmo-fetch-hook] install fetch hook")
        const oldFetch = window.fetch

        window.fetch = async (...args) => {
          console.log("[plasmo-fetch-hook] fetch start")
          const response = await oldFetch(...args)

          try {
            const input = args[0]
            const init = args[1] || {}
            const url =
              typeof input === "string"
                ? input
                : input && input.url
                  ? input.url
                  : ""
            const method =
              init.method || (input && input.method ? input.method : "GET")

            const cloned = response.clone()
            let text = null

            try {
              text = await cloned.text()
            } catch {
              text = null
            }

            postMessage({
              type: "fetch",
              url,
              method,
              status: response.status,
              body: tryParseJson(text)
            })
          } catch (error) {
            console.log("[plasmo-fetch-hook] fetch error", error)
            postMessage({
              type: "status",
              phase: "fetch-error",
              detail: String(error)
            })
            return response
          }

          return response
        }

        postMessage({ type: "status", phase: "fetch-hooked" })
      } catch (error) {
        console.log("[plasmo-fetch-hook] fetch hook failed", error)
        postMessage({
          type: "status",
          phase: "fetch-hook-failed",
          detail: String(error)
        })
      }
    }

    hookXhr()
    hookFetch()
    console.log("[plasmo-fetch-hook] ready")
    postMessage({ type: "status", phase: "ready" })
  } catch (error) {
    try {
      console.error("[plasmo-fetch-hook] fatal error", error)
      window.postMessage(
        {
          source: "plasmo-fetch-hook",
          time: Date.now(),
          type: "status",
          phase: "fatal-error",
          detail: String(error)
        },
        "*"
      )
    } catch {
      return
    }
  }
})()
