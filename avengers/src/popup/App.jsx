import { useState } from 'react'

const isExtension = typeof chrome !== 'undefined' && chrome.runtime?.sendMessage

const buttonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-950 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600'

function App() {
  const [status, setStatus] = useState('Ready')
  const [dashboardTabs, setDashboardTabs] = useState([])
  const [lastResult, setLastResult] = useState('')

  const sendToAgent = async (message) => {
    if (!isExtension) {
      console.info('Extension APIs are unavailable in Vite dev mode.')
      setStatus('Open as an extension to read browser tabs.')
      return
    }

    setStatus('Working...')
    const response = await chrome.runtime.sendMessage(message)
    console.info(response)
    setStatus(response.ok ? 'Done' : response.error ?? 'Something went wrong')
    return response
  }

  const readDashboard = async () => {
    const response = await sendToAgent({
      type: 'dashboard.read',
      query: 'dashboard simulation',
    })

    if (response?.ok) {
      setDashboardTabs(response.candidates)
      setLastResult(
        response.activeContext
          ? `Using: ${response.activeContext.title}`
          : 'No readable dashboard tab found.',
      )
    }
  }

  const runAgent = async () => {
    const response = await sendToAgent({
      type: 'agent.run',
      goal: document.getElementById('goal').value,
    })

    if (response?.ok) {
      setLastResult(String(response.result))
    }
  }

  return (
    <main className="flex h-screen w-full flex-col gap-4 overflow-y-auto bg-slate-50 p-5 text-sm text-slate-600">
      <section className="flex items-start gap-3">
        <span
          className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600 shadow-[0_0_0_4px_rgba(22,138,90,0.13)]"
          aria-hidden="true"
        ></span>
        <div>
          <h1 className="mb-1 text-xl font-bold leading-tight text-slate-950">
            av
          </h1>
          <p>Read internal web app tabs, plan work, and call local tools.</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-950">Auth0 session</span>
          <button
            className={buttonClass}
            type="button"
            onClick={() => sendToAgent({ type: 'auth.login' })}
          >
            Sign in
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{status}</p>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2.5 text-left">
        <label className="text-[13px] font-bold text-slate-950" htmlFor="goal">
          Agent task
        </label>
        <textarea
          className="min-h-40 flex-1 resize-none rounded-lg border border-slate-300 bg-white p-2.5 leading-relaxed text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          id="goal"
          placeholder="Summarize my open tabs and draft the next action..."
          rows="5"
        ></textarea>
        <button
          className={buttonClass}
          type="button"
          onClick={runAgent}
        >
          Run with tab context
        </button>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button
          className={buttonClass}
          type="button"
          onClick={readDashboard}
        >
          Read dashboard tab
        </button>
        <button
          className={buttonClass}
          type="button"
          onClick={() => sendToAgent({ type: 'tools.ping' })}
        >
          Tool server
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 text-left">
        <h2 className="text-sm font-bold text-slate-950">Visible app tabs</h2>
        {dashboardTabs.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {dashboardTabs.map((tab) => (
              <li key={tab.id} className="rounded-md bg-slate-50 p-2">
                <p className="truncate font-semibold text-slate-800">{tab.title}</p>
                <p className="truncate text-xs text-slate-500">{tab.url}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Open the dashboard simulation in this browser window, then read it.
          </p>
        )}
      </section>

      {lastResult && (
        <section className="rounded-lg border border-slate-200 bg-white p-3 text-left">
          <h2 className="text-sm font-bold text-slate-950">Agent output</h2>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
            {lastResult}
          </p>
        </section>
      )}
    </main>
  )
}

export default App
