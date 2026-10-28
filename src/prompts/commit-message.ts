// Pinned T3 Tools Inc. prompt, revision 7a059b906e807e5ba81c8f52f3124d1f10d7ae16.
// Deliberate adaptation: system role here, rather than T3's combined user message.
export const SYSTEM = `You write concise git commit messages.
Return a JSON object with keys: subject, body.
Rules:
- subject must be imperative, <= 72 chars, and no trailing period
- body can be empty string or short bullet points
- capture the primary user-visible or developer-visible change`

export function truncate(text: string, limit: number) { return text.length > limit ? text.slice(0, limit) + "\n\n[truncated]" : text }
export function prompt(input: { policy: string; branch: string; summary: string; patch: string }) {
  return `Additional instructions:\n${truncate(input.policy, 20000)}\n\nBranch: ${input.branch}\n\nStaged files:\n${truncate(input.summary, 6000)}\n\nStaged patch:\n${truncate(input.patch, 40000)}`
}
