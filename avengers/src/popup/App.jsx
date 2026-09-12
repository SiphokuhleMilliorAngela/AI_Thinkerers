import { useEffect, useMemo, useState } from 'react'

const isExtension = typeof chrome !== 'undefined' && chrome.runtime?.sendMessage

const buttonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-950 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700'

const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700'

const initialMessages = [
  {
    role: 'assistant',
    content: 'You are signed in. Open the dashboard overview, then ask me what to inspect.',
  },
]

function App() {
  const [status, setStatus] = useState('Checking session...')
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [dashboardTabs, setDashboardTabs] = useState([])
  const [selectedTabId, setSelectedTabId] = useState(null)
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const conversationForModel = useMemo(() => {
    return messages.filter((message) => ['user', 'assistant'].includes(message.role))
  }, [messages])

  useEffect(() => {
    let active = true

    sendToBackground({ type: 'auth.me' })
      .then((response) => {
        if (!active) return
        if (response?.connected) {
          setSession(response.session)
          setStatus('Ready')
        } else {
          setStatus(response?.expired ? 'Session expired. Sign in again.' : 'Sign in to continue.')
        }
      })
      .catch((error) => {
        if (active) setStatus(error.message)
      })
      .finally(() => {
        if (active) setAuthChecked(true)
      })

    return () => {
      active = false
    }
  }, [])

  const sendToAgent = async (message) => {
    const response = await sendToBackground(message)
    setStatus(response.ok ? 'Ready' : response.error ?? 'Something went wrong')
    return response
  }

  const signIn = async ({ email, password }) => {
    setIsWorking(true)
    setStatus('Signing in...')

    try {
      const response = await sendToBackground({ type: 'auth.login', email, password })
      setSession(response.session)
      setStatus(response.dashboardOpened ? 'Dashboard overview opened.' : 'Ready')
    } catch (error) {
      setStatus(error.message)
    } finally {
      setIsWorking(false)
    }
  }

  const signOut = async () => {
    setIsWorking(true)
    try {
      await sendToBackground({ type: 'auth.logout' })
      setSession(null)
      setDashboardTabs([])
      setSelectedTabId(null)
      setMessages(initialMessages)
      setStatus('Signed out.')
    } catch (error) {
      setStatus(error.message)
    } finally {
      setIsWorking(false)
    }
  }

  const openDashboard = async () => {
    setIsWorking(true)
    setStatus('Opening dashboard...')
    try {
      await sendToBackground({ type: 'dashboard.openAuthenticated', view: 'overview' })
      setStatus('Dashboard overview opened.')
    } catch (error) {
      setStatus(error.message)
    } finally {
      setIsWorking(false)
    }
  }

  const readDashboard = async () => {
    setIsWorking(true)
    setStatus('Reading tabs...')

    const response = await sendToAgent({
      type: 'dashboard.read',
      query: 'dashboard simulation',
    })

    if (response?.ok) {
      setDashboardTabs(response.candidates)
      setSelectedTabId(response.activeContext?.id ?? response.candidates[0]?.id ?? null)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: response.activeContext
            ? `I can see "${response.activeContext.title}". Ask a follow-up and I will use that tab context.`
            : 'I could not find a dashboard-like tab yet. Open the dashboard overview and try again.',
        },
      ])
    }

    setIsWorking(false)
  }

  const sendPrompt = async () => {
    const content = draft.trim()

    if (!content || isWorking) {
      return
    }

    const nextMessages = [...conversationForModel, { role: 'user', content }]
    setMessages(nextMessages)
    setDraft('')
    setIsWorking(true)
    setStatus('Asking OpenRouter...')

    const response = await sendToAgent({
      type: 'agent.run',
      messages: nextMessages,
      contextTabId: selectedTabId,
    })

    setMessages((current) => [
      ...current,
      {
        role: 'assistant',
        content: response?.ok ? String(response.result) : response?.error ?? 'No response returned.',
      },
    ])
    setIsWorking(false)
  }

  const clearChat = () => {
    setMessages(initialMessages)
    setDraft('')
    setStatus('Ready')
  }

  if (!authChecked) {
    return (
      <main className="grid h-screen place-items-center bg-slate-50 p-6 text-slate-700">
        <section className="text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-slate-950 text-lg font-bold text-white">
            av
          </span>
          <p className="text-sm font-semibold">{status}</p>
        </section>
      </main>
    )
  }

  if (!session) {
    return <SignInView busy={isWorking} onSignIn={signIn} status={status} />
  }

  return (
    <main className="flex h-screen w-full flex-col bg-slate-50 text-sm text-slate-600">
      <header className="border-b border-slate-200 bg-white p-4">
        <section className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600 shadow-[0_0_0_4px_rgba(22,138,90,0.13)]"
              aria-hidden="true"
            ></span>
            <div>
              <h1 className="mb-1 text-xl font-bold leading-tight text-slate-950">av</h1>
              <p>Signed in as {session.user.name}. Agent actions stay inside your browser tabs.</p>
            </div>
          </div>
          <button className="text-xs font-bold text-slate-500 hover:text-slate-950" onClick={signOut} type="button">
            Sign out
          </button>
        </section>

        <section className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-emerald-950">Dashboard auth active</span>
            <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
              Signed in
            </span>
          </div>
          <p className="mt-2 text-xs text-emerald-800">
            {status}. Open the dashboard overview, then ask the agent to inspect visible tabs.
          </p>
        </section>
      </header>

      <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <article
            className={`max-w-[92%] rounded-lg px-3 py-2 text-left shadow-sm ${
              message.role === 'user'
                ? 'ml-auto bg-blue-600 text-white'
                : 'mr-auto border border-slate-200 bg-white text-slate-700'
            }`}
            key={`${message.role}-${index}`}
          >
            <p className="mb-1 text-[11px] font-bold uppercase tracking-normal opacity-70">
              {message.role === 'user' ? 'You' : 'av'}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </article>
        ))}
      </section>

      <aside className="border-t border-slate-200 bg-white p-4">
        <section className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
          <div className="grid grid-cols-2 gap-2">
            <button className={primaryButtonClass} type="button" onClick={openDashboard} disabled={isWorking}>
              Open overview
            </button>
            <button className={buttonClass} type="button" onClick={readDashboard} disabled={isWorking}>
              Read tabs
            </button>
          </div>
          {dashboardTabs.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {dashboardTabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    className={`w-full rounded-md border p-2 text-left ${
                      selectedTabId === tab.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-transparent bg-white hover:border-slate-200'
                    }`}
                    type="button"
                    onClick={() => setSelectedTabId(tab.id)}
                  >
                    <p className="truncate font-semibold text-slate-800">{tab.title}</p>
                    <p className="truncate text-xs text-slate-500">{tab.url}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Open the dashboard overview in this browser window, then read tabs.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <textarea
            className="min-h-24 resize-none rounded-lg border border-slate-300 bg-white p-2.5 leading-relaxed text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            placeholder="Ask a follow-up about the dashboard..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                sendPrompt()
              }
            }}
          ></textarea>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button className={buttonClass} type="button" onClick={sendPrompt} disabled={isWorking}>
              {isWorking ? 'Working...' : 'Send message'}
            </button>
            <button className={buttonClass} type="button" onClick={clearChat} disabled={isWorking}>
              Clear
            </button>
          </div>
        </section>
      </aside>
    </main>
  )
}

