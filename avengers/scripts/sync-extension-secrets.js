import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = process.cwd()
const envFiles = ['.env.local', '.env']
const outputPath = resolve(root, 'public/extension/extension-secrets.local.js')

const env = Object.assign({}, process.env)

for (const file of envFiles) {
  try {
    Object.assign(env, parseEnv(readFileSync(resolve(root, file), 'utf8')))
  } catch {
    // Optional local env files are allowed to be missing.
  }
}

const apiKey = env.VITE_OPENROUTER_API_KEY

if (!apiKey || apiKey === 'your-openrouter-api-key') {
  console.warn('OpenRouter key not found. Add VITE_OPENROUTER_API_KEY to .env.local.')
  process.exit(0)
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(
  outputPath,
  `export const OPENROUTER_API_KEY = ${JSON.stringify(apiKey)}\n`,
)

console.log('Synced OpenRouter key into extension local secrets.')

function parseEnv(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((values, line) => {
      const equalsIndex = line.indexOf('=')

      if (equalsIndex === -1) {
        return values
      }

      const key = line.slice(0, equalsIndex).trim()
      const value = line.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '')

      values[key] = value
      return values
    }, {})
}
