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
  describeProviderParams,
  shouldIncludeFullConfigByDefault,
  MAX_DEEPLINK_LEN,
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
  // Volcengine 方舟: base64-shared key decodes to ark-<uuid>-<suffix>.
  // Synthetic body (clearly not a real UUID) so push protection does not flag it.
  ark: 'ark-testonly-not-a-real-token-abcdefghij0123456789',
  arkEndpointAnthropic: 'https://ark.cn-beijing.volces.com/api/coding',
  arkEndpointOpenai: 'https://ark.cn-beijing.volces.com/api/coding/v3',
  // StepFun 阶跃: prefix-less random-string token, often base64-shared with a
  // "64解密" hint. Synthetic body (no vendor prefix, 32+ alnum) — never a real key.
  stepfun: 'testonlynotrealstepfuntokenabcdefghij0123456789abcd',
  stepfunEndpoint: 'https://api.stepfun.com/step_plan/v1',
  // Mistral-style prefix-less plaintext key (synthetic, for C-gap + loose-body).
  mistral: 'testonlynotrealmistraltokenabcdefghij0123456',
  mistralEndpoint: 'https://api.mistral.ai/v1',
  // Additional vendor prefixes (xAI / Groq / Perplexity / Replicate).
  xai: 'xai-testonlynotrealkey0123456789abcdef',
  xaiEndpoint: 'https://api.x.ai/v1',
  gsk: 'gsk_testonlynotrealtoken0123456789abcdef',
  pplx: 'pplx-testonlynotrealtoken0123456789',
  r8: 'r8_testonlynotrealtoken0123456',
  hf: 'hf_testonlynotrealtoken0123456789abcdef',
  fw: 'fw_testonlynotrealtoken0123456789abcdefgh',
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

  it('rejects plain chat containing the word "token" + emoji shortcode (no config)', () => {
    // Real linux.do chat: "token" as an everyday word + a long emoji shortcode
    // (:backhand_index_pointing_left:) — must NOT light the import button.
    const chat =
      '“佬，你为什么不搞个玻利维亚的 gptpro 到公益站给我爽爽，我没token 用了。”\n' +
      '@dingding1 :backhand_index_pointing_left:这是受害者站长\n\n' +
      '“佬，我没有多少 ldc，能不能送个你站的邀请码给我”'
    assert.equal(looksLikeConfig(chat), false)
  })

  it('rejects a lone long English word (no label, no key shape)', () => {
    assert.equal(
      looksLikeConfig('我们讨论一下 supercalifragilisticexpialidocious 这个词'),
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

  it('accepts g2a_ vendor keys (with or without https URL)', () => {
    const key = SYNTH.g2a
    assert.equal(looksLikeConfig(key), true)
    assert.equal(
      looksLikeConfig(`https://grok2api-v2.onrender.com\nGrok2API\n${key}`),
      true,
    )
    // Discourse onebox often pastes bare host without scheme
    assert.equal(
      looksLikeConfig(`grok2api-v2.onrender.com\nGrok2API\n总结\n${key}`),
      true,
    )
  })

  it('recognizes Volcengine Ark base64-shared key (decodes to ark-…)', () => {
    // Real linux.do share shape: key shared as base64, decodes to `ark-<uuid>-<suffix>`.
    const b64 = base64Encode(SYNTH.ark)
    assert.equal(looksLikeConfig(`API-Key Base64\n${b64}`), true)
    const r = parseShareText(
      [
        '当前仓库对于 8月1号到期',
        '',
        'Base URL',
        `兼容 Anthropic 接口协议工具：${SYNTH.arkEndpointAnthropic}`,
        '',
        `兼容 OpenAI 接口协议工具：${SYNTH.arkEndpointOpenai}`,
        '',
        'API-Key Base64',
        b64,
      ].join('\n'),
    )
    assert.ok(r, 'should parse')
    assert.equal(r.apiKey, SYNTH.ark)
    assert.equal(r.endpoint, SYNTH.arkEndpointAnthropic)
    // Anthropic-compatible path (/coding, not /coding/v3) → Claude
    assert.equal(r.app, 'claude')
    assert.equal(Object(r).candidates.length, 2)
  })

  it('bare ark- vendor token lights the import button', () => {
    assert.equal(looksLikeConfig(SYNTH.ark), true)
  })

  it('recognizes xai-/gsk_/pplx-/r8- vendor prefixes', () => {
    assert.equal(looksLikeConfig(SYNTH.xai), true)
    assert.equal(looksLikeConfig(SYNTH.gsk), true)
    assert.equal(looksLikeConfig(SYNTH.pplx), true)
    assert.equal(looksLikeConfig(SYNTH.r8), true)
    const r = parseShareText(`endpoint: ${SYNTH.xaiEndpoint}\nkey: ${SYNTH.xai}`)
    assert.equal(r.apiKey, SYNTH.xai)
    assert.equal(r.endpoint, SYNTH.xaiEndpoint)
  })

  it('recognizes hf_ (HuggingFace) and fw_ (Fireworks) prefixes', () => {
    assert.equal(looksLikeConfig(SYNTH.hf), true)
    assert.equal(looksLikeConfig(SYNTH.fw), true)
    const r = parseShareText(`endpoint: https://api.fireworks.ai/inference/v1\nkey: ${SYNTH.fw}`)
    assert.equal(r.apiKey, SYNTH.fw)
  })
})

describe('prefix-less keys & label-line-with-descriptor', () => {
  it('StepFun: base64 blob + 64解密 hint + endpoint (no prefix, no label)', () => {
    const b64 = base64Encode(SYNTH.stepfun)
    const text = `阶跃星辰的token Plan只用了2%，截止今晚11点，大家用力蹬。64解密\n\n${b64}\n\n${SYNTH.stepfunEndpoint}`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r, 'should parse')
    assert.equal(r.apiKey, SYNTH.stepfun)
    assert.equal(r.endpoint, SYNTH.stepfunEndpoint)
    // Weak shape (no vendor prefix) -> lowered confidence, warning present
    assert.ok(r.confidence < 0.9, 'prefix-less key should not read as fully confident')
  })

  it('Mistral: API-Key Base64 label-line + newline token (prefix-less, C-gap)', () => {
    const b64 = base64Encode(SYNTH.mistral)
    const text = `endpoint：${SYNTH.mistralEndpoint}\nAPI-Key Base64\n${b64}`
    const r = parseShareText(text)
    assert.ok(r, 'should parse')
    assert.equal(r.apiKey, SYNTH.mistral)
    assert.equal(r.endpoint, SYNTH.mistralEndpoint)
  })

  it('does NOT harvest prefix-less base64 without a decode hint', () => {
    // endpoint URL + a random base64-ish blob, but no "base64/解密" hint:
    // must not be mistaken for an API key.
    const r = parseShareText(
      `图片缓存地址 https://img.example.invalid/x\nhash: QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU`,
    )
    assert.equal(r && r.apiKey, null)
  })

  it('does NOT light button for prefix-less base64 without endpoint context', () => {
    assert.equal(
      looksLikeConfig(`讨论一下 ${'A'.repeat(60)} 这段内容`),
      false,
    )
  })
})

