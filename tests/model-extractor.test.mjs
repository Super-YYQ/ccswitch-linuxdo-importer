import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractModels, filterModelsForApp } from '../userscript/lib/model-extractor.mjs'

describe('extractModels', () => {
  it('extracts Claude models from share text', () => {
    const text = `支持 claude-3.5-sonnet、claude-3-opus 等模型`
    const result = extractModels(text)
    assert.ok(result.models.length >= 2)
    assert.ok(result.models.some(m => /sonnet/.test(m)))
    assert.ok(result.models.some(m => /opus/.test(m)))
    assert.equal(result.sonnetModel, 'claude-3.5-sonnet')
    assert.equal(result.opusModel, 'claude-3-opus')
  })

  it('extracts GPT models from share text', () => {
    const text = `模型设置 gpt-5.5，gpt-5.6-sol，gpt-4o`
    const result = extractModels(text)
    assert.ok(result.models.length >= 2)
    assert.ok(result.models.some(m => /gpt-5/.test(m)))
    assert.ok(result.models.some(m => /gpt-4o/.test(m)))
  })

  it('extracts Grok models', () => {
    const text = `claude系列均会转发到grok-4.5`
    const result = extractModels(text)
    assert.ok(result.models.some(m => /grok/.test(m)))
  })

  it('handles "支持所有模型" gracefully', () => {
    const text = `支持所有模型，无限制`
    const result = extractModels(text)
    // Should not extract noise, models array may be empty or contain nothing
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
    assert.ok(result.models.some(m => /gpt-4o/.test(m)))
    assert.ok(result.models.some(m => /sonnet/.test(m)))
  })
})

describe('filterModelsForApp', () => {
  it('keeps Claude models for claude app', () => {
    const models = ['claude-3.5-sonnet', 'gpt-4o', 'deepseek-v3']
    const filtered = filterModelsForApp(models, 'claude')
    assert.ok(filtered.includes('claude-3.5-sonnet'))
    assert.ok(filtered.includes('gpt-4o'))
  })

  it('keeps OpenAI models for codex app', () => {
    const models = ['claude-3.5-sonnet', 'gpt-4o', 'deepseek-v3']
    const filtered = filterModelsForApp(models, 'codex')
    assert.ok(filtered.includes('gpt-4o'))
    assert.ok(filtered.includes('deepseek-v3'))
  })

  it('returns all models when app is null', () => {
    const models = ['claude-3.5-sonnet', 'gpt-4o']
    const filtered = filterModelsForApp(models, null)
    assert.equal(filtered.length, models.length)
  })
})
