# av Browser Extension

Boilerplate for an agent-focused browser extension that can read open tabs,
authenticate with Auth0, call OpenRouter, and talk to a local Node.js tool server
over WebSockets.

## Project Shape

- `src/popup/` contains the React popup UI.
- `src/styles/` contains Tailwind CSS entry styles.
- `public/manifest.json` defines the Manifest V3 extension.
- `public/extension/background.js` coordinates auth, tab reading, OpenRouter calls, and tool calls.
- `public/extension/content-script.js` extracts readable text from tabs.
- `server/index.js` exposes local tools over `ws://localhost:8787`.
- `server/tools/` contains OS-backed tool definitions.

## Setup

```bash
npm install
```

The current extension config lives in `public/extension-config.js` so it is
copied into the built extension. Do not ship real secrets in this file for
production.

## Development

Run the popup in Vite:

```bash
npm run dev
```

Run the local tool server:

```bash
npm run tools
```

Build the extension:

```bash
npm run build
```

Then load the `dist/` folder as an unpacked extension in Chrome or Edge.

## Auth0 Notes

Use `chrome.identity.getRedirectURL()` as the allowed callback URL in Auth0.
For unpacked extensions, the URL looks like:

```text
https://<extension-id>.chromiumapp.org/
```

## Tool Contract

The popup sends messages to the background service worker. The background worker
can call local tools by sending JSON over WebSocket:

```json
{
  "id": "request-id",
  "tool": "system.info",
  "args": {}
}
```
