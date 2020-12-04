import { CodeTime } from "./codetime";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

let codetime: CodeTime;

export function activate(context: vscode.ExtensionContext) {
  codetime = new CodeTime(context.globalState);
}
export function deactivate() {
  if (codetime) {
    codetime.dispose();
  }
}
