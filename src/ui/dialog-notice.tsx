import { usePlugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"

export type Notice = { message: string; variant: "error" | "warning" }

export function DialogNotice(props: { notice: Notice | undefined; width: number; dismiss: () => void }) {
  const ctx = usePlugin()
  return <Show when={props.notice}>{(notice) => <box position="absolute" top={1} right={1} width={Math.max(1, Math.min(60, props.width - 4))} border borderColor={ctx.theme.text.feedback[notice().variant].base} paddingX={1} backgroundColor={ctx.theme.surface("dialog").background.raised.high} flexDirection="row" gap={1} onMouseDown={(event) => event.stopPropagation()} onMouseUp={(event) => event.stopPropagation()}>
    <text flexGrow={1} flexShrink={1} wrapMode="word" fg={ctx.theme.text.base}>{notice().message}</text>
    <text width={1} height={1} selectable={false} fg={ctx.theme.text.muted} onMouseUp={props.dismiss}>×</text>
  </box>}</Show>
}
