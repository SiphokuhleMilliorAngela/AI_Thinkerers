export const API_BASE = import.meta.env.VITE_AVVA_API_URL ?? 'http://127.0.0.1:8787'

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error ?? 'AVVA could not complete that request.')
    error.status = response.status
    throw error
  }

  return payload
}

export const authApi = {
  login: (email, password) => request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  }),
  me: (token) => request('/api/auth/me', { token }),
  logout: (token) => request('/api/auth/logout', { method: 'POST', token }),
  deviceRequest: (userCode) => request(`/api/auth/device/request?code=${encodeURIComponent(userCode)}`),
  approveDevice: (token, userCode) => request('/api/auth/device/approve', {
    method: 'POST',
    token,
    body: { userCode },
  }),
  denyDevice: (token, userCode) => request('/api/auth/device/deny', {
    method: 'POST',
    token,
    body: { userCode },
  }),
  connections: (token) => request('/api/auth/connections', { token }),
  revokeConnection: (token, connectionId) => request(`/api/auth/connections/${connectionId}`, {
    method: 'DELETE',
    token,
  }),
}

export const ledgerApi = {
  summary: (token) => request('/api/ledger/summary', { token }),
  accounts: (token) => request('/api/accounts', { token }),
  beneficiaries: (token) => request('/api/beneficiaries', { token }),
  transactions: (token, params = {}) => {
    const search = new URLSearchParams(params)
    return request(`/api/transactions${search.size ? `?${search}` : ''}`, { token })
  },
  transaction: (token, transactionId) => request(`/api/transactions/${encodeURIComponent(transactionId)}`, { token }),
  sendPayment: (token, payment) => request('/api/payments', {
    method: 'POST',
    token,
    body: payment,
  }),
}
