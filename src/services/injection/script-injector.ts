import { injectScript } from "~lib/inject-script"

type InjectFetchHookOptions = {
  elementId: string
  onLoad?: () => void
  onError?: (event: Event) => void
}

export const injectFetchHook = ({
  elementId,
  onLoad,
  onError
}: InjectFetchHookOptions): boolean => {
  const scriptUrl = chrome.runtime.getURL("assets/fetch-hook.js")
  return injectScript({
    elementId,
    src: scriptUrl,
    onLoad: () => onLoad?.(),
    onError
  })
}
