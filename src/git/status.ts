import { git, type Repository } from "./run.js"

export type FileStatus = { xy: string; path: string; original?: string; submodule?: boolean }
const conflicts = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"])
export const conflicted = (file: FileStatus) => conflicts.has(file.xy)
export const staged = (file: FileStatus) => !conflicted(file) && ![" ", "?", "!"].includes(file.xy[0])
export const unstaged = (file: FileStatus) => file.xy[1] !== " " && file.xy !== "!!"
export const displayPath = (path: string) => /[\x00-\x1f\x7f-\x9f]/.test(path) ? JSON.stringify(path) : path

export function parseStatus(text: string): FileStatus[] {
  const records = text.split("\0"); const result: FileStatus[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (!record) continue
    if (record.length < 4 || record[2] !== " ") throw new Error("Malformed Git status record")
    const file: FileStatus = { xy: record.slice(0, 2), path: record.slice(3) }
    if (/[RC]/.test(file.xy)) {
      const original = records[++i]
      if (!original) throw new Error("Missing rename/copy source")
      file.original = original
    }
    result.push(file)
  }
  return result
}
export async function status(repo: Repository, ignored = false) {
  const result = await git(repo.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", ...(ignored ? ["--ignored"] : [])])
  if (result.truncated) throw new Error("Status exceeds safety limit; reduce the number of changed paths")
  const files = parseStatus(result.text)
  if (!files.length) return files
  const entries = await git(repo.root, ["ls-files", "--stage", "-z"])
  if (entries.truncated) throw new Error("Index metadata exceeds safety limit")
  const submodules = gitlinkPaths(entries.text)
  // Staged deletions no longer have an index entry; inspect their HEAD modes.
  const deleted = files.filter((file) => file.xy[0] === "D").map((file) => file.path)
  for (let offset = 0; offset < deleted.length; offset += 100) {
    const head = await git(repo.root, ["ls-tree", "-r", "-z", "HEAD", "--", ...deleted.slice(offset, offset + 100)])
    if (head.truncated) throw new Error("Deleted-path metadata exceeds safety limit")
    for (const path of gitlinkPaths(head.text)) submodules.add(path)
  }
  return files.map((file) => submodules.has(file.path) ? { ...file, submodule: true } : file)
}

export function gitlinkPaths(text: string): Set<string> {
  const paths = new Set<string>()
  for (const record of text.split("\0")) {
    if (!record.startsWith("160000 ")) continue
    const tab = record.indexOf("\t")
    if (tab >= 0) paths.add(record.slice(tab + 1))
  }
  return paths
}
