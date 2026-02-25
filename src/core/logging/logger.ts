import {
  MessageType,
  type LogLevel,
  type LogMessage,
  type LogSource
} from "~core/protocol/messages"

type Logger = {
  log: (message: string, data?: unknown) => void
  warn: (message: string, data?: unknown) => void
  error: (message: string, data?: unknown) => void
}

export const createRuntimeLogger = (source: LogSource): Logger => {
  const emit = (level: LogLevel, message: string, data?: unknown) => {
    const payload: LogMessage = {
      type: MessageType.Log,
      source,
      level,
      message,
      data
    }
    console[level](`[crawler][${source}]`, message, data ?? "")
    chrome.runtime.sendMessage(payload)
  }

  return {
    log: (message, data) => emit("log", message, data),
    warn: (message, data) => emit("warn", message, data),
    error: (message, data) => emit("error", message, data)
  }
}
