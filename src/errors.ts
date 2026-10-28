export function errorMessage(cause: unknown): string {
  // RPC failures are plain objects, not Error instances.
  if (typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string" && cause.message) return cause.message
  if (typeof cause === "string" && cause) return cause
  return "Commit review operation failed"
}
