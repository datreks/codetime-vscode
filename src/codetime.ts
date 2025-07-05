import type { Got } from 'got'
import * as os from 'node:os'
import process from 'node:process'
import { got } from 'got'

import osName from 'os-name'
import { v4 } from 'uuid'
import * as vscode from 'vscode'
import * as events from './events'
import { getDurationText } from './getDurationText'
import { getGitCurrentBranch, getGitOriginUrl } from './utils'

export class CodeTime {
  osName = osName()
  out: vscode.OutputChannel = vscode.window.createOutputChannel('Codetime')
  private debounceTimer?: NodeJS.Timeout
  private secrets: vscode.SecretStorage

  private debounce(func: any, wait: number) {
    return (...args: any) => {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => func.apply(this, args), wait)
    }
  }

  async setToken() {
    const token = await vscode.window.showInputBox({
      password: true,
      placeHolder: vscode.l10n.t('CodeTime: Input Your Token (from: codetime.dev)'),
    })

    if (token && this.isToken(token)) {
      await this.secrets.store('codetime.token', token)
      this.token = token
      this.getCurrentDuration(true)
    }
    else {
      vscode.window.showErrorMessage(vscode.l10n.t('CodeTime: Token validation failed'))
      this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Cannot Get Token')}`
      this.statusBar.tooltip = vscode.l10n.t('Enter Token')
      this.statusBar.command = 'codetime.getToken'
      this.token = ''
    }
  }

  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  )

  public disposable!: vscode.Disposable
  state: vscode.Memento
  client!: Got
  userId: number
  token: string = ''
  inter!: NodeJS.Timeout
  session!: string
  constructor(state: vscode.Memento, secrets: vscode.SecretStorage) {
    this.state = state
    this.secrets = secrets
    this.userId = this.getUserId()
    this.initSetToken().then(() => {
      this.client = got.extend({
        prefixUrl: vscode.workspace.getConfiguration('codetime').serverEntrypoint,
        responseType: 'json',
        headers: {
          'User-Agent': 'CodeTime Client',
        },
        hooks: {
          beforeRequest: [
            (options: any) => {
              if (options.headers) {
                options.headers.token = this.token
              }
            },
          ],
        },
      })
      this.session = v4()
      this.init()
    })
  }

  getUserId(): number {
    return 2
  }

  isToken(token: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      token,
    )
  }

  async initSetToken() {
    const secretToken = await this.secrets.get('codetime.token')
    const envToken = process.env.CODETIME_TOKEN

    if (secretToken && this.isToken(secretToken)) {
      this.token = secretToken
    }
    else if (envToken && this.isToken(envToken)) {
      this.token = envToken
      await this.secrets.store('codetime.token', envToken)
    }
    else {
      const stateToken = this.state.get<string>('token')
      if (stateToken && this.isToken(stateToken)) {
        this.token = stateToken
        await this.secrets.store('codetime.token', stateToken)
        this.state.update('token', undefined)
      }
    }

    if (this.token === '') {
      this.setToken()
    }
  }

  private init(): void {
    this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Initializing...')}`
    this.statusBar.show()
    this.setupEventListeners()
    this.getCurrentDuration()
    this.inter = setInterval(() => {
      this.getCurrentDuration()
      // TODO: Upload Local Data
      // this.uploadLocalData();
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

  platfromVersion = os.release()
  platfromArch = os.arch()

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
        const lang: string = doc.languageId
        const absoluteFilePath = doc.fileName
        let relativeFilePath: string = vscode.workspace.asRelativePath(
          absoluteFilePath,
        )
        if (relativeFilePath === absoluteFilePath) {
          relativeFilePath = '[other workspace]'
        }

        if (relativeFilePath) {
          const time: number = Date.now()
          const origin = getGitOriginUrl()
          const branch = getGitCurrentBranch()
          const data = {
            project: workspaceName,
            language: lang,
            relativeFile: relativeFilePath,
            absoluteFile: absoluteFilePath,
            editor: 'VSCode',
            platform: this.osName,
            eventTime: time,
            eventType: eventName,
            platformArch: this.platfromArch,
            plugin: 'VSCode',
            gitOrigin: origin,
            gitBranch: branch,
            operationType: this.getOperationType(eventName),
          }
          this.out.appendLine(JSON.stringify({ ...data, token: undefined }))
          // Post data
          this.client.post(`eventLog`, { json: data }).catch((error: { response: { statusCode: number } }) => {
            if (error.response?.statusCode === 401) {
              this.out.appendLine('Token authentication failed')
              this.token = ''
              this.secrets.delete('codetime.token')
              this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Token Invalid')}`
              this.statusBar.tooltip = vscode.l10n.t('Enter Token')
              this.statusBar.command = 'codetime.getToken'
            }
            else {
              this.out.appendLine(`Error: ${error}`)
            }
            // TODO: Append Data To Local
          })
        }
      }
    }
  }

  private getCurrentDuration(showSuccess = false) {
    const key = vscode.workspace.getConfiguration('codetime').statusBarInfo
    if (this.token === '' || !this.isToken(this.token)) {
      this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Without Token')}`
      this.statusBar.tooltip = vscode.l10n.t('Enter Token')
      this.statusBar.command = 'codetime.getToken'
      return
    }
    let currentLanguage = vscode.workspace.getConfiguration('codetime').displayLanguage.title
    if (currentLanguage === 'Auto') {
      currentLanguage = vscode.env.language
    }
    this.statusBar.command = 'codetime.toDashboard'
    this.statusBar.tooltip = vscode.l10n.t('CodeTime: Head to the dashboard for statistics')
    const minutes = getMinutes(key)
    this.client.get<{ minutes: number }>(`user/minutes?minutes=${minutes}`).then(async (res: { body: { minutes: any } }) => {
      const { minutes } = res.body
      this.statusBar.text = `$(watch) ${await getDurationText(minutes, currentLanguage)}`
      if (showSuccess) {
        vscode.window.showInformationMessage(vscode.l10n.t('CodeTime: Token validation succeeded'))
      }
    }).catch((error) => {
      this.out.appendLine(`Token validation failed: ${error.message || error}`)
      this.statusBar.text = `$(clock) ${vscode.l10n.t('CodeTime: Token Invalid')}`
      this.statusBar.tooltip = vscode.l10n.t('Enter Token')
      this.statusBar.command = 'codetime.getToken'
      this.token = ''
      this.secrets.delete('codetime.token')
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
