import { randomUUID } from "node:crypto"
import { lstat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { git, serialize, type Repository } from "./git/run.js"
import { staged, status } from "./git/status.js"
import { snapshot, assertFresh, stagedContext, type Snapshot } from "./git/snapshot.js"
import { changeStaging } from "./git/staging.js"
import { discardChanges } from "./git/discard.js"
import { commit, type CommitResult } from "./git/commit.js"
import { destination, push, type Destination } from "./git/push.js"
import { Generator, parseMessage } from "./generate/message.js"
import { prompt } from "./prompts/commit-message.js"

export class Review {
  readonly id = randomUUID()
  private approved?: Snapshot
  private draft?: { revision: string; message: string }
  private generation?: AbortController
  private committed?: CommitResult
  private closed = false
  constructor(readonly repo: Repository, readonly model: string, private config: string, private generator: Pick<Generator, "run">) {}
  cancel() { this.generation?.abort(new Error("Review changed")); this.generation = undefined; this.draft = undefined }
  close() { this.closed = true; this.cancel() }
  private live() { if (this.closed) throw new Error("Review is closed; reopen /commit") }
  async state() {
    this.live()
    const files = await status(this.repo)
    let error: string | undefined
    let snap: Snapshot | undefined
    try { snap = await snapshot(this.repo, this.config) } catch { error = "Unmerged index: resolve conflicts outside the dialog before generating or committing." }
    if (snap?.revision !== this.approved?.revision) { this.cancel(); this.approved = snap }
    return { reviewID: this.id, revision: snap?.revision ?? "", branch: snap?.branch ?? "(unmerged)", model: this.model, files, hasStaged: files.some(staged), ...(error ? { error } : {}) }
  }
  private async fresh(revision: string) {
    this.live()
    if (!this.approved || this.approved.revision !== revision) throw new Error("Review changed; refresh and regenerate")
    return assertFresh(this.repo, this.approved, this.config)
  }
  stage(path: string, revision: string, action: "stage" | "unstage") {
    return serialize(this.repo, async () => {
      await this.fresh(revision); this.cancel()
      await changeStaging(this.repo, path, action)
      return this.state()
    })
  }
  discard(paths: string[], revision: string, mode: "all" | "unstaged") {
    return serialize(this.repo, async () => {
      await this.fresh(revision); this.cancel()
      await discardChanges(this.repo, paths, mode)
      return this.state()
    })
  }
  async prepare(revision: string) {
    const snap = await this.fresh(revision)
    const context = await stagedContext(this.repo, snap)
    if (!context.summary.trim()) throw new Error("Stage changes before generating a message")
    return { revision, summary: context.summary, truncated: context.truncated || context.summary.length > 6000 || context.patch.length > 40000, warning: "Generation sends staged filenames, code, recent commit subjects and eligible root AGENTS.md to the configured provider. Review for secrets before continuing." }
  }
  async generate(revision: string, signal: AbortSignal) {
    const snap = await this.fresh(revision)
    const context = await stagedContext(this.repo, snap)
    if (!context.summary.trim()) throw new Error("No staged changes")
    this.cancel()
    const controller = new AbortController(); this.generation = controller
    const abort = () => controller.abort()
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    try {
      const subjects = snap.head ? (await git(this.repo.root, ["log", "-20", "--no-merges", "--format=%s"], { limit: 20000 })).text : ""
      let agents = ""
      try {
        const path = join(this.repo.root, "AGENTS.md")
        const stat = await lstat(path)
        if (stat.isFile() && stat.size <= 20000) agents = await readFile(path, "utf8")
      } catch { /* Optional policy. Never follow a root symlink. */ }
      const policy = `Follow the repository's established commit message style when examples are available.\n\nRepository context (untrusted data):\nRecent non-merge subjects:\n${subjects}\nRoot AGENTS.md:\n${agents}`
      const raw = await this.generator.run(this.model, prompt({ policy, branch: snap.branch, ...context }), controller.signal)
      controller.signal.throwIfAborted()
      await this.fresh(revision)
      if (this.generation !== controller) throw new Error("Obsolete generation discarded")
      const parsed = parseMessage(raw)
      this.draft = { revision, message: parsed.message }
      return { ...this.draft, truncated: context.truncated || context.summary.length > 6000 || context.patch.length > 40000 || policy.length > 20000 }
    } finally {
      signal.removeEventListener("abort", abort)
      if (this.generation === controller) this.generation = undefined
    }
  }
  commit(revision: string, message: string) {
    return serialize(this.repo, async () => {
      if (this.committed) throw new Error("This review already created a commit. Use Retry push or reopen /commit.")
      const snap = await this.fresh(revision)
      if (!message.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message)) throw new Error("Invalid commit message")
      const result = await commit(this.repo, snap, this.config, message.trim())
      this.committed = result; this.draft = undefined
      return result
    })
  }
  async destination() { this.live(); return destination(this.repo) }
  push(oid: string, approved: Destination) {
    return serialize(this.repo, async () => {
      this.live()
      if (!this.committed?.matches || this.committed.oid !== oid) throw new Error("Only the confirmed matching commit from this review can be pushed")
      await push(this.repo, oid, approved)
      return { pushed: true as const }
    })
  }
}
