import got, { Got, HTTPError, Response } from "got/dist/source";
import * as vscode from "vscode";
import * as os from "os";
import * as events from "./events";
import { getDurationText } from "./getDurationText";
import { v4 } from "uuid";
import osName = require("os-name");
import { appendFile, readFile, unlink } from "fs";

const LOCAL_STORAGE_FILE_NAME = "TempCodetimeData";

export class CodeTime {
  osName = osName();
  setToken() {
    vscode.window
      .showInputBox({
        password: true,
        placeHolder: "CodeTime: Input Your Token (from: codetime.datreks.com)",
      })
      .then((token) => {
        if (token && this.isToken(token)) {
          this.state.update("token", token);
          this.token = token;
          this.getCurrentDuration(true);
        } else {
          vscode.window.showErrorMessage("CodeTime: Token validation failed");
          this.statusBar.text = "$(clock) CodeTime: Cannot Get Token";
          this.statusBar.tooltip = "Enter Token";
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
    this.statusBar.text = "$(clock) CodeTime: Initializing...";
    this.statusBar.show();
    this.setupEventListeners();
    this.getCurrentDuration();
    this.inter = setInterval(() => {
      this.getCurrentDuration();
      // TODO: Upload Local Data
      // this.uploadLocalData();
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
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("codetime")) {
        this.getCurrentDuration();
      }
    });
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
    let workspaceRoot = vscode.workspace.workspaceFolders;
    if (workspaceRoot && editor) {
      let doc = editor.document;
      if (doc) {
        let lang: string = doc.languageId;
        let absoluteFilePath = doc.fileName;
        let relativeFilePath: string = vscode.workspace.asRelativePath(
          absoluteFilePath
        );
        if (relativeFilePath === absoluteFilePath) {
          relativeFilePath = "[other workspace]";
        }
        if (relativeFilePath) {
          let time: number = Date.now();
          let data = {
            project: workspaceName,
            language: lang,
            relativeFile: relativeFilePath,
            absoluteFile: absoluteFilePath,
            editor: "VSCode",
            platform: this.osName,
            eventTime: time,
            eventType: eventName,
            sessionID: this.session,
            platformVersion: os.release(),
            platformArch: os.arch(),
            editorVersion: vscode.version,
            pluginVersion: "0.0.12",
            plugin: "VSCode",
          };
          // Post data
          this.client.post(`eventLog`, { json: data }).catch((e: HTTPError) => {
            if (
              e.response.statusCode === 400 ||
              e.response.statusCode === 403
            ) {
              this.statusBar.text = "$(alert) CodeTime: Token invalid";
              this.statusBar.tooltip = "Enter Token";
              this.statusBar.command = "codetime.getToken";
            } else {
              this.statusBar.text = "$(clock) CodeTime: Temporarily disconnect";
              this.statusBar.command = "codetime.toDashboard";
            }
            // TODO: Append Data To Local
            // this.appendDataToLocal(data);
          });
        }
      }
    }
  }

  private appendDataToLocal(data: {
    project: string | undefined;
    language: string;
    relativeFile: string;
    absoluteFile: string;
    editor: string;
    platform: string;
    eventTime: number;
    eventType: string;
    sessionID: string;
    platformVersion: string;
    platformArch: string;
    editorVersion: string;
    pluginVersion: string;
    plugin: string;
  }) {
    appendFile(LOCAL_STORAGE_FILE_NAME, JSON.stringify(data) + "\n", () => {});
  }

  private uploadLocalData() {
    readFile(LOCAL_STORAGE_FILE_NAME, (_, data) => {
      const dataList = data
        .toString()
        .split("\n")
        .map((row) => this.tryParseJSON(row))
        .filter((d) => d);
      if (dataList.length > 0) {
        this.client.post(`batchEventLog`, { json: dataList }).then(() => {
          unlink(LOCAL_STORAGE_FILE_NAME, () => {
            console.log(`sent batch event log: ${dataList.length} rows`);
          });
        });
      }
    });
  }
  private tryParseJSON(str: string) {
    try {
      const o = JSON.parse(str);
      if (o && typeof o === "object") {
        return o;
      }
    } catch (e) {}
    return null;
  }
  private getCurrentDuration(showSuccess = false) {
    const key = vscode.workspace.getConfiguration("codetime").statusBarInfo;
    if (this.token === "") {
      this.statusBar.text = "$(clock) CodeTime: Without Token";
      this.statusBar.tooltip = "Enter Token";
      this.statusBar.command = "codetime.getToken";
      return;
    }
    this.statusBar.command = "codetime.toDashboard";
    this.statusBar.tooltip = "CodeTime: Head to the dashboard for statistics";
    this.client
      .get(`stats?by=time`)
      .then((res: Response) => {
        let data = res.body as any;
        const sumDuration = data.data.reduce((acc: any, cur: any) => {
          return acc + cur.duration;
        }, 0);
        const avgDuration: number = sumDuration / data.data.length;
        switch (key) {
          case "average":
            this.statusBar.text = `$(watch) ${getDurationText(avgDuration)}`;
            break;
          case "today":
            this.statusBar.text = `$(watch) ${getDurationText(
              data.data[data.data.length - 1].duration
            )}`;
            break;
          default:
            this.statusBar.text = `$(watch) ${getDurationText(sumDuration)}`;
            break;
        }
        if (showSuccess) {
          vscode.window.showInformationMessage(
            "CodeTime: The Token validation was successful, you can see the code time data in dashboard after writing some code. It may take some time to process the data. Please wait for a while."
          );
        }
      })
      .catch((e: HTTPError) => {
        if (e.response.statusCode === 400 || e.response.statusCode === 403) {
          this.statusBar.text = "$(clock) CodeTime: Token invalid";
          this.statusBar.tooltip = "Enter Token";
          this.statusBar.command = "codetime.getToken";
        } else {
          this.statusBar.text = "$(clock) CodeTime: Temporarily disconnect";
          this.statusBar.command = "codetime.toDashboard";
        }
      });
  }
  public codeTimeInStatBar() {
    vscode.window
      .showQuickPick(
        ["Total code time", "Average daily code time", "Today code time"],
        {}
      )
      .then((v) => {
        let key = "total";
        switch (v) {
          case "Average daily code time":
            key = "average";
            break;
          case "Today code time":
            key = "today";
            break;
          default:
            break;
        }
        vscode.workspace
          .getConfiguration("codetime")
          .update("statusBarInfo", key, true)
          .then(() => this.getCurrentDuration());
      });
  }

  public dispose() {
    this.statusBar.dispose();
    this.disposable.dispose();
    clearInterval(this.inter);
  }
}
