/// <reference types="vite/client" />

import type { PlannerApi } from '../shared/ipc'

declare global {
  interface Window {
    /** Typed IPC bridge exposed by electron/preload.ts. Absent in a plain browser tab. */
    planner?: PlannerApi
  }
}

export {}
