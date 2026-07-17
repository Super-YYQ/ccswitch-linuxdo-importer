# CC Switch Importer for linux.do — Design Spec

**Date:** 2026-07-18  
**Status:** Approved (user: proceed with recommended options, no further gates)

## Problem

On [linux.do](https://linux.do), users often share API provider configs for Claude Code / Codex (env vars, JSON, Base64, `ccswitch://` deep links, or mixed text with Chinese noise). Manually copying fields into [CC Switch](https://github.com/farion1231/cc-switch) is tedious. We need a lightweight Tampermonkey userscript that, after the user selects text and clicks a button, parses the share payload and opens a `ccswitch://` import deep link.

## Goals

1. On `linux.do` only, show an “导入 ccSwitch” button after a meaningful text selection.
2. Parse common share formats even when wrapped in Chinese commentary.
3. Auto-classify target app as Claude Code vs Codex; if unclear, require a manual choice.
4. Generate and open `ccswitch://v1/import?resource=provider&...`.
5. On protocol failure, copy the deep link to clipboard and toast guidance.
6. All parsing is local; no network upload of secrets.

## Non-Goals (YAGNI)

- Chrome extension (later optional)
- Clipboard auto-listen
- Local HTTP helper process
- Multi-candidate full picker UI (only hint “N more candidates”)
- Modifying CC Switch itself

## Decisions

| Item | Choice |
|------|--------|
| Form factor | Tampermonkey single-file userscript |
| Site | `https://linux.do/*`, `https://www.linux.do/*` |
| Trigger | Selection → floating button → confirm card |
| Import | `ccswitch://` deep link |
| Target tab | Auto-detect; manual if unknown |
| Formats | Deep link, Base64, JSON, env/TOML-like, mixed noise |
| UI | Compact floating button + center confirm card |
| Architecture | Single `.user.js` with internal modules |

## Architecture

```
selectionchange / mouseup
        → detect (length + quick heuristic)
        → floating button near selection
click → parser pipeline
        → classify app
        → confirm UI (preview, switch app)
confirm → build deeplink → open
        → fallback: GM_setClipboard + toast
```

### Unified result shape

```ts
type ParseResult = {
  name: string
  app: 'claude' | 'codex' | null
  endpoint: string | null
  apiKey: string | null
  config: string | null       // full config body when present
  configFormat: 'json' | 'toml' | null
  source: 'deeplink' | 'base64' | 'json' | 'env' | 'toml' | 'mixed'
  confidence: number          // 0..1
  candidateCount: number
  warnings: string[]
}
```

## Parser pipeline (priority)

1. **Deep link** — extract `ccswitch://v1/import?...` substring; pass through or re-normalize.
2. **Base64 block** — long base64-ish token → decode UTF-8 → re-enter as JSON/TOML/env.
3. **JSON object** — brace-balanced extract of `{...}` from noise; read `name`, `baseUrl`/`endpoint`/`base_url`, `apiKey`/`api_key`/`key`/`token`.
4. **TOML / key=value config** — `base_url = "..."`, `api_key = "..."`.
5. **Env vars** — `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `CODEX_*`, etc.
6. **Mixed extraction** — regex for `https?://...` URLs and keys (`sk-ant-...`, `sk-...`, long tokens); ignore CJK prose. Prefer best URL+key pair by confidence.

### Anti-noise

- Never require the entire selection to be pure config.
- Strip markdown fences optionally.
- Minimum selection length (~20 chars) before showing the button.
- If no URL and no key: do not treat as success.

### App classification

| Signals | App |
|---------|-----|
| `sk-ant-`, `ANTHROPIC_*`, anthropic host/path | `claude` |
| `OPENAI_*`, `CODEX_*`, openai-style hosts, codex config fragments | `codex` |
| Both / neither | `null` → user must pick |

## Deep link format

Per CC Switch docs:

```
ccswitch://v1/import?resource=provider&app={claude|codex}&name={enc}
  &endpoint={enc}&apiKey={enc}
```

Optional full config:

```
&config={base64url or standard base64}&configFormat=json
```

- Default name: `linuxdo-YYYYMMDD-HHmm` or JSON `name`.
- Do not `console.log` raw apiKey.

## UI

1. Floating pill near selection: **导入 ccSwitch**.
2. Confirm card: source, confidence, masked key, endpoint, Claude/Codex toggle, Cancel / 打开导入, 复制深链.
3. Toast on success/failure.
4. Shadow DOM or high-prefix classes to avoid Discourse theme clashes.
5. Esc / backdrop closes card.

## Errors

| Case | Behavior |
|------|----------|
| Too short / no config | Hide button or “未识别到 API 配置” |
| URL only / key only | Allow import with warning |
| Base64 fail | Skip candidate |
| Multi pairs | Best pair; note extra count |
| Unknown app | Block open until user picks |
| Protocol no-op | Clipboard + toast |
| Non-https endpoint | Allowed (local proxies) |

## Repo layout

```
ccswitch-linuxdo-importer/
├── README.md
├── LICENSE
├── .gitignore
├── package.json              # node test runner only
├── docs/superpowers/specs/...
├── docs/superpowers/plans/...
├── userscript/ccswitch-linuxdo-importer.user.js
└── tests/parser.test.mjs
```

## Acceptance

1. Mixed Chinese + `ANTHROPIC_BASE_URL` + `sk-...` → button → correct fields → claude → deeplink.
2. Base64 JSON config → decoded fields.
3. Existing `ccswitch://` → open/normalize.
4. Plain Chinese post → no false positive success.
5. Missing CC Switch → deeplink copied + toast.
6. Ambiguous app → must choose before open.

## Security

- User-initiated only (select + click).
- Local parse only.
- Masked key in UI (`sk-ant-****xxxx`).
