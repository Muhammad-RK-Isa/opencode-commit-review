import { For } from "solid-js"
import type { FooterAction } from "./footer.js"
import { ActionButton } from "./action-button.js"

export function EditorActions(props: { actions: FooterAction[]; focused: number; focus: (index: number) => void }) {
  return <box height={1} flexShrink={0} flexDirection="row" gap={1} justifyContent="flex-end">
    <For each={props.actions}>{(action, index) => <ActionButton action={action} focused={props.focused === index()} focus={() => props.focus(index())} />}</For>
  </box>
}
