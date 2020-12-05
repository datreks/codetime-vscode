import got, { Got, Response } from "got/dist/source";
import * as vscode from "vscode";
import * as os from "os";
import * as events from "./events";
import { getDurationText } from "./getDurationText";
export class CodeTime {
  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  public disposable!: vscode.Disposable;
  state: vscode.Memento;
  client: Got;
  userId: number;
  inter!: NodeJS.Timeout;
  constructor(state: vscode.Memento) {
    console.log(state);
    this.state = state;
    this.userId = this.getUserId();
    this.client = got.extend({
      prefixUrl: "http://codetime.si9ma.com:5000",
      responseType: "json",
    });
    this.init();
  }
  getUserId(): number {
    return 2;
  }

  private init(): void {
    this.statusBar.text = "$(clock) Hello, Code Time!";
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
            userID: this.userId,
            eventTime: time,
            eventType: eventName,
          };
          console.log(workspaceName, lang, relativeFilePath, time, eventName);
          // Post data
          this.client.post(`eventLog`, { json: data });
        }
      }
    }
  }

  private getCurrentDuration() {
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
      .catch((e) => {
        console.error(e);
      });
  }
  private saveData() {
    // TODO: Save Record Data In Local
  }

  private postData() {
    // TODO: Post Record Data
  }

  public dispose() {
    this.statusBar.dispose();
    this.disposable.dispose();
    clearInterval(this.inter);
    // clearTimeout(this.getCodingActivityTimeout);
  }
}
