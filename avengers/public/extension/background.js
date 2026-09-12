import { OPENROUTER, TOOL_SERVER_URL } from './extension-config.js'
import { OPENROUTER_API_KEY } from './extension-secrets.local.js'

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
    return {
      ok: true,
      disabled: true,
      message: 'Authentication is disabled for local testing.',
    }
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

async function readTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true })

  return Promise.all(
    tabs.map(async (tab) => {
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
    }),
  )
}

async function readDashboardTabs(query = '') {
  const tabs = await readTabs()
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
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
    activeContext:
      candidates.find((tab) => tab.id === activeTab?.id) ?? candidates[0] ?? tabs[0] ?? null,
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
  const dashboardSignals = ['dashboard', 'simulation', 'localhost', 'payment']
  const sortedTabs = [...tabs].sort((a, b) => {
    return scoreTab(b, dashboardSignals) - scoreTab(a, dashboardSignals)
  })
  const selectedTab = contextTabId ? await getReadableTabSnapshot(contextTabId) : null
  const withoutSelected = sortedTabs.filter((tab) => tab.id !== selectedTab?.id)

  return [selectedTab, ...withoutSelected]
    .filter(Boolean)
    .slice(0, openRouter.maxTabs)
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

function scoreTab(tab, signals) {
  const haystack = `${tab.title ?? ''} ${tab.url ?? ''}`.toLowerCase()
  return signals.reduce((score, signal) => {
    return haystack.includes(signal) ? score + 1 : score
  }, tab.text ? 1 : 0)
}

function trimText(text = '', maxCharacters = 2500) {
  if (text.length <= maxCharacters) {
    return text
  }

  return `${text.slice(0, maxCharacters)}...`
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
