import type { FileStatus } from "../git/status.js"

export type TreeRow =
  | { kind: "directory"; path: string; name: string; prefix: string; indices: number[] }
  | { kind: "file"; path: string; name: string; prefix: string; index: number }

type Node = { name: string; path: string; index?: number; children: Map<string, Node> }

// Directories scope review, staging, and discard to their descendant files.
export function fileTree(files: FileStatus[]): TreeRow[] {
  const root: Node = { name: "", path: "", children: new Map() }
  files.forEach((file, index) => {
    let parent = root
    const parts = file.path.split("/")
    parts.forEach((name, part) => {
      let child = parent.children.get(name)
      if (!child) {
        child = { name, path: parts.slice(0, part + 1).join("/"), children: new Map() }
        parent.children.set(name, child)
      }
      if (part === parts.length - 1) child.index = index
      parent = child
    })
  })
  const rows: TreeRow[] = [{ kind: "directory", path: "/", name: "", prefix: "", indices: files.map((_, index) => index) }]
  const ordered = (node: Node) => [...node.children.values()].sort((a, b) =>
      Number(b.index === undefined) - Number(a.index === undefined) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )
  const descendants = (node: Node): number[] => [
    ...(node.index === undefined ? [] : [node.index]),
    ...ordered(node).flatMap(descendants),
  ]
  const visit = (node: Node, prefix: string) => {
    const entries = ordered(node)
    entries.forEach((entry, index) => {
      const last = index === entries.length - 1
      const branch = prefix + (last ? "└─ " : "├─ ")
      if (entry.index === undefined) {
        let directory = entry
        let name = entry.name
        while (directory.children.size === 1) {
          const child = directory.children.values().next().value!
          if (child.index !== undefined) break
          name += "/" + child.name
          directory = child
        }
        rows.push({ kind: "directory", path: directory.path, name, prefix: branch, indices: descendants(directory) })
        visit(directory, prefix + (last ? "   " : "│  "))
      } else {
        rows.push({ kind: "file", path: entry.path, name: entry.name, prefix: branch, index: entry.index })
        // A tracked file can be deleted and replaced with an untracked directory
        // at the same path. Keep both the deletion and every new child visible.
        if (entry.children.size) visit(entry, prefix + (last ? "   " : "│  "))
      }
    })
  }
  visit(root, " ")
  return rows
}

export function treeFileIndices(rows: TreeRow[]): number[] {
  return rows.flatMap((row) => row.kind === "file" ? [row.index] : [])
}

export const treeRowKey = (row: TreeRow) => `${row.kind}:${row.path}`
export const treeRowID = (row: TreeRow) => row.kind === "file" ? `commit-file-${row.index}` : `commit-directory-${row.path}`
