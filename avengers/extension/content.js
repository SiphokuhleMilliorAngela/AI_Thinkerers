chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'avva.context.read') return false
  sendResponse(readWhitelistedContext())
  return false
})

function readWhitelistedContext() {
  const workspace = document.querySelector('[data-avva-page="transactions"]')
  if (!workspace) {
    return {
      ok: true,
      available: false,
      reason: 'This page does not expose an AVVA demo context.',
    }
  }

  const detail = document.querySelector('[data-avva-transaction-detail="true"]')
  if (!detail) {
    return {
      ok: true,
      available: true,
      pageType: 'transaction-list',
      currency: workspace.dataset.avvaCurrency || 'ZAR',
      transaction: null,
    }
  }

  return {
    ok: true,
    available: true,
    pageType: 'transaction-detail',
    currency: detail.dataset.avvaCurrency || 'ZAR',
    transaction: {
      transactionId: detail.dataset.avvaTransactionId || null,
      amount: Number(detail.dataset.avvaAmount || 0),
      currency: detail.dataset.avvaCurrency || 'ZAR',
      beneficiaryId: detail.dataset.avvaBeneficiaryId || null,
      riskLevel: detail.dataset.avvaRisk || 'Unknown',
    },
  }
}
