import { Plugin } from "@opencode/plugin/tui"
import type { Route } from "@opencode/plugin/tui/context"
import { CommitReview } from "./rpc.js"
import { CommitPanel, type ReviewState } from "./ui/commit-panel.js"
import { assertV2 } from "./version.js"
import { errorMessage } from "./errors.js"

type ReviewRouteData = {
  initial: ReviewState
  location: { directory: string }
  returnRoute: Route
}

function snapshotRoute(route: Route): Route {
  switch (route.type) {
    case "home": return { type: "home" }
    case "session": return { type: "session", sessionID: route.sessionID }
    case "plugin": return { type: "plugin", id: route.id, name: route.name, data: route.data && { ...route.data } }
  }
}

export default Plugin.define({
  id: "commit-review.tui",
  setup(ctx) {
    assertV2(ctx.app.version)
    ctx.ui.router.register({
      name: "review",
      render: ({ data }) => {
        const review = data as ReviewRouteData | undefined
        if (!review) return <text>Commit review is unavailable. Reopen /commit.</text>
        return <CommitPanel initial={review.initial} rpc={ctx.client.rpc(CommitReview)} location={review.location} onClose={() => ctx.ui.router.navigate(review.returnRoute)} />
      },
    })
    let opening = false
    ctx.keymap.layer(() => ({ mode: "global", commands: [{
      id: "commit-review.open", title: "Commit changes", group: "Git", palette: true, slash: { name: "commit" },
      run: async () => {
        if (opening) return
        const current = ctx.ui.router.current()
        if (current.type === "plugin" && current.id === "commit-review.tui" && current.name === "review") return
        opening = true
        try {
          const location = ctx.location ?? ctx.data.location.default()
          if (!location) throw new Error("No Git location is available")
          const rpc = ctx.client.rpc(CommitReview)
          const initial = await rpc.open(undefined, { location })
          const returnRoute = snapshotRoute(ctx.ui.router.current())
          ctx.ui.dialog.clear()
          ctx.ui.router.navigate({ type: "plugin", name: "review", data: { initial, location, returnRoute } satisfies ReviewRouteData })
        } catch (cause) { ctx.ui.toast.show({ variant: "error", message: errorMessage(cause) }) }
        finally { opening = false }
      },
    }] }))
  },
})
