import { For } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"
import type { FooterAction } from "./footer.js"

export function EditorActions(props: { actions: FooterAction[]; focused: number; focus: (index: number) => void }) {
  const ctx = usePlugin()
  const theme = () => ctx.theme.surface("dialog")
  return <box height={1} flexShrink={0} flexDirection="row" gap={1} justifyContent="flex-end">
    <For each={props.actions}>{(action, index) => {
      const highlighted = () => index() === 2 || props.focused === index()
      const background = () => highlighted() && !action.disabled ? theme().background.action.primary.focused : theme().background.raised.high
      const foreground = () => action.disabled ? theme().text.faint : highlighted() ? theme().text.action.primary.focused : theme().text.base
      return <box height={1} paddingX={1} backgroundColor={background()} focusable focused={props.focused === index()} on:focused={() => props.focus(index())} onMouseDown={() => { props.focus(index()); if (!action.disabled) action.run() }} onKeyDown={(event) => {
        if (event.name === "return" || event.name === "space") {
          event.preventDefault(); event.stopPropagation()
          if (!action.disabled) action.run()
        }
      }}>
        <text selectable={false} bg={background()} fg={foreground()}>{action.label}</text>
      </box>
    }}</For>
  </box>
}
