import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractModels, filterModelsForApp } from '../userscript/lib/model-extractor.mjs'
import { base64Encode } from '../userscript/lib/core.mjs'

describe('extractModels', () => {
  it('extracts Claude models from share text', () => {
    const text = `支持 claude-3.5-sonnet、claude-3-opus 等模型`
    const result = extractModels(text)
    assert.ok(result.models.length >= 2)
    assert.ok(result.models.some((m) => /sonnet/.test(m)))
    assert.ok(result.models.some((m) => /opus/.test(m)))
    assert.equal(result.sonnetModel, 'claude-3.5-sonnet')
    assert.equal(result.opusModel, 'claude-3-opus')
  })

  it('extracts GPT models from share text', () => {
    const text = `模型设置 gpt-5.5，gpt-5.6-sol，gpt-4o`
    const result = extractModels(text)
    assert.ok(result.models.length >= 2)
    assert.ok(result.models.some((m) => /gpt-5/.test(m)))
    assert.ok(result.models.some((m) => /gpt-4o/.test(m)))
  })

  it('extracts Grok models', () => {
    const text = `claude系列均会转发到grok-4.5`
    const result = extractModels(text)
    assert.ok(result.models.some((m) => /grok/.test(m)))
  })

  it('extracts informal Grok4.5 spelling (no hyphen, mixed case)', () => {
    for (const text of [
      '第一波】福利Grok4.5 1000刀',
      '转发到grok4.5',
      '模型 grok-4.5',
      '支持 Grok-4',
    ]) {
      const result = extractModels(text)
      assert.ok(
        result.models.some((m) => /grok/i.test(m)),
        `expected grok model in: ${text}`,
      )
    }
    const r = extractModels('福利Grok4.5 1000刀')
    assert.equal(r.model, 'grok-4.5')
  })

  it('does not match Grok as substring of unrelated tokens', () => {
    assert.equal(extractModels('mygrok4.5x is not a model id').models.length, 0)
    assert.equal(extractModels('grok4.50 typo version').models.length, 0)
  })

  it('does not treat o3/o1 substrings inside base64 API keys as models', () => {
    // Synthetic key body that still contains "o3" letter runs when base64-encoded
    const key = 'sk-test-o3o1-only-synthetic-body-00000000'
    const b64 = base64Encode(key)
    const r = extractModels(
      `{"_type":"newapi_channel_conn","key":"${b64}","url":"https://api.example.invalid"}`,
    )
    assert.equal(r.models.length, 0)
    assert.equal(r.model, null)
  })

  it('still extracts real o3 / o1 model names with word boundaries', () => {
    const r = extractModels('支持 o3 与 o1-mini 模型')
    assert.ok(r.models.some((m) => m === 'o3'))
    assert.ok(r.models.some((m) => /o1/.test(m)))
  })

  it('handles "支持所有模型" gracefully', () => {
    const text = `支持所有模型，无限制`
    const result = extractModels(text)
    assert.ok(Array.isArray(result.models))
  })

  it('sets model to sonnet when multiple tiers present', () => {
    const text = `支持 claude-3-haiku, claude-3.5-sonnet, claude-3-opus`
    const result = extractModels(text)
    assert.ok(/sonnet/.test(result.model))
    assert.equal(result.haikuModel, 'claude-3-haiku')
    assert.equal(result.sonnetModel, 'claude-3.5-sonnet')
    assert.equal(result.opusModel, 'claude-3-opus')
  })

  it('returns null when no models found', () => {
    const text = `这是一段普通的中文介绍，没有模型名`
    const result = extractModels(text)
    assert.equal(result.model, null)
    assert.equal(result.models.length, 0)
  })

  it('handles mixed case and variant spellings', () => {
    const text = `GPT-4o-MINI and Claude-Sonnet-4.5`
    const result = extractModels(text)
    assert.ok(result.models.some((m) => /gpt-4o/.test(m)))
    assert.ok(result.models.some((m) => /sonnet/.test(m)))
  })

  it('keeps longest match when patterns overlap (sonnet-4.5 / opus-4.8 / gpt-4o / deepseek-v3.2)', () => {
    const text = '支持 claude-sonnet-4.5、claude-opus-4.8、gpt-4o、deepseek-v3.2'
    const r = extractModels(text)
    assert.ok(r.models.includes('claude-sonnet-4.5'))
    assert.ok(!r.models.includes('claude-sonnet-4'), `short sonnet leak: ${r.models}`)
    assert.ok(r.models.includes('claude-opus-4.8'))
    assert.ok(!r.models.includes('claude-opus-4'), `short opus leak: ${r.models}`)
    assert.ok(r.models.includes('gpt-4o'))
    assert.ok(!r.models.includes('gpt-4'), `short gpt leak: ${r.models}`)
    assert.ok(r.models.includes('deepseek-v3.2'))
    assert.ok(!r.models.includes('deepseek-v3'), `truncated deepseek: ${r.models}`)
  })
})

describe('filterModelsForApp', () => {
  it('prefers Claude models for claude app but keeps others (relay-friendly)', () => {
    const models = ['gpt-4o', 'claude-3.5-sonnet', 'deepseek-v3', 'grok-4.5']
    const filtered = filterModelsForApp(models, 'claude')
    assert.equal(filtered.length, models.length)
    assert.equal(filtered[0], 'claude-3.5-sonnet')
    assert.ok(filtered.includes('gpt-4o'))
    assert.ok(filtered.includes('deepseek-v3'))
    assert.ok(filtered.includes('grok-4.5'))
  })

  it('prefers OpenAI models for codex app but keeps others', () => {
    const models = ['claude-3.5-sonnet', 'gpt-4o', 'deepseek-v3', 'grok-4.5']
    const filtered = filterModelsForApp(models, 'codex')
    assert.equal(filtered.length, models.length)
    assert.equal(filtered[0], 'gpt-4o')
    assert.ok(filtered.includes('claude-3.5-sonnet'))
    assert.ok(filtered.includes('grok-4.5'))
  })

  it('returns all models when app is null', () => {
    const models = ['claude-3.5-sonnet', 'gpt-4o']
    const filtered = filterModelsForApp(models, null)
    assert.equal(filtered.length, models.length)
  })
})
