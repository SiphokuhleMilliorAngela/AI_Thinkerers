const views = {
  loading: document.getElementById('loading-view'),
  signedOut: document.getElementById('signed-out-view'),
  pending: document.getElementById('pending-view'),
  connected: document.getElementById('connected-view'),
}

const elements = {
  serviceStatus: document.getElementById('service-status'),
  connectButton: document.getElementById('connect-button'),
  connectionCode: document.getElementById('connection-code'),
  expiryCopy: document.getElementById('expiry-copy'),
  reopenButton: document.getElementById('reopen-button'),
  cancelButton: document.getElementById('cancel-button'),
  dashboardButton: document.getElementById('dashboard-button'),
  signoutButton: document.getElementById('signout-button'),
  userAvatar: document.getElementById('user-avatar'),
  welcomeName: document.getElementById('welcome-name'),
  userEmail: document.getElementById('user-email'),
  userRole: document.getElementById('user-role'),
  userTeam: document.getElementById('user-team'),
  toast: document.getElementById('toast'),
  toastCopy: document.getElementById('toast-copy'),
  toastClose: document.getElementById('toast-close'),
  contextRefresh: document.getElementById('context-refresh'),
  contextEmpty: document.getElementById('context-empty'),
  contextTransaction: document.getElementById('context-transaction'),
  contextTitle: document.getElementById('context-title'),
  contextCopy: document.getElementById('context-copy'),
  contextId: document.getElementById('context-id'),
  contextAmount: document.getElementById('context-amount'),
  contextRisk: document.getElementById('context-risk'),
  contextSignals: document.getElementById('context-signals'),
}

let pollTimer = null
let countdownTimer = null
let contextTimer = null
let currentPending = null
let lastContextId = null

function showView(name) {
  if (name !== 'connected') stopContextMonitoring()
  for (const [viewName, view] of Object.entries(views)) {
    view.classList.toggle('view--active', viewName === name)
  }
}

function setServiceStatus(online) {
  elements.serviceStatus.classList.toggle('service-status--online', online)
  elements.serviceStatus.classList.toggle('service-status--offline', !online)
  elements.serviceStatus.querySelector('span').textContent = online ? 'Service online' : 'Service offline'
}

function showError(message) {
  elements.toastCopy.textContent = message
  elements.toast.classList.add('toast--visible')
}

function hideError() {
  elements.toast.classList.remove('toast--visible')
}

function setBusy(button, busy, label) {
  button.disabled = busy
  const copy = button.querySelector('span')
  if (copy) copy.textContent = busy ? 'Connecting…' : label
}

async function send(message) {
  const response = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(result)
      }
    })
  })

  if (!response?.ok) throw new Error(response?.error ?? 'AVVA could not complete this request.')
  return response
}

async function refreshHealth() {
  const result = await send({ type: 'system.health' }).catch(() => ({ online: false }))
  setServiceStatus(result.online)
  return result.online
}

async function initialise() {
  await refreshHealth()

  try {
    const currentUser = await send({ type: 'auth.me' })
    if (currentUser.connected) {
      renderConnected(currentUser.session.user)
      return
    }

    const pending = await send({ type: 'auth.pending' })
    if (pending.state === 'pending') {
      renderPending(pending.pending)
      startPolling()
      return
    }

    showView('signedOut')
    if (currentUser.expired) showError('Your extension session expired. Connect the dashboard again.')
  } catch (error) {
    showView('signedOut')
    showError(error.message)
  }
}

function renderPending(pending) {
  currentPending = pending
  elements.connectionCode.textContent = pending.userCode
  updateCountdown()
  window.clearInterval(countdownTimer)
  countdownTimer = window.setInterval(updateCountdown, 1000)
  showView('pending')
}

function updateCountdown() {
  if (!currentPending) return
  const remainingSeconds = Math.max(0, Math.floor((currentPending.expiresAt - Date.now()) / 1000))
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = String(remainingSeconds % 60).padStart(2, '0')
  elements.expiryCopy.textContent = remainingSeconds ? `Expires in ${minutes}:${seconds}` : 'Connection code expired'
}

function renderConnected(user) {
  stopPolling()
  currentPending = null
  const firstName = user.name.split(' ')[0]
  elements.userAvatar.textContent = user.initials
  elements.welcomeName.textContent = `Welcome, ${firstName}.`
  elements.userEmail.textContent = user.email
  elements.userRole.textContent = user.role
  elements.userTeam.textContent = user.team
  showView('connected')
  startContextMonitoring()
}

