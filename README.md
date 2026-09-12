# AVVA — ZAR Transaction Dashboard + Chrome Extension

AVVA is a polished local hackathon prototype for fraud operations. It combines a functional synthetic South African banking workspace with a Chrome Manifest V3 side-panel extension that signs in to the same AVVA account and can read explicitly approved transaction context.

The app uses **South African Rand (ZAR)** throughout. Payments are simulated, but the ledger behavior is real: a successful payment validates available funds, subtracts the exact amount from the selected account, creates a new transaction, and refreshes the dashboard.

## What is included

- Responsive AVVA fraud-operations dashboard using the supplied `[A-circle]vva` identity
- Three synthetic ZAR business accounts with live in-memory balances
- Eight realistic South African beneficiaries
- 25 seeded credit/debit transactions with normal and suspicious patterns
- Search, account, direction, and risk filters
- Detailed transaction drawer with explainable rule-based risk signals
- Working simulated payment flow with validation and before/after balances
- Primary suspicious demo transaction `TX-10488`
- Demo analyst login and role profile
- Directly loadable Chrome Manifest V3 side panel
- Dashboard-based extension authorization with revocable extension tokens
- Safe `data-avva-*` page hooks and a curated agent-context API
- Connected-browser management under **Settings**

No real money, customer data, payment rail, or machine-learning fraud model is used.

## Architecture

```text
AVVA Chrome extension                      AVVA dashboard
(extension/, Manifest V3)                  (React + Vite :5173)
       |                                           |
       | device auth + curated context             | login, ledger UI, payment actions
       +---------------------+---------------------+
                             |
                     Local AVVA API
                       (Node :8787)
                             |
                In-memory synthetic ZAR ledger
                   seeded from data/ledger.json
```

### Extension login flow

1. The extension requests a short-lived, unguessable device code.
2. It opens `/connect?code=AVVA-XXXX` in the dashboard.
3. The analyst signs in and reviews the requesting browser.
4. The analyst selects **Allow connection**.
5. The extension polls with its private device code and receives a separate bearer token.
6. The extension displays the same AVVA name, email, role, and team.
7. The analyst can revoke that browser from **Dashboard → Settings**.

The extension never receives the dashboard password.

### Agent-ready transaction context

The Transactions workspace exposes only defined demo attributes such as:

```text
data-avva-transaction-id
data-avva-amount
data-avva-currency
data-avva-customer-id
data-avva-beneficiary-id
data-avva-risk
data-avva-status
```

The content script runs only on the local AVVA dashboard and reads those attributes—not page text, cookies, passwords, or browser history. For a selected transaction, the authenticated extension can retrieve:

```text
GET /api/agent/context?transactionId=TX-10488
```

The response includes curated facts, evidence-backed risk determination, related transactions, and which actions require human approval. It explicitly treats risk as an indication, not proof of fraud.

## Requirements

- Node.js 20.19+ (Node.js 24 is used in the current environment)
- npm
- Google Chrome or Microsoft Edge with extension developer mode enabled

## Run locally

From this directory:

```powershell
npm install
npm run dev
```

One command starts both services:

- Dashboard: <http://127.0.0.1:5173>
- API health: <http://127.0.0.1:8787/health>

### Demo account

```text
Email:    naledi@avva.co.za
Password: demo123
Role:     Fraud Manager
```

The account and all financial records are synthetic.

## Demo the ZAR dashboard

1. Open <http://127.0.0.1:5173>.
2. Sign in with the demo account.
3. The dashboard opens on **Transactions**.
4. Review balances and use account, direction, risk, or text filters.
5. Select `TX-10488` to see its explainable Critical-risk determination and related evidence.
6. Select **Send money**.
7. Choose a source account and beneficiary, enter a Rand amount and reference, then submit.
8. The receipt shows the previous and new balance.
9. Close the receipt to see the new simulated transaction at the top of history.

Try selecting the new beneficiary **Kanyisa Trading** to see an elevated-risk warning. Entering more than the available balance is rejected and does not change the ledger.

The ledger is intentionally in memory. Restarting the API restores the original balances and 25 seeded transactions.

## Load the extension

1. Keep `npm run dev` running.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose:

```text
<project>\avengers\extension
```

6. Pin **AVVA — Fraud Operations**.
7. Click its toolbar action to open the right-side panel.

No extension build is required. After changing extension files, select **Reload** on the browser extensions page and refresh existing dashboard tabs so the content script is updated.

## Demo extension integration

