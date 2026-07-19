# CC Switch Importer for linux.do

> **本仓库文档与代码由 AI 辅助生成（Claude Code）。**  
> Generated with AI assistance · 请自行审查后使用

在 [linux.do](https://linux.do) 上**选中**他人分享的 API 配置文本，点击「导入 ccSwitch」，脚本在本地解析后生成 [`ccswitch://`](https://github.com/farion1231/cc-switch) 深链，唤起本机 [CC Switch](https://github.com/farion1231/cc-switch)，导入到 **Claude Code** 或 **Codex** 供应商。

---

## 功能一览

| 能力 | 说明 |
|------|------|
| 触发方式 | 选中文本 → 悬浮按钮 → 确认卡（不监听剪贴板） |
| 作用站点 | 仅 `linux.do` / `www.linux.do` |
| 目标应用 | 自动识别 Claude Code / Codex；不明时手选 |
| 模型识别 | 从文案提取 `gpt-*` / `claude-*` / `grok-*` 等，写入深链 `model` 等参数；仅一个模型时自动作为默认 |
| 导入方式 | `ccswitch://v1/import?...`；唤起失败则复制深链 |
| 隐私 | 纯本地解析，不上传密钥；确认卡中 Key 脱敏 |

### 支持的分享格式

1. **官方深链** — `ccswitch://v1/import?...`
2. **Base64** — 整段配置或单独的 Key（自动解码 `sk-` / `g2a_` / `tp-` 等）
3. **JSON** — `baseUrl` / `endpoint` + `apiKey` 等
4. **环境变量** — `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`OPENAI_*` 等
5. **TOML / key=value** — `base_url = "..."`、`api_key = "..."`
6. **混排文本** — 中文说明 + URL + Key（含全角冒号 `url：` / `key：`、表格 `Base URL    https://...`、标签与 Base64 分行）

---

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox）
2. 安装并至少运行过一次 [CC Switch](https://github.com/farion1231/cc-switch/releases)（注册 `ccswitch://`）
3. 安装用户脚本（任选其一）：
   - **推荐**：打开  
     [raw 脚本（一键安装）](https://raw.githubusercontent.com/Super-YYQ/ccswitch-linuxdo-importer/release/userscript/ccswitch-linuxdo-importer.user.js)  
     由 Tampermonkey 捕获并安装  
     （安装地址固定指向 **`release` 分支**；`main` 只放源码，推送 main **不会**自动给用户发版）
   - 或从 [GitHub Releases](https://github.com/Super-YYQ/ccswitch-linuxdo-importer/releases) 下载对应版本的 `.user.js`
4. 访问 https://linux.do ，在帖子中选中一段配置文字

确认安装版本：打开确认卡后，元信息末尾应显示当前发布版本（例如 **v1.2.2**）。

> 若你之前从 `main` 安装过旧版：请卸载后按上面的 `release` 链接重装一次，否则自动更新仍会指向已废弃的 main 产物路径。

---

## 使用

1. 选中含 API 地址 / Key / 配置块的文本（可含中文说明）
2. 点击蓝色悬浮按钮 **「导入 ccSwitch」**
3. 在确认卡检查：
   - `endpoint` / 脱敏 `apiKey`
   - `model`（多模型时可下拉切换；会按 Claude/Codex 过滤）
   - 多组 URL/Key 时可用 ‹ › 切换候选
   - Claude Code / Codex 目标栏
4. 点 **「打开导入」** 唤起 CC Switch  
   若无反应：点 **「复制深链」** 粘贴到地址栏，或检查 CC Switch 是否已注册协议  
   （打开时**不会**自动把含 Key 的深链写入剪贴板）
5. 也可点 **「复制深链」** 手动处理

### 模型自动配置规则

| 情况 | 行为 |
|------|------|
| 文案中只出现 **1 个** 可识别模型 | 自动作为默认 `model` 写入深链 |
| 出现 **多个** 模型 | 优先 sonnet / 主模型写入 `model`；Claude 下额外尝试 `haikuModel` / `sonnetModel` / `opusModel` |
| 只有「支持所有模型」等描述、无具体 ID | 不写入模型参数 |
| 深链参数 | 使用官方协议：`model`、`haikuModel`、`sonnetModel`、`opusModel`（见 [CC Switch 深链文档](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/5-faq/5.3-deeplink.md)） |

---

## 解析示例

**环境变量 + 中文噪声**

```text
分享一个可用的：
ANTHROPIC_BASE_URL=https://proxy.example.com/v1
ANTHROPIC_AUTH_TOKEN=sk-ant-api03-xxxx
别外传。
```

**表格 + Base64 Key（常见于 linux.do）**

```text
Base URL    https://example.com
API Key（Base64，请自行解码）
c2st...==
模型设置    gpt-5.5，claude-3.5-sonnet
```

**全角标签**

```text
url：https://grok.example.net
key：ZzJhX...==
```

**JSON**

```json
{"name":"MyRelay","baseUrl":"https://relay.example.com","apiKey":"sk-ant-api03-xxxx"}
```

---

## 开发

```bash
# 安装依赖（esbuild 等）
npm ci

# 单元测试
npm test

# 用 esbuild 将 ESM 源码打包为油猴 IIFE 单文件（本地产物，不提交到 main）
npm run build

# 测试 + 构建
npm run check
```

| 路径 | 说明 |
|------|------|
| `userscript/lib/core.mjs` | 配置解析 / 分类 / 深链（Node 测试直接 import） |
| `userscript/lib/model-extractor.mjs` | 模型名提取 |
| `userscript/ui-main.js` | 选区 / 确认卡 / 唤起（esbuild 入口，ESM） |
| `userscript/ccswitch-linuxdo-importer.user.js` | **构建产物**（gitignore；仅 `release` 分支 / Release 资产） |
| `scripts/build.mjs` | esbuild IIFE + userscript 头（`@updateURL` → `release`） |
| `tests/*.test.mjs` | 单测 |
| `docs/superpowers/` | 设计与计划 |

本地验证：`npm run build` 后把生成的 `.user.js` 粘进 Tampermonkey，或用「从磁盘安装」。

### 发布流程

分支职责：

| 分支 | 内容 |
|------|------|
| `main` | 源码、测试、构建脚本；**不含**安装用 `.user.js` |
| `release` | 稳定油猴脚本（Tampermonkey `@updateURL` / `@downloadURL` 目标） |

发版步骤：

1. 在 `main` 改完功能，`npm test` / `npm run build` 通过
2. 把 `package.json` 版本号改成要发布的版本（如 `1.2.0`）
3. 合并到 `main` 后打 tag 并推送 tag（**不要**只靠推 main 发版）：

```bash
git tag v1.2.0
git push origin v1.2.0
```

4. GitHub Action `Release`（`.github/workflows/release.yml`）会：
   - 跑测试并 `npm run build`（只读权限 Job）
   - 校验 tag 与 `package.json` 版本一致（`v1.2.2` ↔ `1.2.2`），且 tag 提交在 `main` 上
   - 用 `semver` 比较版本；同版本仅当产物 **SHA-256 完全一致** 才允许重跑，内容不同则拒绝并要求升号
   - 把产物推到 `release` 分支（写权限 Job）
   - 创建 GitHub Release，附上 `.user.js` 附件

CI（`main` / PR）只做 test + build，**不会**更新 `release` 分支。

---

## 安全说明

- 仅在用户**主动选中并点击**后处理文本
- Key 在确认卡中脱敏（如 `sk-ant-****xxxx`）
- 勿在公共场合长期展示含真实 Key 的截图
- 本仓库示例中的密钥均为格式样例；真实额度请勿提交到公开仓库

---

## 变更摘要

- **v1.2.2** — 发布守卫：同版本比 SHA-256（内容不同拒绝）；版本比较改用 `semver`（支持预发布号）
- **v1.2.1** — bug333 审查：Release 拆 build/publish 最小权限；并发与版本降级保护；深链长度上限；多深链/无 `//` 提取；错误卡清理；高风险配置默认不勾选；env 字段摘要；TextEncoder 字节数
- **v1.2.0** — 发布链路加固：esbuild IIFE 替代正则剥 export；`@updateURL`/`@downloadURL` 指向 `release` 分支；main 仅源码；打 `v*` tag 才发布
- **v1.1.7** — 确定性测试密钥；确认卡披露完整 config + 可取消携带；非 provider 深链不亮按钮；URL/Key 按行邻近配对；CI Node 18/20/22
- **v1.1.6** — 模型最长匹配去重；`filterModelsForApp` 改为排序不删；清理残留测试密钥；历史 `filter-repo` 脱敏
- **v1.1.5** — 审查加固：拒绝非 provider 深链；简单 JSON 不再整包 config；解析大小/候选预算；测试夹具改为合成密钥且日志脱敏
- **v1.1.4** — 识别 `tp-`（token-plan 等）Key 前缀；中文粘连 Base64（`…佬友们用dHAt…`）也能抽出 Key
- **v1.1.3** — 支持「俩次 base64」嵌套解码（多层 peel 到 `sk-` / `g2a_`）；识别 `base64：` / `俩次base64：` 标签
- **v1.1.2** — 精简 A：统一 `normalizeApiKey` 出口；合并 labeled/table 扫描（标签表单源）；前缀提示改为内部函数（行为不变）
- **v1.1.1** — Base64/Hex Key 解码后根据文案「别忘了 sk- 前缀」等提示自动补 `sk-` / `sk-ant-` / `g2a_`；确认卡提示已补前缀
- **v1.1.0** — 稳定 app 分类（模型列表不再误判）；多 URL/Key 候选可切换；确认卡模型下拉并按 app 过滤；打开导入不再自动复制含 Key 深链；CI + `npm run check`
- **v1.0.8** — Discourse 折行/链化 newapi JSON 时合并多解析器结果恢复 Key；endpoint 去尾部引号；屏蔽 base64 内假 `o3` 模型
- **v1.0.7** — 修复 Discourse 把 JSON `"url"` 链化后 enrich 改坏对象导致丢字段；支持 `newapi_channel_conn` 等 `{key,url}` JSON 分享
- **v1.0.6** — Windows 友好测试脚本；confidence 封顶；收紧 base64 误报；构建注入版本与 `@updateURL`；Grok 匹配加词边界
- **v1.0.5** — 识别无连字符的 `Grok4.5` / `grok4.5` 等 informal 模型写法
- **v1.0.4** — Base64 Key 解码后自动剥离 linux.do「去除文中」等 CJK 水印
- **v1.0.3** — 选区中的链接若可见文案是 `base url` / `url`（真实地址只在 `href`），自动合并 `href` 后再解析
- **v1.0.2** — 模型自动识别并写入深链；README 重排；作者信息匿名化
- **v1.0.1** — Discourse 表格 / Base64 分行 / 零宽字符等抗噪声
- **v1.0.0** — 首版油猴导入

---

## License

MIT · © 2026 CC Switch Importer Contributors

> 本 README 与项目主体由 AI 辅助编写，贡献者可自行 fork / 修改。
