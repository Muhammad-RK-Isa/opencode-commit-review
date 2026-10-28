# OpenCode Commit Review

An **OpenCode V2-only** plugin. `/commit` opens a native OpenTUI/Solid dialog with
a focusable file sidebar, read-only staged/unstaged diffs, real Git staging,
an editable commit message, and **Commit** / **Commit and push** controls.
No browser, external TUI, conversational command, or session panel is involved.

**Minimum supported/tested OpenCode: 2.2.0**, with the host's OpenTUI 0.7.0 and
Solid runtime. V1 is unsupported. No Desktop/browser integration is supplied.
This repository is not published to npm by this implementation.

## Build and install locally

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
```

Add the **package directory**, not `src/index.ts`, to your project or global
`opencode.jsonc` yourself. One entry loads both the server and TUI parts:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-commit-review",
      "options": {
        "model": "opencode-go/deepseek-v4.1-flash"
      }
    }
  ]
}
```

The same options shape works for an installed package directory. The compiled
package exports `.`, `./tui`, and a declaration-backed typed `./rpc` contract.
No host OpenTUI/Solid runtime is bundled. Do not install the plugin a second time
in `cli.json`.

`model` is **this plugin's option**, not OpenCode's conversational `model` field.
It defaults to `opencode-go/deepseek-v4.1-flash`; configure any available,
authenticated `provider/model`. Everything after the first slash is preserved
as the model ID. There is no fallback. Connect the provider through OpenCode's
normal `/connect` flow. Changing options uses V2's watched configuration reload;
pending generation/reviews are invalidated. Reopen `/commit` after a reload.
The current conversation's agent, model, and permissions are never changed.

## Review workflow

1. Run `/commit` from a Git location, including OpenCode's home screen.
2. Inspect the literal, repository-relative Git `XY` status flags and diff.
   File flags appear immediately before buffer names, after the tree indicators,
   retaining both Git status columns and their meaningful spaces.
   The sidebar starts with a selectable `/` root for reviewing and staging/unstaging
   all changes at once, then groups files into an expanded directory tree (directories first),
   compacts single-child directory chains such as `packages/ui/src/components`,
   and labels Git submodules as `[submodule]` leaves. Up/Down selects both modules
   and files, with a full-row theme-derived background highlight. Selecting a
   module shows all descendant diffs for the current Staged/Unstaged view, with
    per-file headers and a shared preview limit. Space stages/unstages the changed
    files beneath the selected module. Submodule staging updates only its
   parent-repository Git pointer, not the submodule's internal files; commit those
   changes in the submodule itself first.
3. Press Space to stage the highlighted file or module's remaining working-tree
   changes, or unstage it when all underlying files are fully staged. Partial
   staging is preserved until you explicitly stage/unstage that scope. Ignored
   files are hidden; conflicts are blocked with a resolution hint.
   Press `d` in either review pane to open the selected file, directory, or
   submodule's discard menu: **Discard all changes**, **Discard unstaged changes**,
   or **Cancel**. Use Up/Down or Tab to select, then Enter/Space to activate;
   Escape dismisses only the menu. Discarding is irreversible. All changes resets
   both index and working tree; unstaged changes restores the index version.
   Untracked files in the selected scope are removed, but ignored files and nested
   untracked repositories are preserved. Newly added submodules must be removed
   outside this dialog to preserve their repositories.
4. Write in **Commit message**, or press `Ctrl+G` (including inside the input) to generate a
   message immediately, without a confirmation. While waiting, **Generating
   commit message** shimmers like OpenCode's session title. Generated messages
   remain editable. Leaving the input empty auto-generates a message when you
   commit. Generation does not run merely from opening the dialog or staging.
   Staging invalidates generated messages but preserves manually edited text.
   Generate refreshes Git status first. If nothing is staged, it shows a hint
   to stage files with Space rather than silently ignoring the request.
   Generate, Commit, and Commit and Push show validation feedback when nothing
   is staged. Notifications render inside the review dialog (or the expanded
   editor while it is open), dismiss automatically, and can be closed with ×.
5. Choose Commit or Commit and push. Push is separately confirmed with its
   remote/ref and outgoing count, including earlier unpublished commits.

| Input | Action |
| --- | --- |
| Tab / Shift+Tab | Files → diff → commit message → Generate → footer controls (and backward) |
| Left / Right | Switch review panes, or footer controls |
| Up / Down | Files: previous / next file; Diff: scroll up / down |
| PageUp / PageDown | Scroll the focused review pane by a page |
| Mouse wheel | Scroll the pane under the pointer, without selecting files |
| Space in a review pane | Stage remaining changes / unstage fully staged file or module |
| `d` in a review pane | Open scoped discard menu for selected file / directory / submodule |
| Enter / Space on a footer control | Activate that control, never stage a file |
| `v` or click diff header | Switch labeled Staged / Unstaged views |
| Ctrl+G | Generate from the current staged snapshot, including while editing |
| `e` with message input focused / click expand | Expand the editor in a nested dialog; Esc or its top-right button returns to the main panel |
| Ctrl+C | Commit the approved snapshot, including while editing |
| Ctrl+P | Commit then ask to push, or retry push after commit success |
| Ctrl+Shift+P / click Push beside the branch | Ask to push existing outgoing commits; the button shows their count |
| Esc | Close; explicit staging persists |

