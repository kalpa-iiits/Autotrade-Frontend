// Regenerate src/api/schema.d.ts from the backend's OpenAPI schema.
//   AUTOTRADE_API_TOKEN=... npm run gen:api
//   AUTOTRADE_API_URL=http://localhost:8010 AUTOTRADE_API_TOKEN=... npm run gen:api
// /api/openapi.json needs a signed-in session or an API token (AUTOTRADE_API_TOKEN on the backend).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.AUTOTRADE_API_URL ?? 'http://localhost:8000'
const token = process.env.AUTOTRADE_API_TOKEN
const cookie = process.env.AUTOTRADE_SESSION_COOKIE // alternative: "session=..." copied from the browser
const headers = token ? { Authorization: `Bearer ${token}` } : cookie ? { Cookie: cookie } : {}

const res = await fetch(`${base}/api/openapi.json`, { headers })
if (!res.ok) {
  console.error(`GET ${base}/api/openapi.json -> ${res.status}. Set AUTOTRADE_API_TOKEN or AUTOTRADE_SESSION_COOKIE.`)
  process.exit(1)
}
const file = join(mkdtempSync(join(tmpdir(), 'openapi-')), 'openapi.json')
writeFileSync(file, await res.text())
// Run through npx: openapi-typescript's peer range doesn't include this project's TypeScript.
execFileSync('npx', ['-y', 'openapi-typescript@7.13.0', file, '-o', 'src/api/schema.d.ts'], { stdio: 'inherit' })
