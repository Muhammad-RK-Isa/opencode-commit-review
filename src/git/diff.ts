import { lstat, open } from "node:fs/promises"
import { constants } from "node:fs"
import { join } from "node:path"
import { git, type Repository } from "./run.js"
import { status, staged, unstaged, displayPath, type FileStatus } from "./status.js"

function limitLines(text: string) {
  const lines = text.split("\n")
  return lines.length > 4000 ? lines.slice(0, 4000).join("\n") + `\n[Preview truncated: ${lines.length} lines; showing the first 4,000]` : text
}

export async function diff(repo: Repository, path: string, view: "staged" | "unstaged") {
  const files = await status(repo)
  const file = files.find((file) => file.path === path)
  if (file) return fileDiff(repo, file, view)
  const children = files.filter((file) => (path === "/" || file.path.startsWith(path + "/")) && (view === "staged" ? staged(file) : unstaged(file)))
  if (!children.length) return `No ${view} changes under ${displayPath(path)}.`
  let content = ""
  let remainingBytes = 200000
  let remainingLines = 4000
  for (let index = 0; index < children.length; index++) {
    const child = children[index]
    const section = `=== ${displayPath(child.path)} · ${view} ===\n${await fileDiff(repo, child, view)}\n\n`
    const bytes = Buffer.from(section)
    const lines = section.split("\n")
    if (bytes.length > remainingBytes || lines.length > remainingLines) {
      content += bytes.subarray(0, remainingBytes).toString("utf8").split("\n").slice(0, remainingLines).join("\n")
      return content + "\n[Module diff truncated: 200,000-byte / 4,000-line preview limit]"
    }
    content += section
    remainingBytes -= bytes.length
    remainingLines -= lines.length
  }
  return content.trimEnd()
}

async function fileDiff(repo: Repository, file: FileStatus, view: "staged" | "unstaged") {
  if (file.xy === "??") {
    if (view === "staged") return "Untracked file · not staged."
    const full = join(repo.root, file.path)
    const stat = await lstat(full)
    if (!stat.isFile()) return "Untracked symlink or special file (not followed)."
    if (stat.size > 200000) return `Untracked file: ${stat.size} bytes; too large to preview. Not staged.`
    const handle = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const buffer = Buffer.alloc(200001)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > 200000) return "Untracked file grew beyond preview limit. Not staged."
      const bytes = buffer.subarray(0, bytesRead)
      if (bytes.includes(0)) return "Binary untracked file. Not staged."
      return limitLines("Untracked file · not staged\n" + bytes.toString("utf8").split("\n").map((line) => `+${line}`).join("\n"))
    } finally { await handle.close() }
  }
  const result = await git(repo.root, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames", ...(view === "staged" ? ["--cached"] : []), "--", ...(file.original ? [file.original] : []), file.path], { limit: 200000 })
  return limitLines(result.text || `No ${view} changes.`) + (result.truncated ? "\n[Diff exceeds 200,000 bytes; preview truncated]" : "")
}
