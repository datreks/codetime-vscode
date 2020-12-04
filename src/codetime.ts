import got, { Got } from "got/dist/source";
import * as vscode from "vscode";
import * as os from "os";
import * as events from "./events";
export class CodeTime {
  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  public disposable!: vscode.Disposable;
  state: vscode.Memento;
  client: Got;
  constructor(state: vscode.Memento) {
    console.log(state);
    this.state = state;
    this.init();
    this.client = got.extend({
      prefixUrl: "http://codetime.si9ma.com:5000",
      responseType: "json",
    });
  }

  private init(): void {
    this.statusBar.text = "$(clock) Hello, Code Time!";
    this.statusBar.show();
    this.setupEventListeners();
  }
  private setupEventListeners(): void {
    // subscribe to selection change and editor activation events
    let events: vscode.Disposable[] = [];
    vscode.window.onDidChangeActiveTextEditor(this.onEditor, this, events);
    vscode.window.onDidChangeWindowState(this.onFocus, this, events);
    vscode.workspace.onDidSaveTextDocument(this.onSave, this, events);
    vscode.workspace.onDidChangeTextDocument(this.onEdit, this, events);
    this.disposable = vscode.Disposable.from(...events);
  }
  private onEdit(e: vscode.TextDocumentChangeEvent) {
    let eventName = events.FILE_EDITED;
    if (
      e.contentChanges.length === 1 &&
      /\r\n|\n|\r/.test(e.contentChanges[0].text)
    ) {
      eventName = events.FILE_ADDED_LINE;
    }
    this.onChange(eventName);
  }
  private onEditor(e: vscode.TextEditor | undefined) {
    this.onChange(events.ACTIVATE_FILE_CHANGED);
  }
  private onFocus(e: vscode.WindowState) {
    this.onChange(events.EDITOR_CHANGED);
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
            userID: 2,
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

  private saveData() {
    // TODO: Save Record Data In Local
  }

  private postData() {
    // TODO: Post Record Data
  }

  public dispose() {
    this.statusBar.dispose();
    this.disposable.dispose();
    // clearTimeout(this.getCodingActivityTimeout);
  }
}
