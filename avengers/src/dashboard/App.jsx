import { useCallback, useEffect, useState } from 'react'
import { authApi } from './api.js'
import TransactionsWorkspace from './TransactionsWorkspace.jsx'

const SESSION_KEY = 'avva.dashboard.session'

const navItems = [
  { label: 'Overview', icon: 'overview' },
  { label: 'Investigations', icon: 'investigations', count: 4 },
  { label: 'Transactions', icon: 'transactions' },
  { label: 'Entities', icon: 'entities' },
  { label: 'Reports', icon: 'reports' },
]

const recentCases = [
  {
    id: 'AVVA-221',
    transaction: 'TX-10488',
    subject: 'Unusual beneficiary activity',
    risk: 'Critical',
    status: 'Needs review',
    analyst: 'Naledi M.',
    updated: '4 min ago',
  },
  {
    id: 'AVVA-219',
    transaction: 'TX-10472',
    subject: 'Shared device detected',
    risk: 'High',
    status: 'Investigating',
    analyst: 'Sipho K.',
    updated: '18 min ago',
  },
  {
    id: 'AVVA-216',
    transaction: 'TX-10441',
    subject: 'After-hours account change',
    risk: 'Medium',
    status: 'Monitoring',
    analyst: 'Amina P.',
    updated: '1 hr ago',
  },
  {
    id: 'AVVA-208',
    transaction: 'TX-10389',
    subject: 'Velocity threshold exceeded',
    risk: 'Low',
    status: 'Resolved',
    analyst: 'Thabo R.',
    updated: 'Yesterday',
  },
]

const iconPaths = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  investigations: <><path d="M14.5 4.5h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3"/><rect x="9" y="2.5" width="6" height="4" rx="1.5"/><path d="m9 14 2 2 4-4"/></>,
  transactions: <><path d="M5 7h14M5 17h14"/><path d="m15 3 4 4-4 4M9 13l-4 4 4 4"/></>,
  entities: <><circle cx="12" cy="7" r="3"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0M18 8.5a2.5 2.5 0 1 1 1.5 4.5M5.5 13A2.5 2.5 0 1 1 7 8.5"/></>,
  reports: <><path d="M5 21V10M12 21V3M19 21v-7"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.03A1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2A2 2 0 1 1 19.83 7l-.06.06A1.7 1.7 0 0 0 19.4 9v.03A1.7 1.7 0 0 0 20.95 10H21a2 2 0 1 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  shield: <><path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  browser: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  activity: <path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1"/></>,
}

function Icon({ name, size = 20 }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      {iconPaths[name]}
    </svg>
  )
}

function Brand({ light = false, compact = false }) {
  return (
    <div className={`brand${light ? ' brand--light' : ''}`} aria-label="AVVA">
      <span className="brand__mark">A</span>
      {!compact && <span className="brand__letters">vva</span>}
    </div>
  )
}

function App() {
  const [storedToken] = useState(() => window.localStorage.getItem(SESSION_KEY))
  const [session, setSession] = useState(null)
  const [initializing, setInitializing] = useState(() => Boolean(storedToken))
  const connectionCode = new URLSearchParams(window.location.search).get('code')

  useEffect(() => {
    if (!storedToken) return undefined

    let active = true
    authApi.me(storedToken)
      .then(({ user }) => {
        if (active) setSession({ token: storedToken, user })
      })
      .catch(() => window.localStorage.removeItem(SESSION_KEY))
      .finally(() => {
        if (active) setInitializing(false)
      })

    return () => { active = false }
  }, [storedToken])

  async function signIn(email, password) {
    const result = await authApi.login(email, password)
    window.localStorage.setItem(SESSION_KEY, result.token)
    setSession({ token: result.token, user: result.user })
  }

  async function signOut() {
    if (session?.token) await authApi.logout(session.token).catch(() => {})
    window.localStorage.removeItem(SESSION_KEY)
    setSession(null)
  }

  if (initializing) return <LoadingScreen />

  if (!session) {
    return <LoginScreen connectionCode={connectionCode} onSignIn={signIn} />
  }

  if (connectionCode) {
    return (
      <ConnectionApproval
        session={session}
        userCode={connectionCode}
        onSignOut={signOut}
      />
    )
  }

  return <Dashboard session={session} onSignOut={signOut} />
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <Brand />
      <span className="loading-dots" aria-label="Loading"><i /><i /><i /></span>
    </div>
  )
}

