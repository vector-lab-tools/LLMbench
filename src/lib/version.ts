// Single source of truth for version display in the UI.
// The canonical version lives in package.json; this re-exports it
// so components never hardcode the string.

// Next.js will inline this at build time via the next.config bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const APP_VERSION: string = require("../../package.json").version;
