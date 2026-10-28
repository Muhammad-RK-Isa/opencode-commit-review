import { For } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"
import type { ScrollBoxRenderable } from "@opentui/core"
import { displayPath } from "../git/status.js"

export function DiffPane(props: { content: string; view: string; scope?: string; focused: boolean; toggle: () => void; focus: () => void; ref: (pane: ScrollBoxRenderable) => void; height: number }) {
  const ctx = usePlugin()
  return <box flexGrow={1} width="66%" height="100%" border borderColor={props.focused ? ctx.theme.text.action.primary.base : ctx.theme.border.base} flexDirection="column">
    <text height={1} wrapMode="none" fg={ctx.theme.text.action.primary.base} onMouseDown={props.toggle}>Diff · {props.view === "staged" ? "Staged" : "Unstaged"} [v: switch]{props.scope ? ` · ${displayPath(props.scope)}` : ""}</text>
    <scrollbox id="commit-diff" ref={props.ref} focused={props.focused} flexGrow={1} height={props.height - 3} scrollX scrollY viewportCulling onMouseDown={props.focus}>
      <For each={props.content.split("\n")}>{(line) => <text height={1} wrapMode="none" selectable fg={line.startsWith("+") ? ctx.theme.diff.text.added : line.startsWith("-") ? ctx.theme.diff.text.removed : line.startsWith("@@") ? ctx.theme.diff.text.hunkHeader : ctx.theme.diff.text.context} bg={line.startsWith("+") ? ctx.theme.diff.background.added : line.startsWith("-") ? ctx.theme.diff.background.removed : ctx.theme.diff.background.context}>{line || " "}</text>}</For>
    </scrollbox>
  </box>
}
