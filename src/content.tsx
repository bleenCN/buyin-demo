import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"

import { CountButton } from "~features/count-button"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

/**
 * 生成一个经过调整的 style 元素，使 CSS 能够在 Shadow DOM 中正确工作。
 *
 * Tailwind CSS 依赖于 `rem` 单位，这通常基于根元素（通常是 <html> 或 <body>）的字体大小。
 * 然而，在 Plasmo 使用的 Shadow DOM 中没有本地的根元素，因此 rem 的值会引用当前页面的根字体大小，
 * 这通常会导致样式大小不一致的问题。
 *
 * 为了解决这个问题，我们采取了以下措施：
 * 1. 将 `:root` 选择器替换为 `:host(plasmo-csui)`，以便样式正确地限定在 Shadow DOM 内部。
 * 2. 将所有的 `rem` 单位根据固定的基准字体大小转换为像素值，从而确保无论宿主页面字体大小如何，都能实现一致的样式效果。
 */
export const getStyle = (): HTMLStyleElement => {
  const baseFontSize = 16

  let updatedCssText = cssText.replaceAll(":root", ":host(plasmo-csui)")
  const remRegex = /([\d.]+)rem/g
  updatedCssText = updatedCssText.replace(remRegex, (match, remValue) => {
    const pixelsValue = parseFloat(remValue) * baseFontSize

    return `${pixelsValue}px`
  })

  const styleElement = document.createElement("style")

  styleElement.textContent = updatedCssText

  return styleElement
}

const PlasmoOverlay = () => {
  return (
    <div className="plasmo-z-50 plasmo-flex plasmo-fixed plasmo-top-32 plasmo-right-8">
      <CountButton />
    </div>
  )
}

export default PlasmoOverlay
