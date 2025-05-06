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

  private debounce(func: any, wait: number) {
    return (...args: any) => {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => func.apply(this, args), wait)
    }
  }

  setToken() {
    vscode.window
      .showInputBox({
        password: true,
        placeHolder: 'CodeTime: Input Your Token (from: codetime.dev)',
      })
      .then((token) => {
        if (token && this.isToken(token)) {
          this.state.update('token', token)
          this.token = token
          this.getCurrentDuration(true)
        }
        else {
          vscode.window.showErrorMessage('CodeTime: Token validation failed')
          this.statusBar.text = '$(clock) CodeTime: Cannot Get Token'
          this.statusBar.tooltip = 'Enter Token'
          this.statusBar.command = 'codetime.getToken'
          this.token = ''
        }
      })
  }

  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  )

  public disposable!: vscode.Disposable
  state: vscode.Memento
  client: Got
  userId: number
  token: string = ''
  inter!: NodeJS.Timeout
  session: string
  constructor(state: vscode.Memento) {
    this.state = state
    this.userId = this.getUserId()
    this.initSetToken()
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
  }

  getUserId(): number {
    return 2
  }

  isToken(token: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      token,
    )
  }

  initSetToken() {
    const stateToken = this.state.get<string>('token')
    const envToken = process.env.CODETIME_TOKEN
    this.token = envToken || (stateToken || '')
    if (this.token === '') {
      this.setToken()
    }
  }

  private init(): void {
    this.statusBar.text = '$(clock) CodeTime: Initializing...'
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
    vscode.window.onDidChangeTextEditorVisibleRanges(this.onChangeTextEditorVisibleRanges, this, events)
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

  private onChangeTextEditorVisibleRanges = this.debounce((_e: vscode.TextEditorVisibleRangesChangeEvent) => {
    if (_e.textEditor.document.uri.scheme === 'output') {
      return
    }

    this.onChange(events.CHANGE_EDITOR_VISIBLE_RANGES)
  }, 300) // 300毫秒的节流时间

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
          this.out.appendLine(JSON.stringify(data))
          // Post data
          this.client.post(`eventLog`, { json: data }).catch((error: { response: { statusCode: number } }) => {
            this.out.appendLine(`Error: ${error}`)
            // TODO: Append Data To Local
          })
        }
      }
    }
  }

  private getCurrentDuration(showSuccess = false) {
    const key = vscode.workspace.getConfiguration('codetime').statusBarInfo
    if (this.token === '') {
      this.statusBar.text = '$(clock) CodeTime: Without Token'
      this.statusBar.tooltip = 'Enter Token'
      this.statusBar.command = 'codetime.getToken'
      return
    }
    this.statusBar.command = 'codetime.toDashboard'
    this.statusBar.tooltip = 'CodeTime: Head to the dashboard for statistics'
    const minutes = getMinutes(key)
    this.client.get<{ minutes: number }>(`user/minutes?minutes=${minutes}`).then((res: { body: { minutes: any } }) => {
      const { minutes } = res.body
      this.statusBar.text = `$(watch) ${getDurationText(minutes * 60 * 1000)}`
      if (showSuccess) {
        vscode.window.showInformationMessage('CodeTime: Token validation succeeded')
      }
    })
  }

  public codeTimeInStatBar() {
    vscode.window
      .showQuickPick(
        ['Total code time', '24h code time', 'Today code time'],
        {},
      )
      .then((v) => {
        let key = 'total'
        switch (v) {
          case '24h code time': {
            key = '24h'
            break
          }
          case 'Today code time': {
            key = 'today'
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
    case 'today': {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
      const hours = now.getHours()
      minutes = now.getMinutes()
      minutes += hours * 60
      break
    }
    case 'total': {
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
