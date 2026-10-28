import { For } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"

export type FooterAction = { label: string; disabled?: boolean; run: () => void }
export function Footer(props: { actions: FooterAction[]; focused: number; focus: (index: number) => void; height: number; shortcuts: string }) {
  const ctx = usePlugin()
  // OpenTUI 0.7 has no button primitive: focusable boxes implement Enter/Space semantics.
  return <box height={props.height} flexDirection="column">
    <text height={1} fg={ctx.theme.text.muted}>{props.shortcuts}</text>
    <box flexDirection="row" gap={2}>
      <For each={props.actions}>{(action, index) => <box focusable focused={props.focused === index()} border borderColor={props.focused === index() ? ctx.theme.text.action.primary.base : ctx.theme.border.base} onMouseDown={() => { props.focus(index()); if (!action.disabled) action.run() }} onKeyDown={(event) => { if (event.name === "return" || event.name === "space") { event.preventDefault(); event.stopPropagation(); if (!action.disabled) action.run() } }}>
        <text fg={action.disabled ? ctx.theme.text.faint : ctx.theme.text.action.primary.base}>{action.label}</text>
      </box>}</For>
    </box>
  </box>
}
