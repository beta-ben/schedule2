/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SCHEDULE_API_PREFIX?: string
  // Escape hatch: when set, client short-circuits API calls (see api.ts)
  readonly VITE_DISABLE_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