function startPolling() {
  stopPolling()
  pollConnection()
  pollTimer = window.setInterval(pollConnection, 2000)
}

function stopPolling() {
  window.clearInterval(pollTimer)
  window.clearInterval(countdownTimer)
  pollTimer = null
  countdownTimer = null
}

async function pollConnection() {
  try {
    const result = await send({ type: 'auth.status' })
    if (result.state === 'connected') {
      renderConnected(result.session.user)
      return
    }
    if (result.state === 'denied') {
      stopPolling()
      showView('signedOut')
      showError('The dashboard connection was declined.')
      return
    }
    if (result.state === 'expired' || result.state === 'idle') {
      stopPolling()
      showView('signedOut')
      showError('The connection code expired. Start a new connection to try again.')
    }
  } catch (error) {
    setServiceStatus(false)
    showError(error.message)
  }
}

async function connectDashboard() {
  hideError()
  setBusy(elements.connectButton, true, 'Connect dashboard')
  try {
    const online = await refreshHealth()
    if (!online) throw new Error('Start AVVA with npm run dev, then try connecting again.')
    const result = await send({ type: 'auth.start' })
    renderPending(result.pending)
    startPolling()
  } catch (error) {
    showError(error.message)
  } finally {
    setBusy(elements.connectButton, false, 'Connect dashboard')
  }
}

async function cancelConnection() {
  await send({ type: 'auth.cancel' }).catch(() => {})
  stopPolling()
  currentPending = null
  showView('signedOut')
}

async function signOut() {
  elements.signoutButton.disabled = true
  try {
    await send({ type: 'auth.logout' })
    showView('signedOut')
  } catch (error) {
    showError(error.message)
  } finally {
    elements.signoutButton.disabled = false
  }
}

function startContextMonitoring() {
  stopContextMonitoring()
  refreshPageContext(true)
  contextTimer = window.setInterval(() => refreshPageContext(false), 2500)
}

function stopContextMonitoring() {
  window.clearInterval(contextTimer)
  contextTimer = null
  lastContextId = null
}

async function refreshPageContext(force = false) {
  try {
    const page = await send({ type: 'context.read' })
    if (!page.available) {
      lastContextId = null
      renderContextEmpty('Open the AVVA dashboard', page.reason ?? 'Select a transaction to make it available to the agent.')
      return
    }

    if (!page.transaction?.transactionId) {
      lastContextId = null
      renderContextEmpty('Dashboard ready', 'Open a transaction to share its whitelisted context with AVVA.')
      return
    }

    if (!force && page.transaction.transactionId === lastContextId) return
    lastContextId = page.transaction.transactionId
    const agentResult = await send({
      type: 'agent.context',
      transactionId: page.transaction.transactionId,
    })
    renderTransactionContext(agentResult.context)
  } catch (error) {
    renderContextEmpty('Context unavailable', error.message)
  }
}

function renderContextEmpty(title, copy) {
  elements.contextEmpty.hidden = false
  elements.contextTransaction.hidden = true
  elements.contextTitle.textContent = title
  elements.contextCopy.textContent = copy
}

function renderTransactionContext(context) {
  const transaction = context.transaction
  const determination = context.determination
  const formattedAmount = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(transaction.amount).replace('ZAR', 'R')

  elements.contextEmpty.hidden = true
  elements.contextTransaction.hidden = false
  elements.contextId.textContent = transaction.transactionId
  elements.contextAmount.textContent = formattedAmount
  elements.contextRisk.className = `context-risk context-risk--${determination.riskLevel.toLowerCase()}`
  elements.contextRisk.innerHTML = '<i></i>'
  elements.contextRisk.append(document.createTextNode(` ${determination.riskLevel} risk`))
  elements.contextSignals.textContent = `${determination.signals.length} explainable signal${determination.signals.length === 1 ? '' : 's'} · Agent ready`
}

elements.connectButton.addEventListener('click', connectDashboard)
elements.reopenButton.addEventListener('click', () => send({ type: 'dashboard.openApproval' }).catch((error) => showError(error.message)))
elements.cancelButton.addEventListener('click', cancelConnection)
elements.dashboardButton.addEventListener('click', () => send({ type: 'dashboard.open' }).catch((error) => showError(error.message)))
elements.signoutButton.addEventListener('click', signOut)
elements.contextRefresh.addEventListener('click', () => refreshPageContext(true))
elements.toastClose.addEventListener('click', hideError)

window.addEventListener('unload', () => {
  stopPolling()
  stopContextMonitoring()
})
initialise()
