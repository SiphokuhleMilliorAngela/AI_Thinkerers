import { useCallback, useEffect, useMemo, useState } from 'react'
import { ledgerApi } from './api.js'
import './transactions.css'

const zarFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
})

function formatZar(value) {
  return zarFormatter.format(Number(value) || 0).replace('ZAR', 'R')
}

function formatDate(value, full = false) {
  return new Intl.DateTimeFormat('en-ZA', full
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
  ).format(new Date(value))
}

function WorkspaceIcon({ name, size = 20 }) {
  const paths = {
    wallet: <><path d="M4 7.5V6a2 2 0 0 1 2-2h12v4"/><rect x="3" y="8" width="18" height="12" rx="3"/><path d="M16 13h5v3h-5a1.5 1.5 0 0 1 0-3Z"/></>,
    arrowUp: <><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/></>,
    arrowDown: <><path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff: <><path d="m3 3 18 18M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.1 2.8M6.5 6.5C3.6 8.2 2 12 2 12s3.5 6 10 6a9.7 9.7 0 0 0 3.5-.6M10.6 10.6a2 2 0 0 0 2.8 2.8"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    shield: <><path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 6l2 6M17.9 16A7 7 0 0 1 6 18l-2-6"/></>,
    building: <><path d="M3 21h18M6 21V7l6-4 6 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 21v-4h4v4"/></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  }

  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
      {paths[name]}
    </svg>
  )
}

