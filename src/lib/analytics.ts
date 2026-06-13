/**
 * Plausible analytics helper.
 *
 * The Plausible script is loaded in index.html and provides a `window.plausible`
 * function. We wrap it in a typed helper that is safe to call even when the
 * script is blocked or hasn't loaded yet (the inline shim in index.html queues
 * events in `window.plausible.q`).
 */

type PlausibleProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: ((eventName: string, options?: { props?: PlausibleProps; callback?: () => void }) => void) & {
      q?: unknown[];
    };
  }
}

/**
 * Track a custom event in Plausible.
 *
 * @example
 *   trackEvent("lead_submitted", { intent: "sample" });
 *   trackEvent("cta_clicked", { cta: "hero" });
 */
export function trackEvent(name: string, props?: PlausibleProps): void {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(name, props ? { props } : undefined);
  } catch {
    // Never let analytics break the app
  }
}