function LoginScreen({ connectionCode, onSignIn }) {
  const [email, setEmail] = useState('naledi@avva.co.za')
  const [password, setPassword] = useState('demo123')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSignIn(email, password)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand light />
        <div className="auth-story__content">
          <span className="eyebrow eyebrow--light">FRAUD OPERATIONS, REIMAGINED</span>
          <h1>Investigate with<br />clarity and control.</h1>
          <p>AVVA gives fraud teams one calm, explainable workspace for every investigation.</p>
        </div>
        <div className="auth-story__foot">
          <span className="status-dot status-dot--green" />
          Protected demo environment
        </div>
        <div className="auth-orbit auth-orbit--one" />
        <div className="auth-orbit auth-orbit--two" />
      </section>

      <section className="auth-form-panel">
        <div className="auth-mobile-brand"><Brand /></div>
        <div className="auth-form-wrap">
          {connectionCode && (
            <div className="connection-notice">
              <span className="connection-notice__icon"><Icon name="browser" size={19} /></span>
              <div>
                <strong>Extension connection requested</strong>
                <span>Sign in to review code {connectionCode.toUpperCase()}</span>
              </div>
            </div>
          )}

          <div className="auth-heading">
            <span className="eyebrow">SECURE WORKSPACE</span>
            <h2>Welcome back</h2>
            <p>Sign in to your AVVA fraud operations account.</p>
          </div>

          <form className="login-form" onSubmit={submit}>
            <label>
              <span>Work email</span>
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              <span className="label-row"><span>Password</span><button type="button">Forgot password?</button></span>
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>

            {error && <div className="form-error" role="alert">{error}</div>}

            <button className="button button--dark button--full" disabled={busy} type="submit">
              {busy ? <><span className="spinner" /> Signing in…</> : <>Sign in <Icon name="arrow" size={18} /></>}
            </button>
          </form>

          <div className="demo-credentials">
            <span className="demo-credentials__icon"><Icon name="lock" size={17} /></span>
            <div><strong>Demo account</strong><span>naledi@avva.co.za · password: demo123</span></div>
          </div>

          <p className="auth-legal">By continuing, you agree to AVVA’s acceptable use and privacy terms.</p>
        </div>
      </section>
    </main>
  )
}

