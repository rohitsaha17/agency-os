// Simple toast helper. Falls back to window.alert() / console if no
// toast library is installed. Swap the internals here to use
// react-hot-toast or sonner once installed without changing callers.

type ToastFn = (msg: string) => void;

function show(kind: "success" | "error" | "info", msg: string) {
  if (typeof window === "undefined") {
    // Server-side — log only.
    // eslint-disable-next-line no-console
    console.log(`[toast:${kind}]`, msg);
    return;
  }
  try {
    // Prefer a lightweight non-blocking notification if available.
    // window.alert is intentionally used as a safe fallback so users
    // always see the message even if no toast UI is mounted.
    if (kind === "error") {
      // eslint-disable-next-line no-console
      console.error("[toast:error]", msg);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[toast:${kind}]`, msg);
    }
    window.alert(msg);
  } catch {
    // swallow
  }
}

export const toast: {
  success: ToastFn;
  error: ToastFn;
  info: ToastFn;
} = {
  success: (msg: string) => show("success", msg),
  error: (msg: string) => show("error", msg),
  info: (msg: string) => show("info", msg),
};

export default toast;
