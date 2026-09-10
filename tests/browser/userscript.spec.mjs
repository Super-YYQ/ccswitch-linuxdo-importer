import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const userscriptPath = path.resolve(
  here,
  '../../userscript/ccswitch-linuxdo-importer.user.js',
)

async function installUserscript(page, shareText) {
  await page.setContent('<main><p id="share"></p></main>')
  await page.evaluate(() => {
    window.__copiedDeeplinks = []
    window.__openedDeeplinks = []
    window.GM_setClipboard = (text) => window.__copiedDeeplinks.push(text)
    window.GM_notification = () => {}
    HTMLAnchorElement.prototype.click = function () {
      if (String(this.href).startsWith('ccswitch:')) {
        window.__openedDeeplinks.push(this.href)
        return
      }
      HTMLElement.prototype.click.call(this)
    }
  })
  await page.locator('#share').evaluate((element, text) => {
    element.textContent = text
  }, shareText)
  await page.addScriptTag({ content: await fs.readFile(userscriptPath, 'utf8') })
}

async function selectShare(page) {
  await page.locator('#share').evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
}

async function shadowState(page) {
  return page.locator('#ccs-ld-root').evaluate((host) => {
    const root = host.shadowRoot
    return {
      activeId: root.activeElement?.id || null,
      overlayOpen: root.getElementById('overlay').classList.contains('show'),
      selectedModel: root.getElementById('model-select').value,
      includeConfig: root.getElementById('include-config').checked,
    }
  })
}

test('copies the complete decoded API key while keeping it masked in the dialog', async ({
  page,
}) => {
  const apiKey = 'sk-ant-api03-TESTONLY-copy-key-browser-fixture'
  const encodedKey = Buffer.from(apiKey).toString('base64')
  await installUserscript(
    page,
    `base_url = "https://relay.example.invalid/v1"\nkey（base64）：${encodedKey}`,
  )
  await selectShare(page)

  const root = page.locator('#ccs-ld-root')
  await root.locator('#btn').click()
  const fields = root.locator('#fields')
  await expect(fields).toContainText('****')
  await expect(fields).not.toContainText(apiKey)
  expect(await page.evaluate(() => window.__copiedDeeplinks)).toEqual([])

  const copyKey = root.getByRole('button', { name: '复制 Key', exact: true })
  await expect(copyKey).toBeVisible()
  await copyKey.click()
  await expect
    .poll(() => page.evaluate(() => window.__copiedDeeplinks))
    .toEqual([apiKey])
  await expect(root.locator('#toast')).toHaveText('Key 已复制到剪贴板')
  await expect(fields).not.toContainText(apiKey)
  expect(await page.evaluate(() => window.__openedDeeplinks)).toEqual([])
})

test('copies the current candidate API key after switching candidates', async ({ page }) => {
  const firstKey = 'sk-ant-api03-TESTONLY-candidate-first-1111'
  const secondKey = 'sk-ant-api03-TESTONLY-candidate-second-2222'
  await installUserscript(
    page,
    `https://relay.example.invalid/v1\n${firstKey}\n${secondKey}`,
  )
  await selectShare(page)

  const root = page.locator('#ccs-ld-root')
  await root.locator('#btn').click()
  const copyKey = root.getByRole('button', { name: '复制 Key', exact: true })
  await copyKey.click()
  await expect
    .poll(() => page.evaluate(() => window.__copiedDeeplinks))
    .toEqual([firstKey])

  await root.getByRole('button', { name: '下一组候选' }).click()
  await expect(root.locator('#cand-label')).toHaveText('候选 2/2')
  await copyKey.click()
  await expect
    .poll(() => page.evaluate(() => window.__copiedDeeplinks))
    .toEqual([firstKey, secondKey])

  await root.getByRole('button', { name: '上一组候选' }).click()
  await copyKey.click()
  await expect
    .poll(() => page.evaluate(() => window.__copiedDeeplinks))
    .toEqual([firstKey, secondKey, firstKey])
})

