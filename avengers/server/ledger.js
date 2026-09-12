import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dataPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'ledger.json')
const seed = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

export function createLedger() {
  const accounts = structuredClone(seed.accounts)
  const beneficiaries = structuredClone(seed.beneficiaries)
  const transactions = structuredClone(seed.transactions).map(enrichTransaction)
  let paymentSequence = 1

  function listAccounts() {
    return accounts.map((account) => ({ ...account }))
  }

  function listBeneficiaries() {
    return beneficiaries.map((beneficiary) => ({ ...beneficiary }))
  }

  function listTransactions({ query = '', risk = 'All', direction = 'all', accountId = '', limit = 100 } = {}) {
    const normalizedQuery = String(query).trim().toLowerCase()
    const normalizedRisk = String(risk).toLowerCase()
    const normalizedDirection = String(direction).toLowerCase()
    const numericLimit = Math.min(Math.max(Number(limit) || 100, 1), 250)

    return transactions
      .filter((transaction) => !accountId || transaction.accountId === accountId)
      .filter((transaction) => normalizedDirection === 'all' || transaction.direction === normalizedDirection)
      .filter((transaction) => normalizedRisk === 'all' || transaction.risk.level.toLowerCase() === normalizedRisk)
      .filter((transaction) => {
        if (!normalizedQuery) return true
        return [
          transaction.id,
          transaction.counterparty,
          transaction.description,
          transaction.reference,
          transaction.type,
        ].some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))
      })
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, numericLimit)
      .map((transaction) => structuredClone(transaction))
  }

  function getTransaction(transactionId) {
    const transaction = transactions.find((candidate) => candidate.id === transactionId)
    return transaction ? structuredClone(transaction) : null
  }

  function getSummary() {
    const completed = transactions.filter((transaction) => transaction.status === 'Completed')
    const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0)
    const availableBalance = accounts.reduce((sum, account) => sum + account.availableBalance, 0)
    const inflow = completed
      .filter((transaction) => transaction.direction === 'credit')
      .reduce((sum, transaction) => sum + transaction.amount, 0)
    const outflow = completed
      .filter((transaction) => transaction.direction === 'debit')
      .reduce((sum, transaction) => sum + transaction.amount, 0)
    const flagged = transactions.filter((transaction) => ['Critical', 'High'].includes(transaction.risk.level))

    return {
      currency: 'ZAR',
      totalBalance: roundMoney(totalBalance),
      availableBalance: roundMoney(availableBalance),
      inflow: roundMoney(inflow),
      outflow: roundMoney(outflow),
      transactionCount: transactions.length,
      flaggedCount: flagged.length,
      pendingReviewAmount: roundMoney(flagged
        .filter((transaction) => transaction.status === 'Pending review')
        .reduce((sum, transaction) => sum + transaction.amount, 0)),
      lastUpdatedAt: new Date().toISOString(),
    }
  }

  function sendPayment(input, actor) {
    const sourceAccount = accounts.find((account) => account.id === input.sourceAccountId)
    const beneficiary = beneficiaries.find((candidate) => candidate.id === input.beneficiaryId)
    const amount = Number(input.amount)
    const reference = String(input.reference ?? '').trim()

    if (!sourceAccount) throw ledgerError('Choose a valid source account.', 400)
    if (!beneficiary) throw ledgerError('Choose a valid beneficiary.', 400)
    if (sourceAccount.status !== 'Active') throw ledgerError('This source account is not active.', 409)
    if (!Number.isFinite(amount) || amount <= 0) throw ledgerError('Enter an amount greater than R0.00.', 400)
    if (Math.round(amount * 100) !== amount * 100) throw ledgerError('Use no more than two decimal places.', 400)
    if (amount > 1_000_000) throw ledgerError('The demo payment limit is R1,000,000.00.', 400)
    if (amount > sourceAccount.availableBalance) throw ledgerError('This account has insufficient available funds.', 409)
    if (reference.length < 3 || reference.length > 40) throw ledgerError('Reference must be between 3 and 40 characters.', 400)

    const balanceBefore = sourceAccount.balance
    const availableBefore = sourceAccount.availableBalance
    sourceAccount.balance = roundMoney(sourceAccount.balance - amount)
    sourceAccount.availableBalance = roundMoney(sourceAccount.availableBalance - amount)

    const now = new Date()
    const transaction = enrichTransaction({
      id: `SIM-${now.getTime().toString(36).toUpperCase()}-${String(paymentSequence).padStart(2, '0')}`,
      accountId: sourceAccount.id,
      customerId: sourceAccount.customerId,
      beneficiaryId: beneficiary.id,
      direction: 'debit',
      type: 'Simulated payment',
      amount: roundMoney(amount),
      currency: 'ZAR',
      status: 'Completed',
      timestamp: now.toISOString(),
      description: `Payment to ${beneficiary.name}`,
      counterparty: beneficiary.name,
      reference,
      channel: 'AVVA Dashboard',
      deviceId: 'DEV-DASHBOARD',
      employeeId: actor.id,
      riskFactors: paymentRiskFactors(amount, beneficiary),
      simulated: true,
      balanceBefore: roundMoney(balanceBefore),
      balanceAfter: sourceAccount.balance,
      availableBefore: roundMoney(availableBefore),
      availableAfter: sourceAccount.availableBalance,
      createdBy: actor.name,
    })
    paymentSequence += 1
    transactions.unshift(transaction)

    return {
      transaction: structuredClone(transaction),
      account: { ...sourceAccount },
      debit: {
        amount: roundMoney(amount),
        balanceBefore: roundMoney(balanceBefore),
        balanceAfter: sourceAccount.balance,
      },
    }
  }

  return {
    getSummary,
    getTransaction,
    listAccounts,
    listBeneficiaries,
    listTransactions,
    sendPayment,
  }
}