describe('mergeParseResults · base64 fragment + base_url', () => {
  it('stitches base64 OPENAI_API_KEY fragment with curly-quoted base_url (no wipe in finalize)', () => {
    // Real linux.do shape: a base64 blob that decodes only to a JSON-ish key field
    // (not a full config object), plus a separate base_url = “…” line with curly quotes.
    // Each half-parser succeeds alone; merge must keep BOTH after finalizeResult.
    const key = SYNTH.skPlain
    const b64 = base64Encode(` "OPENAI_API_KEY": "${key}"`)
    const text = `${b64}\n\nbase_url = “https://ricktoken.example.net”`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r, 'should parse')
    assert.equal(r.apiKey, key)
    assert.equal(r.endpoint, 'https://ricktoken.example.net')
    // candidates must stay in sync — otherwise finalizeResult re-applies a key-only
    // pair and wipes the stitched endpoint
    assert.ok(r.candidates?.length >= 1)
    assert.equal(r.candidates[r.candidateIndex || 0].endpoint, 'https://ricktoken.example.net')
    assert.equal(r.candidates[r.candidateIndex || 0].apiKey, key)
  })

  it('decodes key field value out of base64 JSON fragment behind a key label', () => {
    // The blob decodes to ` "OPENAI_API_KEY": "sk-..."` — a JSON *fragment*, not a
    // bare key. Whether bare or behind a `key：` label, the sk- value must be pulled
    // out, not returned as the raw `"OPENAI_API_KEY": "..."` wrapper string.
    const key = SYNTH.skPlain
    const b64 = base64Encode(` "OPENAI_API_KEY": "${key}"`)
    const variants = [
      `key ：${b64}\n\nbase_url = “https://ricktoken.example.net”`, // fullwidth label+space (reported)
      `key：${b64}\nbase_url = “https://ricktoken.example.net”`, // glued fullwidth
      `key: ${b64}\nbase_url = "https://ricktoken.example.net"`, // ascii
      `KEY ：${b64}\nbase_url = “https://ricktoken.example.net”`, // uppercase
      `api_key ：${b64}\nbase_url = “https://ricktoken.example.net”`, // api_key label
      `key（base64）：${b64}\nbase_url = “https://ricktoken.example.net”`, // CJK note label
      `这是配置\nkey ：${b64}\n\nbase_url = “https://ricktoken.example.net”\n谢谢`, // prose around
    ]
    for (const text of variants) {
      const r = parseShareText(text)
      assert.ok(r, `should parse: ${text.slice(0, 40)}…`)
      assert.equal(r.apiKey, key, `key must be decoded sk- for: ${text.slice(0, 30)}…`)
      assert.equal(r.endpoint, 'https://ricktoken.example.net', `endpoint for: ${text.slice(0, 30)}…`)
    }
  })

  it('decodes various env field names out of a base64 fragment', () => {
    // The same fragment shape with different field names must all yield the key.
    const key = SYNTH.skPlain
    for (const field of ['OPENAI_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'api_key', 'key', 'token']) {
      const b64 = base64Encode(` "${field}": "${key}"`)
      const r = parseShareText(`key ：${b64}\nbase_url = "https://ricktoken.example.net"`)
      assert.ok(r, `field ${field} should parse`)
      assert.equal(r.apiKey, key, `field ${field}`)
    }
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

  it('handles nested/quoted braces, many objects, and an earlier unclosed string', () => {
    const provider = JSON.stringify({
      name: 'Scanner fixture',
      env: {
        ANTHROPIC_BASE_URL: SYNTH.endpoint,
        ANTHROPIC_AUTH_TOKEN: SYNTH.skAnt,
      },
      notes: 'literal { brace } and an escaped "quote"',
    })
    const text = `{"broken":"unterminated\n${'{}\n'.repeat(15)}${provider}`
    const r = parseShareText(text)

    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpoint)
    assert.equal(r.apiKey, SYNTH.skAnt)
    assert.equal(r.name, 'Scanner fixture')
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

  it('skips non-provider deeplink and continues with ordinary endpoint/key text', () => {
    const mcp = `ccswitch://v1/import?resource=mcp&app=claude&name=X&endpoint=${encodeURIComponent(SYNTH.endpoint)}&apiKey=${SYNTH.skAnt}`
    const text = `${mcp}
下面还有：
url：${SYNTH.endpointRelay}
key：${SYNTH.skAntMixed}`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.notEqual(r.source, 'deeplink')
    assert.equal(r.endpoint, SYNTH.endpointRelay)
    assert.equal(r.apiKey, SYNTH.skAntMixed)
  })

  it('picks the first provider deeplink when multiple links are present', () => {
    const mcp = `ccswitch://v1/import?resource=mcp&app=claude&name=X&endpoint=${encodeURIComponent(SYNTH.endpointA)}&apiKey=${SYNTH.skAntA}`
    const provider = `ccswitch://v1/import?resource=provider&app=codex&name=Second&endpoint=${encodeURIComponent(SYNTH.endpointB)}&apiKey=${SYNTH.skAntB}`
    const r = parseShareText(`先是 mcp：${mcp}\n再是 provider：${provider}`)
    assert.ok(r)
    assert.equal(r.source, 'deeplink')
    assert.equal(r.app, 'codex')
    assert.equal(r.endpoint, SYNTH.endpointB)
    assert.equal(r.apiKey, SYNTH.skAntB)
    assert.equal(r.name, 'Second')
  })

  it('parses ccswitch: without authority slashes', () => {
    const link = `ccswitch:v1/import?resource=provider&app=claude&name=NoSlash&endpoint=${encodeURIComponent(SYNTH.endpoint)}&apiKey=${SYNTH.skAntDeeplink}`
    assert.equal(looksLikeConfig(`导入：${link}`), true)
    const r = parseShareText(`导入：${link}`)
    assert.ok(r)
    assert.equal(r.source, 'deeplink')
    assert.equal(r.endpoint, SYNTH.endpoint)
    assert.equal(r.apiKey, SYNTH.skAntDeeplink)
    assert.equal(r.name, 'NoSlash')
  })

  it('round-trips recognized safe provider parameters', () => {
    const params = new URLSearchParams({
      resource: 'provider',
      app: 'claude',
      name: 'Safe metadata',
      endpoint: SYNTH.endpoint,
      apiKey: SYNTH.skAntDeeplink,
      homepage: 'https://provider.example.invalid',
      notes: 'synthetic relay',
      icon: 'https://provider.example.invalid/icon.png',
      enabled: 'false',
      model: 'claude-sonnet-4-5-20250929',
      haikuModel: 'claude-haiku-4-5-20251001',
      sonnetModel: 'claude-sonnet-4-5-20250929',
      opusModel: 'claude-opus-4-1-20250805',
    })
    const r = parseShareText(`ccswitch://v1/import?${params}`)
    assert.ok(r)
    const rebuilt = new URL(buildDeeplink(r))

    for (const name of [
      'homepage',
      'notes',
      'icon',
      'enabled',
      'model',
      'haikuModel',
      'sonnetModel',
      'opusModel',
    ]) {
      assert.equal(rebuilt.searchParams.get(name), params.get(name), name)
    }
  })

  it('discloses risky and unknown provider parameters and requires opt-in', () => {
    const params = new URLSearchParams({
      resource: 'provider',
      app: 'codex',
      name: 'Risky metadata',
      endpoint: SYNTH.endpoint,
      apiKey: SYNTH.skPlain,
      notes: 'safe note',
      configUrl: 'https://remote.example.invalid/provider.json',
      usageScript: 'node usage.js',
      futureToggle: 'on',
    })
    const r = parseShareText(`ccswitch://v1/import?${params}`)
    assert.ok(r)
    const info = describeProviderParams(r.providerParams)
    assert.equal(info.risky, true)
    assert.deepEqual(info.riskyFields.sort(), ['configUrl', 'usageScript'])
    assert.deepEqual(info.unknownFields, ['futureToggle'])

    const safeOnly = new URL(buildDeeplink(r))
    assert.equal(safeOnly.searchParams.get('notes'), 'safe note')
    assert.equal(safeOnly.searchParams.has('configUrl'), false)
    assert.equal(safeOnly.searchParams.has('usageScript'), false)
    assert.equal(safeOnly.searchParams.has('futureToggle'), false)

    const optedIn = new URL(
      buildDeeplink(r, undefined, undefined, { includeRiskyParams: true }),
    )
    assert.equal(optedIn.searchParams.get('configUrl'), params.get('configUrl'))
    assert.equal(optedIn.searchParams.get('usageScript'), params.get('usageScript'))
    assert.equal(optedIn.searchParams.get('futureToggle'), params.get('futureToggle'))
  })

  it('distinguishes unsupported provider apps and prevents cross-app rewrites', () => {
    for (const app of ['gemini', 'opencode', 'openclaw']) {
      const params = new URLSearchParams({
        resource: 'provider',
        app,
        name: `Unsupported ${app}`,
        endpoint: SYNTH.endpoint,
        apiKey: SYNTH.skPlain,
      })
      const r = parseShareText(`ccswitch://v1/import?${params}`)
      assert.ok(r)
      assert.equal(r.app, null)
      assert.equal(r.unsupportedApp, app)
      assert.throws(() => buildDeeplink(r, 'claude'), /不支持|unsupported/i)
      assert.throws(() => buildDeeplink(r, 'codex'), /不支持|unsupported/i)
    }

    const missingApp = parseShareText(
      `ccswitch://v1/import?resource=provider&name=Ambiguous&endpoint=${encodeURIComponent(SYNTH.endpoint)}&apiKey=${SYNTH.skPlain}`,
    )
    assert.ok(missingApp)
    assert.equal(missingApp.app, null)
    assert.equal(missingApp.unsupportedApp, null)
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

  it('strips CJK watermark mid plain sk- key (linux.do anti-scrape, not base64)', () => {
    // Real-world pattern: sk-…删掉我… continues as hex body; must not truncate at CJK.
    const clean = 'sk-testonlyaaaaaaaabbbbbbbbccccccccddddddddeeeeeeee'
    const withWatermark =
      'sk-testonlyaaaaaaaabbbbbbbb' + '删掉我' + 'ccccccccddddddddeeeeeeee'
    const text = `openfly.cc
Sub2API - AI API Gateway
${withWatermark}

想测一下高并发是否稳定`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, clean)
    assert.equal(r.endpoint, 'https://openfly.cc')
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

  it('samples both ends of oversized selections and reports the omitted middle', () => {
    const text =
      '无关讨论内容'.repeat(20_000) + `\nurl：${SYNTH.endpoint}\nkey：${SYNTH.skAnt}\n`

    assert.ok(text.length > 64 * 1024)
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)

    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpoint)
    assert.equal(r.apiKey, SYNTH.skAnt)
    assert.ok(r.warnings.some((w) => /开头和结尾|中间内容已省略/.test(w)))
  })

  it('keeps an oversized omitted-middle selection actionable', () => {
    const padding = '普通讨论内容'.repeat(7_000)
    const text =
      padding + `\nurl：${SYNTH.endpoint}\nkey：${SYNTH.skAnt}\n` + padding

    assert.ok(text.length > 64 * 1024)
    assert.equal(looksLikeConfig(text), true)
    assert.equal(parseShareText(text), null)
  })

  it('bounds malformed JSON scanning at the maximum selection size', () => {
    const text = '{'.repeat(64 * 1024)
    const started = Date.now()
    const r = parseShareText(text)
    const elapsed = Date.now() - started

    assert.equal(r, null)
    assert.ok(elapsed < 1000, `malformed parse exceeded the 1s budget: ${elapsed}ms`)
  })

  it('parses Discourse onebox bare host + g2a_ key (no https scheme in selection)', () => {
    // linux.do onebox shows host text without scheme; key sits under 总结
    const text = `c
grok2api-v2.onrender.com
Grok2API
总结
${SYNTH.g2a}`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, SYNTH.g2a)
    assert.equal(r.endpoint, 'https://grok2api-v2.onrender.com')
  })

  it('parses https URL + g2a_ key without labels', () => {
    const text = `https://grok2api-v2.onrender.com
Grok2API
${SYNTH.g2a}`
    assert.equal(looksLikeConfig(text), true)
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://grok2api-v2.onrender.com')
    assert.equal(r.apiKey, SYNTH.g2a)
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
  it('uses structured CLAUDE env signals before removing model-like text', () => {
    const r = parseShareText(
      `CLAUDE_BASE_URL=${SYNTH.endpoint}\nCLAUDE_API_KEY=${SYNTH.skPlain}`,
    )
    assert.ok(r)
    assert.equal(r.app, 'claude')

    const mixed = classifyApp(
      `CLAUDE_BASE_URL=${SYNTH.endpoint}\nOPENAI_BASE_URL=${SYNTH.endpoint}`,
      {},
    )
    assert.equal(mixed, null)
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

  it('rejects bare non-provider deeplinks so the floating button stays hidden', () => {
    for (const resource of ['mcp', 'prompt', 'skill']) {
      const link = `ccswitch://v1/import?resource=${resource}&app=claude&name=X&endpoint=${encodeURIComponent(SYNTH.endpoint)}&apiKey=${SYNTH.skAnt}`
      assert.equal(looksLikeConfig(`导入：${link}`), false, `resource=${resource}`)
    }
  })

  it('accepts non-provider deeplink when ordinary config text follows', () => {
    const mcp = `ccswitch://v1/import?resource=mcp&app=claude&name=X&endpoint=${encodeURIComponent(SYNTH.endpoint)}&apiKey=${SYNTH.skAnt}`
    const text = `${mcp}
url：${SYNTH.endpointRelay}
key：${SYNTH.skAntMixed}`
    assert.equal(looksLikeConfig(text), true)
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

  it('describeConfigPayload lists fields, env keys, risk and utf8 size', () => {
    const cfg = JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: SYNTH.endpoint,
        ANTHROPIC_AUTH_TOKEN: SYNTH.skAnt,
        ANTHROPIC_MODEL: 'claude-sonnet-4',
      },
      usageScript: 'echo',
    })
    const info = describeConfigPayload(cfg)
    assert.ok(info)
    assert.ok(info.fields.includes('env'))
    assert.ok(info.fields.includes('usageScript'))
    assert.ok(info.envFields.includes('ANTHROPIC_BASE_URL'))
    assert.ok(info.envFields.includes('ANTHROPIC_AUTH_TOKEN'))
    assert.equal(info.risky, true)
    assert.ok(info.riskReasons.some((w) => /usageScript|高风险/.test(w)))
    assert.ok(info.sizeBytes > 10)
    assert.equal(shouldIncludeFullConfigByDefault(cfg), false)
    const plainEnv = JSON.stringify({
      env: { ANTHROPIC_BASE_URL: SYNTH.endpoint, ANTHROPIC_AUTH_TOKEN: SYNTH.skAnt },
    })
    assert.equal(shouldIncludeFullConfigByDefault(plainEnv), true)
    // Chinese content: TextEncoder byte length > string length
    const cjk = JSON.stringify({ env: { NOTE: '中文配置说明一二三四' } })
    const cjkInfo = describeConfigPayload(cjk)
    assert.ok(cjkInfo.sizeBytes > cjk.length)
  })

  it('defaults process-affecting and unknown environment variables to excluded', () => {
    const cfg = JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: SYNTH.endpoint,
        ANTHROPIC_AUTH_TOKEN: SYNTH.skAnt,
        NODE_OPTIONS: '--require ./bootstrap.js',
        BASH_ENV: '/tmp/profile',
        RELAY_EXPERIMENT: 'enabled',
      },
    })

    const info = describeConfigPayload(cfg)
    assert.ok(info)
    assert.equal(info.risky, true)
    assert.ok(info.riskReasons.some((reason) => /NODE_OPTIONS|BASH_ENV/.test(reason)))
    assert.ok(info.riskReasons.some((reason) => /RELAY_EXPERIMENT|未知环境变量/.test(reason)))
    assert.equal(shouldIncludeFullConfigByDefault(cfg), false)
    const defaultLink = new URL(
      buildDeeplink({
        name: 'Risky default',
        app: 'claude',
        endpoint: SYNTH.endpoint,
        apiKey: SYNTH.skAnt,
        config: cfg,
        configFormat: 'json',
      }),
    )
    assert.equal(defaultLink.searchParams.has('config'), false)
  })

  it('recursively detects risky fields and enforces inspection budgets', () => {
    const nestedRisk = JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: SYNTH.endpoint,
        ANTHROPIC_AUTH_TOKEN: SYNTH.skAnt,
      },
      settings: { models: [{ command: 'launch-helper' }] },
    })
    const nestedInfo = describeConfigPayload(nestedRisk)
    assert.ok(nestedInfo.riskReasons.some((reason) => /command/.test(reason)))

    let deep = { model: 'claude-sonnet-4' }
    for (let i = 0; i < 16; i++) deep = { settings: deep }
    const deepInfo = describeConfigPayload(JSON.stringify(deep))
    assert.ok(deepInfo.riskReasons.some((reason) => /安全深度/.test(reason)))

    const wide = { env: { ANTHROPIC_BASE_URL: SYNTH.endpoint } }
    for (let i = 0; i < 300; i++) wide.env[`EXTRA_${i}`] = String(i)
    const wideInfo = describeConfigPayload(JSON.stringify(wide))
    assert.ok(wideInfo.riskReasons.some((reason) => /安全上限/.test(reason)))
  })

  it('validates endpoint URLs and warns for non-loopback HTTP', () => {
    const makeResult = (endpoint) => ({
      name: 'Endpoint policy',
      app: 'claude',
      endpoint,
      apiKey: SYNTH.skAnt,
    })

    assert.doesNotThrow(() => buildDeeplink(makeResult('https://relay.example.invalid/v1')))
    assert.doesNotThrow(() => buildDeeplink(makeResult('http://127.0.0.1:8080/v1')))

    const insecure = parseShareText(
      `ccswitch://v1/import?resource=provider&app=claude&name=HTTP&endpoint=${encodeURIComponent('http://relay.example.invalid/v1')}&apiKey=${SYNTH.skAnt}`,
    )
    assert.ok(insecure)
    assert.ok(insecure.warnings.some((warning) => /未加密|非本机.*HTTP/.test(warning)))

    for (const endpoint of [
      'https://user:pass@relay.example.invalid/v1',
      'ftp://relay.example.invalid/v1',
      'not a url',
    ]) {
      assert.throws(() => buildDeeplink(makeResult(endpoint)), /endpoint|URL|凭据|协议/i)
    }
  })

  it('enforces the final deep-link limit for every parameter source', () => {
    const base = {
      name: 'Length policy',
      app: 'claude',
      endpoint: SYNTH.endpoint,
      apiKey: SYNTH.skAnt,
    }
    const cases = [
      { ...base, name: 'N'.repeat(MAX_DEEPLINK_LEN) },
      {
        ...base,
        endpoint: `https://relay.example.invalid/${'e'.repeat(MAX_DEEPLINK_LEN)}`,
      },
      { ...base, apiKey: `sk-${'k'.repeat(MAX_DEEPLINK_LEN)}` },
      {
        ...base,
        providerParams: { notes: 'm'.repeat(MAX_DEEPLINK_LEN) },
      },
      {
        ...base,
        config: JSON.stringify({ env: { ANTHROPIC_MODEL: 'c'.repeat(MAX_DEEPLINK_LEN) } }),
        configFormat: 'json',
      },
      {
        ...base,
        name: 'n'.repeat(2700),
        apiKey: `sk-${'k'.repeat(2700)}`,
        providerParams: { notes: 'm'.repeat(2700) },
      },
    ]

    for (const input of cases) {
      assert.throws(() => buildDeeplink(input), /8.?000|过长|长度/)
    }
    assert.ok(buildDeeplink(base).length < MAX_DEEPLINK_LEN)
  })

  it('MAX_DEEPLINK_LEN is a finite conservative cap', () => {
    assert.equal(typeof MAX_DEEPLINK_LEN, 'number')
    assert.ok(MAX_DEEPLINK_LEN >= 2000 && MAX_DEEPLINK_LEN <= 32000)
  })
})

