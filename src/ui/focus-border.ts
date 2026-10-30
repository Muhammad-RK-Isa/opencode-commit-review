import { RGBA } from "@opentui/core"

export function focusBorder(color: RGBA) {
  return RGBA.fromValues(color.r * 0.8, color.g * 0.8, color.b * 0.8, color.a)
}
