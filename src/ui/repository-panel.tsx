import { For, Show, type JSX } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"
import type { ScrollBoxRenderable } from "@opentui/core"
import { focusBorder } from "./focus-border.js"

export function RepositoryPanel(props: {
  tabs: readonly string[]; active: number; change: (index: number) => void;
  focused: boolean; focus: () => void; height: number; collapsed?: boolean;
  entries?: string[]; children?: JSX.Element; ref?: (pane: ScrollBoxRenderable) => void;
}) {
  const ctx = usePlugin()
  return <box height={props.height} flexShrink={0} width="100%" border
    borderColor={props.focused ? focusBorder(ctx.theme.text.action.primary.base) : ctx.theme.border.base}
    flexDirection="column" onMouseDown={props.focus}>
    <box height={1} flexShrink={0} flexDirection="row">
      <For each={props.tabs}>{(label, index) => <text height={1} wrapMode="none" selectable={false}
        fg={index() === props.active ? ctx.theme.text.base : ctx.theme.text.muted}
        onMouseDown={() => { props.focus(); props.change(index()) }}>
        {index() ? " · " : ""}{label}
      </text>}</For>
    </box>
    <Show when={!props.collapsed}>
      <Show when={props.children} fallback={
        <scrollbox ref={props.ref} focused={props.focused} flexGrow={1} minHeight={0} scrollX scrollY viewportCulling>
          <For each={props.entries}>{(entry) => <text height={1} wrapMode="none" fg={ctx.theme.text.base}>{entry}</text>}</For>
          <Show when={!props.entries?.length}><text fg={ctx.theme.text.muted}>{props.entries ? "No entries" : "Loading…"}</text></Show>
        </scrollbox>
      }>{props.children}</Show>
    </Show>
  </box>
}
