/**
 * Pure parse / classify / deeplink helpers for CC Switch linux.do importer.
 * Used by Node tests and inlined into the Tampermonkey userscript.
 */

const MIN_SELECTION_LEN = 20

const ENV_URL_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_BASE',
  'CLAUDE_BASE_URL',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'CODEX_BASE_URL',
  'BASE_URL',
  'API_BASE_URL',
]

const ENV_KEY_KEYS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_API_TOKEN',
  'CLAUDE_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_AUTH_TOKEN',
  'CODEX_API_KEY',
  'API_KEY',
  'APIKEY',
  'AUTH_TOKEN',
  'TOKEN',
]

const URL_RE = /https?:\/\/[^\s"'`<>，。；、）)\]}]+/gi
const SK_ANT_RE = /sk-ant-[A-Za-z0-9_\-]{10,}/g
const SK_RE = /sk-[A-Za-z0-9_\-]{16,}/g
const BEARER_RE = /Bearer\s+([A-Za-z0-9_\-.]{16,})/gi
const BASE64_RE = /(?:^|[\s"'`])([A-Za-z0-9+/]{40,}={0,2})(?:$|[\s"'`])/g
const DEEPLINK_RE = /ccswitch:\/\/[^\s"'`<>]+/i

/**
 * @typedef {'claude'|'codex'|null} AppKind
 * @typedef {'deeplink'|'base64'|'json'|'env'|'toml'|'mixed'} SourceKind
 * @typedef {{
 *   name: string,
 *   app: AppKind,
 *   endpoint: string|null,
 *   apiKey: string|null,
 *   config: string|null,
 *   configFormat: 'json'|'toml'|null,
 *   source: SourceKind,
 *   confidence: number,
 *   candidateCount: number,
 *   warnings: string[],
 *   deeplink?: string|null,
 *   models?: string[]
 * }} ParseResult
 */

/**
 * @param {string} text
 * @returns {ParseResult|null}
 */
export function parseShareText(text) {
  if (text == null) return null
  const raw = normalizeShareText(text)
  if (raw.length < MIN_SELECTION_LEN) return null

  const cleaned = repairBrokenBase64(stripMarkdownFences(raw))

  // 1. Existing ccswitch deep link
  const deep = extractDeeplink(cleaned)
  if (deep) {
    const fromLink = parseDeeplink(deep)
    if (fromLink) {
      fromLink.deeplink = deep
      return fromLink
    }
  }

  // 2. Base64 block → decode → re-parse content (without infinite loop: decode once)
  const b64 = tryParseBase64(cleaned)
  if (b64) return finalizeResult(b64)

  // 3. JSON object
  const json = tryParseJson(cleaned)
  if (json) return finalizeResult(json)

  // 4. TOML / key = "value"
  const toml = tryParseTomlLike(cleaned)
  if (toml) return finalizeResult(toml)

  // 5. Env vars
  const env = tryParseEnv(cleaned)
  if (env) return finalizeResult(env)

  // 6. Mixed noise extraction
  return finalizeResult(tryParseMixed(cleaned))
}

/**
 * Strip Discourse/selection noise that breaks key/base64 matching.
 * @param {string} text
 */
export function normalizeShareText(text) {
  return String(text)
    // ZWSP/ZWNJ/ZWJ, BOM, soft-hyphen, word-joiner
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, '')
    // nbsp / narrow nbsp / figure space
    .replace(/[\u00A0\u202F\u2007]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .trim()
}

/**
 * Merge real URLs from selected <a href> into selection text.
 * Discourse often shows link text as "base url" while the real endpoint only lives in href;
 * window.getSelection().toString() drops those hrefs.
 *
 * @param {string} text - selection.toString()
 * @param {Array<{text?: string, href?: string}>} anchors
 * @returns {string}
 */
export function enrichTextWithAnchorHrefs(text, anchors) {
  const base = text == null ? '' : String(text)
  if (!anchors || anchors.length === 0) return base

  const existing = new Set(matchAll(base, URL_RE).map(cleanUrl))
  for (const u of existing) {
    // also mark raw occurrences
    if (base.includes(u)) existing.add(u)
  }

  /** @type {Array<{label: string, href: string, preferred: boolean}>} */
  const toAdd = []
  for (const a of anchors) {
    if (!a) continue
    const href = unwrapHref(a.href)
    if (!href || !/^https?:\/\//i.test(href)) continue
    const cleaned = cleanUrl(href)
    if (!cleaned || existing.has(cleaned) || base.includes(cleaned)) {
      if (cleaned) existing.add(cleaned)
      continue
    }
    const label = String(a.text || '').trim().replace(/\s+/g, ' ')
    const preferred = isUrlLinkLabel(label)
    toAdd.push({ label, href: cleaned, preferred })
    existing.add(cleaned)
  }

  if (toAdd.length === 0) return base

  // Prefer labeled base-url anchors first
  toAdd.sort((a, b) => Number(b.preferred) - Number(a.preferred))

  let out = base
  const appended = []
  for (const item of toAdd) {
    if (item.preferred && item.label) {
      // Replace bare label once with "label\uFF1Ahttps://..." so extractLabeledFields hits it
      const labelRe = new RegExp(
        `(${escapeRegExp(item.label)})(?!\\s*[:\uFF1A=]\\s*https?:)`,
        'i',
      )
      if (labelRe.test(out)) {
        out = out.replace(labelRe, `$1\uFF1A${item.href}`)
        continue
      }
      appended.push(`${item.label}\uFF1A${item.href}`)
    } else {
      appended.push(item.href)
    }
  }
  if (appended.length) out = `${out}\n${appended.join('\n')}`
  return out
}

/** Visible link labels that usually stand for the API base URL on linux.do shares. */
function isUrlLinkLabel(label) {
  if (!label) return false
  const s = label.trim()
  if (
    /^(?:url|base\s*url|base[_-]?url|endpoint|api\s*base|api[_-]?base|host|\u5730\u5740|\u63A5\u53E3|\u94FE\u63A5)(?:\b|[\uFF08(]|\d|$)/i.test(
      s,
    )
  ) {
    return true
  }
  // "base url 2", "Base URL", etc.
  if (/base\s*url|endpoint|base[_-]?url/i.test(s) && s.length <= 40) return true
  return false
}

/**
 * Normalize anchor href: keep http(s), unwrap common click-trackers / nested URLs.
 * @param {string|null|undefined} href
 * @returns {string|null}
 */
function unwrapHref(href) {
  if (!href) return null
  let h = String(href).trim()
  if (!h) return null
  // ignore non-navigational schemes
  if (/^(javascript|mailto|tel|data|#):/i.test(h)) return null
  // nested https inside tracking / redirect URLs
  try {
    const m = h.match(/https?:\/\/[^\s"'<>]+/i)
    if (m) {
      // if the whole thing is already http(s), prefer parsing query redirects
      if (/^https?:\/\//i.test(h)) {
        try {
          const u = new URL(h)
          for (const key of ['url', 'u', 'target', 'redirect', 'to', 'link', 'dest']) {
            const v = u.searchParams.get(key)
            if (v && /^https?:\/\//i.test(v)) return cleanUrl(v)
          }
        } catch {
          /* keep */
        }
        return cleanUrl(h)
      }
      return cleanUrl(m[0])
    }
  } catch {
    /* keep */
  }
  return null
}

/**
 * Re-join base64 tokens broken by spaces/newlines if the join decodes to a key.
 * @param {string} text
 */
export function repairBrokenBase64(text) {
  // spaces inside an otherwise base64-ish run
  let out = text.replace(
    /(?:^|[\s"'`])((?:[A-Za-z0-9+/_-]{6,}={0,2}[\s\u00AD]+){1,}[A-Za-z0-9+/_-]{6,}={0,2})(?=$|[\s"'`])/gm,
    (full, group) => {
      const prefix = full.slice(0, full.length - group.length)
      const joined = group.replace(/[\s\u00AD]+/g, '')
      if (joined.length < 24) return full
      try {
        const d = base64Decode(joined).trim()
        if (/^(sk-ant-|sk-|g2a_)/i.test(d) && !/\s/.test(d) && d.length >= 8) {
          return prefix + joined
        }
      } catch {
        /* keep */
      }
      return full
    },
  )
  // adjacent pure-base64 lines
  out = out.replace(
    /(^|\n)([A-Za-z0-9+/_-]{12,}={0,2})\n([A-Za-z0-9+/_-]{12,}={0,2})(?=\n|$)/gm,
    (full, lead, a, b) => {
      const joined = a + b
      try {
        const d = base64Decode(joined).trim()
        if (/^(sk-ant-|sk-|g2a_)/i.test(d) && !/\s/.test(d)) return `${lead}${joined}`
      } catch {
        /* keep */
      }
      return full
    },
  )
  return out
}

/** Final pass: ensure apiKey is decoded/cleaned and confidence stays in [0, 1]. */
function finalizeResult(result) {
  if (!result) return null
  if (result.apiKey) {
    result.apiKey = maybeDecodeKey(normalizeShareText(result.apiKey))
  }
  if (result.endpoint) {
    result.endpoint = cleanUrl(normalizeShareText(result.endpoint))
  }
  if (typeof result.confidence === 'number') {
    result.confidence = Math.min(1, Math.max(0, result.confidence))
  }
  return result
}

/**
 * @param {string} text
 */
export function looksLikeConfig(text) {
  if (!text || text.trim().length < MIN_SELECTION_LEN) return false
  const t = repairBrokenBase64(normalizeShareText(text))
  if (DEEPLINK_RE.test(t)) return true
  if (/ANTHROPIC_|OPENAI_|CODEX_|BASE_URL|API_KEY|apiKey|baseUrl|endpoint|Base\s*URL/i.test(t))
    return true
  if (/sk-ant-|sk-[A-Za-z0-9]{16,}/.test(t)) return true
  if (/https?:\/\//i.test(t) && /sk-|Bearer\s+/i.test(t)) return true
  // labeled shares: url： / key： / 密钥： / API Key（...）
  if (
    /(?:url|base[_-]?url|base\s*url|endpoint|key|api[_-]?key|api\s*key|token|密钥|地址|接口)/i.test(
      t,
    )
  ) {
    if (/https?:\/\//i.test(t) || /[A-Za-z0-9_+\-/]{16,}/.test(t)) return true
  }
  // url + base64-ish token (key often base64-encoded on linux.do)
  if (/https?:\/\//i.test(t) && /[A-Za-z0-9+/]{32,}={0,2}/.test(t)) return true
  // standalone base64 only if it decodes to a key or config-shaped text (avoid AAAA… noise)
  if (hasUsefulBase64Blob(t)) return true
  if (/\{[\s\S]*"(?:apiKey|api_key|baseUrl|endpoint|base_url)"[\s\S]*\}/.test(t)) return true
  return false
}

/**
 * True when a base64-ish token decodes to an API key or config-like payload.
 * Prevents long random A-Z runs from lighting the import button.
 * @param {string} text
 */
function hasUsefulBase64Blob(text) {
  const re = /(?:^|[\s"'`：:：])([A-Za-z0-9+/]{40,}={0,2})(?=$|[\s"'`])/g
  let m
  while ((m = re.exec(text)) !== null) {
    const token = m[1]
    if (token.startsWith('sk-') || token.startsWith('http')) continue
    try {
      const decoded = base64Decode(token).trim()
      if (!decoded || decoded.length < 8) continue
      const ascii = decoded.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, '')
      if (/^(sk-ant-|sk-|g2a_)/i.test(ascii) && ascii.length >= 8 && ascii.length <= 512) {
        return true
      }
      if (
        /[{=\n:]/.test(decoded) &&
        (/https?:\/\//.test(decoded) || /API|KEY|BASE|endpoint|baseUrl/i.test(decoded))
      ) {
        return true
      }
    } catch {
      /* ignore */
    }
  }
  return false
}

/**
 * @param {ParseResult} result
 * @param {AppKind} [appOverride]
 * @param {object} [modelInfo] - Optional model extraction result
 * @returns {string}
 */
export function buildDeeplink(result, appOverride, modelInfo) {
  const app = appOverride || result.app
  if (!app) {
    throw new Error('app is required (claude or codex)')
  }

  const params = new URLSearchParams()
  params.set('resource', 'provider')
  params.set('app', app)
  params.set('name', result.name || defaultName())

  if (result.endpoint) params.set('endpoint', result.endpoint)
  if (result.apiKey) params.set('apiKey', result.apiKey)

  if (result.config) {
    params.set('config', base64Encode(result.config))
    params.set('configFormat', result.configFormat || 'json')
  }

  // Add model parameters when available
  if (modelInfo) {
    if (modelInfo.model) params.set('model', modelInfo.model)
    if (app === 'claude') {
      if (modelInfo.haikuModel) params.set('haikuModel', modelInfo.haikuModel)
      if (modelInfo.sonnetModel) params.set('sonnetModel', modelInfo.sonnetModel)
      if (modelInfo.opusModel) params.set('opusModel', modelInfo.opusModel)
    }
  }

  // URLSearchParams encodes spaces as +, deep links often prefer %20 — fine for most handlers
  return `ccswitch://v1/import?${params.toString()}`
}

/**
 * @param {string} key
 * @returns {string}
 */
export function maskKey(key) {
  if (!key) return ''
  if (key.length <= 12) return '*'.repeat(Math.min(key.length, 8))
  return `${key.slice(0, 8)}****${key.slice(-4)}`
}

/**
 * @param {string} text
 * @param {object} fields
 * @returns {AppKind}
 */
export function classifyApp(text, fields = {}) {
  const blob = [
    text || '',
    fields.endpoint || '',
    fields.apiKey || '',
    fields.name || '',
    fields.config || '',
  ]
    .join('\n')
    .toLowerCase()

  let claude = 0
  let codex = 0

  if (/sk-ant-/.test(blob)) claude += 3
  if (/anthropic/.test(blob)) claude += 2
  if (/an?thropic_/.test(blob)) claude += 2
  // bare "claude" in model lists is weak (e.g. "claude系列均会转发")
  if (/\bclaude\b/.test(blob)) claude += 0.5

  if (/openai/.test(blob)) codex += 2
  if (/codex/.test(blob)) codex += 3
  if (/openai_api_key|openai_base/.test(blob)) codex += 2
  if (/api\.openai\.com/.test(blob)) codex += 2
  if (/\bgpt-?\d/.test(blob)) codex += 0.5

  // generic sk- without ant leans slightly openai/codex, but weak
  if (/sk-(?!ant)[a-z0-9]/.test(blob) && claude < 2) codex += 0.5

  // multi-model relay blurbs mentioning both → leave to user
  const mentionsBothModels =
    /\bgpt-?\d/.test(blob) && /\bclaude\b/.test(blob) && !/sk-ant-/.test(blob)
  if (mentionsBothModels && Math.abs(claude - codex) < 1.5) return null

  if (claude === 0 && codex === 0) return null
  if (claude > codex) return 'claude'
  if (codex > claude) return 'codex'
  return null
}

// ─── internals ───────────────────────────────────────────────

function defaultName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `linuxdo-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function stripMarkdownFences(text) {
  return text
    .replace(/^```[a-zA-Z0-9]*\s*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim()
}

function emptyResult(partial) {
  return {
    name: defaultName(),
    app: null,
    endpoint: null,
    apiKey: null,
    config: null,
    configFormat: null,
    source: 'mixed',
    confidence: 0,
    candidateCount: 1,
    warnings: [],
    deeplink: null,
    ...partial,
  }
}

function extractDeeplink(text) {
  const m = text.match(DEEPLINK_RE)
  return m ? m[0] : null
}

/**
 * @param {string} link
 * @returns {ParseResult|null}
 */
function parseDeeplink(link) {
  try {
    // URL() may not like custom schemes in all envs — manual parse
    const qIndex = link.indexOf('?')
    if (qIndex < 0) return null
    const qs = link.slice(qIndex + 1)
    const params = new URLSearchParams(qs)
    if (params.get('resource') && params.get('resource') !== 'provider') {
      // still allow provider-like imports
    }
    const app = normalizeApp(params.get('app'))
    const name = params.get('name') || defaultName()
    const endpoint = params.get('endpoint') || params.get('baseUrl') || null
    const apiKey = params.get('apiKey') || params.get('api_key') || null
    let config = null
    let configFormat = null
    const configB64 = params.get('config')
    if (configB64) {
      try {
        config = base64Decode(configB64)
        configFormat = /** @type {'json'|'toml'} */ (params.get('configFormat') || 'json')
      } catch {
        /* ignore */
      }
    }
    const confidence = endpoint || apiKey || config ? 0.95 : 0.5
    if (!endpoint && !apiKey && !config) return null
    return emptyResult({
      name,
      app,
      endpoint,
      apiKey,
      config,
      configFormat,
      source: 'deeplink',
      confidence,
    })
  } catch {
    return null
  }
}

function normalizeApp(app) {
  if (!app) return null
  const a = String(app).toLowerCase()
  if (a === 'claude' || a === 'claudecode' || a === 'claude-code') return 'claude'
  if (a === 'codex') return 'codex'
  return null
}

function tryParseBase64(text) {
  BASE64_RE.lastIndex = 0
  let best = null
  let m
  while ((m = BASE64_RE.exec(text)) !== null) {
    const token = m[1]
    if (token.length < 40) continue
    // skip if looks like a normal url fragment or key
    if (token.startsWith('sk-')) continue
    let decoded
    try {
      decoded = base64Decode(token)
    } catch {
      continue
    }
    if (!decoded || decoded.length < 10) continue
    // must look like text config
    if (!/[{=\n:]/.test(decoded) && !/https?:\/\//.test(decoded) && !/API|KEY|BASE/i.test(decoded)) {
      continue
    }
    // parse decoded without re-running base64 on itself forever
    const inner =
      tryParseJson(decoded) ||
      tryParseTomlLike(decoded) ||
      tryParseEnv(decoded) ||
      tryParseMixed(decoded)
    if (inner && (inner.endpoint || inner.apiKey || inner.config)) {
      inner.source = 'base64'
      inner.confidence = Math.min(1, (inner.confidence || 0.6) + 0.1)
      if (!best || inner.confidence > best.confidence) best = inner
    }
  }
  return best
}

function tryParseJson(text) {
  const objects = extractJsonObjects(text)
  let best = null
  for (const objStr of objects) {
    let obj
    try {
      obj = JSON.parse(objStr)
    } catch {
      continue
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue
    const fields = pickProviderFields(obj)
    if (!fields.endpoint && !fields.apiKey && !fields.hasConfigShape) continue
    const app = classifyApp(text, fields)
    const r = emptyResult({
      name: fields.name || defaultName(),
      app,
      endpoint: fields.endpoint,
      apiKey: fields.apiKey,
      config: fields.hasConfigShape ? objStr : null,
      configFormat: fields.hasConfigShape ? 'json' : null,
      source: 'json',
      confidence: scoreFields(fields, app),
      warnings: buildWarnings(fields),
    })
    if (!best || r.confidence > best.confidence) best = r
  }
  return best
}

function extractJsonObjects(text) {
  const results = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let depth = 0
    let inStr = false
    let esc = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (inStr) {
        if (esc) {
          esc = false
        } else if (c === '\\') {
          esc = true
        } else if (c === '"') {
          inStr = false
        }
        continue
      }
      if (c === '"') {
        inStr = true
        continue
      }
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) {
          results.push(text.slice(i, j + 1))
          i = j
          break
        }
      }
    }
  }
  return results
}

function pickProviderFields(obj) {
  const name = firstString(obj, ['name', 'title', 'label', 'provider', 'providerName'])
  const endpoint = firstString(obj, [
    'endpoint',
    'baseUrl',
    'base_url',
    'baseURL',
    'api_base',
    'apiBase',
    'url',
    'host',
  ])
  const apiKey = firstString(obj, [
    'apiKey',
    'api_key',
    'key',
    'token',
    'authToken',
    'auth_token',
    'secret',
    'access_token',
  ])
  // nested env style
  const env = obj.env || obj.environment || obj.settings || null
  let ep = endpoint
  let key = apiKey
  if (env && typeof env === 'object') {
    ep = ep || firstString(env, ENV_URL_KEYS.map((k) => k).concat(['baseUrl', 'endpoint']))
    // also case-insensitive scan
    if (!ep) ep = scanObjectForUrl(env)
    if (!key) key = firstString(env, ENV_KEY_KEYS.concat(['apiKey', 'key']))
    if (!key) key = scanObjectForKey(env)
  }
  if (!ep) ep = scanObjectForUrl(obj)
  if (!key) key = scanObjectForKey(obj)

  const hasConfigShape = !!(ep || key)
  return { name, endpoint: ep, apiKey: key, hasConfigShape }
}

function firstString(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim()) return String(obj[k]).trim()
  }
  // case-insensitive
  const lowerMap = {}
  for (const [k, v] of Object.entries(obj)) {
    lowerMap[k.toLowerCase()] = v
  }
  for (const k of keys) {
    const v = lowerMap[k.toLowerCase()]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

function scanObjectForUrl(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
      if (/url|base|endpoint|host|api/i.test(k)) return v.trim()
    }
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim()
  }
  return null
}

function scanObjectForKey(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /key|token|secret|auth/i.test(k) && v.trim().length >= 8) {
      return v.trim()
    }
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && /^(sk-ant-|sk-|Bearer\s+)/i.test(v.trim())) return v.trim().replace(/^Bearer\s+/i, '')
  }
  return null
}

function tryParseTomlLike(text) {
  const endpoint =
    matchQuotedAssignment(text, ['base_url', 'baseUrl', 'endpoint', 'api_base', 'url']) || null
  const apiKey =
    matchQuotedAssignment(text, ['api_key', 'apiKey', 'key', 'token', 'auth_token', 'secret']) || null
  if (!endpoint && !apiKey) return null
  // require at least one assignment-style line to distinguish from mixed
  if (!/^\s*[\w.]+\s*=\s*.+/m.test(text) && !endpoint) return null
  if (!/=\s*["']?/.test(text)) return null

  const name = matchQuotedAssignment(text, ['name', 'title']) || defaultName()
  const fields = { name, endpoint, apiKey }
  const app = classifyApp(text, fields)
  return emptyResult({
    name,
    app,
    endpoint,
    apiKey,
    source: 'toml',
    confidence: scoreFields(fields, app),
    warnings: buildWarnings(fields),
  })
}

function matchQuotedAssignment(text, keys) {
  for (const key of keys) {
    const re = new RegExp(
      `(?:^|[\\s;])${escapeRegExp(key)}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|(\\S+))`,
      'im',
    )
    const m = text.match(re)
    if (m) return (m[1] || m[2] || m[3] || '').trim()
  }
  return null
}

function tryParseEnv(text) {
  const map = parseEnvMap(text)
  if (Object.keys(map).length === 0) return null

  let endpoint = null
  let apiKey = null
  for (const k of ENV_URL_KEYS) {
    if (map[k]) {
      endpoint = map[k]
      break
    }
  }
  for (const k of ENV_KEY_KEYS) {
    if (map[k]) {
      apiKey = map[k]
      break
    }
  }
  // fuzzy
  if (!endpoint) {
    for (const [k, v] of Object.entries(map)) {
      if (/BASE_URL|API_BASE|ENDPOINT/i.test(k) && /^https?:\/\//i.test(v)) {
        endpoint = v
        break
      }
    }
  }
  if (!apiKey) {
    for (const [k, v] of Object.entries(map)) {
      if (/API_KEY|AUTH_TOKEN|TOKEN|SECRET/i.test(k) && v.length >= 8) {
        apiKey = v
        break
      }
    }
  }

  if (!endpoint && !apiKey) return null

  const fields = { name: defaultName(), endpoint, apiKey }
  const app = classifyApp(text, fields)
  return emptyResult({
    name: defaultName(),
    app,
    endpoint,
    apiKey,
    source: 'env',
    confidence: scoreFields(fields, app) + 0.05,
    warnings: buildWarnings(fields),
  })
}

function parseEnvMap(text) {
  const map = {}
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    // KEY=value or export KEY=value
    const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    // strip trailing inline comments loosely
    val = val.replace(/\s+#.*$/, '').trim()
    if (val) map[m[1]] = val
  }
  // also allow single-line KEY=value KEY2=value
  if (Object.keys(map).length === 0) {
    const re = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\s]+)/g
    let m
    while ((m = re.exec(text)) !== null) {
      if (ENV_URL_KEYS.includes(m[1]) || ENV_KEY_KEYS.includes(m[1]) || /URL|KEY|TOKEN/i.test(m[1])) {
        map[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  }
  return map
}

function tryParseMixed(text) {
  const labeled = extractLabeledFields(text)

  const urls = unique([
    ...matchAll(text, URL_RE).map(cleanUrl),
    ...(labeled.endpoint ? [labeled.endpoint] : []),
  ])

  const keys = unique([
    ...matchAll(text, SK_ANT_RE),
    ...matchAll(text, SK_RE),
    ...matchAllGroups(text, BEARER_RE, 1),
    ...extractLooseKeys(text),
    ...extractBase64DecodedKeys(text),
    ...(labeled.apiKey ? [labeled.apiKey] : []),
  ])

  const apiKeys = unique(keys)

  if (urls.length === 0 && apiKeys.length === 0) return null

  let endpoint = labeled.endpoint || pickBestUrl(urls, text)
  let apiKey = labeled.apiKey || pickBestKey(apiKeys)

  // Prefer decoded form when labeled key was base64
  if (apiKey) apiKey = maybeDecodeKey(apiKey)

  const fields = { name: labeled.name || defaultName(), endpoint, apiKey }
  const app = classifyApp(text, fields)
  const candidateCount = Math.max(urls.length, 1) * Math.max(apiKeys.length, 1)
  const warnings = buildWarnings(fields)
  if (candidateCount > 1) {
    warnings.push(`检测到 ${urls.length} 个 URL、${apiKeys.length} 个 key，已选取置信度最高的一对`)
  }

  const confidence = scoreFields(fields, app) * (candidateCount > 1 ? 0.9 : 1)
  if (!endpoint && !apiKey) return null

  return emptyResult({
    name: fields.name,
    app,
    endpoint,
    apiKey,
    source: labeled.hit ? 'mixed' : 'mixed',
    confidence: labeled.hit ? Math.min(1, confidence + 0.1) : confidence,
    candidateCount,
    warnings,
  })
}

/**
 * Parse labeled / table-style shares common on linux.do:
 * - "url：https://..." / "key: xxx" (fullwidth colon)
 * - "Base URL    https://..." (table cells / multi-space)
 * - "API Key（Base64，请自行解码）" on one line, value on the next
 */
function extractLabeledFields(text) {
  const result = { endpoint: null, apiKey: null, name: null, hit: false }
  const lines = text.split(/\r?\n/)

  const isKeyLabel = (s) =>
    /^(?:api\s*key|api[_-]?key|key|token|secret|auth[_-]?token|密钥)(?:\b|[（(]|$)/i.test(s)
  const isUrlLabel = (s) =>
    /^(?:url|base\s*url|base[_-]?url|endpoint|api\s*base|api[_-]?base|host|地址|接口|链接)(?:\b|[（(]|$)/i.test(
      s,
    )
  const isNameLabel = (s) => /^(?:name|名称|名字)(?:\b|[（(]|$)/i.test(s)

  const stripValue = (value) => {
    let v = String(value || '').trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).trim()
    }
    return v.replace(/[，。；、！？]+$/g, '')
  }

  const lookLikeKeyValue = (v) =>
    !!v &&
    ( /^(sk-ant-|sk-|g2a_|Bearer\s)/i.test(v) ||
      /^[A-Za-z0-9+/_-]{16,}={0,2}$/.test(v) ||
      v.length >= 12 )

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) continue

    // "API Key（Base64，请自行解码）c2st..." glued value on same line
    const keyGlued = line.match(
      /^(?:api\s*key|api[_-]?key|key|token|secret|auth[_-]?token|密钥)(?:\s*[（(][^）)]*[）)])?\s*[:：]?\s*([A-Za-z0-9+/_-]{16,}={0,2})\s*$/i,
    )
    if (keyGlued && !result.apiKey) {
      result.apiKey = maybeDecodeKey(keyGlued[1])
      result.hit = true
      continue
    }

    // "API Key（Base64，请自行解码）" — label only, value on following line(s)
    // Allow optional trailing notes in fullwidth/halfwidth parens.
    const keyLabelOnly = line.match(
      /^(?:api\s*key|api[_-]?key|key|token|secret|auth[_-]?token|密钥)(?:\s*[（(][^）)]*[）)])?\s*[:：]?\s*$/i,
    )
    if (keyLabelOnly && !result.apiKey) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        let next = lines[j].trim()
        if (!next) continue
        // stop if next line looks like another label
        if (isUrlLabel(next) || isKeyLabel(next) || isNameLabel(next)) break
        // strip leftover label prefix if Discourse glued poorly
        next = next.replace(
          /^(?:api\s*key|api[_-]?key|key|token|密钥)(?:\s*[（(][^）)]*[）)])?\s*[:：]?\s*/i,
          '',
        )
        // join pure base64 continuation lines
        let k = j + 1
        while (
          k < Math.min(i + 6, lines.length) &&
          /^[A-Za-z0-9+/_-]{8,}={0,2}$/.test(lines[k].trim())
        ) {
          next += lines[k].trim()
          k++
        }
        next = next.replace(/\s+/g, '')
        if (lookLikeKeyValue(next) && !/^https?:\/\//i.test(next)) {
          result.apiKey = maybeDecodeKey(next)
          result.hit = true
          break
        }
      }
      continue
    }

    // Same-line colon form: Base URL：https://... / key：xxx
    const colon = line.match(
      /^(url|base\s*url|base[_-]?url|endpoint|api\s*base|api[_-]?base|host|地址|接口|链接|key|api\s*key|api[_-]?key|token|secret|auth[_-]?token|密钥|name|名称|名字)\s*[:：=]\s*(.+)$/i,
    )
    if (colon) {
      const label = colon[1].toLowerCase().replace(/\s+/g, '')
      let value = stripValue(colon[2])
      // value might still be a note like "（Base64，请自行解码）" with real value next line
      if (
        /key|token|secret|auth|密钥/.test(label) &&
        (!lookLikeKeyValue(value) || /base64|解码|自行/i.test(value))
      ) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const next = lines[j].trim()
          if (!next) continue
          if (lookLikeKeyValue(next) && !/^https?:\/\//i.test(next)) {
            value = next
            break
          }
        }
      }
      if (!value) continue
      result.hit = true
      if (/url|base|endpoint|host|地址|接口|链接/.test(label)) {
        const u = (value.match(URL_RE) || [])[0]
        if (u) result.endpoint = cleanUrl(u)
        else if (/^https?:\/\//i.test(value)) result.endpoint = cleanUrl(value)
      } else if (/key|token|secret|auth|密钥/.test(label)) {
        result.apiKey = maybeDecodeKey(value)
      } else if (/name|名称|名字/.test(label)) {
        result.name = value
      }
      continue
    }

    // Table / multi-space: "Base URL    https://api.example.invalid"
    const table = line.match(
      /^(url|base\s*url|base[_-]?url|endpoint|api\s*base|api[_-]?base|host|地址|接口|链接|key|api\s*key|api[_-]?key|token|secret|auth[_-]?token|密钥|name|名称|名字)\s{2,}(.+)$/i,
    )
    if (table) {
      const label = table[1].toLowerCase().replace(/\s+/g, '')
      const value = stripValue(table[2])
      if (!value) continue
      result.hit = true
      if (/url|base|endpoint|host|地址|接口|链接/.test(label)) {
        const u = (value.match(URL_RE) || [])[0]
        if (u) result.endpoint = cleanUrl(u)
        else if (/^https?:\/\//i.test(value)) result.endpoint = cleanUrl(value)
      } else if (/key|token|secret|auth|密钥/.test(label)) {
        result.apiKey = maybeDecodeKey(value)
      } else if (/name|名称|名字/.test(label)) {
        result.name = value
      }
      continue
    }
  }

  // single-line form: url：https://x key：yyy
  if (!result.endpoint || !result.apiKey) {
    const inlineUrl = text.match(
      /(?:url|base[_-]?url|base\s*url|endpoint|地址|接口)\s*[:：]\s*(https?:\/\/[^\s，。；]+)/i,
    )
    if (inlineUrl && !result.endpoint) {
      result.endpoint = cleanUrl(inlineUrl[1])
      result.hit = true
    }

    const inlineKey = text.match(
      /(?:key|api[_-]?key|api\s*key|token|密钥)\s*[:：]\s*([A-Za-z0-9_+\-/=]{8,})/i,
    )
    if (inlineKey && !result.apiKey) {
      result.apiKey = maybeDecodeKey(inlineKey[1])
      result.hit = true
    }
  }

  return result
}

/**
 * If value is base64 that decodes to a printable API token, return decoded; else original.
 * Also strips common linux.do anti-scrape watermarks (CJK like \u300C\u53BB\u9664\u6587\u4E2D\u300D) injected into keys.
 */
function maybeDecodeKey(value) {
  if (!value) return value
  // remove invisible chars / whitespace that Discourse injects into long keys
  let v = String(value)
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, '')
    .replace(/[\s\u00A0]+/g, '')
    .trim()
  // already looks like a normal key (may still carry CJK watermark mid-token)
  if (/^(sk-ant-|sk-|g2a_|Bearer\s*)/i.test(v)) {
    return sanitizeApiKey(v.replace(/^Bearer\s*/i, ''))
  }
  // base64-ish (charset, often ends with =)
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(v) || v.length < 16) return v
  try {
    const decoded = sanitizeApiKey(base64Decode(v).trim())
    // decoded should look like a token: printable ASCII, no spaces, reasonable length
    if (
      decoded.length >= 8 &&
      decoded.length <= 512 &&
      /^[\x20-\x7E]+$/.test(decoded) &&
      !/\s/.test(decoded) &&
      /[A-Za-z0-9]/.test(decoded)
    ) {
      // prefer decoded when it looks more like a key than the raw b64
      if (
        /^(sk-ant-|sk-|g2a_)/i.test(decoded) ||
        decoded.includes('_') ||
        decoded.length < v.length
      ) {
        return decoded
      }
    }
  } catch {
    /* keep original */
  }
  return v
}

/**
 * Strip non-ASCII watermarks (e.g. \u300C\u53BB\u9664\u6587\u4E2D\u300D) that linux.do injects into shared keys.
 * Only applied when the result still looks like an API token prefix.
 * @param {string} key
 * @returns {string}
 */
function sanitizeApiKey(key) {
  if (!key) return key
  let k = String(key).replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, '').trim()
  // Fast path: already pure ASCII token
  if (/^[\x20-\x7E]+$/.test(k) && !/\s/.test(k)) {
    return k.replace(/\s+/g, '')
  }
  // Drop non-ASCII (CJK watermarks etc.) and whitespace
  const stripped = k.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, '')
  // Only accept if it still looks like a known API key form after stripping
  if (
    stripped.length >= 8 &&
    stripped.length <= 512 &&
    /^(sk-ant-|sk-|g2a_)/i.test(stripped)
  ) {
    return stripped
  }
  // Unknown shape with non-ASCII: keep original (don't invent a key)
  return k
}

/** Non-sk tokens that appear after key labels or as long secrets */
function extractLooseKeys(text) {
  const out = []
  // g2a_ / other vendor prefixes
  const vendor = text.match(/\b(?:g2a_|nk-|pk-|rk-)[A-Za-z0-9_\-]{8,}\b/g)
  if (vendor) out.push(...vendor)
  // labeled base64 on same line already handled; also standalone long base64 after 密钥/key
  const afterLabel = text.match(
    /(?:key|api[_-]?key|api\s*key|token|密钥)\s*[:：]\s*([A-Za-z0-9+/_-]{20,}={0,2})/gi,
  )
  if (afterLabel) {
    for (const chunk of afterLabel) {
      const m = chunk.match(/[:：]\s*([A-Za-z0-9+/_-]{20,}={0,2})/)
      if (m) out.push(maybeDecodeKey(m[1]))
    }
  }
  return out
}

/**
 * Standalone base64 lines/tokens that decode to sk- / g2a_ style API keys.
 * Common on linux.do: "API Key（Base64，请自行解码）" + next line base64.
 */
function extractBase64DecodedKeys(text) {
  const out = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const t = line.trim()
    // whole line is base64
    if (/^[A-Za-z0-9+/_-]{24,}={0,2}$/.test(t)) {
      const decoded = maybeDecodeKey(t)
      if (decoded && decoded !== t && /^(sk-ant-|sk-|g2a_)/i.test(decoded)) {
        out.push(decoded)
      }
      continue
    }
  }
  // also scan inline base64 blobs (not only whole lines)
  const re = /(?:^|[\s"'`])([A-Za-z0-9+/]{32,}={0,2})(?=$|[\s"'`])/gm
  let m
  while ((m = re.exec(text)) !== null) {
    const token = m[1]
    if (token.startsWith('sk-') || token.startsWith('http')) continue
    const decoded = maybeDecodeKey(token)
    if (decoded && decoded !== token && /^(sk-ant-|sk-|g2a_)/i.test(decoded)) {
      out.push(decoded)
    }
  }
  return unique(out)
}

function pickBestUrl(urls, text) {
  if (urls.length === 0) return null
  const scored = urls.map((u) => {
    let s = 0
    const lower = u.toLowerCase()
    if (/anthropic|claude/.test(lower)) s += 3
    if (/openai|codex/.test(lower)) s += 2
    if (/api\./.test(lower)) s += 1
    if (/127\.0\.0\.1|localhost/.test(lower)) s += 1 // local proxy common
    // proximity to key words in original text
    if (new RegExp(`(?:BASE_URL|endpoint|baseUrl)[^\\n]{0,40}${escapeRegExp(u.slice(0, 30))}`, 'i').test(text)) {
      s += 2
    }
    return { u, s }
  })
  scored.sort((a, b) => b.s - a.s)
  return scored[0].u
}

function pickBestKey(keys) {
  if (keys.length === 0) return null
  const scored = keys.map((k) => {
    let s = k.length / 100
    if (k.startsWith('sk-ant-')) s += 3
    else if (k.startsWith('sk-')) s += 2
    else if (/^g2a_/i.test(k)) s += 2
    else if (/^[A-Za-z0-9+/]+={1,2}$/.test(k) && k.length >= 24) s += 0.5 // raw b64
    return { k, s }
  })
  scored.sort((a, b) => b.s - a.s)
  return maybeDecodeKey(scored[0].k)
}

function cleanUrl(u) {
  return u.replace(/[.,;:!?）)」』】]+$/g, '')
}

function scoreFields(fields, app) {
  let s = 0.3
  if (fields.endpoint) s += 0.35
  if (fields.apiKey) s += 0.35
  if (app) s += 0.1
  return Math.min(1, s)
}

function buildWarnings(fields) {
  const w = []
  if (fields.endpoint && !fields.apiKey) w.push('未识别到 API Key，仍可尝试导入')
  if (!fields.endpoint && fields.apiKey) w.push('未识别到 endpoint/base URL，仍可尝试导入')
  if (fields.endpoint && !/^https?:\/\//i.test(fields.endpoint)) {
    w.push('endpoint 不是 http(s) URL')
  }
  return w
}

function matchAll(text, re) {
  const out = []
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m
  while ((m = r.exec(text)) !== null) out.push(m[0])
  return out
}

function matchAllGroups(text, re, group) {
  const out = []
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m
  while ((m = r.exec(text)) !== null) out.push(m[group])
  return out
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))]
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function base64Encode(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64')
  }
  // browser
  return btoa(unescape(encodeURIComponent(str)))
}

export function base64Decode(b64) {
  // normalize url-safe
  let s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  if (pad) s += '='.repeat(4 - pad)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'base64').toString('utf8')
  }
  return decodeURIComponent(escape(atob(s)))
}

export { MIN_SELECTION_LEN }
