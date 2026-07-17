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

// Common model patterns seen on linux.do
const MODEL_PATTERNS = {
  // Claude models
  claude: [
    /claude-3\.5-sonnet(?:-\d{8})?/gi,
    /claude-3-sonnet(?:-\d{8})?/gi,
    /claude-3\.5-haiku(?:-\d{8})?/gi,
    /claude-3-haiku(?:-\d{8})?/gi,
    /claude-3-opus(?:-\d{8})?/gi,
    /claude-sonnet-4\.5/gi,
    /claude-sonnet-4/gi,
    /claude-opus-4\.8/gi,
    /claude-opus-4/gi,
    /\bclaude-sonnet\b/gi,
    /\bclaude-haiku\b/gi,
    /\bclaude-opus\b/gi,
  ],
  // OpenAI / Codex models
  openai: [
    /gpt-5\.?6-sol/gi,
    /gpt-5\.?5/gi,
    /gpt-4\.?5[a-z-]*(?:turbo|preview)?/gi,
    /gpt-4o(?:-mini|-preview)?/gi,
    /gpt-4-turbo(?:-preview)?/gi,
    /gpt-4-vision(?:-preview)?/gi,
    /gpt-4(?:-\d{4})?/gi,
    /gpt-3\.5-turbo(?:-\d{4})?/gi,
    /o3(?:-mini)?/gi,
    /o1(?:-mini|-preview)?/gi,
  ],
  // Grok
  grok: [
    /grok-4\.5/gi,
    /grok-3\.5/gi,
    /grok-beta/gi,
    /\bgrok-2\b/gi,
  ],
  // Gemini
  gemini: [
    /gemini-2\.5-(?:pro|flash)/gi,
    /gemini-2\.0-(?:flash|pro)/gi,
    /gemini-1\.5-(?:pro|flash)/gi,
    /gemini-pro/gi,
    /gemini-flash/gi,
  ],
  // DeepSeek
  deepseek: [
    /deepseek-v3/gi,
    /deepseek-coder(?:-v2)?/gi,
    /deepseek-chat/gi,
  ],
}

/**
 * @param {string} text
 * @returns {ModelResult}
 */
export function extractModels(text) {
  if (!text) {
    return { model: null, haikuModel: null, sonnetModel: null, opusModel: null, models: [] }
  }

  const found = new Set()

  // Scan all patterns
  for (const patterns of Object.values(MODEL_PATTERNS)) {
    for (const re of patterns) {
      const matches = text.matchAll(new RegExp(re.source, re.flags))
      for (const m of matches) {
        found.add(m[0].toLowerCase())
      }
    }
  }

  const models = Array.from(found)

  // Claude-specific: map to tier fields
  let haikuModel = null
  let sonnetModel = null
  let opusModel = null

  for (const m of models) {
    if (/haiku/i.test(m)) {
      haikuModel = m
    } else if (/sonnet/i.test(m)) {
      sonnetModel = m
    } else if (/opus/i.test(m)) {
      opusModel = m
    }
  }

  // Primary model: prefer sonnet > opus > haiku > first found
  const model = sonnetModel || opusModel || haikuModel || models[0] || null

  return { model, haikuModel, sonnetModel, opusModel, models }
}

/**
 * Filter model list to only include models compatible with the given app.
 * @param {string[]} models
 * @param {'claude'|'codex'|null} app
 * @returns {string[]}
 */
export function filterModelsForApp(models, app) {
  if (!app || !models.length) return models

  if (app === 'claude') {
    // Claude prefers claude-* models, but can forward others
    return models.filter(m => /claude|grok|gemini|gpt/i.test(m))
  }

  if (app === 'codex') {
    // Codex primarily uses OpenAI models
    return models.filter(m => /gpt|o1|o3|deepseek|claude/i.test(m))
  }

  return models
}
