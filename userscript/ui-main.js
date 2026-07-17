/* UI + integration (concatenated after core by scripts/build.mjs) */
;(function () {
  'use strict'

  const BTN_ID = 'ccs-ld-import-btn'
  const ROOT_ID = 'ccs-ld-root'
  const Z = 2147483000

  let lastSelectionText = ''
  let hideTimer = null
  let selectedApp = null
  let currentResult = null
  let currentDeeplink = null

  function $(sel, root) {
    return (root || document).querySelector(sel)
  }

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
      width: min(360px, 100%);
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
    return String(sel.toString() || '').trim()
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
    rebuildDeeplink()
    renderCard(result)
  }

  function openErrorCard(msg) {
    const { overlay, shadow } = getUi()
    shadow.getElementById('meta').textContent = ''
    shadow.getElementById('fields').style.display = 'none'
    shadow.getElementById('warn').textContent = ''
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
    shadow.getElementById('meta').textContent =
      `识别：${result.source} · 置信度 ${conf}%` +
      (result.candidateCount > 1 ? ` · 候选×${result.candidateCount}` : '') +
      ' · v1.0.1'

    const fields = shadow.getElementById('fields')
    fields.innerHTML = `
      <div><span class="k">name</span>${escapeHtml(result.name || '')}</div>
      <div><span class="k">endpoint</span>${escapeHtml(result.endpoint || '—')}</div>
      <div><span class="k">apiKey</span>${escapeHtml(maskKey(result.apiKey || '') || '—')}</div>
      <div><span class="k">app</span>${escapeHtml(selectedApp || '未选择')}</div>
    `

    const warn = shadow.getElementById('warn')
    const warnings = [...(result.warnings || [])]
    if (!selectedApp) warnings.push('请选择导入到 Claude Code 或 Codex')
    warn.textContent = warnings.join('；')

    syncAppButtons()
    shadow.getElementById('open').disabled = !selectedApp
    overlay.classList.add('show')
  }

  function setApp(app) {
    selectedApp = app
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
      // If original deeplink already targets same app and has params, still rebuild for consistency
      currentDeeplink = buildDeeplink(currentResult, selectedApp)
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

    // Prefer original deeplink if user didn't need rebuild? Always use rebuilt for app override.
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

    // Fallback: if protocol handler missing, page usually stays — copy link
    setTimeout(() => {
      copyText(link).then(() => {
        showToast('已尝试打开 CC Switch；若无反应，深链已复制，请检查是否安装 CC Switch', 4000)
      })
    }, 600)
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
    // warm shadow root
    getUi()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
