/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. https://api.eventify.co. Empty = same origin. */
  readonly VITE_API_URL?: string;
  /** "off" disables the mock API (MSW). On by default until the backend exists. */
  readonly VITE_API_MOCKS?: string;
}
