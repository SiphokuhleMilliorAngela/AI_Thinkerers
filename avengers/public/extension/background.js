import { OPENROUTER, TOOL_SERVER_URL } from './extension-config.js'
import { OPENROUTER_API_KEY } from './extension-secrets.local.js'

const API_BASE = 'http://127.0.0.1:8787'
const DASHBOARD_URL = 'http://127.0.0.1:5173'
const SESSION_KEY = 'av.session'

let toolSocket
let pendingToolCalls = new Map()

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_current_tab',
      description: 'Read the selected browser tab content.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_current_tab',
      description: 'Inspect controls, links, inputs, and forms on the selected tab.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click_element',
      description:
        'Click a non-sensitive element on the selected tab. Sensitive send, submit, approve, pay, transfer, refund, delete, confirm, and authorize actions are blocked.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element to click.',
          },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type_into_element',
      description: 'Type text into a text input or textarea on the selected tab.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the text input or textarea.',
          },
          value: {
            type: 'string',
            description: 'Text value to enter.',
          },
        },
        required: ['selector', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_email_reply',
      description:
        'Click Reply in the selected email/webmail tab and type a drafted response into the compose editor. This never clicks Send.',
      parameters: {
        type: 'object',
        properties: {
          body: {
            type: 'string',
            description: 'The email reply body to draft.',
          },
        },
        required: ['body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_payment_risk',
      description:
        'Analyze visible payment-like content for risk signals such as urgency, bank-detail changes, unusual destinations, or large amounts.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Visible payment or dashboard text to analyze.',
          },
          payee: {
            type: 'string',
            description: 'Optional payee or vendor name.',
          },
          amount: {
            type: 'string',
            description: 'Optional payment amount.',
          },
          reference: {
            type: 'string',
            description: 'Optional payment reference.',
          },
        },
      },
    },
  },
]

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
    return login(message.email, message.password)
  }

  if (message.type === 'auth.me') {
    return getCurrentUser()
  }

  if (message.type === 'auth.logout') {
    return logout()
  }

  if (message.type === 'dashboard.openAuthenticated') {
    return openAuthenticatedDashboard(message.view)
  }

  if (message.type === 'dashboard.navigateTransactions') {
    return sendToDashboardTab({ type: 'avva.navigateTransactions' })
  }

  if (message.type === 'dashboard.findFlaggedTransaction') {
    return sendToDashboardTab({ type: 'avva.findFlaggedTransaction' })
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
    return runAgent(message.messages, message.contextTabId)
  }

  return { ok: false, error: `Unknown message type: ${message.type}` }
}

async function login(email, password) {
  const result = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  const session = {
    token: result.token,
    expiresAt: result.expiresAt,
    user: result.user,
  }

  await chrome.storage.local.set({ [SESSION_KEY]: session })
  await openDashboardWithSession(session.token, 'overview')

  return { ok: true, session, dashboardOpened: true }
}

