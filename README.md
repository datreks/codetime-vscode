# CodeTime

[![CodeTime badge](https://img.shields.io/endpoint?style=social&url=https%3A%2F%2Fapi.codetime.dev%2Fshield%3Fid%3D2%26project%3Dcodetime-vscode%26in%3D0)](https://codetime.dev)
![rating](https://img.shields.io/visual-studio-marketplace/stars/Jannchie.codetime)
![installs](https://img.shields.io/visual-studio-marketplace/i/Jannchie.codetime)

CodeTime vscode plugin. Statistical analysis of programming time.

Web Site: [Code Time](https://codetime.dev)

## Previews

![Dash board](images/preview.png)

## Usage

1. Login from web site: [CodeTime](https://codetime.dev).
2. Get token from web site: [CodeTime / settings](https://codetime.dev/dashboard/settings).
3. In VSCode, Press <kbd>F1</kbd>, enter `token` to find the command: `CodeTime: Enter Token`, Press <kbd>Enter</kbd> and then input your token.
4. Write some code, visit the dashboard and check if data is available.

> If using an online IDE like [GitHub Codespaces](https://docs.github.com/en/codespaces), add your token to global ENV variable `CODETIME_TOKEN`.

## Settings

### Status Bar Info

You are able to select what time to show in your status bar by:

- Press <kbd>Ctrl</kbd> (or <kbd>command</kbd> in Mac OS) + <kbd>,</kbd>, then search `codetime` to find the options.
- Press <kbd>F1</kbd>, enter `codetime` to find the options.

Supported options are:

- total: Show total code time
- average: Show average code time.
- today: Show today code time.

### Language / displayLanguage

#### 作用

`displayLanguage` 选项用于切换插件界面的显示语言。你可以根据需要选择特定语言，或使用 "auto" 模式自动跟随 VSCode 的界面语言。

#### 支持的语言

- `auto`：自动模式，跟随 VSCode 当前界面语言
- `en`：English（英语）
- `zh-cn`：简体中文
- `zh-tw`：繁體中文
- `de`：Deutsch（德语）
- `es`：Español（西班牙语）
- `fr`：Français（法语）
- `hi`：हिन्दी（印地语）
- `it`：Italiano（意大利语）
- `ja`：日本語（日语）
- `ko`：한국어（韩语）
- `pt-br`：Português (Brasil)（葡萄牙语-巴西）
- `ru`：Русский（俄语）

#### 切换方法

1. 按 <kbd>Ctrl</kbd>（或 Mac 上的 <kbd>command</kbd>）+ <kbd>,</kbd> 打开设置，搜索 `codetime displayLanguage`。
2. 或按 <kbd>F1</kbd>，输入 `codetime`，在设置中找到 `displayLanguage` 选项进行切换。

#### 开发者本地化说明

插件开发者可通过如下方式获取本地化文本：

```ts
const text = getLocalizedString(key)
```

其中 `key` 为本地化字符串的标识。该方法会根据当前 displayLanguage 返回对应语言的文本。
