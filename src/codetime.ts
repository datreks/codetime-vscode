import got, { Got, HTTPError, Response } from "got/dist/source";
import * as vscode from "vscode";
import * as os from "os";
import * as events from "./events";
import { getDurationText } from "./getDurationText";
import { v4 } from "uuid";
export class CodeTime {
  setToken() {
    vscode.window
      .showInputBox({
        password: true,
        placeHolder: "Code Time: Input Your Token",
      })
      .then((token) => {
        if (token && this.isToken(token)) {
          this.state.update("token", token);
          this.token = token;
          this.getCurrentDuration();
        } else {
          vscode.window.showErrorMessage("Token validation failed");
          this.statusBar.text = "$(clock) Code Time: Cannot Get Token";
          this.statusBar.command = "codetime.getToken";
          this.token = "";
        }
      });
  }
  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  public disposable!: vscode.Disposable;
  state: vscode.Memento;
  client: Got;
  userId: number;
  token: string = "";
  inter!: NodeJS.Timeout;
  session: string;
  constructor(state: vscode.Memento) {
    console.log(state);
    this.state = state;
    this.userId = this.getUserId();
    this.initSetToken();
    this.client = got.extend({
      prefixUrl: "https://codetime-api.datreks.com",
      responseType: "json",
      hooks: {
        beforeRequest: [
          async (options) => {
            options.headers.token = this.token;
          },
        ],
      },
    });
    this.session = v4();
    this.init();
  }
  getUserId(): number {
    return 2;
  }

  isToken(token: string) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      token
    );
  }

  initSetToken() {
    let token: string | undefined = this.state.get("token");
    this.token = token ? token : "";
    if (this.token === "") {
      this.setToken();
    }
  }

  private init(): void {
    this.statusBar.text = "$(clock) Code Time: Initializing...";
    this.statusBar.show();
    this.setupEventListeners();
    this.getCurrentDuration();
    this.inter = setInterval(() => {
      this.getCurrentDuration();
    }, 60 * 1000);
  }
  private setupEventListeners(): void {
    // subscribe to selection change and editor activation events
    let events: vscode.Disposable[] = [];
    vscode.window.onDidChangeActiveTextEditor(this.onEditor, this, events);
    vscode.window.onDidChangeWindowState(this.onFocus, this, events);
    vscode.workspace.onDidSaveTextDocument(this.onSave, this, events);
    vscode.workspace.onDidChangeTextDocument(this.onEdit, this, events);
    vscode.workspace.onDidCreateFiles(this.onCreate, this, events);
    this.disposable = vscode.Disposable.from(...events);
  }
  private onEdit(e: vscode.TextDocumentChangeEvent) {
    let eventName = events.FILE_EDITED;
    if (
      e.contentChanges.length === 1 &&
      /\r\n|\n|\r/.test(e.contentChanges[0].text)
    ) {
      eventName = events.FILE_ADDED_LINE;
      this.onChange(eventName);
    } else {
      if (Math.random() > 0.9) {
        this.onChange(eventName);
      }
    }
  }
  private onEditor(e: vscode.TextEditor | undefined) {
    this.onChange(events.ACTIVATE_FILE_CHANGED);
  }
  private onFocus(e: vscode.WindowState) {
    this.onChange(events.EDITOR_CHANGED);
  }
  private onCreate() {
    this.onChange(events.FILE_CREATED);
  }
  private onSave(e: vscode.TextDocument) {
    this.onChange(events.FILE_SAVED);
  }
  private onChange(eventName = "unknown") {
    let editor = vscode.window.activeTextEditor;
    let workspaceName = vscode.workspace.name;
    let workspaceRoot = vscode.workspace.rootPath;
    if (workspaceRoot && editor) {
      let doc = editor.document;
      if (doc) {
        let lang: string = doc.languageId;
        let absoluteFilePath = doc.fileName;
        let relativeFilePath: string = vscode.workspace.asRelativePath(
          absoluteFilePath
        );
        if (relativeFilePath === absoluteFilePath) {
          relativeFilePath = "[othor workspace]";
        }
        if (relativeFilePath) {
          let time: number = Date.now();
          let data = {
            project: workspaceName,
            language: lang,
            relativeFile: relativeFilePath,
            absoluteFile: absoluteFilePath,
            editor: "VSCode",
            platform: os.platform(),
            eventTime: time,
            eventType: eventName,
            sessionID: this.session,
            platformVersion: os.release(),
            platformArch: os.arch(),
            editorVersion: vscode.version,
          };
          console.log(workspaceName, lang, relativeFilePath, time, eventName);
          // Post data
          this.client.post(`eventLog`, { json: data }).catch((e: HTTPError) => {
            if (e.response.statusCode === 400) {
              this.statusBar.text = "$(clock) Code Time: Token invalid";
              this.statusBar.command = "codetime.getToken";
            } else {
              this.statusBar.text =
                "$(clock) Code Time: Temporarily disconnect";
              this.statusBar.command = "codetime.toDashboard";
            }
          });
        }
      }
    }
  }

  private getCurrentDuration() {
    if (this.token === "") {
      this.statusBar.text = "$(clock) Code Time: Without Token";
      this.statusBar.command = "codetime.getToken";
      return;
    }
    this.statusBar.command = "codetime.toDashboard";
    this.statusBar.tooltip = "Head to the dashboard for statistics";
    this.client
      .get(`stats/editor?userID=${this.userId}`)
      .then((res: Response) => {
        let data = res.body as any;
        let cEditorDuration: number = 0;
        let sumDuration: number = 0;
        for (let d of data.data) {
          if (d.editor === "VSCode") {
            cEditorDuration = d.duration;
          }
          sumDuration += d.duration;
        }
        let txt = `$(watch) Code Time: ${getDurationText(sumDuration)}`;
        if (cEditorDuration !== sumDuration) {
          txt += `(${getDurationText(cEditorDuration)})`;
        }
        this.statusBar.text = txt;
      })
      .catch((e: HTTPError) => {
        if (e.response.statusCode === 400) {
          this.statusBar.text = "$(clock) Code Time: Token invalid";
          this.statusBar.command = "codetime.getToken";
        } else {
          this.statusBar.text = "$(clock) Code Time: Temporarily disconnect";
          this.statusBar.command = "codetime.toDashboard";
        }
      });
  }

  public dispose() {
    this.statusBar.dispose();
    this.disposable.dispose();
    clearInterval(this.inter);
  }
}
