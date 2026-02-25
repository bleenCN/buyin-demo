import React, { useRef, useState, useEffect, useLayoutEffect } from "react"
import { GripHandleIcon } from "~icon/grip-handle"

type DraggblePannelProps = React.HTMLAttributes<HTMLDivElement> & {
  top?: number
  left?: number
  right?: number
  bottom?: number
}

export const DraggblePannel: React.FC<DraggblePannelProps> = ({
  children,
  className,
  style,
  top,
  left,
  right,
  bottom,
  ...rest
}) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [position, setPosition] = useState<{ x?: number; y?: number; left?: number; top?: number; right?: number; bottom?: number }>({})

  // 初始化定位
  useLayoutEffect(() => {
    setPosition(pos => {
      let next: typeof pos = {}
      // 优先级：left/right与top/bottom可以混用
      if (typeof left === "number") next.left = left
      if (typeof right === "number") next.right = right
      if (typeof top === "number") next.top = top
      if (typeof bottom === "number") next.bottom = bottom
      // 如果用户没设置，默认赋值左上角
      if (
        typeof left !== "number" &&
        typeof right !== "number"
      )
        next.left = 0
      if (
        typeof top !== "number" &&
        typeof bottom !== "number"
      )
        next.top = 0
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 鼠标按下开始拖拽
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    if (!panel) return

    setDragging(true)
    // 这里只取当前渲染位置的 left/top
    const rect = panel.getBoundingClientRect()
    setOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    // 防止拖拽时选中文字
    document.body.style.userSelect = "none"
  }

  // 拖拽
  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging) return

    // 移动时采用 left/top 方案，忽略 right/bottom（即拖动后永远由left/top确定）
    setPosition({
      left: Math.max(0, e.clientX - offset.x),
      top: Math.max(0, e.clientY - offset.y)
    })
  }

  // 结束拖拽
  const handleMouseUp = () => {
    setDragging(false)
    document.body.style.userSelect = ""
  }

  useEffect(() => {
    if (dragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    } else {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, offset])

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        right: position.right,
        bottom: position.bottom,
        opacity: dragging ? 0.8 : 1,
        zIndex: 10000,
        ...style
      }}
      className={`plasmo-bg-gray-50 plasmo-shadow-lg plasmo-rounded-md plasmo-border plasmo-border-gray-200 plasmo-w-fit${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {/* Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="plasmo-cursor-move plasmo-flex plasmo-justify-center plasmo-items-center plasmo-h-6 plasmo-select-none"
        style={{ width: "100%" }}
      >
        <GripHandleIcon className="plasmo-size-4" />
      </div>
      <div className="plasmo-mt-2" onMouseDown={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}