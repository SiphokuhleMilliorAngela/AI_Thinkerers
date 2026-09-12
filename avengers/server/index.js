import crypto from 'node:crypto'
import http from 'node:http'

const HOST = process.env.AVVA_API_HOST ?? '127.0.0.1'
const PORT = Number(process.env.AVVA_API_PORT ?? 8787)
const DASHBOARD_URL = process.env.AVVA_DASHBOARD_URL ?? 'http://127.0.0.1:5173'
const DASHBOARD_SESSION_TTL = 8 * 60 * 60 * 1000
const EXTENSION_SESSION_TTL = 24 * 60 * 60 * 1000
const DEVICE_CODE_TTL = 10 * 60 * 1000

const users = [
  {
    id: 'USR-001',
    email: 'naledi@avva.co.za',
    password: 'demo123',
    name: 'Naledi Mokoena',
    role: 'Fraud Manager',
    initials: 'NM',
    team: 'Fraud Operations',
  },
]

const sessions = new Map()
const deviceRequests = new Map()

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    initials: user.initials,
    team: user.team,
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function createUserCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  do {
    code = 'AVVA-'
    for (let index = 0; index < 4; index += 1) {
      code += alphabet[crypto.randomInt(0, alphabet.length)]
    }
  } while ([...deviceRequests.values()].some((request) => request.userCode === code && request.status === 'pending'))
  return code
}

function safeEqual(value, expected) {
  const left = Buffer.from(String(value))
  const right = Buffer.from(String(expected))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function setResponseHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  response.setHeader('X-Content-Type-Options', 'nosniff')
}

function sendJson(response, status, payload) {
  setResponseHeaders(response)
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

async function readJson(request) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > 32_768) {
      const error = new Error('Request body is too large.')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }

  if (!chunks.length) return {}

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Request body must be valid JSON.')
    error.status = 400
    throw error
  }
}

function findUserById(userId) {
  return users.find((user) => user.id === userId)
}

function bearerToken(request) {
  const authorization = request.headers.authorization ?? ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : null
}

function authenticate(request, allowedTypes = ['dashboard', 'extension']) {
  const token = bearerToken(request)
  const session = token ? sessions.get(token) : null

  if (!session || session.expiresAt <= Date.now() || !allowedTypes.includes(session.type)) {
    if (token) sessions.delete(token)
    const error = new Error('Your AVVA session is no longer valid. Please sign in again.')
    error.status = 401
    throw error
  }

  session.lastSeenAt = new Date().toISOString()
  return { token, session, user: findUserById(session.userId) }
}

function createSession(user, type, metadata = {}) {
  const token = randomToken()
  const now = Date.now()
  const session = {
    id: crypto.randomUUID(),
    userId: user.id,
    type,
    createdAt: new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: now + (type === 'dashboard' ? DASHBOARD_SESSION_TTL : EXTENSION_SESSION_TTL),
    ...metadata,
  }
  sessions.set(token, session)
  return { token, session }
}

function pruneExpiredState() {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token)
  }
  for (const request of deviceRequests.values()) {
    if (request.expiresAt <= now && request.status === 'pending') request.status = 'expired'
  }
}

function findDeviceRequestByCode(userCode) {
  const normalized = String(userCode ?? '').trim().toUpperCase()
  return [...deviceRequests.values()].find((request) => request.userCode === normalized)
}

