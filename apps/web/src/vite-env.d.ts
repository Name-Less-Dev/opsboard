/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço da API no deploy com domínios separados (ex.: https://opsboard-api.onrender.com). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
