import { Buffer } from 'node:buffer'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import * as os from 'node:os'
import process from 'node:process'
import tls from 'node:tls'

import osName from 'os-name'
import * as vscode from 'vscode'
import * as events from './events'
import { getDurationText } from './getDurationText'
import { getGitCurrentBranch, getGitOriginUrl } from './utils'

export class CodeTime {
  osName = osName()
  out: vscode.OutputChannel = vscode.window.createOutputChannel('Codetime')
  private debounceTimer?: NodeJS.Timeout
  private secrets: vscode.SecretStorage
  private readonly platformArch = os.arch()
  private authRetryCount = 0
  private readonly maxAuthRetries = 3

  private debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
    return (...args: Parameters<T>) => {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => func.apply(this, args), wait)
    }
  }

  async setToken() {
    const token = await vscode.window.showInputBox({
      password: true,
      placeHolder: vscode.l10n.t('CodeTime: Input Your Token (from: codetime.dev)'),
    })

    if (token) {
      await this.secrets.store('codetime.token', token)
      this.token = token
      this.getCurrentDuration(true)
    }
  }

  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  )

  public disposable!: vscode.Disposable
  state: vscode.Memento
  token: string = ''
  inter!: NodeJS.Timeout
  constructor(state: vscode.Memento, secrets: vscode.SecretStorage) {
    this.state = state
    this.secrets = secrets
    this.initSetToken().then(() => {
      this.init()
    })
  }

  private getProxyUrl(): string {
    return (
      vscode.workspace.getConfiguration('codetime').get<string>('proxy')
      || process.env.HTTPS_PROXY || process.env.HTTP_PROXY
      || process.env.https_proxy || process.env.http_proxy
      || ''
    )
  }

  private apiRequest(method: string, path: string, body?: any): Promise<{ body: string, statusCode: number }> {
    const serverUrl = vscode.workspace.getConfiguration('codetime').serverEntrypoint as string
    const url = new URL(path, serverUrl)
    const payload = body ? JSON.stringify(body) : undefined
    const proxy = this.getProxyUrl()
    const isHttpsTarget = url.protocol === 'https:'
    const targetPort = Number(url.port) || (isHttpsTarget ? 443 : 80)

    const baseHeaders: Record<string, string> = {
      'User-Agent': 'CodeTime Client',
      'Authorization': `Bearer ${this.token}`,
    }
    if (payload) {
      baseHeaders['Content-Type'] = 'application/json'
      baseHeaders['Content-Length'] = Buffer.byteLength(payload).toString()
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      this.out.appendLine(`[Req] ${method} ${path} proxy=${proxy ? this.redactUrlForLogging(proxy) : 'none'}`)

      const finish = (parsed: { statusCode: number, body: string }) => {
        this.out.appendLine(`[Req] ${parsed.statusCode} after ${Date.now() - startTime}ms`)
        if (parsed.statusCode >= 400) {
          const message = parsed.statusCode === 401 ? 'Unauthorized' : `HTTP ${parsed.statusCode}`
          const err = new Error(message) as Error & { response: { statusCode: number, body: string } }
          err.response = { statusCode: parsed.statusCode, body: parsed.body }
          reject(err)
          return
        }
        resolve(parsed)
      }

      // No proxy: use Node's http(s) client directly
      if (!proxy) {
        const lib = isHttpsTarget ? https : http
        const req = lib.request({
          method,
          hostname: url.hostname,
          port: targetPort,
          path: url.pathname + url.search,
          timeout: 30_000,
          headers: baseHeaders,
        }, (res: http.IncomingMessage) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            finish({
              statusCode: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            })
          })
        })
        req.on('error', (e: any) => {
          this.out.appendLine(`[Req] error after ${Date.now() - startTime}ms: ${e.message}`)
          reject(e)
        })
        req.on('timeout', () => req.destroy(new Error('request timeout')))
        if (payload) {
          req.write(payload)
        }
        req.end()
        return
      }

      // With proxy: open TCP/TLS to proxy, then CONNECT (HTTPS target) or absolute-form (HTTP target)
      let proxyUrlParsed: URL
      try {
        proxyUrlParsed = new URL(proxy)
      }
      catch {
        const error = new Error(`Invalid proxy URL: "${this.redactUrlForLogging(proxy)}". Expected format: http://host:port or https://host:port.`)
        this.out.appendLine(`[Req] invalid proxy configuration: ${error.message}`)
        reject(error)
        return
      }
      if (proxyUrlParsed.protocol !== 'http:' && proxyUrlParsed.protocol !== 'https:') {
        const error = new Error(`Unsupported proxy protocol: ${proxyUrlParsed.protocol}. Only http: and https: proxies are supported.`)
        this.out.appendLine(`[Req] invalid proxy configuration: ${error.message}`)
        reject(error)
        return
      }
      const isHttpsProxy = proxyUrlParsed.protocol === 'https:'
      const proxyPort = Number(proxyUrlParsed.port) || (isHttpsProxy ? 443 : 80)
      const proxyHost = proxyUrlParsed.hostname
      const targetAuthority = url.hostname.includes(':') ? `[${url.hostname}]:${targetPort}` : `${url.hostname}:${targetPort}`

      const proxyAuthHeader = proxyUrlParsed.username
        ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(proxyUrlParsed.username)}:${decodeURIComponent(proxyUrlParsed.password)}`).toString('base64')}`
        : ''

      this.out.appendLine(`[Req] connecting to proxy ${proxyHost}:${proxyPort} (${proxyUrlParsed.protocol})`)

      const writeRequestAndRead = (socket: net.Socket | tls.TLSSocket, requestLine: string, extraHeaders: string[] = []) => {
        const lines = [
          requestLine,
          `Host: ${url.host}`,
          ...Object.entries(baseHeaders).map(([k, v]) => `${k}: ${v}`),
          ...extraHeaders,
          'Connection: close',
          '',
          payload || '',
        ]
        socket.write(lines.join('\r\n'))

        const requestTimeout = setTimeout(() => {
          socket.destroy(new Error('request timeout'))
        }, 30_000)

        const chunks: Buffer[] = []
        socket.on('data', (chunk: Buffer) => chunks.push(chunk))
        socket.on('end', () => {
          clearTimeout(requestTimeout)
          socket.destroy()
          try {
            finish(parseHttpResponse(Buffer.concat(chunks)))
          }
          catch (error: any) {
            this.out.appendLine(`[Req] parse error: ${error.message}`)
            reject(error)
          }
        })
        socket.on('error', (e: any) => {
          clearTimeout(requestTimeout)
          this.out.appendLine(`[Req] socket error: ${e.message}`)
          reject(e)
        })
      }

      const onProxyReady = (proxySocket: net.Socket | tls.TLSSocket) => {
        if (!isHttpsTarget) {
          this.out.appendLine(`[Req] proxy connected, sending HTTP request (absolute form)`)
          proxySocket.setTimeout(0)
          writeRequestAndRead(
            proxySocket,
            `${method} ${url.toString()} HTTP/1.1`,
            proxyAuthHeader ? [proxyAuthHeader] : [],
          )
          return
        }

        this.out.appendLine(`[Req] proxy connected, sending CONNECT`)
        const connectLines = [
          `CONNECT ${targetAuthority} HTTP/1.1`,
          `Host: ${targetAuthority}`,
          ...(proxyAuthHeader ? [proxyAuthHeader] : []),
          'Proxy-Connection: keep-alive',
          '',
          '',
        ]
        proxySocket.write(connectLines.join('\r\n'))

        let connectBuf = Buffer.alloc(0)
        const onConnectData = (chunk: Buffer) => {
          connectBuf = Buffer.concat([connectBuf, chunk])
          const idx = connectBuf.indexOf('\r\n\r\n')
          if (idx === -1) {
            return
          }
          proxySocket.removeListener('data', onConnectData)
          const headerStr = connectBuf.slice(0, idx).toString('utf8')
          const statusLine = headerStr.split('\r\n')[0]
          this.out.appendLine(`[Req] proxy response: ${statusLine}`)
          const m = statusLine.match(/^HTTP\/\d\.\d (\d{3})/)
          if (!m || m[1] !== '200') {
            proxySocket.destroy()
            reject(new Error(`Proxy CONNECT failed: ${statusLine}`))
            return
          }
          proxySocket.setTimeout(0)
          const residue = connectBuf.slice(idx + 4)
          if (residue.length > 0) {
            proxySocket.unshift(residue)
          }
          const tlsSocket = tls.connect({ socket: proxySocket, servername: url.hostname }, () => {
            this.out.appendLine(`[Req] TLS handshake done, sending HTTP request`)
            writeRequestAndRead(tlsSocket, `${method} ${url.pathname + url.search} HTTP/1.1`)
          })
          tlsSocket.on('error', (e: any) => {
            this.out.appendLine(`[Req] TLS error: ${e.message}`)
            reject(e)
          })
        }
        proxySocket.on('data', onConnectData)
      }

      const proxySocket: net.Socket | tls.TLSSocket = isHttpsProxy
        ? tls.connect({ host: proxyHost, port: proxyPort, servername: proxyHost }, () => onProxyReady(proxySocket))
        : net.connect(proxyPort, proxyHost, () => onProxyReady(proxySocket))
      proxySocket.setTimeout(10_000, () => {
        proxySocket.destroy()
        reject(new Error('Proxy connection timeout'))
      })
      proxySocket.on('error', (e: any) => {
        this.out.appendLine(`[Req] proxy socket error: ${e.code || ''} ${e.message}`)
        reject(e)
      })
    })
  }

  async initSetToken() {
    const secretToken = await this.secrets.get('codetime.token')
    const envToken = process.env.CODETIME_TOKEN

    if (secretToken) {
      this.token = secretToken
    }
    else if (envToken) {
      this.token = envToken
      await this.secrets.store('codetime.token', envToken)
    }
    else {
      const stateToken = this.state.get<string>('token')
      if (stateToken) {
        this.token = stateToken
        await this.secrets.store('codetime.token', stateToken)
        this.state.update('token', undefined)
      }
    }

    if (this.token === '') {
      await this.setToken()
    }
  }

  private redactUrlForLogging(url?: string): string {
    if (!url) {
      return '(none)'
    }

    try {
      const parsed = new URL(url)
      parsed.username = ''
      parsed.password = ''
      parsed.pathname = ''
      parsed.search = ''
      parsed.hash = ''
      return `${parsed.protocol}//${parsed.host}`
    }
    catch {
      return '(configured)'
    }
  }

  private init(): void {
    this.out.appendLine(`[Init] proxy=${this.redactUrlForLogging(this.getProxyUrl())}`)
    this.out.appendLine(`[Init] serverEntrypoint=${vscode.workspace.getConfiguration('codetime').serverEntrypoint}`)
    this.out.appendLine(`[Init] token=${this.token ? `***${this.token.slice(-4)}` : '(empty)'}`)

    this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Initializing...')}`
    this.statusBar.show()
    this.setupEventListeners()
    this.getCurrentDuration()
    this.inter = setInterval(() => {
      this.getCurrentDuration()
    }, 60 * 1000)
  }

  private setupEventListeners(): void {
    // subscribe to selection change and editor activation events
    const events: vscode.Disposable[] = []
    vscode.workspace.onDidChangeTextDocument(this.onEdit, this, events)
    vscode.window.onDidChangeActiveTextEditor(this.onEditor, this, events)
    vscode.window.onDidChangeTextEditorSelection(this.onChangeTextEditorSelection, this, events)
    vscode.window.onDidChangeTextEditorVisibleRanges(this.debounce(this.onChangeTextEditorVisibleRanges, 300), this, events)
    vscode.window.onDidChangeWindowState(this.onFocus, this, events)
    vscode.workspace.onDidSaveTextDocument(this.onSave, this, events)
    vscode.workspace.onDidCreateFiles(this.onCreate, this, events)
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('codetime')) {
        this.getCurrentDuration()
      }
    })
    this.disposable = vscode.Disposable.from(...events)
  }

  private onEdit(e: vscode.TextDocumentChangeEvent) {
    let eventName = events.FILE_EDITED
    // 如果 document 是 output channel 的话，不记录
    if (e.document.uri.scheme === 'output') {
      return
    }

    if (e.contentChanges.length === 1
      && /\r\n|\n|\r/.test(e.contentChanges[0].text)) {
      eventName = events.FILE_ADDED_LINE
      this.onChange(eventName)
    }
    else if (Math.random() > 0.9) {
      this.onChange(eventName)
    }
  }

  private onEditor(_e: vscode.TextEditor | undefined) {
    this.onChange(events.ACTIVATE_FILE_CHANGED)
  }

  private onChangeTextEditorSelection(e: vscode.TextEditorSelectionChangeEvent) {
    if (e.textEditor.document.uri.scheme === 'output') {
      return
    }

    if (Math.random() > 0.9) {
      this.onChange(events.CHANGE_EDITOR_SELECTION)
    }
  }

  private onChangeTextEditorVisibleRanges(_e: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (_e.textEditor.document.uri.scheme === 'output') {
      return
    }

    this.onChange(events.CHANGE_EDITOR_VISIBLE_RANGES)
  }

  private onFocus(_e: vscode.WindowState) {
    this.onChange(events.EDITOR_CHANGED)
  }

  private onCreate() {
    this.onChange(events.FILE_CREATED)
  }

  private onSave(_e: vscode.TextDocument) {
    this.onChange(events.FILE_SAVED)
  }

  private getOperationType(eventName = 'unknown'): 'read' | 'write' {
    switch (eventName) {
      case events.FILE_CREATED:
      case events.FILE_EDITED:
      case events.FILE_ADDED_LINE:
      case events.FILE_REMOVED:
      case events.FILE_SAVED: {
        return 'write'
      }
      default: {
        return 'read'
      }
    }
  }

  private onChange(eventName = 'unknown') {
    const editor = vscode.window.activeTextEditor
    const workspaceName = vscode.workspace.name
    const workspaceRoot = vscode.workspace.workspaceFolders
    if (workspaceRoot && editor) {
      const doc = editor.document
      if (doc) {
        const lang = doc.languageId
        const absoluteFilePath = doc.fileName
        let relativeFilePath = vscode.workspace.asRelativePath(
          absoluteFilePath,
        )
        if (relativeFilePath === absoluteFilePath) {
          relativeFilePath = '[other workspace]'
        }

        if (relativeFilePath) {
          const time = Date.now()
          const origin = getGitOriginUrl()
          const branch = getGitCurrentBranch()
          const data = {
            project: workspaceName,
            language: lang,
            relativeFile: relativeFilePath,
            absoluteFile: absoluteFilePath,
            editor: vscode.env.appName,
            platform: this.osName,
            eventTime: time,
            eventType: eventName,
            platformArch: this.platformArch,
            gitOrigin: origin,
            gitBranch: branch,
            operationType: this.getOperationType(eventName),
          }
          this.out.appendLine(JSON.stringify({ ...data, token: undefined }))
          // Post data
          if (this.token === '') {
            this.out.appendLine('Token is empty, cannot send event data')
            this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Without Token')}`
            this.statusBar.tooltip = vscode.l10n.t('Enter Token')
            this.statusBar.command = 'codetime.getToken'
            return
          }
          this.apiRequest('POST', '/v3/users/event-log', data).catch((error: any) => {
            if (error.response?.statusCode === 401) {
              this.handleAuthError()
            }
            else {
              this.out.appendLine(`Error: ${error}`)
            }
          })
        }
      }
    }
  }

  private handleAuthError() {
    this.authRetryCount++

    if (this.authRetryCount <= this.maxAuthRetries) {
      this.out.appendLine(`Authentication failed, retrying (${this.authRetryCount}/${this.maxAuthRetries})...`)
      this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Auth Failed')}`
      this.statusBar.tooltip = vscode.l10n.t('CodeTime: Authentication retry, please wait...')
      this.statusBar.command = 'codetime.getToken'
    }
    else {
      this.out.appendLine('Max authentication retries exceeded, token invalid')
      this.handleTokenInvalid()
    }
  }

  private handleTokenInvalid() {
    this.authRetryCount = 0
    this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Token Invalid')}`
    this.statusBar.tooltip = vscode.l10n.t('Enter Token')
    this.statusBar.command = 'codetime.getToken'
  }

  private resetAuthRetryCount() {
    this.authRetryCount = 0
  }

  private getCurrentDuration(showSuccess = false) {
    const config = vscode.workspace.getConfiguration('codetime')
    const key = config.statusBarInfo
    if (this.token === '') {
      this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Without Token')}`
      this.statusBar.tooltip = vscode.l10n.t('Enter Token')
      this.statusBar.command = 'codetime.getToken'
      return
    }
    let currentLanguage = config.displayLanguage.title
    if (currentLanguage === 'Auto') {
      currentLanguage = vscode.env.language
    }
    this.statusBar.command = 'codetime.toDashboard'
    this.statusBar.tooltip = vscode.l10n.t('CodeTime: Head to the dashboard for statistics')
    const minutes = getMinutes(key)
    this.apiRequest('GET', `/v3/users/self/minutes?minutes=${minutes}`).then(async (res: any) => {
      const data = JSON.parse(res.body)
      const { minutes } = data
      this.out.appendLine(`Current duration: ${minutes} minutes`)
      this.statusBar.text = `$(watch) ${await getDurationText(minutes, currentLanguage)}`
      this.out.appendLine(await getDurationText(minutes, currentLanguage))
      this.resetAuthRetryCount()
      if (showSuccess) {
        vscode.window.showInformationMessage(vscode.l10n.t('CodeTime: Token validation succeeded'))
      }
    }).catch((error: any) => {
      if (error.response?.statusCode === 401) {
        this.handleAuthError()
      }
      else {
        this.out.appendLine(`[Duration] Network error: ${error.message || error}`)
        if (error.code) {
          this.out.appendLine(`[Duration] Error code: ${error.code}`)
        }
        this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Network Error')}`
        this.statusBar.tooltip = vscode.l10n.t('CodeTime: Network connection failed')
        this.statusBar.command = 'codetime.toDashboard'
      }
    })
  }

  public codeTimeInStatBar() {
    vscode.window
      .showQuickPick(
        [
          vscode.l10n.t('Total code time'),
          vscode.l10n.t('24h code time'),
          vscode.l10n.t('Today code time'),
        ],
        {},
      )
      .then((v) => {
        let key = 'Total'
        switch (v) {
          case vscode.l10n.t('24h code time'): {
            key = '24h'
            break
          }
          case vscode.l10n.t('Today code time'): {
            key = 'Today'
            break
          }
          default: {
            break
          }
        }
        vscode.workspace
          .getConfiguration('codetime')
          .update('statusBarInfo', key, true)
          .then(() => this.getCurrentDuration())
      })
  }

  public dispose() {
    this.statusBar.dispose()
    this.disposable.dispose()
    clearInterval(this.inter)
  }
}

