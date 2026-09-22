# CC Switch Importer for linux.do

在 [linux.do](https://linux.do) 选中分享的 API 地址、Key 或配置文本，脚本会在浏览器本地解析内容，并通过 [CC Switch](https://github.com/farion1231/cc-switch) 导入到 **Claude Code** 或 **Codex**。确认卡中的 Key 保持脱敏，也可以点击复制图标获取当前候选的完整 Key。

**[安装用户脚本](https://raw.githubusercontent.com/Super-YYQ/ccswitch-linuxdo-importer/release/userscript/ccswitch-linuxdo-importer.user.js)** · [最新 Release](https://github.com/Super-YYQ/ccswitch-linuxdo-importer/releases/latest) · [反馈问题](https://github.com/Super-YYQ/ccswitch-linuxdo-importer/issues)

## 快速开始

### 安装

1. 在 Chrome、Edge 或 Firefox 中安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 安装并至少运行一次 [CC Switch](https://github.com/farion1231/cc-switch/releases)，让系统注册 `ccswitch://` 协议。
3. 打开上方的“安装用户脚本”链接，由 Tampermonkey 接管安装；也可以从 [GitHub Releases](https://github.com/Super-YYQ/ccswitch-linuxdo-importer/releases) 下载 `.user.js` 文件。
4. 访问 [linux.do](https://linux.do)，选中帖子中的一段配置文本。

安装脚本和自动更新地址指向 `release` 分支；`main` 分支只保存源码、测试和文档。若曾从旧的 `main` 地址安装，请卸载旧脚本，再通过上面的安装链接重新安装。

### 使用

1. 选中含 API 地址、Key 或配置块的文本。
2. 点击蓝色悬浮按钮 **“导入 ccSwitch”**。
3. 在确认卡中核对 endpoint、脱敏 Key、模型和目标应用。存在多组 URL/Key 时，使用 **‹ / ›** 切换候选。
4. 按需调整模型，以及是否携带完整配置或风险附加参数。
5. 选择操作：

| 操作 | 效果 |
| --- | --- |
| Key 旁的复制图标 | 复制当前候选的完整 Key，界面仍保持脱敏；支持鼠标和键盘操作 |
| 推荐地址旁的“复制地址” | 仅在主题标题明确为 OpenCode GO、选区有 Key 但没有地址时显示；按模型对应的接口复制官方地址 |
| 复制深链 | 复制当前导入链接，供手动使用 |
| 打开导入 | 尝试唤起 CC Switch，不会自动写入剪贴板 |
| 取消或 `Escape` | 关闭确认卡 |

未识别到 Key 时，复制图标不可用。复制成功或失败都会显示提示。推荐地址来自主题标题和 OpenCode 官方文档，不会自动写入导入深链；只有 Key 且主题标题无法确定服务商时，确认卡会提示手动查找地址。

## 支持范围

脚本只在 `linux.do` 和 `www.linux.do` 生效，导入目标为 **Claude Code** 和 **Codex**。无法确定目标时可以手动选择；已有深链若明确指定其他应用，脚本会阻止将其改写为 Claude Code 或 Codex。

### 分享格式

| 格式 | 示例或处理方式 |
| --- | --- |
| CC Switch 深链 | `ccswitch://v1/import?...`，仅处理 provider 导入 |
| JSON | `baseUrl` / `endpoint` 配合 `apiKey`，或包含 `env` 的完整配置 |
| 环境变量 | `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`OPENAI_*` 等 |
| TOML / 键值文本 | `base_url = "..."`、`api_key = "..."` |
| Base64 | 编码后的配置、Key 或 Key 字段片段；支持部分多层编码形式 |
| 混排与表格 | 中文说明、URL、Key 混排，以及 `url：` / `key：`、标签和值分行等形式 |

可识别 `sk-`、`sk-ant-`、`g2a_`、`tp-`、`ark-`、`xai-`、`gsk_`、`pplx-`、`r8_`、`hf_`、`fw_`、`oc_sk_` 等常见 Key 前缀。单独选中的长随机串也会作为待核对的 Key 候选，支持明文或 Base64；从一大段文字中提取无固定前缀的 Base64 Key 时仍要求地址、解码提示等上下文，以减少误判。

火山引擎方舟的 Anthropic `/api/coding` 与 OpenAI `/api/coding/v3` 地址也有对应识别逻辑。分享内容中的零宽字符、部分中文水印、折行和链接化文本会在解析时处理。

### 模型选择

| 文本内容 | 行为 |
| --- | --- |
| 仅识别到一个模型 | 自动填入 `model` |
| 识别到多个模型 | Claude Code 优先 Claude / Sonnet，Codex 优先 GPT / o 系列；其他模型仍可选 |
| 切换目标应用 | 重新计算默认模型；仍然有效的手动选择会保留 |
| 只有“支持所有模型”等描述 | 不自动填入模型 |

已识别的 Claude 快照 ID 会保留日期和版本信息，例如 `claude-sonnet-4-5-20250929`。模型来自选中文本，脚本不会访问供应商接口查询模型列表。

## 解析示例

以下示例全部使用合成数据，不包含可用密钥。

### 环境变量

```text
ANTHROPIC_BASE_URL=https://relay.example.invalid/v1
ANTHROPIC_AUTH_TOKEN=sk-ant-api03-TESTONLY-readme-fixture
```

### JSON

```json
{
  "name": "Example Relay",
  "baseUrl": "https://relay.example.invalid/v1",
  "apiKey": "sk-ant-api03-TESTONLY-readme-fixture"
}
```

### 全角标签与 Base64 Key

```text
url：https://relay.example.invalid/v1
key（Base64）：c2stYW50LWFwaTAzLVRFU1RPTkxZLXJlYWRtZS1maXh0dXJl
```

### 表格与分行 Key

```text
Base URL    https://relay.example.invalid/v1
API Key（Base64，请自行解码）
c2stYW50LWFwaTAzLVRFU1RPTkxZLXJlYWRtZS1maXh0dXJl
模型设置    gpt-5.5，claude-sonnet-4-6
```

## 隐私与安全

- **本地解析**：不上传或在线验证 Key，也不监听剪贴板内容。
- **脱敏显示**：确认卡隐藏 Key 中间部分；只有主动点击复制图标或“复制深链”时，才会写入剪贴板。
- **配置检查**：递归检查完整配置中的字段和环境变量。进程控制、命令、脚本、远程配置及未知字段默认不携带；风险或未知深链参数需要显式勾选。
- **地址校验**：endpoint 只允许 HTTP(S)。本机 HTTP 可用；非本机 HTTP 会提示未加密风险；包含账号密码或使用其他协议的地址会被阻止。
- **长度限制**：选区超过 64 KiB 时只解析开头和结尾，并提示中间内容已省略。最终深链最多 8,000 个字符，超限时不能复制或打开。
- **保密建议**：导入前核对地址和配置来源；截图、Issue 和提交记录中不要包含真实 Key。

## 常见问题

### 选中文字后没有出现按钮

确认脚本已启用，并且当前页面属于支持站点。尽量完整选中地址、Key 或配置块，不要只选说明文字。

### Key 显示为 `****`，怎样复制原值？

点击 Key 旁的复制图标。此功能从 v1.2.11 起提供，旧版本需要先更新。

### 点击“打开导入”没有反应

确认已安装并运行过 CC Switch，且系统已经注册 `ccswitch://` 协议。也可以点击“复制深链”，再将链接粘贴到地址栏尝试打开。

### 仓库有新提交，用户脚本却没有更新

源码推送和正式发布是两件事。只有创建并推送与包版本一致的 `v*` 标签、Release 工作流成功后，`release` 分支中的安装脚本才会更新。

### 提示深链过长

取消携带完整配置或风险附加参数，或者缩小选区、缩短输入字段后重试。

### 模型没有识别出来

确认选中文本包含具体且已支持的模型 ID。有多个候选模型时，可以在确认卡的下拉框中手动选择。

## 本地开发

项目要求 **Node.js 18 或更高版本**。

```bash
npm ci
npx playwright install chromium
npm run check
```

| 命令 | 用途 |
| --- | --- |
| `npm test` | 运行解析器、模型提取、发布守卫单元测试及格式变体验证 |
| `npm run test:browser` | 先构建，再运行 Chromium 交互测试 |
| `npm run build` | 将源码打包为单文件油猴脚本 |
| `npm run check` | 运行完整的单元与浏览器检查 |

本地构建产物为 `userscript/ccswitch-linuxdo-importer.user.js`，已被 Git 忽略。修改源码后需重新构建，再安装到 Tampermonkey 验证。

### 目录结构

| 路径 | 职责 |
| --- | --- |
| [`userscript/ui-main.js`](userscript/ui-main.js) | 选区识别、确认卡、复制和导入交互 |
| [`userscript/lib/core.mjs`](userscript/lib/core.mjs) | 配置解析、归一化、风险检查和深链构建 |
| [`userscript/lib/model-extractor.mjs`](userscript/lib/model-extractor.mjs) | 模型提取和默认选择 |
| [`scripts/build.mjs`](scripts/build.mjs) | 打包脚本、注入版本及安装更新地址 |
| [`scripts/release-guard.mjs`](scripts/release-guard.mjs) | 版本比较和发布产物哈希检查 |
| [`tests/`](tests/) | 单元、格式变体和浏览器回归测试 |
| [`.github/workflows/`](.github/workflows/) | CI 与标签触发的发布工作流 |
| [`docs/superpowers/`](docs/superpowers/) | 项目设计与实施记录 |

## 发布说明

| 分支 | 内容 |
| --- | --- |
| `main` | 源码、测试和文档；普通推送只触发 CI |
| `release` | 正式安装脚本，由发布工作流维护，也是 Tampermonkey 的更新来源 |

只更新源码或文档时，提交并推送 `main` 即可，不需要发布标签。正式发版流程如下：

1. 同步更新 `package.json` 和 `package-lock.json` 中的版本号。
2. 运行 `npm run check`，将通过验证的改动提交并推送到 `main`。
3. 为该提交创建 `v<版本号>` 标签并推送；标签必须与包版本一致。
4. 等待 [Release 工作流](.github/workflows/release.yml) 完成，核对 GitHub Release 附件和 `release` 分支脚本。

发布流程先以只读权限测试和构建，再通过版本及 SHA-256 守卫发布。它会阻止版本降级，以及用不同内容覆盖同一版本。

## 版本记录

- **v1.2.13** — 支持识别单独选中的 OpenCode GO Base64 Key 及无固定前缀的长 Key；主题标题明确为 OpenCode GO 时提供可复制的官方接口地址，不自动填入导入深链。
- **v1.2.12** — 修复未引号字段片段 Key 误导入、论坛链接误识别为 endpoint、TOML 配置默认丢失等解析问题；模型识别更新至 gpt-5 家族、gpt-4.1、o4-mini、claude-3.7-sonnet 及 glm/qwen/kimi/doubao 等；改进候选一致性与滚动性能。
- **v1.2.11** — 确认卡新增紧凑复制图标，可在 Key 脱敏状态下复制当前候选的完整值；支持悬停提示与键盘操作，并补充复制相关浏览器回归验证。
- **v1.2.10** — 加强超长选区、配置风险、endpoint、深链长度、模型选择、键盘操作和发布安全，并加入 Chromium 回归门禁。
- **v1.2.9** — 修复 Base64 解码结果为 Key 字段片段时无法提取真实值的问题。
- **v1.2.8** — 修复 Base64 Key 与独立 `base_url` 跨解析器合并后丢失 endpoint 的问题。
- **v1.2.7** — 扩展无固定前缀 Key、多个厂商前缀及 linux.do 常见文本格式支持。

更早版本及完整变更说明见 [GitHub Releases](https://github.com/Super-YYQ/ccswitch-linuxdo-importer/releases)。

## 许可证

[MIT License](LICENSE) · © 2026 CC Switch Importer Contributors

本项目代码与文档由 AI 辅助编写，请审查后使用。
