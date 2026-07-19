/**
 * UI + integration entry for the Tampermonkey userscript.
 * Built with esbuild (IIFE) via scripts/build.mjs.
 */
import {
  parseShareText,
  looksLikeConfig,
  buildDeeplink,
  maskKey,
  selectCandidate,
  enrichTextWithAnchorHrefs,
  describeConfigPayload,
  shouldIncludeFullConfigByDefault,
  MAX_DEEPLINK_LEN,
} from './lib/core.mjs'
import { extractModels, filterModelsForApp } from './lib/model-extractor.mjs'

/* global GM_setClipboard, GM_notification, __SCRIPT_VERSION__ */
// Replaced at build time by scripts/build.mjs (esbuild define).
const SCRIPT_VERSION = __SCRIPT_VERSION__

const ROOT_ID = 'ccs-ld-root'
const Z = 2147483000

let lastSelectionText = ''
let hideTimer = null
let selectedApp = null
let currentResult = null
let currentModelInfo = null
let currentDeeplink = null
/** @type {string|null} */
let selectedModel = null
/** When result has full config, default on; user can uncheck to export endpoint/key only. */
let includeFullConfig = true

function ensureRoot() {
  let host = document.getElementById(ROOT_ID)
  if (host) return host.shadowRoot
  host = document.createElement('div')
  host.id = ROOT_ID
  host.style.all = 'initial'
  host.style.position = 'fixed'
  host.style.zIndex = String(Z)
  host.style.top = '0'
  host.style.left = '0'
  host.style.width = '0'
  host.style.height = '0'
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = CSS_TEXT
  shadow.appendChild(style)
  return shadow
}

