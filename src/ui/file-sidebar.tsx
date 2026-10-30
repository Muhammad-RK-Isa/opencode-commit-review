import { For, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"
import type { ScrollBoxRenderable } from "@opentui/core"
import { conflicted, displayPath, staged, unstaged, type FileStatus } from "../git/status.js"
import { treeRowID, treeRowKey, type TreeRow } from "./file-tree.js"

export function FileSidebar(props: { files: FileStatus[]; rows: TreeRow[]; selected: string; focused: boolean; height: number; select: (row: TreeRow) => void; focus: () => void; ref: (pane: ScrollBoxRenderable) => void }) {
  const ctx = usePlugin()
  const selectedBackground = () => {
    const color = ctx.theme.background.action.secondary.selected
    return color.a > 0 && !color.equals(ctx.theme.background.base) ? color : ctx.theme.background.raised.high
  }
  return <box width="100%" flexGrow={1} minHeight={0} flexDirection="column">
    <scrollbox id="commit-files" ref={props.ref} focused={props.focused} flexGrow={1} minHeight={0} scrollX scrollY contentOptions={{ maxWidth: undefined }} viewportCulling onMouseDown={props.focus}>
      <For each={props.rows}>{(row) => {
        const selected = () => props.selected === treeRowKey(row)
        const background = () => selected() ? selectedBackground() : ctx.theme.background.base
        const fullyStaged = () => row.kind === "directory" && row.indices.length > 0 && row.indices.every((index) => staged(props.files[index]) && !unstaged(props.files[index]))
        return <box id={treeRowID(row)} minWidth="100%" height={1} flexShrink={0} onMouseDown={() => { props.focus(); props.select(row) }} backgroundColor={background()}>
          <text minWidth="100%" height={1} wrapMode="none" bg={background()}>
            <span style={{ fg: ctx.theme.text.action.primary.base }}>{selected() ? "› " : "  "}</span>
            <span style={{ fg: ctx.theme.text.muted }}>{row.prefix}</span>
            <Show when={row.kind === "file" ? props.files[row.index] : undefined}>{(file) => <>
              <span style={{ fg: conflicted(file()) ? ctx.theme.text.feedback.error.base : staged(file()) ? ctx.theme.text.feedback.success.base : ctx.theme.text.base }}>{file().xy[0]}</span>
              <span style={{ fg: conflicted(file()) ? ctx.theme.text.feedback.error.base : ctx.theme.text.base }}>{file().xy[1]} </span>
            </>}</Show>
            <Show when={row.kind === "file" ? props.files[row.index] : undefined} fallback={<span style={{ fg: fullyStaged() ? ctx.theme.text.feedback.success.base : ctx.theme.text.base }}>{displayPath(row.name)}/</span>}>{(file) =>
              <span style={{ fg: conflicted(file()) ? ctx.theme.text.feedback.error.base : staged(file()) ? ctx.theme.text.feedback.success.base : ctx.theme.text.base }}>{file().original ? `${displayPath(file().original!)} → ` : ""}{displayPath(row.name)}{file().submodule ? "/ [submodule]" : ""}</span>
            }</Show>
          </text>
        </box>
      }}</For>
      {props.files.length === 0 && <text fg={ctx.theme.text.muted}>Working tree clean</text>}
    </scrollbox>
  </box>
}
