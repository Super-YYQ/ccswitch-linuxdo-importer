import { parseShareText } from '../userscript/lib/core.mjs'

const b64 =
  'c2stdGVzdC1vbmx5LTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw'
const expectedKey = 'sk-test-only-000000000000000000000000'

const variants = {
  original_newlines: `配置项    值
Base URL    https://api.example.invalid
额度查询页    打开网站后输入 key 可以查询使用额度记录
模型设置    gpt-5.5，gpt-5.6-sol，claude系列均会转发到grok4.5
API Key（Base64，请自行解码）
${b64}
如果想自己稳定`,

  single_space_baseurl: `Base URL https://api.example.invalid
API Key（Base64，请自行解码）
${b64}`,

  tabs: `Base URL\thttps://api.example.invalid
API Key（Base64，请自行解码）\t${b64}`,

  all_one_line: `Base URL https://api.example.invalid 额度查询页 打开网站后输入 key 可以查询 API Key（Base64，请自行解码） ${b64}`,

  no_space_after_label: `API Key（Base64，请自行解码）${b64}
Base URL https://api.example.invalid`,

  zwsp:
    'Base URL​​  https://api.example.invalid\nAPI Key（Base64，请自行解码）\n​' + b64,

  crlf: `Base URL    https://api.example.invalid\r\nAPI Key（Base64，请自行解码）\r\n${b64}`,

  code_fence: '```\nBase URL: https://api.example.invalid\nAPI Key（Base64，请自行解码）\n' + b64 + '\n```',

  // Discourse often inserts spaces into long tokens when selecting
  spaced_b64: `Base URL https://api.example.invalid
API Key（Base64，请自行解码）
${b64.slice(0, 40)} ${b64.slice(40)}`,

  soft_hyphen: `Base URL https://api.example.invalid
API Key（Base64，请自行解码）
${b64.slice(0, 30)}­${b64.slice(30)}`,
}

let fail = 0
for (const [name, t] of Object.entries(variants)) {
  const r = parseShareText(t)
  const ok = r && r.endpoint === 'https://api.example.invalid' && r.apiKey === expectedKey
  if (!ok) fail++
  console.log(
    (ok ? 'OK ' : 'FAIL') +
      ' ' +
      name +
      ' -> ' +
      JSON.stringify(
        r
          ? {
              endpoint: r.endpoint,
              apiKey: r.apiKey,
              app: r.app,
              source: r.source,
              warnings: r.warnings,
            }
          : null,
      ),
  )
}
process.exit(fail ? 1 : 0)
