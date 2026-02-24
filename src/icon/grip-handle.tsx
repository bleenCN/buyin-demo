import React from "react"

export const GripHandleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    width="1em"
    height="1em"
    {...props}
  >
    <circle stroke="currentColor" cx="6" cy="9" r="1" />
    <circle stroke="currentColor" cx="12" cy="9" r="1" />
    <circle stroke="currentColor" cx="18" cy="9" r="1" />
    <circle stroke="currentColor" cx="6" cy="15" r="1" />
    <circle stroke="currentColor" cx="12" cy="15" r="1" />
    <circle stroke="currentColor" cx="18" cy="15" r="1" />
  </svg>
)