function ConnectionApproval({ session, userCode, onSignOut }) {
  const [deviceRequest, setDeviceRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [approved, setApproved] = useState(false)

  useEffect(() => {
    let active = true
    authApi.deviceRequest(userCode)
      .then((result) => {
        if (active) {
          setDeviceRequest(result)
          if (result.status === 'approved') setApproved(true)
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [userCode])

  async function approve() {
    setBusy(true)
    setError('')
    try {
      await authApi.approveDevice(session.token, userCode)
      setApproved(true)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function deny() {
    setBusy(true)
    try {
      await authApi.denyDevice(session.token, userCode)
      window.location.assign('/')
    } catch (requestError) {
      setError(requestError.message)
      setBusy(false)
    }
  }

  if (loading) return <LoadingScreen />

  return (
    <main className="connect-page">
      <header className="connect-header">
        <Brand />
        <div className="connect-user">
          <span className="avatar avatar--small">{session.user.initials}</span>
          <div><strong>{session.user.name}</strong><span>{session.user.role}</span></div>
          <button className="text-button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <section className="connect-card">
        {approved ? (
          <div className="connect-success">
            <span className="success-seal"><Icon name="check" size={34} /></span>
            <span className="eyebrow">CONNECTION APPROVED</span>
            <h1>Your AVVA extension is connected.</h1>
            <p>You can close this tab and return to the extension. It will sign in as {session.user.name}.</p>
            <button className="button button--dark" onClick={() => window.location.assign('/')}>
              Open dashboard <Icon name="arrow" size={18} />
            </button>
          </div>
        ) : error && !deviceRequest ? (
          <div className="connect-error-state">
            <span className="error-seal">!</span>
            <h1>Connection unavailable</h1>
            <p>{error}</p>
            <button className="button button--secondary" onClick={() => window.location.assign('/')}>Return to dashboard</button>
          </div>
        ) : (
          <>
            <div className="connect-visual">
              <span className="connect-visual__app"><Brand compact light /></span>
              <span className="connect-visual__line"><i /><i /><i /></span>
              <span className="connect-visual__browser"><Icon name="browser" size={28} /></span>
            </div>
            <span className="eyebrow">AUTHORISE EXTENSION</span>
            <h1>Connect this browser to AVVA?</h1>
            <p className="connect-intro"><strong>{deviceRequest?.deviceName}</strong> is requesting access to your fraud operations workspace.</p>

            <div className="code-row"><span>Connection code</span><strong>{userCode.toUpperCase()}</strong></div>

            <div className="permission-list">
              <div><span><Icon name="check" size={16} /></span><p><strong>View your AVVA profile</strong><small>Name, role, and team only</small></p></div>
              <div><span><Icon name="check" size={16} /></span><p><strong>Open your AVVA dashboard</strong><small>Launch the local workspace from the extension</small></p></div>
              <div><span><Icon name="lock" size={16} /></span><p><strong>Your password stays private</strong><small>The extension receives its own revocable access token</small></p></div>
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}

            <div className="connect-actions">
              <button className="button button--dark" disabled={busy} onClick={approve}>
                {busy ? 'Connecting…' : 'Allow connection'}
              </button>
              <button className="button button--secondary" disabled={busy} onClick={deny}>Cancel</button>
            </div>
            <p className="connect-footnote">Only approve connection requests you started from your own browser.</p>
          </>
        )}
      </section>
    </main>
  )
}

function Dashboard({ session, onSignOut }) {
  const [activeNav, setActiveNav] = useState('Transactions')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [connections, setConnections] = useState([])
  const [connectionsLoading, setConnectionsLoading] = useState(true)
  const [connectionError, setConnectionError] = useState('')

  const loadConnections = useCallback(async () => {
    try {
      const result = await authApi.connections(session.token)
      setConnections(result.connections)
      setConnectionError('')
    } catch (requestError) {
      setConnectionError(requestError.message)
    } finally {
      setConnectionsLoading(false)
    }
  }, [session.token])

  useEffect(() => {
    const initialTimer = window.setTimeout(loadConnections, 0)
    const refreshTimer = window.setInterval(loadConnections, 15000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(refreshTimer)
    }
  }, [loadConnections])

  async function revokeConnection(connectionId) {
    await authApi.revokeConnection(session.token, connectionId)
    await loadConnections()
  }

  function selectNav(label) {
    setActiveNav(label)
    setSidebarOpen(false)
  }

  return (
    <div className="app-shell">
      <button
        aria-label="Close navigation"
        className={`sidebar-scrim${sidebarOpen ? ' sidebar-scrim--visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__head">
          <Brand />
          <button aria-label="Close navigation" className="icon-button sidebar__close" onClick={() => setSidebarOpen(false)}><Icon name="close" /></button>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          <span className="nav-label">WORKSPACE</span>
          {navItems.map((item) => (
            <button
              className={`nav-item${activeNav === item.label ? ' nav-item--active' : ''}`}
              key={item.label}
              onClick={() => selectNav(item.label)}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {item.count && <small>{item.count}</small>}
            </button>
          ))}
          <span className="nav-label nav-label--second">SYSTEM</span>
          <button className={`nav-item${activeNav === 'Settings' ? ' nav-item--active' : ''}`} onClick={() => selectNav('Settings')}>
            <Icon name="settings" size={19} /><span>Settings</span>
          </button>
        </nav>

        <div className="sidebar__agent">
          <div className="sidebar__agent-head"><span className="agent-orb">A</span><span><strong>AVVA Agent</strong><small><i /> Online</small></span></div>
          <p>Ready to support your next investigation.</p>
        </div>

        <div className="sidebar__profile">
          <span className="avatar">{session.user.initials}</span>
          <span className="sidebar__profile-copy"><strong>{session.user.name}</strong><small>{session.user.role}</small></span>
          <button aria-label="Sign out" className="icon-button" onClick={onSignOut}><Icon name="logout" size={18} /></button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button aria-label="Open navigation" className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button>
          <div className="topbar__search"><Icon name="search" size={18} /><span>Search cases, entities or transactions</span><kbd>⌘ K</kbd></div>
          <div className="topbar__actions">
            <span className="environment"><i /> Demo environment</span>
            <button aria-label="Notifications" className="icon-button notification-button"><Icon name="bell" size={19} /><i /></button>
            <span className="avatar avatar--top">{session.user.initials}</span>
          </div>
        </header>

        <main className="dashboard-main">
          {activeNav === 'Overview' && (
            <Overview
              connections={connections}
              onNavigate={selectNav}
              user={session.user}
            />
          )}
          {activeNav === 'Investigations' && <InvestigationsView />}
          {activeNav === 'Transactions' && <TransactionsWorkspace session={session} />}
          {['Entities', 'Reports'].includes(activeNav) && <ModuleView module={activeNav} />}
          {activeNav === 'Settings' && (
            <SettingsView
              connections={connections}
              error={connectionError}
              loading={connectionsLoading}
              onRevoke={revokeConnection}
              user={session.user}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function Overview({ connections, onNavigate, user }) {
  const today = new Intl.DateTimeFormat('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())

  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">{today.toUpperCase()}</span><h1>Good morning, {user.name.split(' ')[0]}.</h1><p>Here’s what needs your attention across fraud operations.</p></div>
        <button className="button button--dark"><span className="button-plus">+</span> New investigation</button>
      </div>

      <section className="signal-strip" aria-label="Operations summary">
        <div><span className="signal-icon signal-icon--red"><Icon name="shield" size={19} /></span><p><strong>4</strong><small>Cases need review</small></p><span className="signal-trend signal-trend--red">+2 today</span></div>
        <div><span className="signal-icon signal-icon--amber"><Icon name="clock" size={19} /></span><p><strong>12m</strong><small>Average review time</small></p><span className="signal-trend">↓ 18%</span></div>
        <div><span className="signal-icon signal-icon--green"><Icon name="activity" size={19} /></span><p><strong>28</strong><small>Resolved this week</small></p><span className="signal-trend signal-trend--green">Healthy</span></div>
      </section>

      <div className="overview-grid">
        <section className="panel recent-panel">
          <div className="panel__head"><div><h2>Recent investigations</h2><p>Cases with the latest analyst or agent activity.</p></div><button className="text-link" onClick={() => onNavigate('Investigations')}>View all <Icon name="arrow" size={15} /></button></div>
          <CasesTable compact />
        </section>

        <aside className="panel agent-panel">
          <div className="agent-panel__head"><span className="agent-avatar">A</span><div><span className="agent-name">AVVA</span><span className="agent-online"><i /> Online</span></div><button aria-label="Agent options" className="icon-button"><Icon name="more" /></button></div>
          <div className="agent-panel__body">
            <span className="eyebrow">AGENT BRIEFING</span>
            <h2>Two cases show a shared device pattern.</h2>
            <p>I connected activity across TX-10488 and two related transactions. The evidence is ready for review.</p>
            <div className="agent-finding"><span><Icon name="link" size={16} /></span><div><strong>3 linked entities</strong><small>Confidence: high</small></div></div>
          </div>
          <button className="agent-action">Review agent findings <Icon name="arrow" size={16} /></button>
        </aside>
      </div>

      <section className="extension-banner">
        <div className="extension-banner__visual"><span className="extension-browser"><Icon name="browser" size={25} /></span><span className="extension-link"><i /><i /><i /></span><span className="extension-avva">A</span></div>
        <div className="extension-banner__copy"><span className="eyebrow">BROWSER EXTENSION</span><h2>{connections.length ? `${connections.length} browser connection${connections.length === 1 ? '' : 's'} active` : 'Connect AVVA to your browser'}</h2><p>{connections.length ? 'Your extension can securely open this workspace using your AVVA identity.' : 'Open the unpacked AVVA extension and select “Connect dashboard” to link this account.'}</p></div>
        <div className="extension-banner__status"><span className={`connection-pill${connections.length ? ' connection-pill--active' : ''}`}><i /> {connections.length ? 'Connected' : 'Not connected'}</span><button className="button button--secondary" onClick={() => onNavigate('Settings')}>Manage access</button></div>
      </section>
    </>
  )
}

function CasesTable({ compact = false }) {
  const cases = compact ? recentCases.slice(0, 4) : recentCases
  return (
    <div className="table-wrap">
      <table className="cases-table">
        <thead><tr><th>Case</th><th>Transaction</th><th>Risk</th><th>Status</th><th>Assigned</th><th>Updated</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {cases.map((item) => (
            <tr key={item.id}>
              <td><button className="case-link">{item.id}</button><small>{item.subject}</small></td>
              <td className="mono">{item.transaction}</td>
              <td><span className={`risk risk--${item.risk.toLowerCase()}`}><i />{item.risk}</span></td>
              <td><span className="case-status">{item.status}</span></td>
              <td><span className="analyst-cell"><i>{item.analyst.split(' ').map((part) => part[0]).join('')}</i>{item.analyst}</span></td>
              <td className="muted-cell">{item.updated}</td>
              <td><button aria-label={`Open ${item.id}`} className="icon-button row-arrow"><Icon name="chevron" size={17} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InvestigationsView() {
  return (
    <>
      <div className="page-heading page-heading--compact"><div><span className="eyebrow">CASE MANAGEMENT</span><h1>Investigations</h1><p>Review agent findings, evidence, and recommended actions.</p></div><button className="button button--dark"><span className="button-plus">+</span> New investigation</button></div>
      <section className="panel full-table-panel">
        <div className="panel__head"><div className="filter-tabs"><button className="active">Open <span>4</span></button><button>Monitoring <span>7</span></button><button>Resolved <span>28</span></button></div><div className="small-search"><Icon name="search" size={16} /> Filter cases</div></div>
        <CasesTable />
      </section>
    </>
  )
}

const moduleCopy = {
  Transactions: ['Transaction intelligence', 'Search and review the transactions connected to your investigation queue.'],
  Entities: ['Entity intelligence', 'Explore customers, beneficiaries, employees, and the links between them.'],
  Reports: ['Investigation reports', 'Prepare clear, explainable summaries for fraud operations and compliance teams.'],
}

function ModuleView({ module }) {
  const [title, description] = moduleCopy[module]
  return (
    <>
      <div className="page-heading page-heading--compact"><div><span className="eyebrow">AVVA WORKSPACE</span><h1>{module}</h1><p>{description}</p></div></div>
      <section className="panel module-placeholder">
        <span className="module-placeholder__icon"><Icon name={module === 'Transactions' ? 'transactions' : module === 'Entities' ? 'entities' : 'reports'} size={28} /></span>
        <span className="eyebrow">WORKSPACE READY</span><h2>{title}</h2><p>This focused dashboard shell is ready for the investigation data layer when you add it.</p>
        <button className="button button--secondary">View product roadmap</button>
      </section>
    </>
  )
}

function SettingsView({ connections, error, loading, onRevoke, user }) {
  const [revoking, setRevoking] = useState('')

  async function revoke(id) {
    setRevoking(id)
    await onRevoke(id).finally(() => setRevoking(''))
  }

  return (
    <>
      <div className="page-heading page-heading--compact"><div><span className="eyebrow">ACCOUNT & ACCESS</span><h1>Settings</h1><p>Manage your AVVA profile and connected browser extensions.</p></div></div>
      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="settings-card__head"><span className="settings-icon"><Icon name="shield" size={20} /></span><div><h2>Your profile</h2><p>Identity shared with approved AVVA clients.</p></div></div>
          <div className="profile-summary"><span className="avatar avatar--large">{user.initials}</span><div><strong>{user.name}</strong><span>{user.email}</span><small>{user.role} · {user.team}</small></div></div>
          <div className="settings-note"><Icon name="lock" size={16} /><span>This local prototype keeps demo sessions in memory and resets them when the API restarts.</span></div>
        </section>

        <section className="panel settings-card settings-card--connections">
          <div className="settings-card__head"><span className="settings-icon"><Icon name="browser" size={20} /></span><div><h2>Browser connections</h2><p>Extensions currently authorised for your account.</p></div></div>
          {error && <div className="form-error">{error}</div>}
          {loading ? (
            <div className="connections-loading"><span className="spinner spinner--dark" /> Loading connections…</div>
          ) : connections.length ? (
            <div className="connections-list">
              {connections.map((connection) => (
                <div className="connection-row" key={connection.id}>
                  <span className="connection-row__icon"><Icon name="browser" size={20} /></span>
                  <div><strong>{connection.deviceName}</strong><span>{connection.browser} · Connected {formatDate(connection.connectedAt)}</span></div>
                  <span className="connection-pill connection-pill--active"><i /> Active</span>
                  <button className="button button--danger-ghost" disabled={revoking === connection.id} onClick={() => revoke(connection.id)}>{revoking === connection.id ? 'Revoking…' : 'Revoke'}</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-connections"><span><Icon name="browser" size={24} /></span><div><strong>No browser extensions connected</strong><p>Open the AVVA extension and select “Connect dashboard” to begin.</p></div></div>
          )}
        </section>
      </div>
    </>
  )
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

export default App
