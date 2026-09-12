export const AUTH0 = {
  domain: 'YOUR_AUTH0_DOMAIN',
  clientId: 'YOUR_AUTH0_CLIENT_ID',
  audience: 'YOUR_AUTH0_API_AUDIENCE',
}

export const OPENROUTER = {
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: 'YOUR_OPENROUTER_API_KEY',
  model: 'openai/gpt-4o',
  maxCompletionTokens: 400,
  maxTabs: 4,
  maxTabTextCharacters: 2500,
  siteUrl: 'http://localhost:5173',
  siteName: 'av',
}

export const TOOL_SERVER_URL = 'ws://localhost:8787'
