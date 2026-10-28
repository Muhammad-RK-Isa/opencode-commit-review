import { createHash } from "node:crypto"
import { git, type Repository } from "./run.js"

export type Snapshot = { root: string; gitDir: string; head: string; tree: string; branch: string; revision: string }
export async function snapshot(repo: Repository, configRevision: string): Promise<Snapshot> {
  // write-tree reads the actual index, including split indexes, into an immutable tree.
  // No copied index, alternate index, restaging, or merge-state changes are needed.
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = (await git(repo.root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true })).text.trim()
    const branch = (await git(repo.root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true })).text.trim() || "(detached)"
    const tree = (await git(repo.root, ["write-tree"])).text.trim()
    const after = (await git(repo.root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true })).text.trim()
    if (head !== after) continue
    const revision = createHash("sha256").update(JSON.stringify([repo.gitDir, head, tree, branch, configRevision])).digest("hex")
    return { ...repo, head, tree, branch, revision }
  }
  throw new Error("HEAD is changing; try again once Git is idle")
}
export async function emptyTree(repo: Repository) { return (await git(repo.root, ["hash-object", "-t", "tree", "--stdin"], { input: "" })).text.trim() }
export async function assertFresh(repo: Repository, approved: Snapshot, configRevision: string) {
  const current = await snapshot(repo, configRevision)
  if (current.revision !== approved.revision) throw new Error("Review is stale: HEAD, index, branch, or configuration changed. Refresh and regenerate.")
  return current
}
export async function stagedContext(repo: Repository, snap: Snapshot) {
  const base = snap.head || await emptyTree(repo)
  const summary = await git(repo.root, ["diff", "--name-status", "--no-ext-diff", base, snap.tree])
  const patch = await git(repo.root, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", base, snap.tree], { limit: 49000 })
  return { summary: summary.text, patch: patch.text + (patch.truncated ? "\n\n[truncated]" : ""), truncated: summary.truncated || patch.truncated }
}