test('disables API key copying when a later selection has no key', async ({ page }) => {
  await installUserscript(page, 'sk-ant-api03-TESTONLY-previous-key-fixture')
  await selectShare(page)

  const root = page.locator('#ccs-ld-root')
  await root.locator('#btn').click()
  await expect(root.getByRole('button', { name: '复制 Key', exact: true })).toBeEnabled()
  await root.locator('#cancel').click()
  await page.locator('#share').click()
  await expect(root.locator('#btn')).toBeHidden()

  await page.locator('#share').evaluate((element) => {
    element.textContent = 'OPENAI_BASE_URL=https://relay.example.invalid/v1'
  })
  await selectShare(page)
  await root.locator('#btn').click()
  await expect(root.getByRole('button', { name: '复制 Key', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => window.__copiedDeeplinks)).toEqual([])
})

test('reports API key clipboard failures without claiming success', async ({ page }) => {
  await installUserscript(page, 'sk-ant-api03-TESTONLY-clipboard-failure-fixture')
  await page.evaluate(() => {
    window.GM_setClipboard = () => {
      throw new Error('Clipboard unavailable in this fixture')
    }
  })
  await selectShare(page)

  const root = page.locator('#ccs-ld-root')
  await root.locator('#btn').click()
  await root.getByRole('button', { name: '复制 Key', exact: true }).click()
  await expect(root.locator('#toast')).toHaveText('Key 复制失败，请重试')
  expect(await page.evaluate(() => window.__copiedDeeplinks)).toEqual([])
})

test('runs the critical userscript import flow in Chromium', async ({ page }) => {
  const config = JSON.stringify({
    name: 'Browser fixture',
    env: {
      ANTHROPIC_BASE_URL: 'https://relay.example.invalid/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-ant-api03-TESTONLY-browser-fixture',
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
    },
    notes: 'also supports gpt-5.5',
    settings: { command: 'synthetic-helper' },
  })
  await installUserscript(page, config)
  await selectShare(page)

  const root = page.locator('#ccs-ld-root')
  const trigger = root.locator('#btn')
  await expect(trigger).toBeVisible()
  await trigger.click()

  const dialog = root.getByRole('dialog', { name: '导入到 CC Switch' })
  await expect(dialog).toBeVisible()
  await expect(root.locator('#include-config')).not.toBeChecked()
  await expect(root.locator('#warn')).toContainText('高风险')
  await expect.poll(async () => (await shadowState(page)).activeId).toBe('open')
  await page.keyboard.press('Tab')
  await expect.poll(async () => (await shadowState(page)).activeId).toBe('copy-key')
  await page.keyboard.press('Tab')
  await expect.poll(async () => (await shadowState(page)).activeId).toBe('model-select')
  await page.keyboard.press('Shift+Tab')
  await expect.poll(async () => (await shadowState(page)).activeId).toBe('copy-key')
  await page.keyboard.press('Shift+Tab')
  await expect.poll(async () => (await shadowState(page)).activeId).toBe('open')

  await expect(root.locator('#model-select')).toHaveValue('claude-sonnet-4-6')
  await root.locator('#app-codex').click()
  await expect(root.locator('#model-select')).toHaveValue('gpt-5.5')

  await root.locator('#model-select').selectOption('claude-sonnet-4-6')
  await root.locator('#app-claude').click()
  await root.locator('#app-codex').click()
  await expect(root.locator('#model-select')).toHaveValue('claude-sonnet-4-6')

  await root.locator('#copy').click()
  await expect
    .poll(() => page.evaluate(() => window.__copiedDeeplinks.length))
    .toBe(1)
  expect(await page.evaluate(() => window.__copiedDeeplinks[0])).not.toContain(
    'config=',
  )

  await root.locator('#include-config').check()
  await expect(root.locator('#include-config')).toBeChecked()
  await root.locator('#copy').click()
  await expect
    .poll(() => page.evaluate(() => window.__copiedDeeplinks.length))
    .toBe(2)
  expect(await page.evaluate(() => window.__copiedDeeplinks[1])).toContain(
    'config=',
  )

  await root.locator('#open').click()
  await expect
    .poll(() => page.evaluate(() => window.__openedDeeplinks.length))
    .toBe(1)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect.poll(async () => (await shadowState(page)).activeId).toBe('btn')
})

test('shows an actionable error instead of copying or opening an overlong link', async ({
  page,
}) => {
  const params = new URLSearchParams({
    resource: 'provider',
    app: 'claude',
    name: 'N'.repeat(8_000),
    endpoint: 'https://relay.example.invalid/v1',
    apiKey: 'sk-ant-api03-TESTONLY-overlong-browser-fixture',
  })
  await installUserscript(page, `ccswitch://v1/import?${params}`)
  await selectShare(page)

  const root = page.locator('#ccs-ld-root')
  await root.locator('#btn').click()

  await expect(root.locator('#err')).toContainText('深链过长')
  await expect(root.locator('#copy')).toBeDisabled()
  await expect(root.locator('#open')).toBeDisabled()
  expect(await page.evaluate(() => window.__copiedDeeplinks)).toEqual([])
  expect(await page.evaluate(() => window.__openedDeeplinks)).toEqual([])
})
