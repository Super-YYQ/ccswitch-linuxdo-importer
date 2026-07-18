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
  selectCandidate,
  describeConfigPayload,
} from '../userscript/lib/core.mjs'

// Synthetic fixtures only — never paste live share secrets into the suite.
const SYNTH = {
  skAnt: 'sk-ant-api03-TESTONLY00000000000000000000',
  skAntShort: 'sk-ant-api03-abcdefghij',
  skAntMixed: 'sk-ant-api03-mixedkeyvalue99',
  skAntA: 'sk-ant-api03-aaaaaaaaaaaaaaaa',
  skAntB: 'sk-ant-api03-bbbbbbbbbbbbbbbb',
  skAntDeeplink: 'sk-ant-api03-deeplinkkey',
  skAntJson: 'sk-ant-api03-xyzxyzxyzxyz',
  skAntB64: 'sk-ant-api03-base64keyvalue',
  skPlain: 'sk-test-only-000000000000000000000000',
  skProj: 'sk-proj-abcdefghijklmnopqrstuv',
  skHex: 'sk-hexonlysyntheticvalue1234567890ab',
  skWatermarkBody: 'sk-test-only-222222222222222222222222',
  g2a: 'g2a_testonly_not_a_real_token_abcdefghij',
  tp: 'tp-test-only-not-a-real-token-abcdefghij01',
  endpoint: 'https://api.example.invalid',
  endpointV1: 'https://api.example.invalid/v1',
  endpointAnthropic: 'https://api.example.invalid/anthropic',
  endpointRelay: 'https://relay.example.invalid/v1',
  endpointProxy: 'https://proxy.example.invalid/v1',
  endpointOpenai: 'https://api.openai-proxy.test',
  endpointB64: 'https://b64.example.invalid',
  endpointHex: 'https://hex.example.invalid',
  endpointA: 'https://a.example.invalid',
  endpointB: 'https://b.example.invalid',
  endpointMid: 'https://mid.example.invalid/anthropic',
  endpointGrok: 'https://grok.example.invalid',
  endpointNewapi: 'https://newapi.example.invalid',
}

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
        ANTHROPIC_BASE_URL=${SYNTH.endpoint}
        ANTHROPIC_AUTH_TOKEN=${SYNTH.skAntShort}
      `),
      true,
    )
  })

  it('rejects long base64-ish noise without a decodable key/config', () => {
    assert.equal(
      looksLikeConfig('这是一段讨论 ' + 'A'.repeat(50) + ' 填充填充填充填充'),
      false,
    )
  })

  it('accepts standalone base64 that decodes to an sk- key', () => {
    const b64 = base64Encode(SYNTH.skPlain)
    assert.equal(looksLikeConfig(`请自行解码\n${b64}\n谢谢`), true)
  })
})

describe('parseShareText · env', () => {
  it('extracts ANTHROPIC env from Chinese noise', () => {
    const text = `
大家好，下面是我用了一周的配置，自己测试可用：
ANTHROPIC_BASE_URL=${SYNTH.endpointProxy}
ANTHROPIC_AUTH_TOKEN=${SYNTH.skAnt}
用的时候注意别泄露，谢谢各位佬。
`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpointProxy)
    assert.equal(r.apiKey, SYNTH.skAnt)
    assert.equal(r.app, 'claude')
    assert.equal(r.source, 'env')
    assert.ok(r.confidence >= 0.7)
    assert.ok(r.confidence <= 1, `confidence must be <= 1, got ${r.confidence}`)
  })

  it('extracts OPENAI-style env as codex-leaning', () => {
    const text = `
OPENAI_BASE_URL=${SYNTH.endpointOpenai}
OPENAI_API_KEY=${SYNTH.skProj}
`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpointOpenai)
    assert.equal(r.apiKey, SYNTH.skProj)
    assert.equal(r.app, 'codex')
  })
})

describe('parseShareText · json', () => {
  it('parses JSON provider object embedded in prose', () => {
    const text = `
