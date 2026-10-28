import { spawn } from "node:child_process"
import { realpath } from "node:fs/promises"

export type Repository = { root: string; gitDir: string }
export async function git(cwd: string, args: string[], options: { input?: string; limit?: number; env?: Record<string, string>; allowFailure?: boolean } = {}) {
  return new Promise<{ text: string; bytes: Buffer; code: number; truncated: boolean }>((resolve, reject) => {
    // Ignore inherited index/worktree overrides: the host location is authoritative.
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env }
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX"]) delete env[key]
    const child = spawn("git", ["--no-optional-locks", "--literal-pathspecs", ...args], { cwd, env, stdio: "pipe" })
    const chunks: Buffer[] = []; const errors: Buffer[] = []
    let size = 0; let truncated = false
    const limit = options.limit ?? 8 * 1024 * 1024
    child.stdout.on("data", (data: Buffer) => {
      const remaining = Math.max(0, limit - size)
      chunks.push(data.subarray(0, remaining)); size += Math.min(data.length, remaining)
      if (data.length > remaining) truncated = true
    })
    child.stderr.on("data", (data: Buffer) => { if (errors.reduce((n, b) => n + b.length, 0) < 65536) errors.push(data) })
    child.on("error", reject)
    child.on("close", (code) => {
      const bytes = Buffer.concat(chunks)
      if (code !== 0 && !options.allowFailure) reject(new Error(`Git ${args[0]} failed: ${Buffer.concat(errors).toString().trim() || `exit ${code}`}`))
      else resolve({ text: bytes.toString("utf8"), bytes, code: code ?? -1, truncated })
    })
    child.stdin.on("error", () => {})
    child.stdin.end(options.input)
  })
}
export async function repository(directory: string): Promise<Repository> {
  const root = await git(directory, ["rev-parse", "--show-toplevel"])
  const gitDir = await git(directory, ["rev-parse", "--absolute-git-dir"])
  return { root: await realpath(root.text.replace(/\n$/, "")), gitDir: await realpath(gitDir.text.replace(/\n$/, "")) }
}

const queues = new Map<string, Promise<unknown>>()
export async function serialize<T>(repo: Repository, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(repo.gitDir) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(action)
  queues.set(repo.gitDir, next)
  try { return await next } finally { if (queues.get(repo.gitDir) === next) queues.delete(repo.gitDir) }
}
