import { CodeTime } from "./codetime";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import {verbose} from "sqlite3";
let codetime: CodeTime;

function connectToDB(context: vscode.ExtensionContext) {
  const globalStoragePath = context.globalStorageUri;
  const dbPath = globalStoragePath.fsPath;
  const sqlite3 = verbose();
  const fs = require("fs");
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
  }
  const db = new sqlite3.Database(`${dbPath}/codetime.db`);
  return db;
}

export function activate(context: vscode.ExtensionContext) {
  const db = connectToDB(context);
  codetime = new CodeTime(context.globalState, db);
  vscode.commands.registerCommand("codetime.getToken", () => {
    codetime.setToken();
  });
  vscode.commands.registerCommand("codetime.codeTimeInStatusBar", () => {
    codetime.codeTimeInStatBar();
  });
  vscode.commands.registerCommand("codetime.toDashboard", () => {
    let url = `https://codetime.datreks.com/dashboard`;
    vscode.env.openExternal(vscode.Uri.parse(url));
  });
}

export function deactivate() {
  if (codetime) {
    codetime.dispose();
  }
}