export default function TransactionsWorkspace({ session }) {
  const [summary, setSummary] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [beneficiaries, setBeneficiaries] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('All')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [balancesVisible, setBalancesVisible] = useState(true)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [paymentOpen, setPaymentOpen] = useState(false)

  const loadLedger = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [summaryResult, accountResult, beneficiaryResult, transactionResult] = await Promise.all([
        ledgerApi.summary(session.token),
        ledgerApi.accounts(session.token),
        ledgerApi.beneficiaries(session.token),
        ledgerApi.transactions(session.token, { limit: 100 }),
      ])
      setSummary(summaryResult.summary)
      setAccounts(accountResult.accounts)
      setBeneficiaries(beneficiaryResult.beneficiaries)
      setTransactions(transactionResult.transactions)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [session.token])

  useEffect(() => {
    const timer = window.setTimeout(() => loadLedger(), 0)
    return () => window.clearTimeout(timer)
  }, [loadLedger])

  useEffect(() => {
    if (!selectedTransaction && !paymentOpen) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setSelectedTransaction(null)
        setPaymentOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [paymentOpen, selectedTransaction])

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return transactions.filter((transaction) => {
      const matchesSearch = !query || [transaction.id, transaction.counterparty, transaction.description, transaction.reference]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
      const matchesRisk = riskFilter === 'All' || transaction.risk.level === riskFilter
      const matchesDirection = directionFilter === 'all' || transaction.direction === directionFilter
      const matchesAccount = accountFilter === 'all' || transaction.accountId === accountFilter
      return matchesSearch && matchesRisk && matchesDirection && matchesAccount
    })
  }, [accountFilter, directionFilter, riskFilter, search, transactions])

  async function paymentCompleted(result) {
    await loadLedger({ quiet: true })
    setSelectedTransaction(result.transaction)
  }

  return (
    <div className="money-workspace" data-avva-page="transactions" data-avva-currency="ZAR">
      <div className="money-heading">
        <div>
          <span className="money-eyebrow">SIMULATED BANKING · SOUTH AFRICA</span>
          <h1>Transactions</h1>
          <p>Review money movement, risk signals, and send test payments in South African Rand.</p>
        </div>
        <div className="money-heading__actions">
          <button aria-label="Refresh transactions" className="money-icon-button" onClick={() => loadLedger()}><WorkspaceIcon name="refresh" size={18} /></button>
          <button className="send-button" onClick={() => setPaymentOpen(true)}><WorkspaceIcon name="send" size={17} /> Send money</button>
        </div>
      </div>

      {error && !summary ? (
        <section className="ledger-error">
          <span>!</span><div><strong>Couldn’t load the ZAR ledger</strong><p>{error}</p></div><button onClick={() => loadLedger()}>Try again</button>
        </section>
      ) : (
        <>
          <section className="balance-hero" data-avva-total-balance={summary?.totalBalance ?? 0}>
            <div className="balance-hero__main">
              <span className="balance-label">TOTAL BALANCE</span>
              <div className="balance-value">
                <strong>{loading ? 'R —' : balancesVisible ? formatZar(summary?.totalBalance) : 'R ••••••'}</strong>
                <button aria-label={balancesVisible ? 'Hide balances' : 'Show balances'} onClick={() => setBalancesVisible((visible) => !visible)}><WorkspaceIcon name={balancesVisible ? 'eye' : 'eyeOff'} size={18} /></button>
              </div>
              <p><span className="live-dot" /> Available now: {balancesVisible ? formatZar(summary?.availableBalance) : 'R ••••••'}</p>
            </div>
            <div className="balance-metrics">
              <div><span className="metric-icon metric-icon--in"><WorkspaceIcon name="arrowDown" size={17} /></span><p><small>Money in</small><strong>{balancesVisible ? formatZar(summary?.inflow) : 'R ••••'}</strong></p></div>
              <div><span className="metric-icon metric-icon--out"><WorkspaceIcon name="arrowUp" size={17} /></span><p><small>Money out</small><strong>{balancesVisible ? formatZar(summary?.outflow) : 'R ••••'}</strong></p></div>
              <div><span className="metric-icon metric-icon--risk"><WorkspaceIcon name="shield" size={17} /></span><p><small>Flagged</small><strong>{summary?.flaggedCount ?? 0} transactions</strong></p></div>
            </div>
          </section>

          <section className="account-strip" aria-label="Accounts">
            <button className={`account-chip${accountFilter === 'all' ? ' account-chip--active' : ''}`} onClick={() => setAccountFilter('all')}>
              <span className="account-chip__icon"><WorkspaceIcon name="wallet" size={18} /></span>
              <p><small>All accounts</small><strong>{balancesVisible ? formatZar(summary?.totalBalance) : 'R ••••••'}</strong></p>
              <span className="account-check">✓</span>
            </button>
            {accounts.map((account) => (
              <button
                className={`account-chip${accountFilter === account.id ? ' account-chip--active' : ''}`}
                key={account.id}
                onClick={() => setAccountFilter(account.id)}
              >
                <span className="account-chip__icon"><WorkspaceIcon name="building" size={18} /></span>
                <p><small>{account.name} · {account.accountNumber}</small><strong>{balancesVisible ? formatZar(account.balance) : 'R ••••••'}</strong></p>
                <span className="account-check">✓</span>
              </button>
            ))}
          </section>

          <section className="transactions-panel">
            <header className="transactions-panel__head">
              <div><h2>Transaction history</h2><p>{filteredTransactions.length} of {transactions.length} transactions</p></div>
              <span className="simulation-badge"><i /> Live simulation</span>
            </header>

            <div className="transaction-tools">
              <label className="transaction-search"><WorkspaceIcon name="search" size={17} /><input aria-label="Search transactions" onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, counterparty or reference" value={search} /></label>
              <div className="filter-group" aria-label="Direction filter">
                {['all', 'debit', 'credit'].map((direction) => <button className={directionFilter === direction ? 'active' : ''} key={direction} onClick={() => setDirectionFilter(direction)}>{direction === 'all' ? 'All' : direction === 'debit' ? 'Money out' : 'Money in'}</button>)}
              </div>
              <label className="risk-select"><WorkspaceIcon name="filter" size={15} /><select aria-label="Risk filter" onChange={(event) => setRiskFilter(event.target.value)} value={riskFilter}><option>All</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
            </div>

            {loading ? (
              <div className="transaction-loading"><span className="ledger-spinner" /><p>Loading transaction history…</p></div>
            ) : filteredTransactions.length ? (
              <div className="money-table-wrap">
                <table className="money-table">
                  <thead><tr><th>Transaction</th><th>Counterparty</th><th>Risk</th><th>Status</th><th>Date</th><th className="amount-head">Amount</th><th /></tr></thead>
                  <tbody>
                    {filteredTransactions.map((transaction) => (
                      <tr
                        data-avva-amount={transaction.amount}
                        data-avva-beneficiary-id={transaction.beneficiaryId ?? ''}
                        data-avva-currency="ZAR"
                        data-avva-customer-id={transaction.customerId}
                        data-avva-risk={transaction.risk.level}
                        data-avva-status={transaction.status}
                        data-avva-transaction-id={transaction.id}
                        key={transaction.id}
                        onClick={() => setSelectedTransaction(transaction)}
                      >
                        <td><span className={`direction-icon direction-icon--${transaction.direction}`}><WorkspaceIcon name={transaction.direction === 'credit' ? 'arrowDown' : 'arrowUp'} size={15} /></span><p><strong>{transaction.id}</strong><small>{transaction.type}</small></p></td>
                        <td><strong className="counterparty">{transaction.counterparty}</strong><small>{transaction.reference}</small></td>
                        <td><RiskPill risk={transaction.risk} /></td>
                        <td><span className={`tx-status tx-status--${transaction.status.toLowerCase().replace(' ', '-')}`}><i />{transaction.status}</span></td>
                        <td><strong className="date-copy">{formatDate(transaction.timestamp)}</strong><small>{transaction.channel}</small></td>
                        <td className={`money-amount money-amount--${transaction.direction}`}>{transaction.direction === 'credit' ? '+' : '−'}{formatZar(transaction.amount)}</td>
                        <td><button aria-label={`View ${transaction.id}`} className="row-chevron"><WorkspaceIcon name="chevron" size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-transactions"><span><WorkspaceIcon name="search" size={24} /></span><h3>No matching transactions</h3><p>Try clearing a filter or using a different search term.</p><button onClick={() => { setSearch(''); setRiskFilter('All'); setDirectionFilter('all'); setAccountFilter('all') }}>Clear filters</button></div>
            )}
          </section>
        </>
      )}

      {selectedTransaction && <TransactionDrawer transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />}
      {paymentOpen && (
        <PaymentDialog
          accounts={accounts}
          beneficiaries={beneficiaries}
          onClose={() => setPaymentOpen(false)}
          onCompleted={paymentCompleted}
          token={session.token}
        />
      )}
    </div>
  )
}

function RiskPill({ risk }) {
  return <span className={`money-risk money-risk--${risk.level.toLowerCase()}`} title={`Risk score ${risk.score}`}><i />{risk.level}</span>
}

function TransactionDrawer({ transaction, onClose }) {
  const [copied, setCopied] = useState(false)

  async function copyId() {
    await navigator.clipboard.writeText(transaction.id).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button aria-label="Close transaction details" className="drawer-scrim" onClick={onClose} />
      <aside
        aria-label={`Transaction ${transaction.id}`}
        aria-modal="true"
        className="transaction-drawer"
        data-avva-amount={transaction.amount}
        data-avva-beneficiary-id={transaction.beneficiaryId ?? ''}
        data-avva-currency="ZAR"
        data-avva-risk={transaction.risk.level}
        data-avva-transaction-detail="true"
        data-avva-transaction-id={transaction.id}
        role="dialog"
      >
        <header className="drawer-head"><div><span>TRANSACTION DETAIL</span><h2>{transaction.id}</h2></div><button aria-label="Close" onClick={onClose}><WorkspaceIcon name="close" size={19} /></button></header>
        <div className="drawer-body">
          <section className="transaction-summary">
            <span className={`direction-icon direction-icon--large direction-icon--${transaction.direction}`}><WorkspaceIcon name={transaction.direction === 'credit' ? 'arrowDown' : 'arrowUp'} size={20} /></span>
            <span>{transaction.direction === 'credit' ? 'MONEY RECEIVED' : 'MONEY SENT'}</span>
            <strong className={transaction.direction === 'credit' ? 'positive' : ''}>{transaction.direction === 'credit' ? '+' : '−'}{formatZar(transaction.amount)}</strong>
            <p>{transaction.counterparty}</p>
            <span className={`tx-status tx-status--${transaction.status.toLowerCase().replace(' ', '-')}`}><i />{transaction.status}</span>
          </section>

          {transaction.simulated && <div className="simulated-callout"><span>SIMULATED</span><p>This payment was created in the AVVA local ledger. The source balance was debited from {formatZar(transaction.balanceBefore)} to {formatZar(transaction.balanceAfter)}.</p></div>}

          <section className={`risk-card risk-card--${transaction.risk.level.toLowerCase()}`}>
            <header><span><WorkspaceIcon name="shield" size={19} /></span><div><small>AVVA RISK DETERMINATION</small><h3>{transaction.risk.level} risk · {transaction.risk.score}/100</h3></div><RiskPill risk={transaction.risk} /></header>
            <p className="risk-language">This indicates possible suspicious activity and does not confirm fraud.</p>
            <ul>{transaction.risk.signals.map((signal) => <li key={signal}><span>•</span>{signal}</li>)}</ul>
            <div className="risk-recommendation"><small>RECOMMENDATION</small><strong>{transaction.risk.recommendation}</strong></div>
          </section>

          <section className="detail-section"><h3>Payment information</h3><dl>
            <div><dt>Transaction ID</dt><dd>{transaction.id}<button aria-label="Copy transaction ID" onClick={copyId}><WorkspaceIcon name={copied ? 'check' : 'copy'} size={14} /></button></dd></div>
            <div><dt>Description</dt><dd>{transaction.description}</dd></div>
            <div><dt>Reference</dt><dd>{transaction.reference}</dd></div>
            <div><dt>Date and time</dt><dd>{formatDate(transaction.timestamp, true)}</dd></div>
            <div><dt>Channel</dt><dd>{transaction.channel}</dd></div>
            <div><dt>Account</dt><dd>{transaction.accountId}</dd></div>
          </dl></section>

          <section className="agent-ready"><span className="agent-ready__mark">A</span><div><strong>Ready for AVVA</strong><p>Structured transaction context and {transaction.risk.signals.length} explainable signal{transaction.risk.signals.length === 1 ? '' : 's'} are available to the browser agent.</p></div><span className="agent-ready__status"><i /> Ready</span></section>
        </div>
      </aside>
    </div>
  )
}

function PaymentDialog({ accounts, beneficiaries, onClose, onCompleted, token }) {
  const [sourceAccountId, setSourceAccountId] = useState(accounts[0]?.id ?? '')
  const [beneficiaryId, setBeneficiaryId] = useState(beneficiaries.find((item) => item.status === 'Trusted')?.id ?? beneficiaries[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)

  const account = accounts.find((item) => item.id === sourceAccountId)
  const beneficiary = beneficiaries.find((item) => item.id === beneficiaryId)
  const numericAmount = Number(amount) || 0
  const afterBalance = account ? account.balance - numericAmount : 0

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await ledgerApi.sendPayment(token, {
        sourceAccountId,
        beneficiaryId,
        amount: numericAmount,
        reference,
      })
      setReceipt(result)
      await onCompleted(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="payment-layer">
      <button aria-label="Close payment" className="payment-scrim" onClick={onClose} />
      <section aria-label="Send simulated payment" aria-modal="true" className="payment-dialog" role="dialog">
        {receipt ? (
          <div className="payment-success">
            <span className="payment-success__check"><WorkspaceIcon name="check" size={31} /></span>
            <span className="money-eyebrow">PAYMENT COMPLETE</span>
            <h2>{formatZar(receipt.transaction.amount)} sent</h2>
            <p>Your simulated payment to <strong>{receipt.transaction.counterparty}</strong> was completed and added to transaction history.</p>
            <div className="receipt-card"><div><span>Transaction</span><strong>{receipt.transaction.id}</strong></div><div><span>Previous balance</span><strong>{formatZar(receipt.debit.balanceBefore)}</strong></div><div><span>New balance</span><strong>{formatZar(receipt.debit.balanceAfter)}</strong></div></div>
            <button className="send-button send-button--full" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <header className="payment-head"><div><span className="money-eyebrow">NEW SIMULATED PAYMENT</span><h2>Send money</h2><p>Funds are debited from the selected local demo account.</p></div><button aria-label="Close" onClick={onClose}><WorkspaceIcon name="close" size={19} /></button></header>
            <form className="payment-form" onSubmit={submit}>
              <label><span>From account</span><select onChange={(event) => setSourceAccountId(event.target.value)} required value={sourceAccountId}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.accountNumber} · {formatZar(item.availableBalance)}</option>)}</select></label>
              <label><span>Beneficiary</span><select onChange={(event) => setBeneficiaryId(event.target.value)} required value={beneficiaryId}>{beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.bank} · {item.status}</option>)}</select></label>
              <label><span>Amount</span><div className="amount-input"><b>R</b><input inputMode="decimal" min="0.01" onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={amount} /></div></label>
              <label><span>Payment reference</span><input maxLength="40" minLength="3" onChange={(event) => setReference(event.target.value)} placeholder="e.g. September invoice" required value={reference} /></label>

              {account && <div className={`balance-preview${afterBalance < 0 ? ' balance-preview--error' : ''}`}><div><span>Available</span><strong>{formatZar(account.availableBalance)}</strong></div><WorkspaceIcon name="chevron" size={16} /><div><span>Balance after payment</span><strong>{formatZar(afterBalance)}</strong></div></div>}
              {beneficiary?.status === 'New' && <div className="new-beneficiary-warning"><WorkspaceIcon name="shield" size={17} /><p><strong>New beneficiary</strong><span>AVVA will attach elevated-risk context to this payment.</span></p></div>}
              {error && <div className="payment-error" role="alert">{error}</div>}
              <div className="payment-actions"><button className="cancel-payment" onClick={onClose} type="button">Cancel</button><button className="send-button" disabled={busy || afterBalance < 0} type="submit">{busy ? <><span className="ledger-spinner ledger-spinner--light" /> Sending…</> : <><WorkspaceIcon name="send" size={16} /> Send {numericAmount > 0 ? formatZar(numericAmount) : 'payment'}</>}</button></div>
              <p className="payment-disclaimer">Simulation only · No real bank account or payment rail is used.</p>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
