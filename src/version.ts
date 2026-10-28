export function assertV2(version: string) {
  const [major, minor] = version.replace(/^v/, "").split(".").map(Number)
  if (major !== 2 || !Number.isFinite(minor) || minor < 2) throw new Error("Commit Review requires OpenCode >=2.2.0 <3 (V1 is unsupported)")
}