function SignInView({ busy, onSignIn, status }) {
  const [email, setEmail] = useState('naledi@avva.co.za')
  const [password, setPassword] = useState('demo123')

  function submit(event) {
    event.preventDefault()
    onSignIn({ email, password })
  }

  return (
    <main className="flex h-screen w-full flex-col bg-stone-50 text-sm text-slate-600">
      <header className="border-b border-stone-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-slate-950 text-base font-bold text-white">
            av
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Sign in</h1>
            <p>Use your AVVA dashboard account.</p>
          </div>
        </div>
      </header>

      <section className="flex flex-1 flex-col justify-center p-5">
        <form className="space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">Work email</span>
            <input
              autoComplete="email"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">Password</span>
            <input
              autoComplete="current-password"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <button className={primaryButtonClass + ' w-full'} disabled={busy} type="submit">
            {busy ? 'Signing in...' : 'Sign in and open dashboard'}
          </button>
        </form>

        <section className="mt-5 rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">Status</p>
          <p className="mt-1 text-sm text-slate-700">{status}</p>
        </section>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Demo account: naledi@avva.co.za / demo123. The dashboard remains a separate web app.
        </p>
      </section>
    </main>
  )
}

function sendToBackground(message) {
  if (!isExtension) {
    return Promise.reject(new Error('Open this page as the unpacked extension to use AVVA auth.'))
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      if (!response?.ok) {
        reject(new Error(response?.error ?? 'AVVA could not complete this request.'))
        return
      }

      resolve(response)
    })
  })
}

export default App
