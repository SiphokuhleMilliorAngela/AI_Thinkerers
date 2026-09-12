const SENSITIVE_ACTION_PATTERN =
  /\b(send|submit|approve|pay|transfer|refund|delete|confirm|authorize)\b/i

if (!globalThis.__AV_CONTENT_SCRIPT_READY__) {
  globalThis.__AV_CONTENT_SCRIPT_READY__ = true

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handlePageCommand(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }))

    return true
  })
}

async function handlePageCommand(message) {
  if (message.type === 'page.read') {
    return readPage()
  }

  if (message.type === 'page.inspect') {
    return inspectPage()
  }

  if (message.type === 'page.click') {
    return clickElement(message.selector)
  }

  if (message.type === 'page.type') {
    return typeIntoElement(message.selector, message.value)
  }

  if (message.type === 'page.draftReply') {
    return draftReply(message.body)
  }

  return { ok: false, error: `Unknown page command: ${message.type}` }
}

function readPage() {
  const text = document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? ''

  return {
    ok: true,
    url: location.href,
    title: document.title,
    text: text.slice(0, 12000),
  }
}

function inspectPage() {
  return {
    ok: true,
    url: location.href,
    title: document.title,
    controls: findInteractiveElements(),
    forms: findForms(),
  }
}

function clickElement(selector) {
  const element = findElement(selector)

  if (!element) {
    throw new Error(`Could not find clickable element: ${selector}`)
  }

  const label = getElementLabel(element)

  if (SENSITIVE_ACTION_PATTERN.test(label)) {
    return {
      ok: false,
      blocked: true,
      reason: `Blocked sensitive click: ${label}`,
    }
  }

  element.click()
  return { ok: true, clicked: selector, label }
}

async function draftReply(body = '') {
  const replyButton = findActionElement('reply')

  if (!replyButton) {
    throw new Error('Could not find a Reply control on this page.')
  }

  replyButton.click()
  const editor = await waitForElement(findMessageEditor, 5000)

  if (!editor) {
    throw new Error('Reply was clicked, but no editable message area appeared.')
  }

  setElementValue(editor, body)

  return {
    ok: true,
    action: 'draft_reply',
    characters: body.length,
    note: 'Draft created. Send is intentionally not clicked.',
  }
}

function typeIntoElement(selector, value = '') {
  const element = findElement(selector)

  if (!element) {
    throw new Error(`Could not find input element: ${selector}`)
  }

  if (!isTextInput(element)) {
    throw new Error(`Element is not a text input: ${selector}`)
  }

  setElementValue(element, value)

  return { ok: true, typed: selector, characters: value.length }
}

function findInteractiveElements() {
  const elements = [
    ...document.querySelectorAll(
      'button, a, input, textarea, select, [contenteditable="true"], [role="button"], [role="textbox"]',
    ),
  ]

  return elements.slice(0, 80).map((element) => ({
    selector: getStableSelector(element),
    tag: element.tagName.toLowerCase(),
    label: getElementLabel(element).slice(0, 140),
    type: element.getAttribute('type') ?? '',
    disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
  }))
}

function findForms() {
  return [...document.querySelectorAll('form')].slice(0, 20).map((form) => ({
    selector: getStableSelector(form),
    label: getElementLabel(form).slice(0, 140),
    fields: [...form.querySelectorAll('input, textarea, select')].slice(0, 40).map((field) => ({
      selector: getStableSelector(field),
      label: getElementLabel(field).slice(0, 140),
      type: field.getAttribute('type') ?? field.tagName.toLowerCase(),
      valuePreview: isSensitiveField(field) ? '[redacted]' : String(field.value ?? '').slice(0, 80),
    })),
  }))
}

function findElement(selector) {
  if (!selector || typeof selector !== 'string') {
    return null
  }

  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}

function getStableSelector(element) {
  if (element.id) {
    return `#${CSS.escape(element.id)}`
  }

  const testId = element.getAttribute('data-testid') ?? element.getAttribute('data-test-id')

  if (testId) {
    return `[data-testid="${cssAttributeEscape(testId)}"]`
  }

  const name = element.getAttribute('name')

  if (name) {
    return `${element.tagName.toLowerCase()}[name="${cssAttributeEscape(name)}"]`
  }

  const parent = element.parentElement
  const index = parent ? [...parent.children].indexOf(element) + 1 : 1
  return `${element.tagName.toLowerCase()}:nth-of-type(${index})`
}

function getElementLabel(element) {
  const aria = element.getAttribute('aria-label')
  const labelledBy = element.getAttribute('aria-labelledby')
  const labelledText = labelledBy
    ? labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText ?? '')
        .join(' ')
    : ''
  const relatedLabel = element.id
    ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.innerText
    : ''

  return (
    aria ||
    labelledText ||
    relatedLabel ||
    element.getAttribute('placeholder') ||
    element.getAttribute('name') ||
    element.innerText ||
    element.textContent ||
    element.value ||
    element.tagName
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function isTextInput(element) {
  if (element.isContentEditable || element.getAttribute('role') === 'textbox') {
    return true
  }

  if (element.tagName === 'TEXTAREA') {
    return true
  }

  if (element.tagName !== 'INPUT') {
    return false
  }

  const type = (element.getAttribute('type') ?? 'text').toLowerCase()
  return ['email', 'number', 'search', 'tel', 'text', 'url'].includes(type)
}

function setElementValue(element, value = '') {
  element.focus()

  if (element.isContentEditable || element.getAttribute('role') === 'textbox') {
    element.textContent = value
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }

  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function findActionElement(action) {
  const elements = [
    ...document.querySelectorAll('button, a, [role="button"]'),
  ]

  return elements.find((element) => {
    const label = getElementLabel(element).toLowerCase()
    return label === action || label.startsWith(`${action} `) || label.includes(` ${action}`)
  })
}

function findMessageEditor() {
  const editors = [
    ...document.querySelectorAll(
      '[contenteditable="true"], [role="textbox"], textarea, input[type="text"]',
    ),
  ]

  return editors.find((element) => {
    const label = getElementLabel(element).toLowerCase()
    const rect = element.getBoundingClientRect()

    return (
      rect.width > 80 &&
      rect.height > 20 &&
      !isSensitiveField(element) &&
      !/search|to recipients|cc|bcc|subject/.test(label)
    )
  })
}

async function waitForElement(finder, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const element = finder()

    if (element) {
      return element
    }

    await wait(150)
  }

  return null
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isSensitiveField(element) {
  const type = (element.getAttribute('type') ?? '').toLowerCase()
  const name = `${element.getAttribute('name') ?? ''} ${element.id ?? ''}`.toLowerCase()
  return type === 'password' || /token|secret|password|card|cvv|pin/.test(name)
}

function cssAttributeEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