1. Open the AVVA side panel and confirm **Service online**.
2. Select **Connect dashboard**.
3. Sign in on the opened dashboard tab.
4. Confirm the matching connection code and select **Allow connection**.
5. Return to the side panel; it signs in automatically as Naledi Mokoena.
6. Select **Open AVVA dashboard**.
7. Open any transaction row in the dashboard.
8. The extension’s **Page context** card displays its ID, Rand amount, risk level, and number of explainable signals.
9. Open **Settings** in the dashboard to inspect or revoke the extension session.

## Primary risk demo: TX-10488

`TX-10488` is deliberately suspicious and evaluates to Critical risk because the synthetic evidence includes:

- R34,500 payment, well above the configured review threshold
- Amount 7.8× above the customer’s normal payment
- Beneficiary added 11 minutes before payment
- Same employee created the beneficiary and approved the payment
- After-hours activity
- Device shared across three customer accounts
- Two linked unusual transactions
- Two previous alerts on linked entities

AVVA recommends human review and never labels the transaction as definitely fraudulent.

## Project structure

```text
avengers/
├── data/
│   └── ledger.json                    # accounts, beneficiaries, 25 transactions
├── extension/
│   ├── manifest.json                  # Manifest V3 configuration
│   ├── background.js                  # auth/context API bridge
│   ├── content.js                     # whitelisted data-avva-* reader
│   ├── sidepanel.html
│   ├── sidepanel.js
│   └── styles.css
├── public/
│   └── avva-mark.svg
├── scripts/
│   └── dev.js                         # starts dashboard and API
├── server/
│   ├── index.js                       # auth, ledger, payment, context routes
│   └── ledger.js                      # mutable ledger and risk rules
├── src/dashboard/
│   ├── App.jsx                        # login, approval, shell, settings
│   ├── TransactionsWorkspace.jsx      # balances, history, payment UI
│   ├── api.js
│   ├── main.jsx
│   ├── styles.css
│   └── transactions.css
├── index.html
└── package.json
```

## API summary

All ledger routes require an AVVA bearer token. Payment creation requires a dashboard session, not an extension session.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service and capability status |
| `POST` | `/api/auth/login` | Demo dashboard login |
| `POST` | `/api/auth/device/start` | Start extension authorization |
| `GET` | `/api/auth/device/status` | Poll extension authorization |
| `POST` | `/api/auth/device/approve` | Approve from dashboard |
| `GET` | `/api/ledger/summary` | ZAR balance and ledger totals |
| `GET` | `/api/accounts` | Account balances |
| `GET` | `/api/beneficiaries` | Payment beneficiaries |
| `GET` | `/api/transactions` | Searchable transaction history |
| `GET` | `/api/transactions/:id` | Transaction and risk evidence |
| `POST` | `/api/payments` | Execute a simulated ledger debit |
| `GET` | `/api/agent/context` | Curated agent-readable transaction context |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start dashboard and API together |
| `npm run dev:dashboard` | Start only Vite on port 5173 |
| `npm run dev:server` | Start only the API on port 8787 |
| `npm run build` | Build the production dashboard |
| `npm run lint` | Lint dashboard, extension, API, and scripts |

## Security notes

This is local demo authentication and a synthetic ledger, not production banking software.

Implemented safeguards:

- API binds to `127.0.0.1`, not the external network.
- Extension is restricted to local AVVA URLs and has no cookies/history permissions.
- Content extraction is allowlisted to defined `data-avva-*` attributes.
- Passwords are never shared with the extension.
- Device requests expire after 10 minutes.
- Dashboard and extension use separate random tokens.
- Extension tokens are visible and revocable in dashboard settings.
- Only dashboard sessions can submit simulated payments.
- Amount, precision, beneficiary, reference, payment limit, and available funds are validated server-side.
- Risk conclusions always include supporting signals and cautious language.

For production, use an OIDC provider such as Auth0, HTTPS, persistent double-entry ledger infrastructure, idempotency keys, transactional database writes, server-side organisation/RBAC checks, audit logs, rate limits, approved payment-rail adapters, secret management, and independent security review.

## Troubleshooting

- **Service offline:** run `npm run dev` and check <http://127.0.0.1:8787/health>.
- **Code expired:** start the dashboard connection again; codes last 10 minutes.
- **No page context:** reload the extension at `chrome://extensions`, then refresh the dashboard tab and open a transaction.
- **Old extension UI:** select **Reload** on the extension card.
- **Sessions or payments disappeared:** expected; restarting the API resets all in-memory state.
- **Port already in use:** stop the process using port 5173 or 8787, then restart AVVA.

## Screenshots

Add final hackathon screenshots here:

- ZAR Transactions workspace
- Send-money receipt with before/after balance
- TX-10488 risk evidence drawer
- Dashboard extension authorization screen
- Connected extension page-context card
