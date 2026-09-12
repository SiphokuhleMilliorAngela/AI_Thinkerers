chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'page.read') {
    return false
  }

  const text = document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? ''

  sendResponse({
    url: location.href,
    title: document.title,
    text: text.slice(0, 12000),
  })

  return true
})