async function getCurrentUser() {
  const values = await chrome.storage.local.get(SESSION_KEY)
  const session = values[SESSION_KEY]

  if (!session?.token) {
    return { ok: true, connected: false }
  }

  try {
    const result = await api('/api/auth/me', { token: session.token })
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
  const values = await chrome.storage.local.get(SESSION_KEY)
  const session = values[SESSION_KEY]

  if (session?.token) {
    await api('/api/auth/logout', {
      method: 'POST',
      token: session.token,
    }).catch(() => {})
  }

  await chrome.storage.local.remove(SESSION_KEY)
  return { ok: true, connected: false }
}

async function openAuthenticatedDashboard(view = 'overview') {
  const values = await chrome.storage.local.get(SESSION_KEY)
  const session = values[SESSION_KEY]

  if (!session?.token) {
    throw new Error('Sign in to AVVA from the extension first.')
  }

  await openDashboardWithSession(session.token, view)
  return { ok: true }
}

async function openDashboardWithSession(token, view = 'overview') {
  const url = new URL(DASHBOARD_URL)
  url.searchParams.set('sessionToken', token)
  url.searchParams.set('view', view)
  await chrome.tabs.create({ url: url.toString(), active: true })
}

async function sendToDashboardTab(message) {
  const tab = await getDashboardTab()
  validateReadableTab(tab)
  return sendToTab(tab.id, message)
}

async function getDashboardTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (isDashboardTab(activeTab)) {
    return activeTab
  }

  const dashboardTabs = await chrome.tabs.query({
    currentWindow: true,
    url: [
      'http://127.0.0.1:5173/*',
      'http://localhost:5173/*',
    ],
  })

  if (dashboardTabs[0]) {
    await chrome.tabs.update(dashboardTabs[0].id, { active: true })
    return dashboardTabs[0]
  }

  const values = await chrome.storage.local.get(SESSION_KEY)
  const session = values[SESSION_KEY]

  if (!session?.token) {
    throw new Error('Open the AVVA dashboard tab or sign in from the extension first.')
  }

  const url = new URL(DASHBOARD_URL)
  url.searchParams.set('sessionToken', session.token)
  url.searchParams.set('view', 'overview')
  const tab = await chrome.tabs.create({ url: url.toString(), active: true })
  await wait(900)
  return tab
}

function isDashboardTab(tab) {
  return Boolean(
    tab?.url?.startsWith('http://127.0.0.1:5173/') ||
    tab?.url?.startsWith('http://localhost:5173/'),
  )
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readTabs() {
  return [await readActiveTabSnapshot()]
}

async function readActiveTabSnapshot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id) {
    throw new Error('No active browser tab found.')
  }

  try {
    if (!canReadTab(tab)) {
      throw new Error('This browser page cannot be read by an extension.')
    }

    const page = await sendToTab(tab.id, { type: 'page.read' })
    return { id: tab.id, ...page }
  } catch (error) {
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      text: '',
      unreadable: error.message,
    }
  }
}

async function readDashboardTabs() {
  const activeContext = await readActiveTabSnapshot()

  return {
    ok: true,
    tabs: [activeContext],
    candidates: [activeContext],
    activeContext,
    note: 'Only the current active tab was read.',
  }
}

async function runAgent(messages = [], contextTabId) {
  const openRouter = {
    ...OPENROUTER,
    apiKey: OPENROUTER_API_KEY ?? OPENROUTER.apiKey,
  }
  const tabs = await readTabs()
  const relevantTabs = await selectRelevantTabs(tabs, openRouter, contextTabId)

  if (!openRouter.apiKey || openRouter.apiKey === 'YOUR_OPENROUTER_API_KEY') {
    throw new Error(
      'Set OPENROUTER_API_KEY in extension-secrets.local.js before running the agent.',
    )
  }

  const response = await fetch(openRouter.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouter.apiKey}`,
      'HTTP-Referer': openRouter.siteUrl,
      'X-Title': openRouter.siteName,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openRouter.model,
      max_tokens: openRouter.maxCompletionTokens,
      tools: AGENT_TOOLS,
      messages: [
        {
          role: 'system',
          content:
            'You are an internal browser workflow agent with browser tools. Do not say you cannot interact with pages. If the user asks you to act in the selected tab, inspect and use tools. You may click Reply, type drafts, fill ordinary text fields, perform safe clicks, and analyze payment-like content for risk signals. Never send, submit, approve, pay, transfer, refund, delete, confirm, or authorize. For email, create the draft but stop before Send. Keep answers concise.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            type: 'browser_tab_context',
            auth: false,
            tabs: relevantTabs,
          }),
        },
        ...normalizeMessages(messages),
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(await formatOpenRouterError(response))
  }

  const data = await response.json()
  const assistantMessage = data.choices?.[0]?.message

  if (assistantMessage?.tool_calls?.length) {
    return runAgentToolLoop(openRouter, messages, assistantMessage, contextTabId)
  }

  return { ok: true, result: assistantMessage?.content ?? data }
}

async function runAgentToolLoop(openRouter, messages, assistantMessage, contextTabId) {
  const conversation = await buildToolConversation(openRouter, messages, contextTabId)
  let currentAssistantMessage = assistantMessage

  for (let step = 0; step < 4; step += 1) {
    conversation.push({
      role: 'assistant',
      content: currentAssistantMessage.content ?? null,
      tool_calls: currentAssistantMessage.tool_calls,
    })

    const toolMessages = await Promise.all(
      currentAssistantMessage.tool_calls.map(async (toolCall) => ({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(await executeAgentTool(toolCall, contextTabId)),
      })),
    )

    conversation.push(...toolMessages)

    const response = await fetch(openRouter.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouter.apiKey}`,
        'HTTP-Referer': openRouter.siteUrl,
        'X-Title': openRouter.siteName,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: openRouter.model,
        max_tokens: openRouter.maxCompletionTokens,
        tools: AGENT_TOOLS,
        messages: conversation,
      }),
    })

    if (!response.ok) {
      throw new Error(await formatOpenRouterError(response))
    }

    const data = await response.json()
    currentAssistantMessage = data.choices?.[0]?.message

    if (!currentAssistantMessage?.tool_calls?.length) {
      return { ok: true, result: currentAssistantMessage?.content ?? data }
    }
  }

  return {
    ok: true,
    result: 'I used the available tools but stopped after the maximum tool steps. Please review the page and send a follow-up.',
  }
}