export function assessRisk(transaction) {
  const factors = transaction.riskFactors ?? {}
  const signals = []
  let score = 4

  if (factors.expectedPayroll || factors.trustedInstitution || factors.trustedInternalTransfer) {
    return {
      level: 'Low',
      score: 6,
      confidence: 'High',
      signals: ['Known transaction pattern or trusted counterparty.'],
      recommendation: 'No additional action required.',
    }
  }

  if (transaction.amount >= 30000) {
    score += 22
    signals.push('Amount exceeds the R30,000 review threshold.')
  }

  if (factors.customerAverageAmount && transaction.amount >= factors.customerAverageAmount * 5) {
    const multiple = (transaction.amount / factors.customerAverageAmount).toFixed(1)
    score += 24
    signals.push(`Amount is ${multiple}× higher than the customer’s typical payment.`)
  }

  if (factors.beneficiaryAgeMinutes <= 60) {
    score += 19
    signals.push(`Beneficiary was added ${factors.beneficiaryAgeMinutes} minutes before payment.`)
  } else if (factors.beneficiaryAgeMinutes <= 180) {
    score += 9
    signals.push('Beneficiary was added less than three hours before payment.')
  }

  if (factors.sameEmployeeCreatedAndApproved) {
    score += 20
    signals.push('The same employee created the beneficiary and approved the payment.')
  }

  if (factors.afterHours) {
    score += 10
    signals.push('Activity occurred outside normal working hours.')
  }

  if (factors.deviceAccountCount >= 3) {
    score += 15
    signals.push(`The device appears across ${factors.deviceAccountCount} customer accounts.`)
  }

  if (factors.linkedTransactionCount >= 2) {
    score += 10
    signals.push(`${factors.linkedTransactionCount} related unusual transactions were identified.`)
  }

  if (factors.previousAlerts > 0) {
    score += 10
    signals.push(`${factors.previousAlerts} previous alert${factors.previousAlerts === 1 ? '' : 's'} exist for a linked entity.`)
  }

  const boundedScore = Math.min(score, 98)
  const level = boundedScore >= 75 ? 'Critical' : boundedScore >= 45 ? 'High' : boundedScore >= 22 ? 'Medium' : 'Low'
  const defaultSignal = level === 'Low'
    ? 'Activity is consistent with the available transaction history.'
    : 'Transaction meets the configured review threshold.'

  return {
    level,
    score: boundedScore,
    confidence: signals.length >= 3 ? 'High' : signals.length ? 'Medium' : 'Low',
    signals: signals.length ? signals : [defaultSignal],
    recommendation: level === 'Critical'
      ? 'Hold for authorised human review.'
      : level === 'High'
        ? 'Escalate for analyst review.'
        : level === 'Medium'
          ? 'Monitor and verify supporting context.'
          : 'No additional action required.',
  }
}

function enrichTransaction(transaction) {
  return {
    ...transaction,
    amount: roundMoney(transaction.amount),
    risk: assessRisk(transaction),
  }
}

function paymentRiskFactors(amount, beneficiary) {
  return {
    customerAverageAmount: 6200,
    beneficiaryAgeMinutes: beneficiary.status === 'New'
      ? Math.max(1, Math.floor((Date.now() - new Date(beneficiary.createdAt).getTime()) / 60000))
      : undefined,
    sameEmployeeCreatedAndApproved: beneficiary.createdBy === 'USR-001',
    afterHours: new Date().getHours() < 6 || new Date().getHours() >= 22,
    deviceAccountCount: beneficiary.id === 'BEN-7721' ? 3 : 1,
    previousAlerts: beneficiary.id === 'BEN-7721' ? 2 : 0,
  }
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function ledgerError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}
