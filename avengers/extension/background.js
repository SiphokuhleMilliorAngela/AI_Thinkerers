const API_BASE = 'http://127.0.0.1:8787'
const DASHBOARD_URL = 'http://127.0.0.1:5173'
const SESSION_KEY = 'avvaSession'
const PENDING_KEY = 'avvaPendingConnection'

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)
})

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }))
  return true
})

async function handleMessage(message) {
  switch (message?.type) {
    case 'system.health':
      return checkHealth()
    case 'auth.start':
      return startConnection()
    case 'auth.status':
      return checkConnectionStatus()
    case 'auth.pending':
      return getPendingConnection()
    case 'auth.me':
      return getCurrentUser()
    case 'auth.logout':
      return logout()
    case 'auth.cancel':
      await chrome.storage.local.remove(PENDING_KEY)
      return { ok: true, state: 'idle' }
    case 'context.read':
      return readDashboardContext()
    case 'agent.context':
      return getAgentContext(message.transactionId)
    case 'dashboard.open':
      await chrome.tabs.create({ url: DASHBOARD_URL })
      return { ok: true }
    case 'dashboard.openApproval': {
      const pending = await getStored(PENDING_KEY)
      if (!pending?.verificationUri) throw new Error('Start a new dashboard connection first.')
      await chrome.tabs.create({ url: pending.verificationUri })
      return { ok: true }
    }
    default:
      throw new Error('Unsupported AVVA extension request.')
  }
}

async function checkHealth() {
  try {
    const result = await api('/health')
    return { ok: true, online: result.ok === true, dashboardUrl: result.dashboardUrl }
  } catch (error) {
    return { ok: true, online: false, error: error.message }
  }
}

async function startConnection() {
  const result = await api('/api/auth/device/start', {
    method: 'POST',
    body: {
      deviceName: 'AVVA Chrome Extension',
      browser: getBrowserName(),
    },
  })

  const pending = {
    deviceCode: result.deviceCode,
    userCode: result.userCode,
    verificationUri: result.verificationUri,
    interval: result.interval,
    expiresAt: Date.now() + result.expiresIn * 1000,
  }

  await chrome.storage.local.set({ [PENDING_KEY]: pending })
  await chrome.tabs.create({ url: result.verificationUri, active: true })

  return { ok: true, state: 'pending', pending }
}

async function checkConnectionStatus() {
  const pending = await getStored(PENDING_KEY)
  if (!pending) return { ok: true, state: 'idle' }

  if (pending.expiresAt <= Date.now()) {
    await chrome.storage.local.remove(PENDING_KEY)
    return { ok: true, state: 'expired' }
  }

  const result = await api(`/api/auth/device/status?deviceCode=${encodeURIComponent(pending.deviceCode)}`)

  if (result.status === 'approved') {
    const session = {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      user: result.user,
    }
    await chrome.storage.local.set({ [SESSION_KEY]: session })
    await chrome.storage.local.remove(PENDING_KEY)
    return { ok: true, state: 'connected', session }
  }

  if (result.status === 'denied' || result.status === 'expired') {
    await chrome.storage.local.remove(PENDING_KEY)
    return { ok: true, state: result.status }
  }

  return { ok: true, state: 'pending', pending }
}

async function getPendingConnection() {
  const pending = await getStored(PENDING_KEY)
  if (!pending || pending.expiresAt <= Date.now()) {
    if (pending) await chrome.storage.local.remove(PENDING_KEY)
    return { ok: true, state: 'idle' }
  }
  return { ok: true, state: 'pending', pending }
}

async function getCurrentUser() {
  const session = await getStored(SESSION_KEY)
  if (!session?.accessToken) return { ok: true, connected: false }

  try {
    const result = await api('/api/auth/me', { token: session.accessToken })
    const refreshedSession = { ...session, user: result.user }
    await chrome.storage.local.set({ [SESSION_KEY]: refreshedSession })
    return { ok: true, connected: true, session: refreshedSession }
  } catch (error) {
    if (error.status === 401) {
      await chrome.storage.local.remove(SESSION_KEY)
      return { ok: true, connected: false, expired: true }
    }
    throw error
  }
}

async function logout() {
  const session = await getStored(SESSION_KEY)
  if (session?.accessToken) {
    await api('/api/auth/logout', {
      method: 'POST',
      token: session.accessToken,
    }).catch(() => {})
  }
  await chrome.storage.local.remove([SESSION_KEY, PENDING_KEY])
  return { ok: true, connected: false }
}

async function getStored(key) {
  const values = await chrome.storage.local.get(key)
  return values[key]
}

function getBrowserName() {
  const agent = navigator.userAgent
  if (agent.includes('Edg/')) return 'Microsoft Edge'
  if (agent.includes('Chrome/')) return 'Google Chrome'
  return 'Chromium browser'
}

async function readDashboardContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const isDashboard = tab?.url?.startsWith('http://127.0.0.1:5173/')
    || tab?.url?.startsWith('http://localhost:5173/')

  if (!tab?.id || !isDashboard) {
    return { ok: true, available: false, reason: 'Open the AVVA dashboard to share transaction context.' }
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'avva.context.read' })
  } catch {
    return { ok: true, available: false, reason: 'Reload the dashboard tab after updating the extension.' }
  }
}

async function getAgentContext(transactionId) {
  if (!transactionId) throw new Error('Select a transaction in the AVVA dashboard first.')
  const session = await getStored(SESSION_KEY)
  if (!session?.accessToken) throw new Error('Connect this extension to the dashboard first.')
  const result = await api(`/api/agent/context?transactionId=${encodeURIComponent(transactionId)}`, {
    token: session.accessToken,
  })
  return { ok: true, context: result.context }
}

async function api(path, { method = 'GET', token, body } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new Error('The local AVVA service is offline. Run npm run dev and try again.')
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error ?? 'AVVA could not complete this request.')
    error.status = response.status
    throw error
  }
  return payload
}