可以导入这个 JSON：
{"name":"MyRelay","baseUrl":"https://relay.example.com","apiKey":"${SYNTH.skAntJson}"}
祝好
`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.name, 'MyRelay')
    assert.equal(r.endpoint, 'https://relay.example.com')
    assert.equal(r.apiKey, SYNTH.skAntJson)
    assert.equal(r.app, 'claude')
    assert.equal(r.source, 'json')
    // simple share objects must not smuggle the whole JSON as config
    assert.equal(r.config, null)
  })

  it('attaches config only for full env-shaped provider objects', () => {
    const obj = {
      name: 'FullCfg',
      env: {
        ANTHROPIC_BASE_URL: SYNTH.endpoint,
        ANTHROPIC_AUTH_TOKEN: SYNTH.skAnt,
        ANTHROPIC_MODEL: 'claude-sonnet-4',
      },
    }
    const text = `完整配置：\n${JSON.stringify(obj)}`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpoint)
    assert.equal(r.apiKey, SYNTH.skAnt)
    assert.ok(r.config, 'full env config should attach config payload')
    assert.equal(r.configFormat, 'json')
  })
})

describe('parseShareText · base64', () => {
  it('decodes base64 JSON config', () => {
    const json = JSON.stringify({
      name: 'B64Provider',
      endpoint: SYNTH.endpointB64,
      apiKey: SYNTH.skAntB64,
    })
    const b64 = base64Encode(json)
    const text = `配置已加密分享如下（base64）：\n${b64}\n解码后自行导入`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpointB64)
    assert.equal(r.apiKey, SYNTH.skAntB64)
    assert.equal(r.source, 'base64')
  })
})

describe('parseShareText · deeplink', () => {
  it('parses existing ccswitch deep link', () => {
    const link = `ccswitch://v1/import?resource=provider&app=claude&name=Shared&endpoint=${encodeURIComponent(SYNTH.endpoint)}&apiKey=${SYNTH.skAntDeeplink}`
    const text = `一键导入：${link} 点了就能用`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.source, 'deeplink')
    assert.equal(r.app, 'claude')
    assert.equal(r.endpoint, SYNTH.endpoint)
    assert.equal(r.apiKey, SYNTH.skAntDeeplink)
    assert.equal(r.name, 'Shared')
  })

  it('rejects non-provider ccswitch deeplinks (mcp/prompt/skill)', () => {
    for (const resource of ['mcp', 'prompt', 'skill']) {
      const link = `ccswitch://v1/import?resource=${resource}&app=claude&name=X&endpoint=${encodeURIComponent(SYNTH.endpoint)}&apiKey=${SYNTH.skAnt}`
      const r = parseShareText(`导入：${link}`)
      // Must not rewrite into a provider import
      assert.equal(r, null, `resource=${resource} should be rejected`)
    }
  })
})

