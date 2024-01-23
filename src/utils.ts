import { execSync } from 'node:child_process'
import * as vscode from 'vscode'

export function getGitOriginUrl() {
  try {
    const folder = vscode.workspace.workspaceFolders?.[0] ?? null
    if (!folder)
      return ''

    const gitOriginUrl = execSync('git remote get-url origin', {
      cwd: folder.uri.fsPath,
    }).toString().trim()
    // if is fatal: Not a git repository (or any of the parent directories): .git, return empty string
    if (gitOriginUrl.includes('fatal:'))
      return ''

    return gitOriginUrl
  }
  catch (e) {
    console.error('getGitOriginUrl error', e)
    return ''
  }
}

export function getGitCurrentBranch() {
  try {
    const folder = vscode.workspace.workspaceFolders?.[0] ?? null
    if (!folder)
      return ''

    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: folder.uri.fsPath,
    }).toString().trim()
    if (gitBranch.includes('fatal:'))
      return ''
    return gitBranch
  }
  catch (e) {
    console.error('getCurrentBranch error', e)
    return ''
  }
}