describe('maskKey', () => {
  it('masks middle of key', () => {
    const m = maskKey('sk-ant-api03-abcdefghijklmnop')
    assert.ok(m.includes('****'))
    assert.ok(!m.includes('abcdefghijklmnop'))
  })
})

describe('labeled key hygiene', () => {
  it('rejects Chinese placeholder text after key labels', () => {
    for (const text of [
      `API Key：请联系群主获取完整密钥后填写\nBase URL ${SYNTH.endpoint}`,
      `密钥：请自行填写\n地址：${SYNTH.endpoint}`,
      `key: your-key-here-please\nurl: ${SYNTH.endpoint}`,
    ]) {
      const r = parseShareText(text)
      assert.ok(r, `expected parse for endpoint in: ${text.slice(0, 30)}`)
      assert.equal(r.endpoint, SYNTH.endpoint)
      assert.equal(r.apiKey, null, `should not treat prose as key: ${r.apiKey}`)
    }
  })

  it('rejects URL values labeled as key', () => {
    const text = `key：https://evil.example.invalid/steal\nurl：${SYNTH.endpoint}`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, SYNTH.endpoint)
    assert.ok(
      r.apiKey == null || r.apiKey === SYNTH.endpoint || !/^https?:\/\//i.test(r.apiKey),
      `apiKey must not be a URL: ${r.apiKey}`,
    )
    // Prefer no key at all over stealing the url as key
    assert.notEqual(r.apiKey, 'https://evil.example.invalid/steal')
  })
})

