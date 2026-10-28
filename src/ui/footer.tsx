import { For } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"

export type FooterAction = { label: string; primary?: boolean; disabled?: boolean; run: () => void }
export function Footer(props: { actions: FooterAction[]; focused: number; focus: (index: number) => void; height: number; shortcuts: string }) {
  const ctx = usePlugin()
  const theme = () => ctx.theme.surface("dialog")
  // OpenTUI 0.7 has no button primitive: focusable boxes implement Enter/Space semantics.
  return <box height={props.height} flexDirection="row" alignItems="center" gap={2}>
    <text height={1} flexGrow={1} flexShrink={1} wrapMode="none" fg={theme().text.muted}>{props.shortcuts}</text>
    <box flexDirection="row" gap={1} flexShrink={0} justifyContent="flex-end">
      <For each={props.actions}>{(action, index) => {
        const highlighted = () => action.primary || props.focused === index()
        const background = () => highlighted() && !action.disabled ? theme().background.action.primary.focused : theme().background.raised.high
        const foreground = () => action.disabled ? theme().text.faint : highlighted() ? theme().text.action.primary.focused : theme().text.base
        return <box height={1} paddingX={1} backgroundColor={background()} focusable focused={props.focused === index()} on:focused={() => props.focus(index())} onMouseDown={() => { props.focus(index()); if (!action.disabled) action.run() }} onKeyDown={(event) => { if (event.name === "return" || event.name === "space") { event.preventDefault(); event.stopPropagation(); if (!action.disabled) action.run() } }}>
          <text selectable={false} bg={background()} fg={foreground()}>{action.label}</text>
        </box>
      }}</For>
    </box>
  </box>
}
