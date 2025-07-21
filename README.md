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

#### Purpose

The `displayLanguage` option is used to switch the display language of the plugin interface. You can choose a specific language as needed, or use "auto" mode to automatically follow VSCode's interface language.

#### Supported Languages

- `auto`: Auto mode, follows VSCode's current interface language
- `en`: English
- `zh-cn`: Simplified Chinese
- `zh-tw`: Traditional Chinese
- `de`: Deutsch (German)
- `es`: Español (Spanish)
- `fr`: Français (French)
- `hi`: हिन्दी (Hindi)
- `it`: Italiano (Italian)
- `ja`: 日本語 (Japanese)
- `ko`: 한국어 (Korean)
- `pt-br`: Português (Brasil) (Portuguese-Brazil)
- `ru`: Русский (Russian)

#### How to Switch

1. Press <kbd>Ctrl</kbd> (or <kbd>command</kbd> on Mac) + <kbd>,</kbd> to open settings, search for `codetime displayLanguage`.
2. Or press <kbd>F1</kbd>, enter `codetime`, and find the `displayLanguage` option in settings to switch.
