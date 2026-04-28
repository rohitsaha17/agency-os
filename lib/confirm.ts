// Simple confirm helper for imperative call-sites that can't use the
// `useConfirm()` hook (e.g. module-level code or quick prompts). The
// implementation is intentionally trivial today — it wraps window.confirm —
// and can be swapped for a modal-based implementation later without
// changing callers.

export async function confirmAction(message: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    return window.confirm(message);
  } catch {
    return false;
  }
}

export default confirmAction;