async function route(request, response) {
  if (request.method === 'OPTIONS') {
    setResponseHeaders(response)
    response.writeHead(204)
    response.end()
    return
  }

  pruneExpiredState()
  const url = new URL(request.url, `http://${request.headers.host ?? `${HOST}:${PORT}`}`)
  if (!route.ledgerPromise) {
    route.ledgerPromise = import('./ledger.js').then(({ createLedger }) => createLedger())
  }
  const ledger = await route.ledgerPromise

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'avva-local-api',
      dashboardUrl: DASHBOARD_URL,
      capabilities: ['authentication', 'zar-ledger', 'simulated-payments', 'risk-signals'],
      time: new Date().toISOString(),
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/ledger/summary') {
    authenticate(request)
    sendJson(response, 200, { summary: ledger.getSummary() })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/accounts') {
    authenticate(request)
    sendJson(response, 200, { accounts: ledger.listAccounts() })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/beneficiaries') {
    authenticate(request)
    sendJson(response, 200, { beneficiaries: ledger.listBeneficiaries() })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/transactions') {
    authenticate(request)
    const transactions = ledger.listTransactions({
      query: url.searchParams.get('query') ?? '',
      risk: url.searchParams.get('risk') ?? 'All',
      direction: url.searchParams.get('direction') ?? 'all',
      accountId: url.searchParams.get('accountId') ?? '',
      limit: url.searchParams.get('limit') ?? 100,
    })
    sendJson(response, 200, { transactions, count: transactions.length, currency: 'ZAR' })
    return
  }

  const transactionMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/)
  if (request.method === 'GET' && transactionMatch) {
    authenticate(request)
    const transaction = ledger.getTransaction(decodeURIComponent(transactionMatch[1]))
    if (!transaction) {
      sendJson(response, 404, { error: 'That transaction was not found.' })
      return
    }
    sendJson(response, 200, { transaction })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent/context') {
    authenticate(request)
    const transactionId = url.searchParams.get('transactionId')
    if (!transactionId) {
      sendJson(response, 400, { error: 'A transactionId is required.' })
      return
    }

    const transaction = ledger.getTransaction(transactionId)
    if (!transaction) {
      sendJson(response, 404, { error: 'That transaction was not found.' })
      return
    }

    const relatedTransactions = ledger.listTransactions({ limit: 250 })
      .filter((candidate) => candidate.id !== transaction.id && (
        (transaction.beneficiaryId && candidate.beneficiaryId === transaction.beneficiaryId)
        || (transaction.deviceId && candidate.deviceId === transaction.deviceId)
      ))
      .slice(0, 6)
      .map((candidate) => ({
        transactionId: candidate.id,
        amount: candidate.amount,
        currency: candidate.currency,
        status: candidate.status,
        riskLevel: candidate.risk.level,
        timestamp: candidate.timestamp,
      }))

    sendJson(response, 200, {
      context: {
        schemaVersion: '1.0',
        source: 'avva-synthetic-zar-ledger',
        generatedAt: new Date().toISOString(),
        pageType: 'transaction-detail',
        transaction: {
          transactionId: transaction.id,
          accountId: transaction.accountId,
          customerId: transaction.customerId,
          beneficiaryId: transaction.beneficiaryId ?? null,
          employeeId: transaction.employeeId,
          deviceId: transaction.deviceId,
          amount: transaction.amount,
          currency: 'ZAR',
          direction: transaction.direction,
          type: transaction.type,
          status: transaction.status,
          timestamp: transaction.timestamp,
          counterparty: transaction.counterparty,
          reference: transaction.reference,
          channel: transaction.channel,
          simulated: transaction.simulated === true,
        },
        determination: {
          riskLevel: transaction.risk.level,
          riskScore: transaction.risk.score,
          confidence: transaction.risk.confidence,
          signals: transaction.risk.signals,
          recommendation: transaction.risk.recommendation,
          language: 'This is a risk indication, not a conclusion that fraud occurred.',
        },
        relatedTransactions,
        controls: {
          humanReviewRequired: ['Critical', 'High'].includes(transaction.risk.level),
          autonomousActions: ['read_context', 'analyse_signals', 'suggest_next_step'],
          humanApprovalRequiredFor: ['hold_transaction', 'send_payment', 'escalate_case'],
        },
      },
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/payments') {
    const { user } = authenticate(request, ['dashboard'])
    const body = await readJson(request)
    const result = ledger.sendPayment(body, user)
    sendJson(response, 201, {
      ok: true,
      message: 'Simulated payment completed.',
      ...result,
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJson(request)
    const user = users.find((candidate) => candidate.email.toLowerCase() === String(body.email ?? '').trim().toLowerCase())

    if (!user || !safeEqual(body.password ?? '', user.password)) {
      sendJson(response, 401, { error: 'Email or password is incorrect.' })
      return
    }

    const { token, session } = createSession(user, 'dashboard', {
      deviceName: 'AVVA web dashboard',
    })
    sendJson(response, 200, {
      token,
      expiresAt: new Date(session.expiresAt).toISOString(),
      user: publicUser(user),
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const { session, user } = authenticate(request)
    sendJson(response, 200, {
      user: publicUser(user),
      session: {
        id: session.id,
        type: session.type,
        expiresAt: new Date(session.expiresAt).toISOString(),
      },
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = bearerToken(request)
    if (token) sessions.delete(token)
    sendJson(response, 200, { ok: true })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/device/start') {
    const body = await readJson(request)
    const deviceCode = randomToken(36)
    const userCode = createUserCode()
    const createdAt = Date.now()
    const deviceRequest = {
      id: crypto.randomUUID(),
      deviceCode,
      userCode,
      status: 'pending',
      deviceName: String(body.deviceName ?? 'AVVA browser extension').slice(0, 80),
      browser: String(body.browser ?? 'Chrome').slice(0, 40),
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: createdAt + DEVICE_CODE_TTL,
      approvedBy: null,
      extensionToken: null,
    }
    deviceRequests.set(deviceCode, deviceRequest)

    sendJson(response, 201, {
      deviceCode,
      userCode,
      verificationUri: `${DASHBOARD_URL}/connect?code=${encodeURIComponent(userCode)}`,
      expiresIn: Math.floor(DEVICE_CODE_TTL / 1000),
      interval: 2,
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/device/status') {
    const deviceCode = url.searchParams.get('deviceCode')
    const deviceRequest = deviceCode ? deviceRequests.get(deviceCode) : null
    if (!deviceRequest) {
      sendJson(response, 404, { error: 'This extension connection request was not found.' })
      return
    }

    const payload = { status: deviceRequest.status }
    if (deviceRequest.status === 'approved') {
      const extensionSession = sessions.get(deviceRequest.extensionToken)
      if (!extensionSession) {
        payload.status = 'expired'
      } else {
        payload.accessToken = deviceRequest.extensionToken
        payload.expiresAt = new Date(extensionSession.expiresAt).toISOString()
        payload.user = publicUser(findUserById(extensionSession.userId))
      }
    }
    sendJson(response, 200, payload)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/device/request') {
    const deviceRequest = findDeviceRequestByCode(url.searchParams.get('code'))
    if (!deviceRequest) {
      sendJson(response, 404, { error: 'That extension code is invalid or no longer available.' })
      return
    }
    sendJson(response, 200, {
      userCode: deviceRequest.userCode,
      status: deviceRequest.status,
      deviceName: deviceRequest.deviceName,
      browser: deviceRequest.browser,
      expiresAt: new Date(deviceRequest.expiresAt).toISOString(),
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/device/approve') {
    const { user } = authenticate(request, ['dashboard'])
    const body = await readJson(request)
    const deviceRequest = findDeviceRequestByCode(body.userCode)

    if (!deviceRequest || deviceRequest.expiresAt <= Date.now()) {
      sendJson(response, 404, { error: 'That extension code has expired. Start again from the extension.' })
      return
    }
    if (deviceRequest.status !== 'pending') {
      sendJson(response, 409, { error: `This connection request is already ${deviceRequest.status}.` })
      return
    }

    const { token } = createSession(user, 'extension', {
      deviceName: deviceRequest.deviceName,
      browser: deviceRequest.browser,
      connectionRequestId: deviceRequest.id,
    })
    deviceRequest.status = 'approved'
    deviceRequest.approvedBy = user.id
    deviceRequest.extensionToken = token
    deviceRequest.approvedAt = new Date().toISOString()

    sendJson(response, 200, {
      ok: true,
      status: 'approved',
      deviceName: deviceRequest.deviceName,
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/device/deny') {
    authenticate(request, ['dashboard'])
    const body = await readJson(request)
    const deviceRequest = findDeviceRequestByCode(body.userCode)

    if (!deviceRequest || deviceRequest.expiresAt <= Date.now()) {
      sendJson(response, 404, { error: 'That extension code has expired.' })
      return
    }
    if (deviceRequest.status === 'pending') deviceRequest.status = 'denied'
    sendJson(response, 200, { ok: true, status: deviceRequest.status })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/connections') {
    const { user } = authenticate(request, ['dashboard'])
    const connections = [...sessions.values()]
      .filter((session) => session.userId === user.id && session.type === 'extension')
      .map((session) => ({
        id: session.id,
        deviceName: session.deviceName,
        browser: session.browser,
        connectedAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: new Date(session.expiresAt).toISOString(),
        status: 'Connected',
      }))
      .sort((left, right) => right.connectedAt.localeCompare(left.connectedAt))
    sendJson(response, 200, { connections })
    return
  }

  const connectionMatch = url.pathname.match(/^\/api\/auth\/connections\/([^/]+)$/)
  if (request.method === 'DELETE' && connectionMatch) {
    const { user } = authenticate(request, ['dashboard'])
    const connectionId = decodeURIComponent(connectionMatch[1])
    const entry = [...sessions.entries()].find(([, session]) => (
      session.id === connectionId && session.userId === user.id && session.type === 'extension'
    ))
    if (!entry) {
      sendJson(response, 404, { error: 'That browser connection was not found.' })
      return
    }
    sessions.delete(entry[0])
    sendJson(response, 200, { ok: true })
    return
  }

  sendJson(response, 404, { error: 'AVVA API route not found.' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error(error)
    if (!response.headersSent) {
      sendJson(response, error.status ?? 500, {
        error: error.status ? error.message : 'The local AVVA service encountered an error.',
      })
    } else {
      response.end()
    }
  })
})

server.listen(PORT, HOST, () => {
  console.log(`AVVA authentication service listening on http://${HOST}:${PORT}`)
  console.log(`Demo sign-in: naledi@avva.co.za / demo123`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
