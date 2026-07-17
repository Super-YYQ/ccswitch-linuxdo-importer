# CC Switch Importer for linux.do

在 [linux.do](https://linux.do) 上**选中**别人分享的 API 配置文本，点击「导入 ccSwitch」，脚本会本地解析并生成 [`ccswitch://`](https://github.com/farion1231/cc-switch) 深链，一键唤起本机 [CC Switch](https://github.com/farion1231/cc-switch) 导入到 **Claude Code** 或 **Codex** 供应商栏。

## 功能

- 仅在 `linux.do` / `www.linux.do` 生效
- **选中文本 → 悬浮按钮 → 确认卡 → 打开深链**（不会偷偷读剪贴板）
- 支持常见分享格式（可夹杂中文说明）：
  1. `ccswitch://v1/import?...` 深链
  2. Base64 编码的 JSON / env 配置
  3. JSON 对象（`baseUrl` / `endpoint` + `apiKey` 等）
  4. 环境变量（`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` 等）
  5. TOML / `key = "value"` 风格
  6. 混排纯文本中的 URL + `sk-` / `sk-ant-` key
- 自动识别 Claude Code / Codex；无法判断时需手动选择
- 唤起失败时自动复制深链到剪贴板
- **纯本地解析**，不上传任何密钥

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox）
2. 本机已安装并至少运行过一次 [CC Switch](https://github.com/farion1231/cc-switch/releases)（用于注册 `ccswitch://` 协议）
3. 打开脚本文件  
   [`userscript/ccswitch-linuxdo-importer.user.js`](./userscript/ccswitch-linuxdo-importer.user.js)  
   用浏览器打开，或在 Tampermonkey 面板 →「添加新脚本」→ 粘贴全文 → 保存
4. 访问 https://linux.do ，在帖子中选中一段配置文字

## 使用

1. 用鼠标选中包含 API 地址 / Key / 配置块的文本（可带中文说明）
2. 出现蓝色悬浮按钮 **「导入 ccSwitch」** → 点击
3. 确认卡中检查 `endpoint` / 脱敏后的 `apiKey`，必要时切换 Claude / Codex
4. 点 **「打开导入」** 唤起 CC Switch；若无反应，深链已复制，可粘贴到地址栏或检查协议是否注册
5. 也可点 **「复制深链」** 手动处理

## 解析示例

**环境变量 + 中文噪声：**

```text
分享一个可用的：
ANTHROPIC_BASE_URL=https://proxy.example.com/v1
ANTHROPIC_AUTH_TOKEN=sk-ant-api03-xxxx
别外传。
```

**JSON：**

```json
{"name":"MyRelay","baseUrl":"https://relay.example.com","apiKey":"sk-ant-api03-xxxx"}
```

**混排：**

```text
地址是 https://mid.example.org/anthropic 密钥 sk-ant-api03-xxxx 自己测试。
```

## 开发

```bash
# 单元测试（解析 / 分类 / 深链）
npm test

# 从 core + UI 重新打包油猴单文件
npm run build
```

| 路径 | 说明 |
|------|------|
| `userscript/lib/core.mjs` | 纯解析逻辑（Node 可测） |
| `userscript/ui-main.js` | 选区 / 浮层 / 唤起 |
| `userscript/ccswitch-linuxdo-importer.user.js` | **安装用产物**（`npm run build` 生成） |
| `tests/parser.test.mjs` | 解析单测 |
| `docs/superpowers/specs/` | 设计说明 |

修改 `core.mjs` 或 `ui-main.js` 后务必 `npm run build`，再更新 Tampermonkey 中的脚本。

## 安全说明

- 仅在你主动选中并点击后处理文本
- 确认卡中 Key 会脱敏显示（`sk-ant-****xxxx`）
- 不要在公共场合长期展示含真实 Key 的选区截图

## License

MIT
