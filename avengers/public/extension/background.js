import { AUTH0, OPENROUTER, TOOL_SERVER_URL } from './extension-config.js'

let toolSocket
let pendingToolCalls = new Map()

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }))

  return true
})

async function handleMessage(message) {
  if (message.type === 'auth.login') {
    return loginWithAuth0()
  }

  if (message.type === 'tabs.read') {
    return { ok: true, tabs: await readTabs() }
  }

  if (message.type === 'dashboard.read') {
    return readDashboardTabs(message.query)
  }

  if (message.type === 'tools.ping') {
    return callToolServer({ tool: 'system.info', args: {} })
  }

  if (message.type === 'agent.run') {
    return runAgent(message.goal)
  }

  return { ok: false, error: `Unknown message type: ${message.type}` }
}

async function loginWithAuth0() {
  const redirectUri = chrome.identity.getRedirectURL()
  const authUrl = new URL(`https://${AUTH0.domain}/authorize`)

  authUrl.searchParams.set('client_id', AUTH0.clientId)
  authUrl.searchParams.set('response_type', 'token')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', 'openid profile email')
  authUrl.searchParams.set('audience', AUTH0.audience)

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.href,
    interactive: true,
  })

  const params = new URL(callbackUrl.replace('#', '?')).searchParams
  const accessToken = params.get('access_token')

  if (!accessToken) {
    throw new Error('Auth0 did not return an access token.')
  }

  await chrome.storage.local.set({ accessToken })
  return { ok: true }
}

async function readTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true })

  return Promise.all(
    tabs.map(async (tab) => {
      try {
        const page = await chrome.tabs.sendMessage(tab.id, { type: 'page.read' })
        return { id: tab.id, ...page }
      } catch {
        return { id: tab.id, title: tab.title, url: tab.url, text: '' }
      }
    }),
  )
}

async function readDashboardTabs(query = '') {
  const tabs = await readTabs()
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  const candidates = tabs.filter((tab) => {
    const haystack = `${tab.title ?? ''} ${tab.url ?? ''}`.toLowerCase()
    const dashboardSignals = ['dashboard', 'simulation', 'localhost', 'payment']

    return [...dashboardSignals, ...terms].some((term) => haystack.includes(term))
  })

  return {
    ok: true,
    tabs,
    candidates,
    activeContext: candidates[0] ?? tabs[0] ?? null,
  }
}

async function runAgent(goal) {
  const tabs = await readTabs()
  const { accessToken } = await chrome.storage.local.get('accessToken')

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': OPENROUTER.siteUrl,
      'X-Title': 'av',
    },
    body: JSON.stringify({
      model: OPENROUTER.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an internal browser workflow agent. Use supplied tab context from web applications, summarize what is visible, and propose careful next actions. Request local tools only when needed.',
        },
        {
          role: 'user',
          content: JSON.stringify({ goal, auth: Boolean(accessToken), tabs }),
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status}`)
  }

  const data = await response.json()
  return { ok: true, result: data.choices?.[0]?.message?.content ?? data }
}

function callToolServer(payload) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const socket = connectToolServer()

    pendingToolCalls.set(id, { resolve, reject })

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ id, ...payload }))
      return
    }

    socket.addEventListener(
      'open',
      () => socket.send(JSON.stringify({ id, ...payload })),
      { once: true },
    )
  })
}

function connectToolServer() {
  if (
    toolSocket?.readyState === WebSocket.OPEN ||
    toolSocket?.readyState === WebSocket.CONNECTING
  ) {
    return toolSocket
  }

  toolSocket = new WebSocket(TOOL_SERVER_URL)

  toolSocket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    const pending = pendingToolCalls.get(message.id)

    if (!pending) {
      return
    }

    pendingToolCalls.delete(message.id)
    if (message.ok) {
      pending.resolve(message)
    } else {
      pending.reject(new Error(message.error))
    }
  }

  toolSocket.onclose = () => {
    for (const pending of pendingToolCalls.values()) {
      pending.reject(new Error('Tool server disconnected.'))
    }
    pendingToolCalls = new Map()
  }

  return toolSocket
}
