import * as vscode from "vscode";
export class CodeTime {
  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  public disposable!: vscode.Disposable;

  constructor() {
    this.init();
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
    vscode.window.onDidChangeTextEditorViewColumn(this.onCol, this, events);
    vscode.workspace.onDidSaveTextDocument(this.onSave, this, events);
    this.disposable = vscode.Disposable.from(...events);
  }
  private onEditor() {
    console.log("change editor");
    this.onChange();
  }
  private onFocus() {
    console.log("change focus");
    this.onChange();
  }
  private onCol() {
    console.log("change column");
    this.onChange();
  }
  private onSave() {
    console.log("save file");
    this.onChange();
  }
  private onChange() {
    let editor = vscode.window.activeTextEditor;
    let workspaceName = vscode.workspace.name;
    let workspaceRoot = vscode.workspace.rootPath;
    if (workspaceRoot && editor) {
      let doc = editor.document;
      if (doc) {
        let lang: string = doc.languageId;
        let originName = doc.fileName;
        let file: string = vscode.workspace.asRelativePath(originName);
        if (file === originName) {
          file = "[othor workspace]";
        }
        if (file) {
          let time: number = Date.now();
          console.log(workspaceName, lang, file, time);
        }
      }
    }
  }

  public dispose() {
    this.statusBar.dispose();
    this.disposable.dispose();
    // clearTimeout(this.getCodingActivityTimeout);
  }
}