describe('parseShareText · mixed', () => {
  it('pulls url + key from messy Chinese paragraph', () => {
    const text = `
佬友们好，今天分享一个中转，地址是 ${SYNTH.endpointMid} 密钥 ${SYNTH.skAntMixed}
别问我怎么来的，自己测试。限速别骂人。
`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpointMid)
    assert.equal(r.apiKey, SYNTH.skAntMixed)
    assert.equal(r.app, 'claude')
    assert.ok(['mixed', 'env'].includes(r.source))
  })

  it('parses url：/key： fullwidth labels with base64 key', () => {
    const b64 = base64Encode(SYNTH.g2a)
    const text = `免费500刀（并发80，rpm1200）
url：${SYNTH.endpointGrok}
key：${b64}`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpointGrok)
    assert.equal(r.apiKey, SYNTH.g2a)
    assert.ok(r.confidence >= 0.6)
  })

  it('parses table Base URL + next-line Base64 API Key', () => {
    const b64 = base64Encode(SYNTH.skPlain)
    const text = `配置项    值
Base URL    ${SYNTH.endpoint}
额度查询页    打开网站后输入 key 可以查询使用额度记录
模型设置    gpt-5.5，gpt-5.6-sol，claude系列均会转发到grok4.5
API Key（Base64，请自行解码）
${b64}
如果想自己稳定`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpoint)
    assert.equal(r.apiKey, SYNTH.skPlain)
    // multi-model blurb should not hard-force claude
    assert.ok(r.app === null || r.app === 'codex' || r.app === 'claude')
  })

  it('handles Discourse noise: zwsp, soft-hyphen, spaced base64, glued label', () => {
    const b64 = base64Encode(SYNTH.skPlain)
    const expected = SYNTH.skPlain
    const cases = [
      // glued label+value
      `API Key（Base64，请自行解码）${b64}\nBase URL ${SYNTH.endpoint}`,
      // zwsp before key
      `Base URL ${SYNTH.endpoint}\nAPI Key（Base64，请自行解码）\n​` + b64,
      // space-split base64
      `Base URL ${SYNTH.endpoint}\nAPI Key（Base64，请自行解码）\n${b64.slice(0, 20)} ${b64.slice(20)}`,
      // soft hyphen inside base64
      `Base URL ${SYNTH.endpoint}\nAPI Key（Base64，请自行解码）\n${b64.slice(0, 16)}­${b64.slice(16)}`,
    ]
    for (const text of cases) {
      const r = parseShareText(text)
      assert.ok(r, 'expected parse result')
      assert.equal(r.endpoint, SYNTH.endpoint)
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
    const b64 = base64Encode(SYNTH.skPlain)
    const text = `API Key（Base64，请自行解码）
${b64}
base url`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, SYNTH.skPlain)
    // endpoint missing — real URL only lived in <a href>
    assert.equal(r.endpoint, null)
  })

  it('recovers endpoint after enriching selection with anchor hrefs', () => {
    const b64 = base64Encode(SYNTH.skPlain)
    const selectionText = `API Key（Base64，请自行解码）
${b64}
base url`
    const anchors = [{ text: 'base url', href: SYNTH.endpointRelay }]
    const enriched = enrichTextWithAnchorHrefs(selectionText, anchors)
    const r = parseShareText(enriched)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpointRelay)
    assert.equal(r.apiKey, SYNTH.skPlain)
  })

  it('decodes base64 key with CJK watermark 去除文中 injected (linux.do anti-scrape)', () => {
    // Synthetic: insert CJK anti-scrape watermark mid-token, then base64.
    const clean = SYNTH.skWatermarkBody
    const mid = Math.floor(clean.length / 2)
    const withWatermark = clean.slice(0, mid) + '去除文中' + clean.slice(mid)
    const b64 = base64Encode(withWatermark)
    const text = `API Key（Base64，请自行解码）
${b64}
base url：${SYNTH.endpoint}`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, clean)
    assert.equal(r.endpoint, SYNTH.endpoint)
  })

  it('parses newapi_channel_conn JSON with base64 key field', () => {
    const b64 = base64Encode(SYNTH.skPlain)
    const text = `{"_type":"newapi_channel_conn","key":"${b64}","url":"${SYNTH.endpointNewapi}"}
链接不能注册 欢迎佬们 帮忙测试`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpointNewapi)
    assert.equal(r.apiKey, SYNTH.skPlain)
    assert.ok(['json', 'mixed'].includes(r.source), `source=${r.source}`)
    assert.equal(r.config, null)
  })

  it('recovers endpoint when Discourse linkifies JSON url value to bare "url"', () => {
    const b64 = base64Encode(SYNTH.skPlain)
    const selectionText = `{"_type":"newapi_channel_conn","key":"${b64}","url":"url"}
链接不能注册`
    const enriched = enrichTextWithAnchorHrefs(selectionText, [
      { text: 'url', href: SYNTH.endpointNewapi },
    ])
    assert.ok(!/"url[：:]https?:\/\//.test(enriched), `corrupted JSON: ${enriched}`)
    assert.match(enriched, /https:\/\/newapi\.example\.invalid/)
    const r = parseShareText(enriched)
    assert.ok(r)
    assert.equal(r.apiKey, SYNTH.skPlain)
    assert.equal(r.endpoint, SYNTH.endpointNewapi)
  })

  it('handles Discourse-wrapped newapi JSON (newline after colon, unquoted url)', () => {
    const b64 = base64Encode(SYNTH.skPlain)
    const text = `{"_type":"newapi_channel_conn","key":
"${b64}","url":
${SYNTH.endpointNewapi}"}
链接不能注册 欢迎佬们 帮忙测试

key base64`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpointNewapi)
    assert.equal(r.apiKey, SYNTH.skPlain)
    assert.ok(!String(r.endpoint).includes('"'))
  })

  it('recovers tp- key from CJK-glued base64 (no whitespace boundary)', () => {
    // Pattern from real shares: base64 glued after Chinese prose, peels to tp-…
    const b64 = base64Encode(SYNTH.tp)
    const text = `自己买的这个都没咋用 之前一分钱续费的 最近使用的grok 丢出来给需要的佬友们用${b64}
目前还有额度

兼容 OpenAI 接口协议：

${SYNTH.endpointV1}

兼容 Anthropic 接口协议：

${SYNTH.endpointAnthropic}`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, SYNTH.tp)
    assert.ok(r.endpoint === SYNTH.endpointV1 || r.endpoint === SYNTH.endpointAnthropic)
  })

  it('accepts plain / spaced base64 that peels to tp- keys', () => {
    const b64 = base64Encode(SYNTH.tp)
    const cases = [
      `${b64}\n${SYNTH.endpointV1}`,
      `佬友们用 ${b64}\n${SYNTH.endpointV1}`,
      `key: ${SYNTH.tp}\n${SYNTH.endpointV1}`,
    ]
    for (const text of cases) {
      const r = parseShareText(text)
      assert.ok(r, `expected parse for: ${text.slice(0, 40)}…`)
      assert.equal(r.apiKey, SYNTH.tp)
      assert.equal(r.endpoint, SYNTH.endpointV1)
    }
  })

  it('truncates oversized selections and still parses trailing config', () => {
    // Put the real config near the start so truncation keeps it; pad with prose after.
    const text =
      `url：${SYNTH.endpoint}\nkey：${SYNTH.skAnt}\n` + '讨论内容填充'.repeat(20_000)
    assert.ok(text.length > 64 * 1024)
    const started = Date.now()
    const r = parseShareText(text)
    const elapsed = Date.now() - started
    assert.ok(elapsed < 2000, `parse took too long: ${elapsed}ms`)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpoint)
    assert.equal(r.apiKey, SYNTH.skAnt)
    assert.ok(r.warnings.some((w) => /选区过大|截断/.test(w)))
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
  it('ignores multi-model relay blurbs (gpt+claude+grok) without provider env', () => {
    const text = `模型设置    gpt-5.5，gpt-5.6-sol，claude系列均会转发到grok4.5
Base URL    ${SYNTH.endpoint}
API Key     ${SYNTH.skPlain}`
    assert.equal(
      classifyApp(text, {
        endpoint: SYNTH.endpoint,
        apiKey: SYNTH.skPlain,
      }),
      null,
    )
  })
  it('does not treat bare sk- alone as codex', () => {
    assert.equal(
      classifyApp('自建中转', {
        endpoint: 'https://relay.example.org',
        apiKey: SYNTH.skPlain,
      }),
      null,
    )
  })
})

