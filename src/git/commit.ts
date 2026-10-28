import { git, type Repository } from "./run.js"
import { assertFresh, type Snapshot } from "./snapshot.js"
import { lstat } from "node:fs/promises"
import { join } from "node:path"

export type CommitResult = { oid: string; matches: boolean; warning?: string }
export async function commit(repo: Repository, approved: Snapshot, config: string, message: string): Promise<CommitResult> {
  await assertFresh(repo, approved, config)
  for (const marker of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-apply", "rebase-merge", "sequencer"]) {
    const exists = await lstat(join(repo.gitDir, marker)).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false
      throw error
    })
    if (exists) throw new Error("An in-progress merge/rebase/cherry-pick/revert exists. Complete or abort it outside this dialog first.")
  }
  // Let Git own hooks, signing and the real index. Never kill a write on dialog close.
  const result = await git(repo.root, ["commit", "--file=-", "--cleanup=verbatim"], { input: message + "\n", allowFailure: true })
  const oid = (await git(repo.root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true })).text.trim()
  if (!oid || oid === approved.head) throw new Error(result.code === 0 ? "Git did not create a commit" : "Commit failed (hook/signing failure). No push was attempted; inspect Git and retry.")
  const tree = (await git(repo.root, ["rev-parse", `${oid}^{tree}`])).text.trim()
  const parents = (await git(repo.root, ["show", "-s", "--format=%P", oid])).text.trim()
  const matches = tree === approved.tree && parents === approved.head && result.code === 0
  return { oid, matches, ...(!matches ? { warning: "A commit was created, but its tree/parent or process outcome differed from approval (possibly a hook). Push blocked. Inspect Git and re-review; the commit was not undone." } : {}) }
}
