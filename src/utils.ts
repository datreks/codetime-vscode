import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'

/**
 * Checks if git commands should be executed based on git.autoRepositoryDetection setting
 * @param folder The workspace folder to check
 * @returns boolean indicating if git commands should be executed
 */
function shouldExecuteGitCommands(folder: vscode.WorkspaceFolder | null): boolean {
  if (!folder) {
    return false
  }

  // Get git.autoRepositoryDetection setting
  const config = vscode.workspace.getConfiguration('git')
  const autoRepoDetection = config.get<string | boolean>('autoRepositoryDetection')

  // If setting is 'false', don't execute git commands
  if (autoRepoDetection === false) {
    return false
  }

  // If setting is 'true' or 'openEditors', always try to execute git commands
  if (autoRepoDetection === true || autoRepoDetection === 'openEditors') {
    return true
  }

  // For 'subFolders' (default), check if .git directory exists in the folder
  if (autoRepoDetection === 'subFolders') {
    const gitDir = path.join(folder.uri.fsPath, '.git')
    return fs.existsSync(gitDir)
  }

  // Default to true if setting is unrecognized
  return true
}

export function getGitOriginUrl() {
  try {
    const folder = vscode.workspace.workspaceFolders?.[0] ?? null
    if (!folder || !shouldExecuteGitCommands(folder)) {
      return ''
    }

    const gitOriginUrl = execSync('git remote get-url origin', {
      cwd: folder.uri.fsPath,
    }).toString().trim()
    // if is fatal: Not a git repository (or any of the parent directories): .git, return empty string
    if (gitOriginUrl.includes('fatal:')) {
      return ''
    }

    return gitOriginUrl
  }
  catch (error) {
    // Only log errors that are not related to "not a git repository"
    if (error instanceof Error && !error.message.includes('fatal: not a git repository')) {
      console.error('getGitOriginUrl error', error)
    }
    return ''
  }
}

export function getGitCurrentBranch() {
  try {
    const folder = vscode.workspace.workspaceFolders?.[0] ?? null
    if (!folder || !shouldExecuteGitCommands(folder)) {
      return ''
    }

    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: folder.uri.fsPath,
    }).toString().trim()
    if (gitBranch.includes('fatal:')) {
      return ''
    }

    return gitBranch
  }
  catch (error) {
    // Only log errors that are not related to "not a git repository"
    if (error instanceof Error && !error.message.includes('fatal: not a git repository')) {
      console.error('getCurrentBranch error', error)
    }
    return ''
  }
}
