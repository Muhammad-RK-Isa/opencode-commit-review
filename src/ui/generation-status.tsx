import { createSignal, For, onCleanup, onMount } from "solid-js"
import { RGBA } from "@opentui/core"
import { usePlugin } from "@opencode/plugin/tui"

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const smooth = (value: number) => value ** 3 * (value * (value * 6 - 15) + 10)
const coast = (value: number) => value < 0.2 ? value ** 2 / 0.32 : value > 0.8 ? 1 - (1 - value) ** 2 / 0.32 : (value - 0.1) / 0.8

export function ShimmerText(props: { label: string; background?: RGBA }) {
  const ctx = usePlugin()
  const [elapsed, setElapsed] = createSignal(0)
  onMount(() => {
    if (ctx.options.animations === false) return
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - start), 33)
    onCleanup(() => clearInterval(timer))
  })
  // Match OpenCode's native title sweep: 1200ms, 4-cell head, 18-cell tail,
  // 240ms fade-in, and a 60% dim toward the dialog backdrop off the peak.
  // https://github.com/anomalyco/opencode/blob/9adc42b/packages/tui/src/component/title-shimmer.tsx
  const color = (column: number) => {
    const foreground = ctx.theme.text.base
    const background = props.background ?? ctx.theme.surface("dialog").background.base
    const front = -4 + coast(elapsed() % 1200 / 1200) * (props.label.length + 22)
    const distance = front - column
    const intensity = smooth(clamp(distance < 0 ? 1 + distance / 4 : 1 - distance / 18))
    const strength = ctx.options.animations === false ? 0.6 : 0.6 * smooth(clamp(elapsed() / 240)) * (1 - intensity)
    return RGBA.fromValues(
      foreground.r + (background.r - foreground.r) * strength,
      foreground.g + (background.g - foreground.g) * strength,
      foreground.b + (background.b - foreground.b) * strength,
      foreground.a,
    )
  }
  return <text height={1} selectable={false} bg={props.background}><For each={[...props.label]}>{(letter, index) => <span style={{ fg: color(index()) }}>{letter}</span>}</For></text>
}
