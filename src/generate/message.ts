import type { Plugin } from "@opencode/plugin"
import { SYSTEM } from "../prompts/commit-message.js"

export type ServerContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]
export const DEFAULT_MODEL = "opencode-go/deepseek-v4.1-flash"
export function parseModel(slug: string) {
  const slash = slug.indexOf("/")
  if (slash < 1 || slash === slug.length - 1 || slug.trim() !== slug) throw new Error("model must be a provider/model identifier")
  return { providerID: slug.slice(0, slash), id: slug.slice(slash + 1) }
}
export function parseMessage(text: string): { subject: string; body: string; message: string } {
  // Balanced JSON extraction, respecting braces in strings and escaped quotes.
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0; let quoted = false; let escaped = false
    for (let end = start; end < text.length; end++) {
      const ch = text[end]
      if (quoted) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') quoted = false; continue }
      if (ch === '"') { quoted = true; continue }
      if (ch === "{") depth++
      if (ch === "}") {
        depth--
        if (depth !== 0) continue
        let value: unknown
        try { value = JSON.parse(text.slice(start, end + 1)) } catch { break }
        if (!value || typeof value !== "object" || !("subject" in value) || !("body" in value) || typeof value.subject !== "string" || typeof value.body !== "string") break
        const subject = [...value.subject.split(/\r?\n/)[0].trim().replace(/\.+$/, "")].slice(0, 72).join("").trim().replace(/\.+$/, "")
        const body = value.body.trim()
        if (!subject || /[\x00-\x1f\x7f]/.test(subject) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body)) throw new Error("Invalid generated message; regenerate")
        return { subject, body, message: subject + (body ? `\n\n${body}` : "") }
      }
    }
  }
  throw new Error("Generation must return JSON with string subject and body")
}

export class Generator {
  readonly owned = new Map<string, string>()
  private active = new Set<AbortController>()
  constructor(private ctx: ServerContext, private timeoutMs = 180000) {}
  private async remove(sessionID: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.ctx.session.remove({ sessionID }, { signal: AbortSignal.timeout(5000) })
        this.owned.delete(sessionID)
        return
      } catch { /* Retain ownership on failure so plugin cleanup can retry. */ }
    }
    throw new Error("Temporary generation-session cleanup failed; plugin cleanup will retry")
  }
  async install() {
    await this.ctx.session.hook("context", (event) => {
      const dynamic = this.owned.get(event.sessionID)
      if (dynamic === undefined) return
      event.system = [{ type: "text", text: SYSTEM }]
      event.messages = [{ role: "user", content: [{ type: "text", text: dynamic }] }]
      event.tools = {}
      event.options.maxTokens = 2000
    })
    await this.ctx.session.hook("title", (event) => {
      if (this.owned.has(event.sessionID)) event.result = "Commit message generation"
    })
  }
  async run(modelSlug: string, dynamic: string, signal: AbortSignal): Promise<string> {
    const model = parseModel(modelSlug)
    const models = await this.ctx.model.list()
    if (!models.data.some((available) => available.providerID === model.providerID && available.id === model.id && available.enabled)) {
      throw new Error(`Generation model ${modelSlug} is unavailable. Check provider authentication and plugin options; no fallback was used.`)
    }
    const controller = new AbortController(); this.active.add(controller)
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    const timer = setTimeout(() => controller.abort(new Error("Generation timed out after three minutes")), this.timeoutMs)
    let sessionID: string | undefined
    let stream: Promise<void> | undefined
    let stopEvents: AbortController | undefined
    try {
      controller.signal.throwIfAborted()
      const session = await this.ctx.session.create({ title: "Commit message generation", location: { directory: this.ctx.location.directory }, model, permissions: [{ action: "*", resource: "*", effect: "ask" }] })
      sessionID = session.id
      this.owned.set(sessionID, dynamic)
      controller.signal.throwIfAborted()
      const texts = new Map<string, string>()
      let done!: (text: string) => void; let fail!: (error: Error) => void
      const outcome = new Promise<string>((resolve, reject) => { done = resolve; fail = reject })
      // Attach immediately so cancellation during prompt admission cannot cause unhandled rejection.
      void outcome.catch(() => {})
      const interrupted = () => fail(new Error(controller.signal.reason instanceof Error ? controller.signal.reason.message : "Generation cancelled"))
      controller.signal.addEventListener("abort", interrupted, { once: true })
      stopEvents = new AbortController()
      const events = this.ctx.event.subscribe({ signal: stopEvents.signal })
      stream = (async () => {
        try {
          for await (const event of events) {
            if (!("sessionID" in event.data) || event.data.sessionID !== sessionID) continue
            switch (event.type) {
              case "session.text.ended": texts.set(`${event.data.assistantMessageID}:${event.data.ordinal}`, event.data.text); break
              case "permission.asked": await this.ctx.permission.reply({ sessionID, requestID: event.data.id, decision: "reject", message: "Commit generation cannot use tools" }, { signal: controller.signal }); break
              case "session.execution.succeeded": done([...texts.values()].join("\n")); break
              case "session.execution.failed": fail(new Error("Generation failed; check provider authentication and availability")); break
              case "session.execution.interrupted": fail(new Error("Generation interrupted")); break
            }
          }
          fail(new Error("Generation event stream disconnected"))
        } catch { fail(new Error("Generation event stream disconnected")) }
      })()
      // Subscription iteration begins before admission; only owned session IDs are observed.
      await this.ctx.session.prompt({ sessionID, text: dynamic }, { signal: controller.signal })
      return await outcome
    } finally {
      clearTimeout(timer); signal.removeEventListener("abort", abort)
      stopEvents?.abort()
      try {
        if (sessionID) await this.remove(sessionID)
      } finally {
        this.active.delete(controller)
        await stream
      }
    }
  }
  async dispose() {
    for (const controller of this.active) controller.abort(new Error("Plugin reloaded"))
    await Promise.allSettled([...this.owned.keys()].map((sessionID) => this.remove(sessionID)))
  }
}