async function buildToolConversation(openRouter, messages, contextTabId) {
  const tabs = await readTabs()
  const relevantTabs = await selectRelevantTabs(tabs, openRouter, contextTabId)

  return [
    {
      role: 'system',
      content:
        'You are an internal browser workflow agent with browser tools. Continue using tools until the requested safe browser task is completed. Never send, submit, approve, pay, transfer, refund, delete, confirm, or authorize. Summarize what you did clearly.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        type: 'browser_tab_context',
        auth: false,
        tabs: relevantTabs,
      }),
    },
    ...normalizeMessages(messages),
  ]
}

async function executeAgentTool(toolCall, contextTabId) {
  const args = parseToolArgs(toolCall.function.arguments)

  if (toolCall.function.name === 'read_current_tab') {
    return readTargetTab(contextTabId)
  }

  if (toolCall.function.name === 'inspect_current_tab') {
    return sendToTargetTab(contextTabId, { type: 'page.inspect' })
  }

  if (toolCall.function.name === 'click_element') {
    return sendToTargetTab(contextTabId, { type: 'page.click', selector: args.selector })
  }

  if (toolCall.function.name === 'type_into_element') {
    return sendToTargetTab(contextTabId, {
      type: 'page.type',
      selector: args.selector,
      value: args.value,
    })
  }

  if (toolCall.function.name === 'draft_email_reply') {
    return sendToTargetTab(contextTabId, {
      type: 'page.draftReply',
      body: args.body,
    })
  }

  if (toolCall.function.name === 'analyze_payment_risk') {
    return analyzePaymentRisk(args)
  }

  return { ok: false, error: `Unknown agent tool: ${toolCall.function.name}` }
}

async function readTargetTab(contextTabId) {
  const tab = await getTargetTab(contextTabId)

  validateReadableTab(tab)
  const page = await sendToTab(tab.id, { type: 'page.read' })
  return { id: tab.id, ...page }
}

async function sendToTargetTab(contextTabId, message) {
  const tab = await getTargetTab(contextTabId)

  validateReadableTab(tab)
  return sendToTab(tab.id, message)
}

async function getTargetTab(contextTabId) {
  if (contextTabId) {
    return chrome.tabs.get(contextTabId)
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id) {
    throw new Error('No target tab found.')
  }

  return tab
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message)
  } catch (error) {
    if (!isReceivingEndError(error)) {
      throw error
    }

    await injectContentScript(tabId)
    return chrome.tabs.sendMessage(tabId, message)
  }
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['extension/content-script.js'],
    })
  } catch (error) {
    throw new Error('Could not connect to this tab. Reload the page or use a normal web app tab.', {
      cause: error,
    })
  }
}

