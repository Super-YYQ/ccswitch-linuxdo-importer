import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseShareText,
  looksLikeConfig,
  buildDeeplink,
  maskKey,
  classifyApp,
  base64Encode,
  enrichTextWithAnchorHrefs,
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

  it('parses table Base URL + next-line Base64 API Key', () => {
    const text = `配置项    值
Base URL    https://api.example.invalid
额度查询页    打开网站后输入 key 可以查询使用额度记录
模型设置    gpt-5.5，gpt-5.6-sol，claude系列均会转发到grok4.5
API Key（Base64，请自行解码）
c2stdGVzdC1vbmx5LTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw
如果想自己稳定`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://api.example.invalid')
    assert.equal(
      r.apiKey,
      'sk-test-only-000000000000000000000000',
    )
    // multi-model blurb should not hard-force claude
    assert.ok(r.app === null || r.app === 'codex' || r.app === 'claude')
  })

  it('handles Discourse noise: zwsp, soft-hyphen, spaced base64, glued label', () => {
    const b64 =
      'c2stdGVzdC1vbmx5LTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw'
    const expected =
      'sk-test-only-000000000000000000000000'
    const cases = [
      // glued label+value
      `API Key（Base64，请自行解码）${b64}\nBase URL https://api.example.invalid`,
      // zwsp before key
      'Base URL https://api.example.invalid\nAPI Key（Base64，请自行解码）\n​' + b64,
      // space-split base64
      `Base URL https://api.example.invalid\nAPI Key（Base64，请自行解码）\n${b64.slice(0, 40)} ${b64.slice(40)}`,
      // soft hyphen inside base64
      `Base URL https://api.example.invalid\nAPI Key（Base64，请自行解码）\n${b64.slice(0, 30)}­${b64.slice(30)}`,
    ]
    for (const text of cases) {
      const r = parseShareText(text)
      assert.ok(r, 'expected parse result')
      assert.equal(r.endpoint, 'https://api.example.invalid')
      assert.equal(r.apiKey, expected)
    }
  })

  it('returns null for pure prose', () => {
    const r = parseShareText(
      '今天天气不错，我们来讨论一下如何学习 Linux 内核以及写驱动的心得体会吧朋友们',
    )
    assert.equal(r, null)
  })

  it('fails to find endpoint when selection only has link label "base url" (Discourse onebox)', () => {
    // Reproduces Snipaste_2026-07-18_09-09-59: [base url](https://...) shows as text "base url"
    // without the real href in selection.toString().
    const b64 =
      'c2stdGVzdC1vbmx5LTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw'
    const text = `API Key（Base64，请自行解码）
${b64}
base url`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, 'sk-test-only-000000000000000000000000')
    // endpoint missing — real URL only lived in <a href>
    assert.equal(r.endpoint, null)
  })

  it('recovers endpoint after enriching selection with anchor hrefs', () => {
    const b64 =
      'c2stdGVzdC1vbmx5LTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw'
    const selectionText = `API Key（Base64，请自行解码）
${b64}
base url`
    const anchors = [{ text: 'base url', href: 'https://relay.example.net/v1' }]
    const enriched = enrichTextWithAnchorHrefs(selectionText, anchors)
    const r = parseShareText(enriched)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://relay.example.net/v1')
    assert.equal(r.apiKey, 'sk-test-only-000000000000000000000000')
  })

  it('decodes base64 key with CJK watermark 去除文中 injected (linux.do anti-scrape)', () => {
    // Real share pattern: key is base64, but after decode a Chinese watermark sits mid-token.
    // Example: sk-...去除文中... — strip non-ASCII noise, keep the sk- key.
    const b64 =
      'c2stdGVzdC1vbmx5LTIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy'
    const text = `API Key（Base64，请自行解码）
${b64}
base url：https://example.com`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, 'sk-test-only-222222222222222222222222')
    assert.equal(r.endpoint, 'https://example.com')
  })
})

describe('enrichTextWithAnchorHrefs', () => {
  it('appends hrefs when visible link text has no URL', () => {
    const text = 'API Key xxx\nbase url'
    const out = enrichTextWithAnchorHrefs(text, [
      { text: 'base url', href: 'https://hidden.example.com/api' },
    ])
    assert.match(out, /https:\/\/hidden\.example\.com\/api/)
    assert.match(out, /base\s*url/i)
  })

  it('does not duplicate href already present in selection text', () => {
    const text = 'url：https://already.example.com\nkey：sk-xxx'
    const out = enrichTextWithAnchorHrefs(text, [
      { text: 'https://already.example.com', href: 'https://already.example.com' },
    ])
    const matches = out.match(/https:\/\/already\.example\.com/g) || []
    assert.equal(matches.length, 1)
  })

  it('skips non-http(s) and empty anchors', () => {
    const text = 'hello world enough chars here!!'
    const out = enrichTextWithAnchorHrefs(text, [
      { text: 'click', href: 'javascript:void(0)' },
      { text: 'x', href: '' },
      { text: 'mail', href: 'mailto:a@b.com' },
    ])
    assert.equal(out, text)
  })

  it('labels preferred: base url / url / endpoint anchors first', () => {
    const text = 'see also docs and base url'
    const out = enrichTextWithAnchorHrefs(text, [
      { text: 'docs', href: 'https://docs.example.com/readme' },
      { text: 'base url', href: 'https://api.example.com' },
    ])
    // both appended, but base-url labeled form for the preferred one
    assert.match(out, /base\s*url\s*[:：]\s*https:\/\/api\.example\.com/i)
    assert.match(out, /https:\/\/docs\.example\.com\/readme/)
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

  it('includes model params when provided', () => {
    const link = buildDeeplink(
      {
        name: 'Test',
        app: 'claude',
        endpoint: 'https://api.example.com',
        apiKey: 'sk-ant-api03-x',
      },
      'claude',
      {
        model: 'claude-3.5-sonnet',
        haikuModel: 'claude-3-haiku',
        sonnetModel: 'claude-3.5-sonnet',
        opusModel: 'claude-3-opus',
        models: ['claude-3.5-sonnet', 'claude-3-haiku', 'claude-3-opus'],
      },
    )
    assert.match(link, /model=claude-3\.5-sonnet/)
    assert.match(link, /haikuModel=claude-3-haiku/)
    assert.match(link, /sonnetModel=claude-3\.5-sonnet/)
    assert.match(link, /opusModel=claude-3-opus/)
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