Minimum usable terminal size: **84 columns × 26 rows**. Below it, the dialog
shows a resize hint and disables actions other than Escape. Both panes retain
their side-by-side arrangement. The centered dialog uses the terminal width
minus four columns, up to 180 columns. Pane focus is indicated by the outline,
without a textual “focused” label. Theme tokens are read reactively, including
`text.feedback.success.base` for staged paths and semantic diff/focus colors.
Inside the message input, letters and navigation keys edit text normally, except
`e` opens the nested editor. Inside that dialog, `e` types normally and Esc
returns to the same message in the main panel. Tab leaves the inline input.
The expanded editor has compact filled **Commit and Push**, **Commit**, and **Done**
buttons. Enter in the editor saves and returns; Shift+Enter inserts a newline.
Tab cycles through the editor and buttons. With a button focused, Enter/Space
activates it. Ctrl+C / Ctrl+P commit or commit-and-push even while editing.
Commit and Push still returns to the main panel for push confirmation.
The main footer shows shortcut suggestions only for the Sidebar, Diff panel, and
Commit message panel. Generate and Push brighten on hover.
Set the plugin option `animations` to `false` to disable
the generation shimmer (the host's animation preference is not exposed to plugins).

## Safety and limitations

- Git's real index is the only staging state. Commands use argument arrays and
  literal pathspecs, with NUL-safe status parsing. Paths containing control
  characters are escaped for display, not changed for Git operations.
- Snapshot generation uses `git write-tree` on the actual index, then reads the
  immutable tree against the captured HEAD. It does not copy/rebuild the index
  or restage working files, and works with split indexes and linked worktrees.
- Approval binds the worktree, HEAD, branch, staged tree, and configuration
  revision. Git writes are serialized per worktree. Status is refreshed from
  Git, not optimistically invented, with external changes polled every 2s.
- Commit uses normal Git hooks and configured signing, without `--no-verify`,
  amend, reset, or automatic staging. In-progress merge/rebase/cherry-pick/revert
  operations must be finished outside the dialog. Signing or hooks requiring
  interactive stdin may fail: use an independently configured signing agent.
- **Hook/race policy:** the real Git commit is not sandboxed. Its resulting
  HEAD tree, parent, and process outcome are checked. If a hook or concurrent
  external Git writer changes the committed content, the created commit is
  retained, a warning is shown, and push/recommit in that review is blocked.
  Inspect Git and re-review manually; no destructive rollback is attempted.
  This detects, rather than prevents, arbitrary hook/external-writer changes
  during Git's own transaction. Avoid simultaneous external Git writes.
- Closing does not kill a Git write or assume cancellation means failure.
  Writes reconcile their outcome and show a UI toast if they finish after
  close. A closed/reloaded review cannot be used for a new mutation.
- Push never force-pushes, pulls, rebases, or changes branches. It sends an
  explicit approved commit object to an explicit ref. Establishing a missing
  upstream requires confirmation and one unambiguous remote; otherwise set it
  up outside the dialog. Outgoing counts are based on local tracking refs;
  no automatic fetch occurs.
- Failed push preserves the local commit. **Retry push** in the still-open
  dialog only pushes that commit; it never commits again. After closing,
  reopen the dialog and use Push beside the branch for an already-created commit.
- Diffs are capped at 200,000 bytes / 4,000 displayed lines; large untracked
  files and binaries have explicit summaries. These are preview limits, not
  commit-content limits. No hunk editing/staging or conflict resolution exists.

## Generation and privacy

Generation creates an unrelated temporary session with an explicit model and
no parent. An owned-session-only `context` hook replaces its system block and
user context and removes tools. Permission requests are additionally rejected.
The plugin subscribes before prompting, filters events by its owned session ID,
and handles failure, interruption, disconnection, cancellation, and a three-minute
timeout. Owned sessions are removed in a finalizer; cleanup is retried and
retained ownership is retried again on plugin disposal if removal fails.
No generation session tab is opened.

Only the staged snapshot, branch, up to 20 recent non-merge subjects, and eligible
regular root `AGENTS.md` content are sent. Repository-derived policy is untrusted
user context, never system instructions. Generation sends this content immediately,
without a confirmation: inspect for credentials and secrets **before pressing Ctrl+G
or committing with an empty message**. A non-empty manual message skips generation.
Diffs, prompts, credentials, and generated content are not logged by the plugin.

The static instruction block is pinned to T3 Code revision
`7a059b906e807e5ba81c8f52f3124d1f10d7ae16`. Unlike T3's combined user prompt,
this plugin deliberately places the unchanged static block in the **system**
role and dynamic context in the user role. Policy, summary, and patch are capped
at 20,000 / 6,000 / 40,000 characters, with a 49,000-byte initial patch capture.
Truncation is marked in the prompt. JSON is extracted and validated
locally; empty/invalid subjects are rejected rather than replaced with a generic
message. See [LICENSE](LICENSE) for copyright and permission notices.

The temporary `session.prompt` transport avoids depending on experimental
generate endpoints. T3 reports free-tier generate-endpoint restrictions;
**this is not asserted for all V2 providers**.

## Build checks and testing policy

```sh
bun run typecheck
bun run build
```

Automated tests, smoke scripts, and their configuration have been intentionally
removed. Do not write or run tests unless explicitly requested by the user.
See [AGENTS.md](AGENTS.md) for the repository's testing policy.

Live **Go/DeepSeek** authentication and billing behavior, real signing hardware,
and manual testing across terminal emulators have **not** been verified.
