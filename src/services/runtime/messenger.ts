type MessageResult<T> = {
  ok: boolean
  response?: T
  error?: string
}

export const sendRuntimeMessage = <T = unknown>(
  message: unknown
): Promise<MessageResult<T>> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message
        })
        return
      }
      resolve({
        ok: true,
        response: response as T
      })
    })
  })
}