function canReadTab(tab) {
  return Boolean(tab?.id && /^https?:|^file:/.test(tab.url ?? ''))
}

function validateReadableTab(tab) {
  if (!canReadTab(tab)) {
    throw new Error('The selected tab cannot be read. Choose a normal http, https, or allowed file tab.')
  }
}

function isReceivingEndError(error) {
  return /receiving end does not exist|could not establish connection/i.test(
    error?.message ?? '',
  )
}

function parseToolArgs(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

function analyzePaymentRisk(args) {
  const text = `${args.text ?? ''} ${args.payee ?? ''} ${args.amount ?? ''} ${args.reference ?? ''}`
  const signals = [
    ['urgent language', /\burgent|immediately|asap|final notice\b/i],
    ['bank detail change', /\bnew bank|changed bank|different account|update banking\b/i],
    ['large amount', /\b([5-9]\d{4,}|\d{6,})\b/],
    ['missing reference', /\bno reference|missing reference|unknown reference\b/i],
    ['first-time payee', /\bnew vendor|first payment|new supplier|first-time\b/i],
    ['round amount', /\b\d+000\.?00?\b/],
    ['foreign or unusual destination', /\boffshore|international|foreign|crypto|wallet\b/i],
  ]
  const matches = signals
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label)
  const riskLevel =
    matches.length >= 4 ? 'high' : matches.length >= 2 ? 'medium' : matches.length ? 'low' : 'unknown'

  return {
    ok: true,
    riskLevel,
    signals: matches,
    recommendation:
      riskLevel === 'high'
        ? 'Pause and escalate for manual review before any payment action.'
        : 'Review visible details against internal policy before proceeding.',
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [
      {
        role: 'user',
        content: 'Summarize the relevant dashboard tab and suggest next steps.',
      },
    ]
  }

  return messages
    .filter((message) => {
      return (
        ['user', 'assistant'].includes(message.role) &&
        typeof message.content === 'string' &&
        message.content.trim()
      )
    })
    .slice(-8)
}

async function selectRelevantTabs(tabs, openRouter, contextTabId) {
  const targetTab = contextTabId ? await getReadableTabSnapshot(contextTabId) : tabs[0]

  return [targetTab]
    .filter(Boolean)
    .slice(0, Math.min(openRouter.maxTabs, 1))
    .map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      text: trimText(tab.text, openRouter.maxTabTextCharacters),
    }))
}

async function getReadableTabSnapshot(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId)
    validateReadableTab(tab)
    const page = await sendToTab(tab.id, { type: 'page.read' })
    return { id: tab.id, ...page }
  } catch (error) {
    return {
      id: tabId,
      title: 'Selected tab',
      url: '',
      text: '',
      unreadable: error.message,
    }
  }
}

function trimText(text = '', maxCharacters = 2500) {
  if (text.length <= maxCharacters) {
    return text
  }

  return `${text.slice(0, maxCharacters)}...`
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

async function formatOpenRouterError(response) {
  const fallback = `OpenRouter request failed: ${response.status}`

  try {
    const text = await response.text()

    if (!text) {
      return fallback
    }

    try {
      const body = JSON.parse(text)
      const message =
        body.error?.message ??
        body.message ??
        body.detail ??
        JSON.stringify(body)

      if (response.status === 402 && /in-flight requests/i.test(message)) {
        return `${fallback} - OpenRouter is still processing another request for this key. Wait a moment and try again, or use local dashboard actions such as Open overview, Read current tab, or Find flagged transaction.`
      }

      return `${fallback} - ${message}`
    } catch {
      return `${fallback} - ${text.slice(0, 500)}`
    }
  } catch {
    return fallback
  }
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