const CSS_TEXT = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .ccs-btn {
    position: fixed;
    z-index: ${Z};
    padding: 8px 14px;
    border: none;
    border-radius: 999px;
    background: #228be6;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,.28);
    display: none;
    white-space: nowrap;
  }
  .ccs-btn:hover { background: #1c7ed6; }
  .ccs-btn.show { display: inline-flex; align-items: center; gap: 6px; }
  .ccs-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    z-index: ${Z + 1}; display: none; align-items: center; justify-content: center;
    padding: 16px;
  }
  .ccs-overlay.show { display: flex; }
  .ccs-card {
    width: min(380px, 100%);
    background: #2c2e33;
    color: #e9ecef;
    border-radius: 12px;
    border: 1px solid #373a40;
    box-shadow: 0 12px 40px rgba(0,0,0,.45);
    padding: 16px;
  }
  .ccs-card h2 { margin: 0 0 6px; font-size: 15px; font-weight: 650; color: #fff; }
  .ccs-meta { font-size: 12px; color: #adb5bd; margin-bottom: 12px; line-height: 1.5; }
  .ccs-fields {
    background: #1a1b1e; border-radius: 8px; padding: 10px 12px;
    font-size: 12px; line-height: 1.65; margin-bottom: 12px;
    word-break: break-all;
  }
  .ccs-fields .k { color: #868e96; margin-right: 6px; }
  .ccs-warn {
    font-size: 11px; color: #fcc419; margin: -4px 0 12px; line-height: 1.45;
  }
  .ccs-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
    font-size: 12px;
  }
  .ccs-row label { color: #adb5bd; white-space: nowrap; }
  .ccs-row select {
    flex: 1; min-width: 0;
    background: #1a1b1e; color: #e9ecef; border: 1px solid #495057;
    border-radius: 6px; padding: 6px 8px; font-size: 12px;
  }
  .ccs-cand {
    display: none; align-items: center; gap: 8px; margin-bottom: 10px;
    font-size: 12px; color: #ced4da;
  }
  .ccs-cand.show { display: flex; }
  .ccs-cand button {
    border: 1px solid #495057; background: #373a40; color: #fff;
    border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer;
  }
  .ccs-cand button:disabled { opacity: .4; cursor: not-allowed; }
  .ccs-cand .ccs-cand-label { flex: 1; text-align: center; color: #adb5bd; }
  .ccs-apps { display: flex; gap: 8px; margin-bottom: 12px; }
  .ccs-apps button {
    flex: 1; border: 1px solid #495057; background: #373a40; color: #ced4da;
    border-radius: 8px; padding: 8px; font-size: 12px; cursor: pointer;
  }
  .ccs-apps button.active {
    background: #228be6; border-color: #228be6; color: #fff; font-weight: 600;
  }
  .ccs-apps button:disabled { opacity: .5; cursor: not-allowed; }
  .ccs-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .ccs-actions button {
    flex: 1; min-width: 90px; border-radius: 8px; padding: 9px 10px;
    font-size: 12px; cursor: pointer; border: 1px solid transparent;
  }
  .ccs-btn-cancel { background: transparent; border-color: #495057 !important; color: #adb5bd; }
  .ccs-btn-copy { background: #495057; color: #fff; }
  .ccs-btn-open { background: #40c057; color: #fff; font-weight: 600; }
  .ccs-btn-open:disabled { opacity: .45; cursor: not-allowed; }
  .ccs-toast {
    position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
    background: #212529; color: #fff; padding: 10px 16px; border-radius: 8px;
    font-size: 12px; z-index: ${Z + 2}; opacity: 0; pointer-events: none;
    transition: opacity .2s ease; max-width: min(420px, 92vw); text-align: center;
    box-shadow: 0 6px 20px rgba(0,0,0,.35);
  }
  .ccs-toast.show { opacity: 1; }
  .ccs-err {
    color: #ff6b6b; font-size: 13px; padding: 8px 0 12px; line-height: 1.5;
  }
  .ccs-config-opt {
    display: none; align-items: flex-start; gap: 8px; margin: -2px 0 12px;
    font-size: 12px; color: #ced4da; line-height: 1.45;
  }
  .ccs-config-opt.show { display: flex; }
  .ccs-config-opt input { margin-top: 2px; }
  .ccs-config-opt .ccs-config-meta { color: #868e96; font-size: 11px; margin-top: 2px; }
`

function getUi() {
  const shadow = ensureRoot()
  let btn = shadow.getElementById('btn')
  let overlay = shadow.getElementById('overlay')
  let toast = shadow.getElementById('toast')
  if (!btn) {
    btn = document.createElement('button')
    btn.id = 'btn'
    btn.className = 'ccs-btn'
    btn.type = 'button'
    btn.textContent = '导入 ccSwitch'
    btn.addEventListener('mousedown', (e) => e.preventDefault())
    btn.addEventListener('click', onImportClick)
    shadow.appendChild(btn)

    overlay = document.createElement('div')
    overlay.id = 'overlay'
    overlay.className = 'ccs-overlay'
    overlay.innerHTML = `
      <div class="ccs-card" role="dialog" aria-modal="true">
        <h2>导入到 CC Switch</h2>
        <div class="ccs-meta" id="meta"></div>
        <div class="ccs-err" id="err" style="display:none"></div>
        <div class="ccs-fields" id="fields"></div>
        <div class="ccs-cand" id="cand">
          <button type="button" id="cand-prev" aria-label="上一组候选">‹</button>
          <span class="ccs-cand-label" id="cand-label">候选 1/1</span>
          <button type="button" id="cand-next" aria-label="下一组候选">›</button>
        </div>
        <div class="ccs-row" id="model-row" style="display:none">
          <label for="model-select">model</label>
          <select id="model-select"></select>
        </div>
        <label class="ccs-config-opt" id="config-opt">
          <input type="checkbox" id="include-config" checked />
          <span>
            <span>携带完整配置</span>
            <div class="ccs-config-meta" id="config-meta"></div>
          </span>
        </label>
        <div class="ccs-warn" id="warn"></div>
        <div class="ccs-apps">
          <button type="button" data-app="claude" id="app-claude">Claude Code</button>
          <button type="button" data-app="codex" id="app-codex">Codex</button>
        </div>
        <div class="ccs-actions">
          <button type="button" class="ccs-btn-cancel" id="cancel">取消</button>
          <button type="button" class="ccs-btn-copy" id="copy">复制深链</button>
          <button type="button" class="ccs-btn-open" id="open">打开导入</button>
        </div>
      </div>
    `
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeCard()
    })
    shadow.appendChild(overlay)

    toast = document.createElement('div')
    toast.id = 'toast'
    toast.className = 'ccs-toast'
    shadow.appendChild(toast)

    shadow.getElementById('cancel').addEventListener('click', closeCard)
    shadow.getElementById('copy').addEventListener('click', () => copyDeeplink(true))
    shadow.getElementById('open').addEventListener('click', openImport)
    shadow.getElementById('app-claude').addEventListener('click', () => setApp('claude'))
    shadow.getElementById('app-codex').addEventListener('click', () => setApp('codex'))
    shadow.getElementById('cand-prev').addEventListener('click', () => shiftCandidate(-1))
    shadow.getElementById('cand-next').addEventListener('click', () => shiftCandidate(1))
    shadow.getElementById('model-select').addEventListener('change', onModelSelect)
    shadow.getElementById('include-config').addEventListener('change', onIncludeConfigChange)
  }
  return { shadow, btn, overlay, toast }
}

function showToast(msg, ms = 2800) {
  const { toast } = getUi()
  toast.textContent = msg
  toast.classList.add('show')
  clearTimeout(showToast._t)
  showToast._t = setTimeout(() => toast.classList.remove('show'), ms)
}

function getSelectionText() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return ''
  const plain = String(sel.toString() || '').trim()
  if (!plain) return ''
  const anchors = collectAnchorsInSelection(sel)
  if (typeof enrichTextWithAnchorHrefs === 'function') {
    return String(enrichTextWithAnchorHrefs(plain, anchors) || plain).trim()
  }
  return plain
}

/**
 * @param {Selection} sel
 * @returns {Array<{text: string, href: string}>}
 */
function collectAnchorsInSelection(sel) {
  const out = []
  if (!sel || sel.rangeCount === 0) return out
  const seen = new Set()
  for (let i = 0; i < sel.rangeCount; i++) {
    const range = sel.getRangeAt(i)
    const root = range.commonAncestorContainer
    const rootEl =
      root.nodeType === 1 /* ELEMENT_NODE */ ? root : root.parentElement
    if (!rootEl) continue

    let nearest = rootEl.closest ? rootEl.closest('a[href]') : null
    if (!nearest && rootEl.tagName === 'A' && rootEl.getAttribute('href')) {
      nearest = rootEl
    }
    if (nearest) pushAnchor(nearest, out, seen)

    const candidates = rootEl.querySelectorAll
      ? rootEl.querySelectorAll('a[href]')
      : []
    for (const a of candidates) {
      if (!rangeIntersectsNode(range, a)) continue
      pushAnchor(a, out, seen)
    }

    for (const boundary of [range.startContainer, range.endContainer]) {
      const el =
        boundary.nodeType === 1 ? boundary : boundary.parentElement
      if (!el) continue
      const a = el.closest ? el.closest('a[href]') : null
      if (a) pushAnchor(a, out, seen)
    }
  }
  return out
}

function pushAnchor(a, out, seen) {
  if (!a || !a.getAttribute) return
  const href = a.href || a.getAttribute('href') || ''
  if (!href) return
  const key = href + '|' + (a.textContent || '').trim()
  if (seen.has(key)) return
  seen.add(key)
  out.push({
    text: String(a.textContent || '').replace(/\s+/g, ' ').trim(),
    href: String(href),
  })
}

function rangeIntersectsNode(range, node) {
  if (!range || !node) return false
  try {
    if (typeof range.intersectsNode === 'function') {
      return range.intersectsNode(node)
    }
  } catch {
    /* fall through */
  }
  try {
    const nodeRange = document.createRange()
    nodeRange.selectNode(node)
    return (
      range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
    )
  } catch {
    return false
  }
}

function getSelectionRect() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (!rect || (rect.width === 0 && rect.height === 0)) return null
  return rect
}

function positionButton(rect) {
  const { btn } = getUi()
  const top = Math.min(window.innerHeight - 48, Math.max(8, rect.bottom + 8))
  const left = Math.min(window.innerWidth - 140, Math.max(8, rect.left + rect.width / 2 - 60))
  btn.style.top = `${top}px`
  btn.style.left = `${left}px`
}

function updateSelectionUi() {
  const text = getSelectionText()
  lastSelectionText = text
  const { btn } = getUi()
  if (!text || !looksLikeConfig(text)) {
    btn.classList.remove('show')
    return
  }
  const rect = getSelectionRect()
  if (!rect) {
    btn.classList.remove('show')
    return
  }
  positionButton(rect)
  btn.classList.add('show')
}

function scheduleUpdate() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(updateSelectionUi, 120)
}

function onImportClick(e) {
  e.preventDefault()
  e.stopPropagation()
  const text = lastSelectionText || getSelectionText()
  const { btn } = getUi()
  btn.classList.remove('show')

  const result = parseShareText(text)
  if (!result) {
    openErrorCard('未识别到 API 配置。请选中包含 base URL / API Key / ccswitch 深链 / Base64 配置 的文本。')
    return
  }
  currentResult = result
  selectedApp = result.app
  selectedModel = null
  includeFullConfig = shouldIncludeFullConfigByDefault(result.config)
  refreshModelInfo(text)
  rebuildDeeplink()
  // Long full-config deeplinks are unreliable over custom protocols; drop config.
  if (includeFullConfig && currentDeeplink && currentDeeplink.length > MAX_DEEPLINK_LEN) {
    includeFullConfig = false
    rebuildDeeplink()
    result.warnings = [
      ...(result.warnings || []),
      '完整配置生成的深链过长，可能无法唤起 CC Switch。已改为仅导入 endpoint/key。',
    ]
  }
  renderCard(result)
}

/**
 * Recompute models for current app (filters by app when possible).
 * @param {string} [sourceText]
 */
function refreshModelInfo(sourceText) {
  const text = sourceText || lastSelectionText || ''
  let info =
    typeof extractModels === 'function'
      ? extractModels(text)
      : { model: null, haikuModel: null, sonnetModel: null, opusModel: null, models: [] }

  let models = info.models || []
  if (typeof filterModelsForApp === 'function' && selectedApp) {
    models = filterModelsForApp(models, selectedApp)
  }

  if (selectedModel && models.includes(selectedModel)) {
    info = { ...info, models, model: selectedModel }
  } else if (models.length === 1) {
    selectedModel = models[0]
    info = { ...info, models, model: models[0] }
  } else if (models.length > 1) {
    const preferred =
      (info.model && models.includes(info.model) && info.model) ||
      models.find((m) => /sonnet/i.test(m)) ||
      models[0]
    selectedModel = preferred
    info = { ...info, models, model: preferred }
  } else {
    selectedModel = null
    info = {
      model: null,
      haikuModel: null,
      sonnetModel: null,
      opusModel: null,
      models: [],
    }
  }

  if (selectedApp === 'claude') {
    info.haikuModel = models.find((m) => /haiku/i.test(m)) || null
    info.sonnetModel = models.find((m) => /sonnet/i.test(m)) || null
    info.opusModel = models.find((m) => /opus/i.test(m)) || null
  } else {
    info.haikuModel = null
    info.sonnetModel = null
    info.opusModel = null
  }

  currentModelInfo = info
}

function openErrorCard(msg) {
  const { overlay, shadow } = getUi()
  shadow.getElementById('meta').textContent = ''
  shadow.getElementById('fields').style.display = 'none'
  shadow.getElementById('warn').textContent = ''
  shadow.getElementById('cand').classList.remove('show')
  shadow.getElementById('model-row').style.display = 'none'
  shadow.getElementById('config-opt').classList.remove('show')
  shadow.getElementById('include-config').checked = false
  shadow.getElementById('config-meta').textContent = ''
  includeFullConfig = false
  const err = shadow.getElementById('err')
  err.style.display = 'block'
  err.textContent = msg
  shadow.getElementById('app-claude').disabled = true
  shadow.getElementById('app-codex').disabled = true
  shadow.getElementById('open').disabled = true
  shadow.getElementById('copy').disabled = true
  overlay.classList.add('show')
}

function renderCard(result) {
  const { overlay, shadow } = getUi()
  const err = shadow.getElementById('err')
  err.style.display = 'none'
  err.textContent = ''
  shadow.getElementById('fields').style.display = 'block'
  shadow.getElementById('app-claude').disabled = false
  shadow.getElementById('app-codex').disabled = false
  shadow.getElementById('copy').disabled = false

  const conf = Math.round((result.confidence || 0) * 100)
  const modelCount = currentModelInfo?.models?.length || 0
  const candCount = result.candidates?.length || result.candidateCount || 1
  const candIdx = (result.candidateIndex || 0) + 1
  const ver =
    typeof SCRIPT_VERSION !== 'undefined' && SCRIPT_VERSION ? String(SCRIPT_VERSION) : 'dev'
  shadow.getElementById('meta').textContent =
    `识别：${result.source} · 置信度 ${conf}%` +
    (candCount > 1 ? ` · 候选 ${candIdx}/${candCount}` : '') +
    (modelCount ? ` · 模型×${modelCount}` : '') +
    ` · v${ver}`

  const modelLine = currentModelInfo?.model
    ? escapeHtml(currentModelInfo.model) +
      (modelCount > 1
        ? ` <span style="opacity:.65">(+${modelCount - 1})</span>`
        : '')
    : modelCount
      ? escapeHtml(currentModelInfo.models.slice(0, 3).join(', ')) +
        (modelCount > 3 ? '…' : '')
      : '—'

  const configInfo =
    result.config && typeof describeConfigPayload === 'function'
      ? describeConfigPayload(result.config)
      : result.config
        ? { fields: [], sizeBytes: String(result.config).length }
        : null

  const fields = shadow.getElementById('fields')
  fields.innerHTML = `
    <div><span class="k">name</span>${escapeHtml(result.name || '')}</div>
    <div><span class="k">endpoint</span>${escapeHtml(result.endpoint || '—')}</div>
    <div><span class="k">apiKey</span>${escapeHtml(maskKey(result.apiKey || '') || '—')}</div>
    <div><span class="k">model</span>${modelLine}</div>
    <div><span class="k">app</span>${escapeHtml(selectedApp || '未选择')}</div>
    ${
      configInfo
        ? `<div><span class="k">完整配置</span>${includeFullConfig ? '是（将写入深链）' : '否（仅 endpoint/key）'}</div>
    <div><span class="k">顶层字段</span>${escapeHtml(
      (configInfo.fields || []).slice(0, 12).join('、') || '（非 JSON / 无字段名）',
    )}${configInfo.fields && configInfo.fields.length > 12 ? '…' : ''}</div>
    ${
      configInfo.envFields && configInfo.envFields.length
        ? `<div><span class="k">env 字段</span>${escapeHtml(
            configInfo.envFields.slice(0, 12).join('、'),
          )}${configInfo.envFields.length > 12 ? '…' : ''}</div>`
        : ''
    }
    <div><span class="k">配置大小</span>${escapeHtml(formatBytes(configInfo.sizeBytes || 0))}</div>`
        : ''
    }
  `

  const configOpt = shadow.getElementById('config-opt')
  const includeCb = shadow.getElementById('include-config')
  const configMeta = shadow.getElementById('config-meta')
  if (configInfo) {
    configOpt.classList.add('show')
    includeCb.checked = includeFullConfig
    const fieldPreview = (configInfo.fields || []).slice(0, 8).join('、') || '原始配置块'
    const envPreview =
      configInfo.envFields && configInfo.envFields.length
        ? ` · env：${configInfo.envFields.slice(0, 6).join('、')}${
            configInfo.envFields.length > 6 ? '…' : ''
          }`
        : ''
    configMeta.textContent = `顶层字段：${fieldPreview}${
      configInfo.fields && configInfo.fields.length > 8 ? '…' : ''
    }${envPreview} · ${formatBytes(configInfo.sizeBytes || 0)}`
  } else {
    configOpt.classList.remove('show')
    configMeta.textContent = ''
  }

  const candEl = shadow.getElementById('cand')
  if (candCount > 1 && result.candidates && result.candidates.length > 1) {
    candEl.classList.add('show')
    shadow.getElementById('cand-label').textContent = `候选 ${candIdx}/${candCount}`
    shadow.getElementById('cand-prev').disabled = (result.candidateIndex || 0) <= 0
    shadow.getElementById('cand-next').disabled =
      (result.candidateIndex || 0) >= result.candidates.length - 1
  } else {
    candEl.classList.remove('show')
  }

  const modelRow = shadow.getElementById('model-row')
  const modelSelect = shadow.getElementById('model-select')
  if (modelCount > 1) {
    modelRow.style.display = 'flex'
    modelSelect.innerHTML = currentModelInfo.models
      .map(
        (m) =>
          `<option value="${escapeHtml(m)}"${m === currentModelInfo.model ? ' selected' : ''}>${escapeHtml(m)}</option>`,
      )
      .join('')
  } else {
    modelRow.style.display = 'none'
    modelSelect.innerHTML = ''
  }

  const warn = shadow.getElementById('warn')
  const warnings = [...(result.warnings || [])]
  if (!selectedApp) warnings.push('请选择导入到 Claude Code 或 Codex')
  if (modelCount === 1) warnings.push('已自动填入检测到的唯一模型')
  else if (modelCount > 1) warnings.push(`检测到 ${modelCount} 个模型，可在下方切换`)
  if (configInfo?.risky) {
    warnings.push(
      '配置包含高风险附加字段，请确认来源可信' +
        (configInfo.riskReasons && configInfo.riskReasons.length
          ? `（${configInfo.riskReasons.join('；')}）`
          : ''),
    )
  }
  if (
    includeFullConfig &&
    currentDeeplink &&
    currentDeeplink.length > MAX_DEEPLINK_LEN * 0.85
  ) {
    warnings.push(
      `深链较长（${currentDeeplink.length} 字符），若无法唤起请取消「携带完整配置」`,
    )
  }
  warn.textContent = warnings.join('；')

  syncAppButtons()
  shadow.getElementById('open').disabled = !selectedApp
  overlay.classList.add('show')
}

function shiftCandidate(delta) {
  if (!currentResult || typeof selectCandidate !== 'function') return
  const list = currentResult.candidates
  if (!list || list.length < 2) return
  const next = selectCandidate(currentResult, (currentResult.candidateIndex || 0) + delta)
  currentResult = next
  rebuildDeeplink()
  renderCard(next)
}

function onModelSelect(e) {
  const v = e.target && e.target.value
  selectedModel = v || null
  if (currentModelInfo) {
    currentModelInfo = { ...currentModelInfo, model: selectedModel }
  }
  rebuildDeeplink()
  if (currentResult) renderCard(currentResult)
}

function onIncludeConfigChange(e) {
  includeFullConfig = !!(e.target && e.target.checked)
  rebuildDeeplink()
  if (
    includeFullConfig &&
    currentDeeplink &&
    currentDeeplink.length > MAX_DEEPLINK_LEN
  ) {
    includeFullConfig = false
    rebuildDeeplink()
    const { shadow } = getUi()
    shadow.getElementById('include-config').checked = false
    showToast('完整配置生成的深链过长，可能无法唤起 CC Switch。建议仅导入 endpoint/key。', 4200)
  }
  if (currentResult) renderCard(currentResult)
}

function formatBytes(n) {
  const b = Number(n) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function setApp(app) {
  selectedApp = app
  refreshModelInfo()
  rebuildDeeplink()
  if (currentResult) renderCard(currentResult)
}

function syncAppButtons() {
  const { shadow } = getUi()
  shadow.getElementById('app-claude').classList.toggle('active', selectedApp === 'claude')
  shadow.getElementById('app-codex').classList.toggle('active', selectedApp === 'codex')
}

function rebuildDeeplink() {
  currentDeeplink = null
  if (!currentResult || !selectedApp) return
  try {
    const modelInfo = currentModelInfo
      ? { ...currentModelInfo, model: selectedModel || currentModelInfo.model }
      : null
    currentDeeplink = buildDeeplink(currentResult, selectedApp, modelInfo, {
      includeConfig: includeFullConfig,
    })
  } catch (e) {
    currentDeeplink = null
  }
}

function closeCard() {
  const { overlay } = getUi()
  overlay.classList.remove('show')
}

function copyText(text) {
  if (typeof GM_setClipboard === 'function') {
    GM_setClipboard(text, 'text')
    return Promise.resolve(true)
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false)
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return Promise.resolve(ok)
  } catch {
    return Promise.resolve(false)
  }
}

function copyDeeplink(fromBtn) {
  if (!currentDeeplink) {
    showToast('请先选择 Claude Code 或 Codex')
    return
  }
  copyText(currentDeeplink).then((ok) => {
    showToast(ok ? '深链已复制到剪贴板' : '复制失败，请手动复制')
    if (fromBtn && typeof GM_notification === 'function') {
      try {
        GM_notification({ title: 'CC Switch Importer', text: '深链已复制', timeout: 2000 })
      } catch (_) {}
    }
  })
}

function openImport() {
  if (!selectedApp) {
    showToast('请选择 Claude Code 或 Codex')
    return
  }
  rebuildDeeplink()
  if (!currentDeeplink) {
    showToast('无法生成深链')
    return
  }

  const link = currentDeeplink
  const a = document.createElement('a')
  a.href = link
  a.style.display = 'none'
  document.body.appendChild(a)
  try {
    a.click()
  } catch (_) {
    try {
      window.location.href = link
    } catch (_) {}
  }
  setTimeout(() => a.remove(), 0)

  // Do NOT auto-copy the deeplink (contains apiKey). Use「复制深链」if protocol fails.
  showToast('已尝试打开 CC Switch。若无反应，请点「复制深链」并确认已安装 CC Switch', 4200)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function onKeydown(e) {
  if (e.key === 'Escape') closeCard()
}

function init() {
  document.addEventListener('selectionchange', scheduleUpdate)
  document.addEventListener('mouseup', scheduleUpdate)
  document.addEventListener('keyup', scheduleUpdate)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', () => {
    const { btn } = getUi()
    if (btn.classList.contains('show')) updateSelectionUi()
  }, true)
  getUi()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
