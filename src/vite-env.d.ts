/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOUDIZHU_WS_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
