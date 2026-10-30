import { randomUUID } from "node:crypto"
import { Plugin } from "@opencode/plugin"
import { CommitReview } from "./rpc.js"
import { repository } from "./git/run.js"
import { diff } from "./git/diff.js"
import { panelEntries } from "./git/panels.js"
import { DEFAULT_MODEL, Generator, parseModel } from "./generate/message.js"
import { Review } from "./review.js"
import { assertV2 } from "./version.js"

async function guard<T, E>(action: () => Promise<T>, error: (type: "operation_failed", message: string, data: { message: string }) => E): Promise<T | E> {
  try { return await action() } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Commit review operation failed"
    return error("operation_failed", message, { message })
  }
}

export default Plugin.define({
  id: "commit-review",
  async setup(ctx) {
    assertV2(ctx.app.version)
    const model = ctx.options.model ?? DEFAULT_MODEL
    if (typeof model !== "string") throw new Error("Commit Review model option must be a string")
    parseModel(model)
    const config = randomUUID() // Options reload recreates this plugin and invalidates every review.
    const generator = new Generator(ctx)
    await generator.install()
    const reviews = new Map<string, Review>()
    const get = (id: string) => {
      const review = reviews.get(id)
      if (!review) throw new Error("Review expired after close/reload; reopen /commit")
      return review
    }
    await ctx.rpc.register(CommitReview, {
      open: async (_, call) => guard(async () => {
        const review = new Review(await repository(ctx.location.directory), model, config, generator)
        reviews.set(review.id, review)
        try { return await review.state() } catch (error) { reviews.delete(review.id); throw error }
      }, call.error),
      status: async ({ reviewID }, call) => guard(() => get(reviewID).state(), call.error),
      panel: async ({ reviewID, tab }, call) => guard(() => panelEntries(get(reviewID).repo, tab), call.error),
      close: async ({ reviewID }) => { reviews.get(reviewID)?.close(); reviews.delete(reviewID); return undefined },
      diff: async ({ reviewID, path, view }, call) => guard(() => diff(get(reviewID).repo, path, view), call.error),
      stageFile: async ({ reviewID, revision, path }, call) => guard(() => get(reviewID).stage(path, revision, "stage"), call.error),
      unstageFile: async ({ reviewID, revision, path }, call) => guard(() => get(reviewID).stage(path, revision, "unstage"), call.error),
      discardChanges: async ({ reviewID, revision, paths, mode }, call) => guard(() => get(reviewID).discard(paths, revision, mode), call.error),
      prepareStagedSnapshot: async ({ reviewID, revision }, call) => guard(() => get(reviewID).prepare(revision), call.error),
      generateMessage: async ({ reviewID, revision }, call) => guard(() => get(reviewID).generate(revision, call.signal), call.error),
      cancelGeneration: async ({ reviewID }) => { get(reviewID).cancel(); return undefined },
      commit: async ({ reviewID, revision, message }, call) => guard(() => get(reviewID).commit(revision, message), call.error),
      pushDestination: async ({ reviewID }, call) => guard(() => get(reviewID).destination(), call.error),
      pushExistingCommit: async ({ reviewID, oid, destination }, call) => guard(() => get(reviewID).push(oid, destination), call.error),
    })
    return async () => {
      for (const review of reviews.values()) review.close()
      reviews.clear()
      await generator.dispose()
    }
  },
})
