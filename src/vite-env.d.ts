/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_COUNTDOWN_SECONDS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
