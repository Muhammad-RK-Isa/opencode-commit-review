import { For } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"
import { ActionButton } from "./action-button.js"

export type FooterAction = { label: string; primary?: boolean; disabled?: boolean; loading?: boolean; run: () => void }
export function Footer(props: { actions: FooterAction[]; focused: number; focus: (index: number) => void; height: number; shortcuts: string }) {
  const ctx = usePlugin()
  const theme = () => ctx.theme.surface("dialog")
  // OpenTUI 0.7 has no button primitive: focusable boxes implement Enter/Space semantics.
  return <box height={props.height} flexDirection="row" alignItems="center" gap={2}>
    <text height={1} flexGrow={1} flexShrink={1} wrapMode="none" fg={theme().text.muted}>{props.shortcuts}</text>
    <box flexDirection="row" gap={1} flexShrink={0} justifyContent="flex-end">
      <For each={props.actions}>{(action, index) => <ActionButton action={action} focused={props.focused === index()} focus={() => props.focus(index())} />}</For>
    </box>
  </box>
}
