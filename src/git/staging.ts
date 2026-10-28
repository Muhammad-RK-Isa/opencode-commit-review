import { git, type Repository } from "./run.js"
import { conflicted, staged, status, unstaged } from "./status.js"

export async function changeStaging(repo: Repository, path: string, action: "stage" | "unstage" | "toggle") {
  const current = await status(repo)
  const file = current.find((file) => file.path === path)
  const files = path === "/" ? current : file ? [file] : current.filter((file) => file.path.startsWith(path + "/"))
  if (!files.length) throw new Error("Path is no longer in the Git status; refresh the review")
  if (files.some(conflicted)) throw new Error("Resolve the conflict outside this dialog before staging this path")
  if (files.some((file) => file.xy === "!!")) throw new Error("Ignored files are not force-added")
  const unstage = action === "unstage" || (action === "toggle" && files.every((file) => staged(file) && !unstaged(file)))
  // An index rename has already removed its source. git add on that vanished
  // source would fail, and a copy's source must never be staged as a side effect.
  const targets = files.filter((file) => unstage ? staged(file) : unstaged(file))
  const paths = [...new Set(targets.flatMap((file) => file.original && (unstage ? file.xy[0] === "R" : file.xy[1] === "R") ? [file.original, file.path] : [file.path]))]
  if (!paths.length) return
  if (!unstage) await git(repo.root, ["add", "-A", "--", ...paths])
  else {
    const head = await git(repo.root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true })
    if (head.code === 0) await git(repo.root, ["restore", "--staged", "--", ...paths])
    else await git(repo.root, ["rm", "--cached", "-r", "--", ...paths])
  }
}
