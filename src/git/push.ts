import { git, type Repository } from "./run.js"

export type Destination = { remote: string; ref: string; branch: string; count: number; needsUpstream: boolean }
export async function destination(repo: Repository): Promise<Destination> {
  const branch = (await git(repo.root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true })).text.trim()
  if (!branch) throw new Error("Cannot push detached HEAD; configure a branch outside the dialog")
  const remote = (await git(repo.root, ["config", "--get", `branch.${branch}.remote`], { allowFailure: true })).text.trim()
  const ref = (await git(repo.root, ["config", "--get", `branch.${branch}.merge`], { allowFailure: true })).text.trim()
  if (!remote || !ref) {
    const remotes = (await git(repo.root, ["remote"])).text.trim().split("\n").filter(Boolean)
    if (remotes.length !== 1) throw new Error("No upstream and no unique remote. Configure an upstream outside this dialog first.")
    return { remote: remotes[0], ref: `refs/heads/${branch}`, branch, count: Number((await git(repo.root, ["rev-list", "--count", "HEAD"])).text.trim()), needsUpstream: true }
  }
  if (remote === "." || !ref.startsWith("refs/heads/")) throw new Error("Unsupported upstream; configure a remote branch outside the dialog")
  const count = await git(repo.root, ["rev-list", "--count", "@{upstream}..HEAD"], { allowFailure: true })
  if (count.code !== 0) throw new Error("Upstream tracking ref is unavailable; fetch outside this dialog and retry")
  return { remote, ref, branch, count: Number(count.text.trim()), needsUpstream: false }
}
export async function push(repo: Repository, oid: string, approved: Destination) {
  const head = (await git(repo.root, ["rev-parse", "HEAD"])).text.trim()
  if (head !== oid) throw new Error("HEAD changed after commit; push blocked. Inspect Git before retrying.")
  const current = await destination(repo)
  if (JSON.stringify(current) !== JSON.stringify(approved)) throw new Error("Push destination changed; review it again")
  // An exact object refspec avoids publishing a concurrently advanced local branch.
  await git(repo.root, ["push", "--", approved.remote, `${oid}:${approved.ref}`])
  if (approved.needsUpstream) {
    await git(repo.root, ["config", `branch.${approved.branch}.remote`, approved.remote])
    await git(repo.root, ["config", `branch.${approved.branch}.merge`, approved.ref])
  }
}
