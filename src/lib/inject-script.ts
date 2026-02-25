type InjectScriptOptions = {
  elementId: string
  src: string
  onLoad?: (script: HTMLScriptElement) => void
  onError?: (event: Event) => void
}

const isAbsoluteUrl = (url: string): boolean => {
  return /^(https?:|chrome-extension:|moz-extension:|data:)/.test(url)
}

const resolveScriptSrc = (src: string): string => {
  if (isAbsoluteUrl(src)) return src
  if (chrome?.runtime?.getURL) {
    return chrome.runtime.getURL(src)
  }
  return src
}

export const injectScript = ({
  elementId,
  src,
  onLoad,
  onError
}: InjectScriptOptions): boolean => {
  if (document.getElementById(elementId)) return false

  const script = document.createElement("script")
  script.id = elementId
  script.src = resolveScriptSrc(src)
  script.async = false
  if (onLoad) {
    script.addEventListener("load", () => onLoad(script), { once: true })
  }
  if (onError) {
    script.addEventListener("error", (event) => onError(event), { once: true })
  }

  ;(document.head || document.documentElement).appendChild(script)

  return true
}
