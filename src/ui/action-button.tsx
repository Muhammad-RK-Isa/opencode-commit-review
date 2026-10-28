import { createSignal, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"
import type { FooterAction } from "./footer.js"
import { ShimmerText } from "./generation-status.js"

export function ActionButton(props: { action: FooterAction; focused: boolean; focus: () => void }) {
  const ctx = usePlugin()
  const theme = () => ctx.theme.surface("dialog")
  const [hovered, setHovered] = createSignal(false)
  const background = () => {
    const surface = theme()
    if (props.action.disabled) return surface.background.raised.high
    if (props.action.primary) return surface.background.action.primary.focused
    if (!props.focused && !hovered()) return surface.background.raised.high
    const color = props.focused
      ? surface.background.action.secondary.focused
      : surface.background.action.secondary.hovered
    return color.a > 0 && !color.equals(surface.background.raised.high) && !color.equals(surface.background.base)
      ? color
      : surface.background.raised.max
  }
  const foreground = () => props.action.disabled
    ? theme().text.faint
    : props.action.primary ? theme().text.action.primary.focused : theme().text.base
  return <box height={1} paddingX={1} backgroundColor={background()} focusable focused={props.focused}
    on:focused={props.focus}
    onMouseOver={() => setHovered(true)}
    onMouseOut={() => setHovered(false)}
    onMouseDown={() => { props.focus(); if (!props.action.disabled) props.action.run() }}
    onKeyDown={(event) => {
      if (event.name === "return" || event.name === "space") {
        event.preventDefault(); event.stopPropagation()
        if (!props.action.disabled) props.action.run()
      }
    }}>
    <Show when={props.action.loading} fallback={<text selectable={false} bg={background()} fg={foreground()}>{props.action.label}</text>}><ShimmerText label={props.action.label} background={background()} /></Show>
  </box>
}