describe('bare host email peel', () => {
  it('does not treat email domains as bare API hosts', () => {
    const text = `admin@mail.example.com\n${SYNTH.g2a}`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.apiKey, SYNTH.g2a)
    assert.notEqual(r.endpoint, 'https://example.com')
    assert.notEqual(r.endpoint, 'https://mail.example.com')
  })

  it('still accepts genuine bare onebox hosts with keys', () => {
    const text = `grok2api-v2.onrender.com\n${SYNTH.g2a}`
    const r = parseShareText(text)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://grok2api-v2.onrender.com')
    assert.equal(r.apiKey, SYNTH.g2a)
  })
})

describe('deeplink finalize', () => {
  it('strips trailing punctuation from deeplink endpoints via finalizeResult', () => {
    const link = `ccswitch://v1/import?resource=provider&app=claude&name=X&endpoint=${encodeURIComponent(
      'https://api.example.com/v1.',
    )}&apiKey=${SYNTH.skAntDeeplink}`
    const r = parseShareText(link)
    assert.ok(r)
    assert.equal(r.source, 'deeplink')
    assert.equal(r.endpoint, 'https://api.example.com/v1')
    assert.equal(r.apiKey, SYNTH.skAntDeeplink)
  })

  it('strips trailing quotes from deeplink endpoints', () => {
    const link = `ccswitch://v1/import?resource=provider&app=claude&name=X&endpoint=${encodeURIComponent(
      'https://api.example.com/v1"',
    )}&apiKey=${SYNTH.skAntDeeplink}`
    const r = parseShareText(link)
    assert.ok(r)
    assert.equal(r.endpoint, 'https://api.example.com/v1')
  })
})
