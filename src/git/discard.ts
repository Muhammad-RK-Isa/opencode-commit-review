import { join } from "node:path"
import { git, repository, type Repository } from "./run.js"
import { conflicted, staged, status } from "./status.js"

export async function discardChanges(repo: Repository, paths: string[], mode: "all" | "unstaged") {
  const files = (await status(repo)).filter((file) => paths.includes(file.path))
  if (!files.length) throw new Error("Selected changes no longer exist; refresh the review")
  if (files.some(conflicted)) throw new Error("Resolve conflicts outside this dialog before discarding changes")
  const head = await git(repo.root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true })
  const source = mode === "all" && head.code === 0
    ? await git(repo.root, ["ls-tree", "-r", "--name-only", "-z", "HEAD"])
    : await git(repo.root, ["ls-files", "-z"])
  if (source.truncated) throw new Error("Tracked paths exceed safety limit")
  const tracked = new Set(mode === "all" && head.code !== 0 ? [] : source.text.split("\0").filter(Boolean))
  // Include rename sources, but never a copy's source: it is not part of the change.
  const targets = [...new Set(files.flatMap((file) => [file.path, ...(file.original && file.xy.includes("R") ? [file.original] : [])]))]
  if (mode === "all" && files.some((file) => file.submodule && !tracked.has(file.path))) throw new Error("Remove newly added submodules outside this dialog to preserve their repositories")
  const preserveIndex = new Set<string>()
  for (const file of files.filter((file) => file.submodule)) {
    const child = await repository(join(repo.root, file.path)).catch(() => undefined)
    // An uninitialized submodule resolves to the parent repository; never recurse into it.
    if (child && child.root !== repo.root) {
      const changes = await status(child)
      if (mode === "unstaged" && changes.some(staged)) {
        const entry = await git(repo.root, ["ls-files", "--stage", "-z", "--", file.path])
        const head = await git(child.root, ["rev-parse", "HEAD"])
        if (entry.text.split(" ")[1] !== head.text.trim()) throw new Error("Submodule has staged changes and a changed checkout; discard its unstaged changes inside the submodule first")
        // Recursive restore resets a submodule's index too. Keep its staged content.
        preserveIndex.add(file.path)
      }
      if (changes.length) await discardChanges(child, changes.map((file) => file.path), mode)
    }
  }
  const restore = targets.filter((path) => tracked.has(path))
  for (const recurse of [true, false]) {
    const paths = restore.filter((path) => preserveIndex.has(path) !== recurse)
    if (paths.length) await git(repo.root, ["restore", ...(mode === "all" ? ["--source=HEAD", "--staged"] : []), "--worktree", ...(recurse ? ["--recurse-submodules"] : []), "--", ...paths])
  }
  if (mode === "all") {
    const additions = files.filter((file) => !tracked.has(file.path) && file.xy !== "??").map((file) => file.path)
    if (additions.length) await git(repo.root, ["rm", "--cached", "-r", "-f", "--ignore-unmatch", "--", ...additions])
  }
  // Git owns deletion and path handling. Never force removal of ignored files or nested repositories.
  const untracked = targets.filter((path) => !tracked.has(path))
  if (untracked.length) await git(repo.root, ["clean", "-f", "-d", "--", ...untracked])
}
