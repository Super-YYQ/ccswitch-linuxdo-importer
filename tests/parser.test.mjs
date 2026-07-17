import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseShareText,
  looksLikeConfig,
  buildDeeplink,
  maskKey,
  classifyApp,
  base64Encode,
} from '../userscript/lib/core.mjs'

describe('looksLikeConfig', () => {
  it('rejects short or plain Chinese posts', () => {
    assert.equal(looksLikeConfig('短'), false)
    assert.equal(
      looksLikeConfig('这个帖子只是随便聊聊编程学习经验，没有任何密钥内容在里面哈哈哈哈'),
      false,
    )
  })

  it('accepts env-style shares', () => {
    assert.equal(
      looksLikeConfig(`
        分享一个可用的：
        ANTHROPIC_BASE_URL=https://api.example.com
        ANTHROPIC_AUTH_TOKEN=sk-ant-api03-abcdefghij
      `),
      true,
    )
  })
})

describe('parseShareText · env', () => {
  it('extracts ANTHROPIC env from Chinese noise', () => {
    const text = `
大家好，下面是我用了一周的配置，自己测试可用：
ANTHROPIC_BASE_URL=https://proxy.example.com/v1
ANTHROPIC_AUTH_TOKEN=sk-ant-api03-ABCDEFGHijklmnop
用的时候注意别泄露，谢谢各位佬。
`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://proxy.example.com/v1')
    assert.equal(r.apiKey, 'sk-ant-api03-ABCDEFGHijklmnop')
    assert.equal(r.app, 'claude')
    assert.equal(r.source, 'env')
    assert.ok(r.confidence >= 0.7)
  })

  it('extracts OPENAI-style env as codex-leaning', () => {
    const text = `
OPENAI_BASE_URL=https://api.openai-proxy.test
OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuv
`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://api.openai-proxy.test')
    assert.equal(r.apiKey, 'sk-proj-abcdefghijklmnopqrstuv')
    assert.equal(r.app, 'codex')
  })
})

describe('parseShareText · json', () => {
  it('parses JSON provider object embedded in prose', () => {
    const text = `
可以导入这个 JSON：
{"name":"MyRelay","baseUrl":"https://relay.example.com","apiKey":"sk-ant-api03-xyzxyzxyzxyz"}
祝好
`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.name, 'MyRelay')
    assert.equal(r.endpoint, 'https://relay.example.com')
    assert.equal(r.apiKey, 'sk-ant-api03-xyzxyzxyzxyz')
    assert.equal(r.app, 'claude')
    assert.equal(r.source, 'json')
  })
})

describe('parseShareText · base64', () => {
  it('decodes base64 JSON config', () => {
    const json = JSON.stringify({
      name: 'B64Provider',
      endpoint: 'https://b64.example.com',
      apiKey: 'sk-ant-api03-base64keyvalue',
    })
    const b64 = base64Encode(json)
    const text = `配置已加密分享如下（base64）：\n${b64}\n解码后自行导入`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://b64.example.com')
    assert.equal(r.apiKey, 'sk-ant-api03-base64keyvalue')
    assert.equal(r.source, 'base64')
  })
})

describe('parseShareText · deeplink', () => {
  it('parses existing ccswitch deep link', () => {
    const link =
      'ccswitch://v1/import?resource=provider&app=claude&name=Shared&endpoint=https%3A%2F%2Fapi.example.com&apiKey=sk-ant-api03-deeplinkkey'
    const text = `一键导入：${link} 点了就能用`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.source, 'deeplink')
    assert.equal(r.app, 'claude')
    assert.equal(r.endpoint, 'https://api.example.com')
    assert.equal(r.apiKey, 'sk-ant-api03-deeplinkkey')
    assert.equal(r.name, 'Shared')
  })
})

describe('parseShareText · mixed', () => {
  it('pulls url + key from messy Chinese paragraph', () => {
    const text = `
佬友们好，今天分享一个中转，地址是 https://mid.example.org/anthropic 密钥 sk-ant-api03-mixedkeyvalue99
别问我怎么来的，自己测试。限速别骂人。
`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://mid.example.org/anthropic')
    assert.equal(r.apiKey, 'sk-ant-api03-mixedkeyvalue99')
    assert.equal(r.app, 'claude')
    assert.ok(['mixed', 'env'].includes(r.source))
  })

  it('parses url：/key： fullwidth labels with base64 key', () => {
    const text = `免费500刀（并发80，rpm1200）
url：https://grok.example.invalid
key：ZzJhX3Rlc3Rvbmx5X25vdF9hX3JlYWxfdG9rZW5fYWJjZGVmZ2hpag==`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://grok.example.invalid')
    // base64-decoded key (g2a_...)
    assert.equal(r.apiKey, 'g2a_testonly_not_a_real_token_abcdefghij')
    assert.ok(r.confidence >= 0.6)
  })

  it('returns null for pure prose', () => {
    const r = parseShareText(
      '今天天气不错，我们来讨论一下如何学习 Linux 内核以及写驱动的心得体会吧朋友们',
    )
    assert.equal(r, null)
  })
})

describe('classifyApp', () => {
  it('detects claude from sk-ant', () => {
    assert.equal(classifyApp('', { apiKey: 'sk-ant-api03-xxxx' }), 'claude')
  })
  it('detects codex from openai signals', () => {
    assert.equal(
      classifyApp('OPENAI_API_KEY for codex', {
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-abcdef',
      }),
      'codex',
    )
  })
})

describe('buildDeeplink', () => {
  it('builds provider import link', () => {
    const link = buildDeeplink(
      {
        name: 'Test',
        app: 'claude',
        endpoint: 'https://api.example.com',
        apiKey: 'sk-ant-api03-x',
        config: null,
        configFormat: null,
      },
      'claude',
    )
    assert.match(link, /^ccswitch:\/\/v1\/import\?/)
    assert.match(link, /resource=provider/)
    assert.match(link, /app=claude/)
    assert.match(link, /name=Test/)
    assert.match(link, /endpoint=/)
    assert.match(link, /apiKey=/)
  })

  it('throws without app', () => {
    assert.throws(() =>
      buildDeeplink({
        name: 'x',
        app: null,
        endpoint: 'https://a.com',
        apiKey: 'sk-1',
      }),
    )
  })
})

describe('maskKey', () => {
  it('masks middle of key', () => {
    const m = maskKey('sk-ant-api03-abcdefghijklmnop')
    assert.ok(m.includes('****'))
    assert.ok(!m.includes('abcdefghijklmnop'))
  })
})
