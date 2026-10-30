import { git, type Repository } from "./run.js"

export const panelTabs = ["worktrees", "submodules", "branches", "remotes", "tags", "commits", "reflogs", "stash"] as const
export type PanelTab = typeof panelTabs[number]

export async function panelEntries(repo: Repository, tab: PanelTab): Promise<string[]> {
  const commands: Record<PanelTab, string[]> = {
    worktrees: ["worktree", "list"],
    submodules: ["submodule", "status"],
    branches: ["branch", "--list", "--no-color"],
    remotes: ["remote", "-v"],
    tags: ["tag", "--list", "--sort=-creatordate"],
    commits: ["log", "-100", "--format=%h %s"],
    reflogs: ["reflog", "-100", "--format=%h %gs"],
    stash: ["stash", "list", "--format=%gd %s"],
  }
  if (tab === "commits" || tab === "reflogs") {
    const head = await git(repo.root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true })
    if (head.code !== 0) return []
  }
  const result = await git(repo.root, commands[tab], { limit: 128 * 1024 })
  return result.text.replace(/\x1b/g, "␛").split("\n").filter(Boolean)
}
