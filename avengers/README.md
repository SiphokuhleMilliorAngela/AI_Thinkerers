# av Browser Extension

Boilerplate for an agent-focused browser side-panel extension that can read
internal web application tabs, call OpenRouter, and talk to a local Node.js tool
server over WebSockets. Auth0 is scaffolded in config but disabled in the active
runtime while OpenRouter is being tested.

## Project Shape

- `src/popup/` contains the React popup UI.
- `src/styles/` contains Tailwind CSS entry styles.
- `public/manifest.json` defines the Manifest V3 side panel extension.
- `public/extension/background.js` coordinates auth, tab reading, OpenRouter calls, and tool calls.
- `public/extension/content-script.js` extracts readable text from tabs.
- `server/index.js` exposes local tools over `ws://localhost:8787`.
- `server/tools/` contains OS-backed tool definitions.

## Internal Tool Ideas

- Read the active dashboard simulation tab and summarize the visible workflow state.
- Compare values across dashboard pages the analyst has open in the same browser window.
- Draft review notes from the current tab context.
- Open a local tool request for system metadata or future internal APIs.
- Keep Auth0 as the gate before exposing analyst actions or protected workflows.

## Setup

```bash
npm install
```

The current extension config lives in `public/extension/extension-config.js` so it is
copied into the built extension. Do not ship real secrets in this file for
production.

For local OpenRouter testing, create `.env.local`:

```bash
VITE_OPENROUTER_API_KEY=OPENROUTER_KEY_HERE
```

`npm run build` reads that environment file and generates
`public/extension/extension-secrets.local.js`. Both files are ignored by Git.

The OpenRouter request is plain JavaScript in `public/extension/background.js`
and uses this config shape:

```js
export const OPENROUTER = {
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: 'YOUR_OPENROUTER_API_KEY',
  model: 'openai/gpt-4o',
  maxCompletionTokens: 800,
  maxTabs: 4,
  maxTabTextCharacters: 2500,
  siteUrl: 'http://localhost:5173',
  siteName: 'av',
}
```

Those limits keep local dashboard-review requests well below large-context
defaults while you are testing with limited credits.

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

Auth0 is currently disabled for local OpenRouter testing. Re-enable the
`identity` and `storage` permissions in `public/manifest.json`, restore the
login flow in `public/extension/background.js`, and wire the sign-in controls
back into the side panel when authentication is needed again.

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
