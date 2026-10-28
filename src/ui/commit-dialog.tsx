import { batch, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { RpcClient } from "@opencode/client/promise/api"
import { CommitReview } from "../rpc.js"
import { displayPath, staged, unstaged } from "../git/status.js"
import type { Destination } from "../git/push.js"
import { FileSidebar } from "./file-sidebar.js"
import { DiffPane } from "./diff-pane.js"
import { MessagePreview } from "./message-preview.js"
import { Footer, type FooterAction } from "./footer.js"
import { fileTree, treeRowKey, treeRowID, type TreeRow } from "./file-tree.js"

export type ReviewClient = RpcClient<typeof CommitReview>
export type ReviewState = Awaited<ReturnType<ReviewClient["open"]>>
export function CommitDialog(props: { initial: ReviewState; rpc: ReviewClient; location: { directory: string } }) {
  const ctx = usePlugin(); const dimensions = useTerminalDimensions()
  const options = { location: props.location }
  const [state, setState] = createSignal(props.initial)
  const initialRow = fileTree(props.initial.files)[0]
  const [selected, setSelected] = createSignal(initialRow ? treeRowKey(initialRow) : "")
  const tree = createMemo(() => fileTree(state().files))
  const selectedRow = createMemo(() => tree().find((row) => treeRowKey(row) === selected()))
  const selectedFiles = () => {
    const row = selectedRow()
    return row ? (row.kind === "file" ? [row.index] : row.indices).map((index) => state().files[index]) : []
  }
  const [focus, setFocus] = createSignal(0) // files, diff, message, generate, then footer controls
  const [view, setView] = createSignal<"staged" | "unstaged">("staged")
  const [content, setContent] = createSignal("Loading diff…")
  const [message, setMessage] = createSignal("")
  const [expanded, setExpanded] = createSignal(false)
  const [status, setStatus] = createSignal(props.initial.error ?? "Write a message, press Ctrl+G to generate, or commit with an empty message to auto-generate.")
  const [error, setError] = createSignal(!!props.initial.error)
  const [busy, setBusy] = createSignal(false)
  const [generating, setGenerating] = createSignal(false)
  const [manual, setManual] = createSignal(false)
  const [confirmation, setConfirmation] = createSignal<"push">()
  const [discard, setDiscard] = createSignal<{ path: string; paths: string[]; revision: string }>()
  const [discardOption, setDiscardOption] = createSignal(0)
  const [discardPanelHeight, setDiscardPanelHeight] = createSignal(9)
  const discardSelectedBackground = () => {
    const color = ctx.theme.background.action.secondary.selected
    return color.a > 0 && !color.equals(ctx.theme.surface("dialog").background.base) ? color : ctx.theme.background.raised.high
  }
  const [target, setTarget] = createSignal<Destination>()
  const [oid, setOid] = createSignal("")
  const [pushable, setPushable] = createSignal(false)
  const [pushed, setPushed] = createSignal(false)
  let filesPane: ScrollBoxRenderable | undefined; let diffPane: ScrollBoxRenderable | undefined
  let disposed = false; let generation = 0; let diffRequest = 0
  const review = () => ({ reviewID: state().reviewID })
  const revision = () => ({ ...review(), revision: state().revision })
  const height = () => Math.max(6, Math.min(45, dimensions().height - (confirmation() ? 20 : 18)))
  const usable = () => dimensions().width >= 84 && dimensions().height >= 26
  const width = () => Math.max(1, Math.min(180, dimensions().width - 4))
  const dialogHeight = () => usable() ? height() + (confirmation() ? 15.5 : 13.5) : 5
  const editorHeight = () => Math.max(8, Math.min(24, dialogHeight() - 4))
  // V2.2's largest host surface is 116 columns. Center wider plugin content
  // within that surface without inspecting or mutating host renderables.
  const horizontalInset = () => Math.floor((Math.min(116, dimensions().width - 2) - width()) / 2)
  const report = (cause: unknown) => { if (!disposed) { const message = cause instanceof Error ? cause.message : String(cause); setStatus(message); setError(true); ctx.ui.toast.show({ variant: "error", message }) } }
  function invalidate() {
    generation++; if (!manual()) setMessage(""); setGenerating(false)
  }
  async function update() {
    const next = await props.rpc.status(review(), options)
    if (disposed) return
    const key = selected()
    if (next.revision !== state().revision) invalidate()
    const nextTree = fileTree(next.files)
    batch(() => {
      setState(next)
      setSelected(nextTree.some((row) => treeRowKey(row) === key) ? key : (nextTree[0] ? treeRowKey(nextTree[0]) : ""))
      const current = selectedFiles()
      if (current.length && current.every((file) => staged(file) && !unstaged(file))) setView("staged")
      else if (current.length && !current.some(staged)) setView("unstaged")
    })
    void loadDiff()
    if (next.error) { setError(true); setStatus(next.error) }
  }
  async function loadDiff() {
    const request = ++diffRequest
    const current = selectedRow()
    if (!current) { setContent("No changed files."); return }
    try {
      const text = await props.rpc.diff({ ...review(), path: current.path, view: view() }, options)
      if (!disposed && request === diffRequest) setContent(text.replace(/\x1b/g, "␛"))
    } catch (cause) { report(cause) }
  }
  function select(row: TreeRow) { setSelected(treeRowKey(row)); setView(selectedFiles().some(staged) ? "staged" : "unstaged") }
  function toggleView() { setView((previous) => previous === "staged" ? "unstaged" : "staged") }
  async function toggleStage() {
    const row = selectedRow()
    const files = selectedFiles()
    if (busy() || oid() || !row || !files.length) return
    setConfirmation(undefined); setBusy(true); invalidate()
    try {
      const input = { ...revision(), path: row.path }
      if (files.every((file) => staged(file) && !unstaged(file))) await props.rpc.unstageFile(input, options)
      else await props.rpc.stageFile(input, options)
      await update(); await loadDiff(); setError(false); setStatus("Index updated. Escape will keep these staging changes.")
    } catch (cause) { report(cause); await update().catch(report) }
    finally { if (!disposed) setBusy(false) }
  }
  function askDiscard() {
    const row = selectedRow()
    if (busy() || oid() || focus() > 1 || !row) return
    setConfirmation(undefined); setDiscardOption(0)
    setDiscard({ path: row.path, paths: selectedFiles().map((file) => file.path), revision: state().revision })
  }
  async function applyDiscard(index = discardOption()) {
    const current = discard()
    if (!current || busy()) return
    setDiscard(undefined)
    if (index === 2) return
    setBusy(true); invalidate(); setError(false)
    try {
      await props.rpc.discardChanges({ ...review(), revision: current.revision, paths: current.paths, mode: index === 0 ? "all" : "unstaged" }, options)
      await update()
      setStatus(`${index === 0 ? "All" : "Unstaged"} changes discarded for ${displayPath(current.path)}.`)
    } catch (cause) { report(cause); await update().catch(report) }
    finally { if (!disposed) setBusy(false) }
  }
  async function generate() {
    if (disposed || busy() || generating() || discard() || oid() || !state().hasStaged || !state().revision) return
    const request = ++generation; setGenerating(true); setError(false)
    try {
      const result = await props.rpc.generateMessage(revision(), options)
      if (disposed || request !== generation || result.revision !== state().revision) return
      setManual(false); setMessage(result.message)
      return result.message
    } catch (cause) { if (request === generation) report(cause) }
    finally { if (!disposed && request === generation) setGenerating(false) }
  }
  async function askPush() {
    const destination = await props.rpc.pushDestination(review(), options)
    setTarget(destination); setConfirmation("push"); setFocus(4)
    setStatus(`Publish ${destination.count} outgoing commit(s) to ${destination.remote}/${destination.ref}${destination.needsUpstream ? " · establish new upstream? (count includes all local history)" : "?"}`)
  }
  async function submit(andPush: boolean) {
    if (busy() || generating() || confirmation() || discard() || oid() || !state().hasStaged) return
    const approved = revision()
    const commitMessage = message().trim() || await generate()
    if (!commitMessage || disposed || approved.revision !== state().revision) return
    setBusy(true); setStatus("Committing · hooks/signing enabled…"); setError(false)
    try {
      const result = await props.rpc.commit({ ...approved, message: commitMessage }, options)
      if (disposed) {
        ctx.ui.toast.show({ variant: result.matches ? "success" : "error", message: result.warning ?? `Committed ${result.oid.slice(0, 12)}. Dialog closed; no push attempted.` })
        return
      }
      setOid(result.oid); setPushable(result.matches); setMessage("")
      setStatus(result.warning ?? `Committed ${result.oid.slice(0, 12)}`); setError(!result.matches)
      if (andPush && result.matches && !disposed) await askPush()
    } catch (cause) {
      if (disposed) ctx.ui.toast.show({ variant: "error", message: "Commit request ended with an error after close. Inspect Git before retrying; no push was attempted." })
      else { report(cause); await update().catch(report) }
    }
    finally { if (!disposed) setBusy(false) }
  }
  async function retryPush() { if (busy() || !pushable() || pushed()) return; try { await askPush() } catch (cause) { report(cause) } }
  async function confirm() {
    const action = confirmation(); setConfirmation(undefined); setFocus(0)
    const destination = target()
    if (action !== "push" || !destination || busy()) return
    setBusy(true); setStatus("Pushing confirmed commit…")
    try {
      await props.rpc.pushExistingCommit({ ...review(), oid: oid(), destination }, options)
      if (disposed) ctx.ui.toast.show({ variant: "success", message: "Commit pushed successfully after dialog close." })
      else { setPushed(true); setStatus("Commit pushed successfully."); setError(false) }
    }
    catch (cause) {
      if (disposed) ctx.ui.toast.show({ variant: "error", message: "Push failed after close. The local commit is retained; inspect Git before retrying." })
      else report(cause)
    }
    finally { if (!disposed) setBusy(false) }
  }
  const actions = createMemo<FooterAction[]>(() => confirmation() ? [
    { label: "Confirm push", run: () => void confirm(), disabled: busy() },
    { label: "Cancel", run: () => { setConfirmation(undefined); setFocus(0) } },
  ] : [
    { label: "Commit: c", disabled: busy() || generating() || !state().hasStaged || !!oid(), run: () => void submit(false) },
    { label: oid() ? pushed() ? "Pushed" : "Retry push: p" : "Commit and push: p", disabled: busy() || generating() || (oid() ? !pushable() || pushed() : !state().hasStaged), run: () => void (oid() ? retryPush() : submit(true)) },
  ])
  const activate = () => { if (focus() === 3) { if (!confirmation()) void generate(); return }; const action = actions()[focus() - 4]; if (action && !action.disabled) action.run() }
  const expand = () => { if (!busy() && !oid() && !discard()) { setFocus(2); setExpanded(true) } }
  const closeEditor = () => { setExpanded(false); setFocus(2) }
  const changeMessage = (value: string) => { generation++; setGenerating(false); setManual(true); setMessage(value) }
  const generateDisabled = () => busy() || generating() || !!confirmation() || !!discard() || !!oid() || !state().hasStaged
  const shortcuts = createMemo(() => {
    if (busy() || discard() || expanded()) return ""
    if (focus() === 2) return "e Expand  Ctrl+G Generate"
    if (focus() === 3) return generating() ? "" : "Enter Generate"
    if (focus() >= 4) return `Enter ${actions()[focus() - 4]?.label.replace(/: [cp]$/, "") ?? "Activate"}`
    const files = selectedFiles()
    const action = files.length && files.every((file) => staged(file) && !unstaged(file)) ? "Unstage" : "Stage"
    return `Space ${action}  d Discard${focus() === 1 ? "  v Switch view" : ""}`
  })
  const close = () => { if (expanded()) closeEditor(); else if (discard()) setDiscard(undefined); else ctx.ui.dialog.clear() }
  const navigateFocus = (delta: number) => setFocus((current) => (current + delta + 4 + actions().length) % (4 + actions().length))
  function move(delta: number, page = false) {
    if (focus() === 0 && !page && tree().length) {
      const position = tree().findIndex((row) => treeRowKey(row) === selected())
      const row = tree()[Math.max(0, Math.min(tree().length - 1, position + delta))]
      select(row)
      filesPane?.scrollChildIntoView(treeRowID(row))
    }
    else if (focus() <= 1) (focus() === 0 ? filesPane : diffPane)?.scrollBy(delta * (page ? height() - 4 : 1))
  }
  // The host pushes its modal mode when showing the dialog. A separately pushed
  // mode can be superseded by that host effect, leaving only native scrolling.
  ctx.keymap.layer(() => ({ mode: "modal", priority: 100, commands: [
    { bind: "escape", run: close },
    { bind: "tab", run: () => navigateFocus(1) }, { bind: "shift+tab", run: () => navigateFocus(-1) },
    { bind: "left", run: () => { if (focus() <= 1) setFocus(0); else navigateFocus(-1) } },
    { bind: "right", run: () => { if (focus() <= 1) setFocus(1); else navigateFocus(1) } },
    { bind: "up", run: () => move(-1) }, { bind: "down", run: () => move(1) },
    { bind: "pageup", run: () => move(-1, true) }, { bind: "pagedown", run: () => move(1, true) },
    { bind: "space", run: () => { if (focus() >= 3) activate(); else void toggleStage() } },
    { bind: "return", run: () => { if (focus() >= 3) activate() } },
    { bind: "d", run: askDiscard },
    { bind: "v", run: toggleView }, { bind: "ctrl+g", run: () => { if (!confirmation()) void generate() } },
    { bind: "e", run: expand },
    { bind: "c", run: () => void submit(false) }, { bind: "p", run: () => { if (!confirmation()) void (oid() ? retryPush() : submit(true)) } },
  ].map((command) => ({ ...command, enabled: command.bind === "escape" || (usable() && !discard() && (command.bind === "ctrl+g" || (!expanded() && (command.bind === "e" ? focus() === 2 && !busy() && !oid() : focus() !== 2 || command.bind === "tab" || command.bind === "shift+tab")))) })) }))
  const moveDiscard = (delta: number) => { setDiscardOption((index) => (index + delta + 3) % 3) }
  ctx.keymap.layer(() => ({ mode: "modal", priority: 110, commands: [
    { bind: "escape", run: () => setDiscard(undefined) },
    { bind: "up", run: () => moveDiscard(-1) }, { bind: "down", run: () => moveDiscard(1) },
    { bind: "tab", run: () => moveDiscard(1) }, { bind: "shift+tab", run: () => moveDiscard(-1) },
    { bind: "return", run: () => void applyDiscard() }, { bind: "space", run: () => void applyDiscard() },
  ].map((command) => ({ ...command, enabled: !!discard() })) }))
  const selectedPath = createMemo(() => selectedRow() ? treeRowKey(selectedRow()!) : undefined)
  createEffect(on([selectedPath, view], () => {
    diffPane?.scrollTo(0)
    void loadDiff()
  }))
  createEffect(on(() => state().revision, () => { void loadDiff() }, { defer: true }))
  onMount(() => {
    // show() resets presentation to medium/non-centered. Apply options only
    // after the new dialog has mounted, not before show().
    ctx.ui.dialog.set({ size: "xlarge", centered: true })
    if (selectedFiles().length) setView(selectedFiles().some(staged) ? "staged" : "unstaged")
  })
  const poll = setInterval(() => { if (!busy() && !confirmation() && !discard() && !oid()) void update().catch(report) }, 2000)
  onCleanup(() => {
    disposed = true; generation++; diffRequest++; clearInterval(poll)
    // Close cancels reads/generation, but server write transactions finish and reconcile independently.
    void props.rpc.close(review(), options).catch(() => {})
  })
  // The base theme may intentionally be transparent. Paint the same raised
  // dialog surface as the host across our entire (potentially wider) rectangle.
  // Cancel the host's top inset so its narrower surface cannot protrude above ours.
  return <box id="commit-dialog" flexDirection="column" width={width()} marginLeft={horizontalInset()} marginTop={-1} backgroundColor={ctx.theme.surface("dialog").background.base} height={dialogHeight()} paddingX={2} paddingY={1}>
    <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
      <text height={1} flexGrow={1} flexShrink={1} wrapMode="none" fg={ctx.theme.text.base}>Commit changes · {state().branch}</text>
      <text id="commit-close" height={1} width={3} flexShrink={0} selectable={false} fg={ctx.theme.text.muted} onMouseUp={close}>esc</text>
    </box>
    <Show when={usable()} fallback={<text fg={ctx.theme.text.feedback.warning.base}>Resize terminal to at least 84 × 26. Escape closes; staging is retained.</text>}>
      <box height={height()} flexDirection="row">
        <FileSidebar files={state().files} rows={tree()} selected={selected()} focused={focus() === 0} height={height()} select={select} focus={() => setFocus(0)} ref={(pane) => { filesPane = pane }} />
        <DiffPane content={content()} view={view()} scope={selectedRow()?.path} focused={focus() === 1} height={height()} toggle={toggleView} focus={() => setFocus(1)} ref={(pane) => { diffPane = pane }} />
      </box>
      <MessagePreview message={message()} generating={generating()} focused={!expanded() && focus() === 2 && !discard() && !busy() && !oid()} focus={() => setFocus(2)} change={changeMessage} generate={() => { if (!confirmation()) void generate() }} generateDisabled={generateDisabled()} generateFocused={!expanded() && focus() === 3 && !discard()} focusGenerate={() => setFocus(3)} expanded={false} expand={expand} height={6.5} />
      <Show when={confirmation()}><text fg={ctx.theme.text.feedback.warning.base} height={2} wrapMode="word">{status()}</text></Show>
      <Footer height={4} actions={actions()} focused={expanded() ? -1 : focus() - 4} focus={(index) => setFocus(index + 4)} shortcuts={shortcuts()} />
    </Show>
    <Show when={expanded()}><box position="absolute" left={0} top={0} width="100%" height="100%" alignItems="center" justifyContent="center" onMouseDown={(event) => event.stopPropagation()} onMouseUp={(event) => event.stopPropagation()}>
      <box width={Math.max(1, Math.min(100, width() - 8))} height={editorHeight()} border borderColor={ctx.theme.border.base} paddingX={1} backgroundColor={ctx.theme.surface("dialog").background.base} flexDirection="column">
        <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
          <text fg={ctx.theme.text.base}>Edit commit message</text>
          <text id="message-editor-close" width={3} height={1} selectable={false} fg={ctx.theme.text.muted} onMouseUp={closeEditor}>esc</text>
        </box>
        <MessagePreview message={message()} generating={generating()} focused={expanded()} focus={() => setFocus(2)} change={changeMessage} generate={() => { if (!confirmation()) void generate() }} generateDisabled={generateDisabled()} generateFocused={false} focusGenerate={() => {}} expanded height={editorHeight() - 3} />
      </box>
    </box></Show>
    <Show when={discard()}>{(current) => <box position="absolute" left={0} top={0} width="100%" height="100%" alignItems="center" justifyContent="center">
      <box width={Math.max(1, Math.min(70, width() - 4))} paddingX={1} flexDirection="column" onSizeChange={function () { setDiscardPanelHeight(this.height) }}>
        {/* Half-blocks extend the solid panel by half a column on either side.
            With the border's half-column, this matches its half-row top/bottom. */}
        <text position="absolute" left={0} top={0} width={1} height="100%" selectable={false} fg={ctx.theme.surface("dialog").background.base}>{Array(discardPanelHeight()).fill("▐").join("\n")}</text>
        <text position="absolute" right={0} top={0} width={1} height="100%" selectable={false} fg={ctx.theme.surface("dialog").background.base}>{Array(discardPanelHeight()).fill("▌").join("\n")}</text>
        <box width="100%" border borderColor={ctx.theme.border.base} paddingX={1} paddingY={0} flexDirection="column" backgroundColor={ctx.theme.surface("dialog").background.base}>
          <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
            <text height={1} flexGrow={1} flexShrink={1} fg={ctx.theme.text.base}>Discard changes</text>
            <text id="discard-close" height={1} width={3} flexShrink={0} selectable={false} fg={ctx.theme.text.muted} onMouseUp={() => setDiscard(undefined)}>esc</text>
          </box>
          <text height={1} wrapMode="none" fg={ctx.theme.text.muted}>{displayPath(current().path)}</text>
          <text height={1} fg={ctx.theme.text.feedback.warning.base}>Discarded changes cannot be undone.</text>
          <box marginTop={1} flexDirection="column">
            <For each={["Discard all changes", "Discard unstaged changes", "Cancel"]}>{(label, index) => {
              const selected = () => discardOption() === index()
              const background = () => selected() ? discardSelectedBackground() : ctx.theme.surface("dialog").background.base
              return <box width="100%" height={1} flexShrink={0} backgroundColor={background()} onMouseOver={() => setDiscardOption(index())} onMouseUp={() => void applyDiscard(index())}>
                <text width="100%" height={1} selectable={false} bg={background()} fg={selected() ? ctx.theme.text.action.primary.base : ctx.theme.text.base}>{selected() ? "› " : "  "}{label}</text>
              </box>
            }}</For>
          </box>
        </box>
      </box>
    </box>}</Show>
  </box>
}