function parseHttpResponse(buf: Buffer): { statusCode: number, body: string } {
  const headerEnd = buf.indexOf('\r\n\r\n')
  if (headerEnd === -1) {
    throw new Error('Incomplete HTTP response (no header terminator)')
  }
  const headerText = buf.slice(0, headerEnd).toString('utf8')
  const lines = headerText.split('\r\n')
  const statusLine = lines[0] || ''
  const m = statusLine.match(/^HTTP\/\d\.\d (\d{3})/)
  if (!m) {
    throw new Error(`Invalid status line: ${statusLine}`)
  }
  const statusCode = Number(m[1])
  const headers = new Map<string, string>()
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(':')
    if (idx > 0) {
      headers.set(lines[i].slice(0, idx).trim().toLowerCase(), lines[i].slice(idx + 1).trim())
    }
  }
  const rawBody = buf.slice(headerEnd + 4)
  const isChunked = (headers.get('transfer-encoding') || '').toLowerCase().includes('chunked')
  const bodyBuf = isChunked ? decodeChunked(rawBody) : rawBody
  return { statusCode, body: bodyBuf.toString('utf8') }
}

function decodeChunked(buf: Buffer): Buffer {
  const out: Buffer[] = []
  let offset = 0
  while (offset < buf.length) {
    const sizeLineEnd = buf.indexOf('\r\n', offset)
    if (sizeLineEnd === -1) {
      break
    }
    const sizeHex = buf.slice(offset, sizeLineEnd).toString('utf8').split(';')[0].trim()
    const size = Number.parseInt(sizeHex, 16)
    if (Number.isNaN(size)) {
      throw new TypeError(`Invalid chunk size: ${sizeHex}`)
    }
    if (size === 0) {
      break
    }
    const dataStart = sizeLineEnd + 2
    out.push(buf.slice(dataStart, dataStart + size))
    offset = dataStart + size + 2
  }
  return Buffer.concat(out)
}

function getMinutes(key: string) {
  let minutes = 60 * 24
  switch (key) {
    case 'Today': {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
      const hours = now.getHours()
      minutes = now.getMinutes()
      minutes += hours * 60
      break
    }
    case 'Total': {
      minutes = 60 * 24 * 365 * 100
      break
    }
    case '24h': {
      minutes = 60 * 24
      break
    }
    default: {
      minutes = 60 * 24 * 365 * 100
      break
    }
  }
  return minutes
}
