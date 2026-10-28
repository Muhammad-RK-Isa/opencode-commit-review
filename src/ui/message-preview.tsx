import { usePlugin } from "@opencode/plugin/tui"
import { createEffect, Show } from "solid-js"
import { TextAttributes, type TextareaRenderable } from "@opentui/core"
import { GenerationStatus } from "./generation-status.js"

export function MessagePreview(props: { message: string; generating: boolean; focused: boolean; focus: () => void; change: (value: string) => void; generate: () => void; generateDisabled: boolean; generateFocused: boolean; focusGenerate: () => void; expanded: boolean; expand?: () => void; close?: () => void; height: number }) {
  const ctx = usePlugin()
  let input: TextareaRenderable | undefined
  createEffect(() => {
    const value = props.message
    if (input && !input.isDestroyed && input.plainText !== value) {
      input.setText(value)
      input.cursorOffset = value.length
    }
  })
  createEffect(() => {
    if (props.focused) queueMicrotask(() => { if (props.focused && input && !input.isDestroyed) input.focus() })
  })
  return <box height={props.height} flexDirection="column">
    <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
      <box height={1} flexDirection="row">
      <text fg={ctx.theme.text.muted}>Commit message</text>
      <text fg={ctx.theme.text.muted}> · </text>
      <Show when={props.generating} fallback={<box height={1} focusable={!props.expanded} focused={props.generateFocused} on:focused={() => { if (!props.expanded) props.focusGenerate() }} onMouseDown={() => { props.focusGenerate(); if (!props.generateDisabled) props.generate() }} onKeyDown={(event) => { if (event.name === "return" || event.name === "space") { event.preventDefault(); event.stopPropagation(); if (!props.generateDisabled) props.generate() } }}>
        <text selectable={false} fg={props.generateDisabled ? ctx.theme.text.faint : ctx.theme.text.action.primary.base} attributes={props.generateFocused ? TextAttributes.BOLD : 0}>Generate</text>
      </box>}><GenerationStatus /></Show>
      </box>
      <Show when={props.focused && !props.expanded}><text height={1} selectable={false} fg={ctx.theme.text.action.primary.base} onMouseUp={() => props.expand?.()}>expand</text></Show>
      <Show when={props.expanded}><text id="message-editor-close" width={3} height={1} selectable={false} fg={ctx.theme.text.muted} onMouseUp={() => props.close?.()}>esc</text></Show>
    </box>
    <box flexGrow={1} width="100%" border borderColor={props.focused ? ctx.theme.text.action.primary.base : ctx.theme.border.base} onMouseDown={props.focus}>
    <textarea ref={(value) => { input = value }} height="100%" width="100%" focused={props.focused}
      on:focused={props.focus} onMouseDown={props.focus}
      placeholder="Keep empty to auto-generate commit message" placeholderColor={ctx.theme.text.muted}
      textColor={ctx.theme.text.base} focusedTextColor={ctx.theme.text.base}
      backgroundColor={ctx.theme.surface("dialog").background.base} focusedBackgroundColor={ctx.theme.surface("dialog").background.base}
      cursorColor={ctx.theme.text.base}
      onContentChange={() => { if (input && input.plainText !== props.message) props.change(input.plainText) }} />
    </box>
  </box>
}
