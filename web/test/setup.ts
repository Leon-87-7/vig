import '@testing-library/jest-dom'
import { createElement, type SVGProps } from 'react'
import { vi } from 'vitest'

vi.mock('@/app/ownix-logo.svg', () => ({
  default: (props: SVGProps<SVGSVGElement>) => createElement('svg', props),
}))

// jsdom lacks ResizeObserver, which Radix popper-positioned content (e.g. Tooltip) needs.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
