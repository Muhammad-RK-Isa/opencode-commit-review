import { Plugin } from "@opencode/plugin/tui"
import { CommitReview } from "./rpc.js"
import { CommitDialog } from "./ui/commit-dialog.js"
import { assertV2 } from "./version.js"
import { errorMessage } from "./errors.js"

export default Plugin.define({
  id: "commit-review.tui",
  setup(ctx) {
    assertV2(ctx.app.version)
    let opening = false
    ctx.keymap.layer(() => ({ mode: "global", commands: [{
      id: "commit-review.open", title: "Commit changes", group: "Git", palette: true, slash: { name: "commit" },
      run: async () => {
        if (opening) return
        opening = true
        try {
          const location = ctx.location ?? ctx.data.location.default()
          if (!location) throw new Error("No Git location is available")
          const rpc = ctx.client.rpc(CommitReview)
          const initial = await rpc.open(undefined, { location })
          ctx.ui.dialog.show(() => <CommitDialog initial={initial} rpc={rpc} location={location} />)
        } catch (cause) { ctx.ui.toast.show({ variant: "error", message: errorMessage(cause) }) }
        finally { opening = false }
      },
    }] }))
  },
})
