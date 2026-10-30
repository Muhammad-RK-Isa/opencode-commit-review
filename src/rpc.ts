import { Rpc } from "@opencode/plugin/rpc"
import { z } from "zod"

const review = z.object({ reviewID: z.string().uuid() }).strict()
const revision = review.extend({ revision: z.string() })
const path = revision.extend({ path: z.string().min(1) })
const file = z.object({ xy: z.string().length(2), path: z.string(), original: z.string().optional(), submodule: z.boolean().optional() })
const destination = z.object({ remote: z.string(), ref: z.string(), branch: z.string(), count: z.number(), needsUpstream: z.boolean() })
const state = z.object({ reviewID: z.string(), revision: z.string(), branch: z.string(), head: z.string(), unpushed: z.number(), model: z.string(), files: z.array(file), hasStaged: z.boolean(), error: z.string().optional() })
function method<const T extends { input: z.ZodType; output: z.ZodType }>(definition: T) {
  return { ...definition, errors: { operation_failed: z.object({ message: z.string() }) } }
}

export const CommitReview = Rpc.define({
  id: "commit-review",
  events: {},
  methods: {
    open: method({ input: z.undefined(), output: state }),
    status: method({ input: review, output: state }),
    panel: method({ input: review.extend({ tab: z.enum(["worktrees", "submodules", "branches", "remotes", "tags", "commits", "reflogs", "stash"]) }), output: z.array(z.string()) }),
    close: method({ input: review, output: z.undefined() }),
    diff: method({ input: review.extend({ path: z.string(), view: z.enum(["staged", "unstaged"]) }), output: z.string() }),
    stageFile: method({ input: path, output: state }),
    unstageFile: method({ input: path, output: state }),
    discardChanges: method({ input: revision.extend({ paths: z.array(z.string().min(1)).min(1), mode: z.enum(["all", "unstaged"]) }), output: state }),
    prepareStagedSnapshot: method({ input: revision, output: z.object({ revision: z.string(), summary: z.string(), truncated: z.boolean(), warning: z.string() }) }),
    generateMessage: method({ input: revision, output: z.object({ revision: z.string(), message: z.string(), truncated: z.boolean() }) }),
    cancelGeneration: method({ input: review, output: z.undefined() }),
    commit: method({ input: revision.extend({ message: z.string().trim().min(1) }), output: z.object({ oid: z.string(), matches: z.boolean(), warning: z.string().optional() }) }),
    pushDestination: method({ input: review, output: destination }),
    pushExistingCommit: method({ input: review.extend({ oid: z.string(), destination }), output: z.object({ pushed: z.literal(true) }) }),
  },
})
