/**
 * Extract model names from share text for CC Switch deep link.
 * Used by Node tests and inlined into the Tampermonkey userscript.
 */

/**
 * @typedef {{
 *   model: string|null,
 *   haikuModel: string|null,
 *   sonnetModel: string|null,
 *   opusModel: string|null,
 *   models: string[]
 * }} ModelResult
 */

/**
 * Ordered specific → general. Overlaps are resolved by keeping the longest
 * match at each span (e.g. claude-sonnet-4.5 wins over claude-sonnet-4).
 * @type {RegExp[]}
 */
const MODEL_RES = [
  // Claude (longer / more specific first)
  /claude-3\.5-sonnet(?:-\d{8})?/gi,
  /claude-3-sonnet(?:-\d{8})?/gi,
  /claude-3\.5-haiku(?:-\d{8})?/gi,
  /claude-3-haiku(?:-\d{8})?/gi,
  /claude-3-opus(?:-\d{8})?/gi,
  /claude-sonnet-4\.5/gi,
  /claude-opus-4\.8/gi,
  /claude-sonnet-4(?!\.\d)/gi,
  /claude-opus-4(?!\.\d)/gi,
  /\bclaude-sonnet\b/gi,
  /\bclaude-haiku\b/gi,
  /\bclaude-opus\b/gi,
  // OpenAI
  /gpt-5\.?6-sol/gi,
  /gpt-5\.?5/gi,
  /gpt-4\.?5[a-z-]*(?:turbo|preview)?/gi,
  /gpt-4o(?:-mini|-preview)?/gi,
  /gpt-4-turbo(?:-preview)?/gi,
  /gpt-4-vision(?:-preview)?/gi,
  /gpt-4(?:-\d{4})?(?![a-z0-9.])/gi,
  /gpt-3\.5-turbo(?:-\d{4})?/gi,
  /\bo3(?:-mini)?\b/gi,
  /\bo1(?:-mini|-preview)?\b/gi,
  // Grok — accept "Grok4.5" / "grok4.5" (no hyphen)
  /(?<![a-z0-9])grok[-_]?4\.5(?![0-9])/gi,
  /(?<![a-z0-9])grok[-_]?3\.5(?![0-9])/gi,
  /(?<![a-z0-9])grok[-_]?4(?![0-9.])/gi,
  /(?<![a-z0-9])grok[-_]?3(?![0-9.])/gi,
  /(?<![a-z0-9])grok-beta\b/gi,
  /(?<![a-z0-9])grok-2\b/gi,
  // Gemini
  /gemini-2\.5-(?:pro|flash)/gi,
  /gemini-2\.0-(?:flash|pro)/gi,
  /gemini-1\.5-(?:pro|flash)/gi,
  /gemini-pro/gi,
  /gemini-flash/gi,
  // DeepSeek — require full minor when present so deepseek-v3.2 is not truncated
  /deepseek-v3(?:\.\d+)?/gi,
  /deepseek-coder(?:-v2)?/gi,
  /deepseek-chat/gi,
]

/**
 * @param {string} text
 * @returns {ModelResult}
 */
export function extractModels(text) {
  if (!text) {
    return { model: null, haikuModel: null, sonnetModel: null, opusModel: null, models: [] }
  }

  // Mask secrets / long base64 so tokens like "...o3..." inside keys never become models
  const scanText = String(text)
    .replace(/[A-Za-z0-9+/_-]{24,}={0,2}/g, ' ')
    .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/gi, ' ')
    .replace(/\b(?:g2a_|tp-|nk-|pk-|rk-)[A-Za-z0-9_-]{8,}\b/gi, ' ')

  /** @type {Array<{start: number, end: number, value: string}>} */
  const spans = []
  for (const re of MODEL_RES) {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    let m
    while ((m = r.exec(scanText)) !== null) {
      const value = normalizeModelId(m[0])
      if (!value) continue
      spans.push({ start: m.index, end: m.index + m[0].length, value })
    }
  }

  // Prefer longer matches; drop spans fully contained in a longer one
  spans.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
  /** @type {Array<{start: number, end: number, value: string}>} */
  const kept = []
  for (const s of spans) {
    const contained = kept.some((k) => s.start >= k.start && s.end <= k.end)
    if (!contained) kept.push(s)
  }

  // Stable unique list in document order
  kept.sort((a, b) => a.start - b.start)
  const models = []
  const seen = new Set()
  for (const s of kept) {
    if (seen.has(s.value)) continue
    seen.add(s.value)
    models.push(s.value)
  }

  // Claude-specific: map to tier fields (prefer longer / more specific ids)
  let haikuModel = null
  let sonnetModel = null
  let opusModel = null
  for (const m of models) {
    if (/haiku/i.test(m)) {
      if (!haikuModel || m.length > haikuModel.length) haikuModel = m
    } else if (/sonnet/i.test(m)) {
      if (!sonnetModel || m.length > sonnetModel.length) sonnetModel = m
    } else if (/opus/i.test(m)) {
      if (!opusModel || m.length > opusModel.length) opusModel = m
    }
  }

  // Primary model: prefer sonnet > opus > haiku > first found
  const model = sonnetModel || opusModel || haikuModel || models[0] || null

  return { model, haikuModel, sonnetModel, opusModel, models }
}

/**
 * Normalize informal spellings to stable model ids.
 * e.g. Grok4.5 / grok4.5 → grok-4.5; gpt5.5 → gpt-5.5 (when matched that way)
 * @param {string} raw
 * @returns {string}
 */
function normalizeModelId(raw) {
  let m = String(raw || '').toLowerCase().trim()
  // Grok: "Grok4.5" / "grok4.5" / "grok_4.5" → "grok-4.5"
  m = m.replace(/^grok[_-]?(\d)/, 'grok-$1')
  // gpt5.5 → gpt-5.5 when hyphen missing
  m = m.replace(/^gpt(\d)/, 'gpt-$1')
  return m
}

/**
 * Soft preference sort for UI dropdowns. Relay shares mix vendors freely, so we
 * never drop models by app — only put preferred families first.
 * @param {string[]} models
 * @param {'claude'|'codex'|null} app
 * @returns {string[]}
 */
export function filterModelsForApp(models, app) {
  if (!app || !models.length) return models.slice()

  const prefer =
    app === 'claude'
      ? (m) => /claude/i.test(m)
      : app === 'codex'
        ? (m) => /gpt|o1|o3|codex/i.test(m)
        : () => false

  return models.slice().sort((a, b) => Number(prefer(b)) - Number(prefer(a)))
}
