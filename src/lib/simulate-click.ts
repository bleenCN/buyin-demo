type SimulateClickOptions = {
  document: Document
  selector: string
}

const dispatchMouseEvent = (
  target: Element,
  type: string,
  view: Window | null
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view,
    button: 0,
    buttons: 1
  })
  target.dispatchEvent(event)
}

const dispatchPointerEvent = (
  target: Element,
  type: string,
  view: Window | null
) => {
  if (typeof PointerEvent !== "function") return
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    view,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: 1
  })
  target.dispatchEvent(event)
}

export const simulateClick = ({ document, selector }: SimulateClickOptions) => {
  const target = document.querySelector(selector)
  if (!target) {
    throw new Error(`simulateClick: target not found for selector "${selector}"`)
  }

  const view = document.defaultView

  if (target instanceof HTMLElement) {
    target.focus()
  }

  dispatchPointerEvent(target, "pointerdown", view)
  dispatchMouseEvent(target, "mousedown", view)
  dispatchPointerEvent(target, "pointerup", view)
  dispatchMouseEvent(target, "mouseup", view)
  dispatchMouseEvent(target, "click", view)
}