describe('selectCandidate', () => {
  it('switches endpoint/apiKey among mixed multi-pair candidates', () => {
    const text = `
      url1 ${SYNTH.endpointA}
      url2 ${SYNTH.endpointB}
      key1 ${SYNTH.skAntA}
      key2 ${SYNTH.skAntB}
    `
    const r = parseShareText(text)
    assert.ok(r)
    assert.ok(r.candidates && r.candidates.length >= 2, `candidates=${r.candidates?.length}`)
    const second = selectCandidate(r, 1)
    assert.equal(second.candidateIndex, 1)
    assert.ok(second.endpoint)
    assert.ok(second.apiKey)
    assert.ok([SYNTH.endpointA, SYNTH.endpointB].includes(second.endpoint))
    assert.ok([SYNTH.skAntA, SYNTH.skAntB].includes(second.apiKey))
  })

  it('defaults to same-block URL/key pairs instead of crossed best fields', () => {
    // Grouped blocks: URL1+KEY1 then URL2+KEY2 — default must not be URL2×KEY1
    const text = `
url：${SYNTH.endpointA}
key：${SYNTH.skAntA}

url：${SYNTH.endpointB}
key：${SYNTH.skAntB}
`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpointA)
    assert.equal(r.apiKey, SYNTH.skAntA)
  })
})

describe('looksLikeConfig · deeplink gate', () => {
  it('accepts provider deeplinks', () => {
    const link = `ccswitch://v1/import?resource=provider&app=claude&name=Shared&endpoint=${encodeURIComponent(SYNTH.endpoint)}&apiKey=${SYNTH.skAntDeeplink}`
    assert.equal(looksLikeConfig(`一键导入：${link}`), true)
  })

  it('rejects non-provider deeplinks so the floating button stays hidden', () => {
    for (const resource of ['mcp', 'prompt', 'skill']) {
      const link = `ccswitch://v1/import?resource=${resource}&app=claude&name=X&endpoint=${encodeURIComponent(SYNTH.endpoint)}&apiKey=${SYNTH.skAnt}`
      assert.equal(looksLikeConfig(`导入：${link}`), false, `resource=${resource}`)
    }
  })
})

