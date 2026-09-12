import { useMemo, useState } from 'react'

const isExtension = typeof chrome !== 'undefined' && chrome.runtime?.sendMessage

const buttonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-950 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600'

const initialMessages = [
  {
    role: 'assistant',
    content: 'Open the dashboard simulation tab, then ask me what to inspect.',
  },
]

function App() {
  const [status, setStatus] = useState('Ready')
  const [dashboardTabs, setDashboardTabs] = useState([])
  const [selectedTabId, setSelectedTabId] = useState(null)
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const conversationForModel = useMemo(() => {
    return messages.filter((message) => ['user', 'assistant'].includes(message.role))
  }, [messages])

  const sendToAgent = async (message) => {
    if (!isExtension) {
      console.info('Extension APIs are unavailable in Vite dev mode.')
      setStatus('Open as an extension to read browser tabs.')
      return null
    }

    const response = await chrome.runtime.sendMessage(message)
    console.info(response)
    setStatus(response.ok ? 'Ready' : response.error ?? 'Something went wrong')
    return response
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
            : 'I could not find a dashboard-like tab yet. Open it in this browser window and try again.',
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

  return (
    <main className="flex h-screen w-full flex-col bg-slate-50 text-sm text-slate-600">
      <header className="border-b border-slate-200 bg-white p-4">
        <section className="flex items-start gap-3">
          <span
            className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600 shadow-[0_0_0_4px_rgba(22,138,90,0.13)]"
            aria-hidden="true"
          ></span>
          <div>
            <h1 className="mb-1 text-xl font-bold leading-tight text-slate-950">av</h1>
            <p>Chat with your internal web app tabs and run safe page actions.</p>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-amber-950">OpenRouter test mode</span>
            <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
              Auth off
            </span>
          </div>
          <p className="mt-2 text-xs text-amber-800">
            {status}. Drafting and safe clicks are allowed; Send and approvals stay blocked.
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-950">Visible app tabs</h2>
            <button className={buttonClass} type="button" onClick={readDashboard} disabled={isWorking}>
              Read dashboard
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
              Open the dashboard simulation in this browser window, then read it.
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

export default App
