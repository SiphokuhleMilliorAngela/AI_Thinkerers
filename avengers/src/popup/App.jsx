const isExtension = typeof chrome !== 'undefined' && chrome.runtime?.sendMessage

function App() {
  const sendToAgent = async (message) => {
    if (!isExtension) {
      console.info('Extension APIs are unavailable in Vite dev mode.')
      return
    }

    const response = await chrome.runtime.sendMessage(message)
    console.info(response)
  }

  return (
    <main className="flex min-h-[480px] w-[380px] flex-col gap-4 bg-slate-50 p-5 text-sm text-slate-600">
      <section className="flex items-start gap-3">
        <span
          className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600 shadow-[0_0_0_4px_rgba(22,138,90,0.13)]"
          aria-hidden="true"
        ></span>
        <div>
          <h1 className="mb-1 text-xl font-bold leading-tight text-slate-950">
            av
          </h1>
          <p>Read tabs, plan work, and call local Node tools over WebSockets.</p>
        </div>
      </section>

      <section className="flex flex-col gap-2.5 text-left">
        <label className="text-[13px] font-bold text-slate-950" htmlFor="goal">
          Agent task
        </label>
        <textarea
          className="min-h-28 resize-y rounded-lg border border-slate-300 bg-white p-2.5 leading-relaxed text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          id="goal"
          placeholder="Summarize my open tabs and draft the next action..."
          rows="5"
        ></textarea>
        <button
          className="min-h-10 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-950 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          type="button"
          onClick={() =>
            sendToAgent({
              type: 'agent.run',
              goal: document.getElementById('goal').value,
            })
          }
        >
          Run agent
        </button>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <button
          className="min-h-10 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-950 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          type="button"
          onClick={() => sendToAgent({ type: 'auth.login' })}
        >
          Sign in
        </button>
        <button
          className="min-h-10 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-950 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          type="button"
          onClick={() => sendToAgent({ type: 'tabs.read' })}
        >
          Read tabs
        </button>
        <button
          className="min-h-10 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-950 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          type="button"
          onClick={() => sendToAgent({ type: 'tools.ping' })}
        >
          Tool server
        </button>
      </section>
    </main>
  )
}

export default App