describe('key prefix hints + alternate encodings', () => {
  it('parses base64 key body and prepends sk- from prose hint (linux.do style)', () => {
    // Deterministic test-only body — never high-entropy “real key” shapes
    const body = 'TESTONLY_PREFIX_BODY_00000000000000000000'
    const b64 = base64Encode(body)
    const text = `模型：grok-4.5
key（base64）：${b64}

别忘了 sk- 前缀哦
干啥都行，不做限制喵`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, `sk-${body}`)
    assert.ok(r.warnings.some((w) => /前缀/.test(w)))
  })

  it('parses base64 key body and prepends sk-ant- when that prefix is hinted', () => {
    const body = 'TESTONLY_ANT_BODY_0000000000000000000000'
    const b64 = base64Encode(body)
    const text = `API Key（Base64）
${b64}
请加上 sk-ant- 前缀再导入`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, `sk-ant-${body}`)
  })

  it('does not invent sk- prefix without a prose hint', () => {
    const body = 'TESTONLY_NOPREFIX_BODY_000000000000000000'
    const b64 = base64Encode(body)
    const text = `key（base64）：${b64}\n仅分享 body，无前缀说明`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, body)
  })

  it('decodes hex-encoded sk- key when labeled as key', () => {
    const full = SYNTH.skHex
    const hex = Buffer.from(full, 'utf8').toString('hex')
    const text = `key：${hex}
url：${SYNTH.endpointHex}`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, full)
    assert.equal(r.endpoint, SYNTH.endpointHex)
  })

  it('peels double base64 (俩次base64) to sk- key', () => {
    const key = 'sk-test-double-base64-00000000000000000000'
    const inner = base64Encode(key)
    const outer = base64Encode(inner)
    const text = `俩次base64：${outer}
url：${SYNTH.endpoint}`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, key)
    assert.equal(r.endpoint, SYNTH.endpoint)
  })

  it('peels double base64 even without 俩次 label (whole-line token)', () => {
    const key = 'sk-test-double-base64-00000000000000000000'
    const outer = base64Encode(base64Encode(key))
    const text = `${outer}
${SYNTH.endpoint}`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, key)
  })
})

describe('buildDeeplink', () => {
  it('builds provider import link', () => {
    const link = buildDeeplink(
      {
        name: 'T',
        app: 'claude',
        endpoint: SYNTH.endpoint,
        apiKey: SYNTH.skAnt,
      },
      'claude',
    )
    assert.match(link, /^ccswitch:\/\/v1\/import\?/)
    assert.match(link, /resource=provider/)
    assert.match(link, /app=claude/)
    assert.match(link, /apiKey=/)
  })

  it('includes model params when provided', () => {
    const link = buildDeeplink(
      {
        name: 'T',
        app: 'claude',
        endpoint: SYNTH.endpoint,
        apiKey: SYNTH.skAnt,
      },
      'claude',
      { model: 'claude-sonnet-4', sonnetModel: 'claude-sonnet-4' },
    )
    assert.match(link, /model=claude-sonnet-4/)
    assert.match(link, /sonnetModel=claude-sonnet-4/)
  })

  it('throws without app', () => {
    assert.throws(() =>
      buildDeeplink({
        name: 'T',
        app: null,
        endpoint: SYNTH.endpoint,
        apiKey: SYNTH.skAnt,
      }),
    )
  })

  it('does not embed config for simple {url,key} json shares', () => {
    const text = `{"name":"Simple","url":"${SYNTH.endpoint}","key":"${SYNTH.skPlain}"}`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.config, null)
    const link = buildDeeplink({ ...r, app: r.app || 'claude' }, r.app || 'claude')
    assert.ok(!/[?&]config=/.test(link), `unexpected config in deeplink: ${link}`)
  })

  it('can omit full config when includeConfig is false', () => {
    const obj = {
      name: 'FullCfg',
      env: {
        ANTHROPIC_BASE_URL: SYNTH.endpoint,
        ANTHROPIC_AUTH_TOKEN: SYNTH.skAnt,
        ANTHROPIC_MODEL: 'claude-sonnet-4',
      },
      usageScript: 'echo usage',
    }
    const r = parseShareText(JSON.stringify(obj))
    assert.ok(r)
    assert.ok(r.config)
    const withCfg = buildDeeplink({ ...r, app: 'claude' }, 'claude', null, { includeConfig: true })
    const without = buildDeeplink({ ...r, app: 'claude' }, 'claude', null, { includeConfig: false })
    assert.ok(/[?&]config=/.test(withCfg))
    assert.ok(!/[?&]config=/.test(without), without)
  })

  it('describeConfigPayload lists fields and size', () => {
    const cfg = JSON.stringify({
      name: 'X',
      env: { A: '1' },
      usageScript: 'echo',
    })
    const info = describeConfigPayload(cfg)
    assert.ok(info)
    assert.ok(info.fields.includes('env'))
    assert.ok(info.fields.includes('usageScript'))
    assert.ok(info.sizeBytes > 10)
  })
})

describe('maskKey', () => {
  it('masks middle of key', () => {
    const m = maskKey('sk-ant-api03-abcdefghijklmnop')
    assert.ok(m.includes('****'))
    assert.ok(!m.includes('abcdefghijklmnop'))
  })
})
