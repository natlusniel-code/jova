"use client";

/**
 * Browser (Chrome) notification plumbing.
 *
 * What this can and cannot do, stated plainly because the difference matters:
 *
 *   * It CAN raise a real OS notification while the tab is open, and while the
 *     tab is closed but the browser is running — via the service worker.
 *   * It CANNOT deliver anything while the browser is fully closed unless the
 *     server sends a Web Push message to a stored subscription. That needs a
 *     VAPID key pair and a sender; `subscribeToPush` below stores the
 *     subscription so a sender can be added without touching the client again.
 *
 * So the honest summary for the user is: notifications work in the browser and
 * on the phone's notification tray while the browser is running, and the
 * groundwork for true background push is in place but needs a VAPID key.
 */

import { notificationIcons } from "./notification-icons";

const SW_PATH = "/sw.js";

export function notificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** Register the worker once. Safe to call repeatedly. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!notificationsSupported()) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  } catch {
    return null;
  }
}

/**
 * Ask for permission and register the worker.
 *
 * Must be called from a user gesture — Chrome ignores a permission prompt that
 * was not triggered by a click, and a denied prompt cannot be re-shown from
 * code, so the UI has to offer a button rather than asking on page load.
 */
export async function enableBrowserNotifications(): Promise<{
  ok: boolean;
  permission: NotificationPermission | "unsupported";
  error?: string;
}> {
  if (!notificationsSupported()) {
    return { ok: false, permission: "unsupported", error: "This browser does not support notifications." };
  }
  const reg = await registerServiceWorker();
  if (!reg) {
    return { ok: false, permission: Notification.permission, error: "Could not start the notification service." };
  }
  const permission = await Notification.requestPermission();
  return { ok: permission === "granted", permission };
}

/**
 * Raise a notification right now, through the service worker when possible.
 *
 * The worker path is preferred because it survives the tab losing focus and
 * gives us the click-to-open behaviour. `new Notification()` is the fallback
 * for a browser that has permission but no active worker yet.
 */
export async function showBrowserNotification(payload: {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string;
  /** The notification's source, so the worker can name it if the title is bare. */
  kind?: string;
}): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;

  // The phone's theme decides which silhouette is visible in the status bar;
  // the plate icon is the same in both. See src/lib/notification-icons.ts.
  const icons = notificationIcons();

  const data = {
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/notifications",
    tag: payload.tag,
    kind: payload.kind,
    icon: icons.icon,
    badge: icons.badge,
  };

  try {
    const reg = (await navigator.serviceWorker.getRegistration(SW_PATH)) ?? (await registerServiceWorker());
    if (reg) {
      // Prefer postMessage so the worker owns the display and the click handler.
      const target = reg.active ?? reg.waiting ?? reg.installing;
      if (target) {
        target.postMessage({ type: "nm:notify", payload: data });
        return true;
      }
      await reg.showNotification(data.title, {
        body: data.body,
        // The plate icon reads on a light and a dark shade; the badge is the
        // silhouette that contrasts with the phone's current theme.
        icon: icons.icon,
        badge: icons.badge,
        data: { url: data.url, kind: data.kind },
        tag: data.tag,
      });
      return true;
    }
  } catch {
    /* fall through to the constructor */
  }

  try {
    new Notification(data.title, {
      body: data.body,
      icon: icons.icon,
      badge: icons.badge,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Store a Web Push subscription so a server can reach this device later.
 *
 * Returns a clear reason when it cannot, rather than failing silently: without
 * a VAPID public key there is nothing to subscribe with, and pretending
 * otherwise would leave the user believing background push is live.
 *
 * ── Why an existing subscription is checked, not just reused ──────────────
 * `getSubscription()` returns whatever this browser already holds, and the old
 * code stored it without looking at it. That is the single most common way
 * Web Push dies silently: a subscription is bound to the application server
 * key it was created with, and the push service rejects any message signed
 * with a different VAPID key (403). So a device that subscribed before the key
 * changed keeps a row in `push_subscriptions` that can never be delivered to —
 * the server reports `sent: 1`, the phone shows nothing, and nothing anywhere
 * says why.
 *
 * The fix is to compare the subscription's own `applicationServerKey` with the
 * key we are about to sign with. If they differ, the old subscription is
 * dropped and a new one is created against the current key. That is the only
 * way a device recovers on its own.
 */
export async function subscribeToPush(vapidPublicKey?: string): Promise<{
  ok: boolean;
  subscription?: PushSubscriptionJSON;
  error?: string;
}> {
  if (!notificationsSupported() || !("PushManager" in window)) {
    return { ok: false, error: "This browser does not support background push." };
  }
  if (!vapidPublicKey) {
    return {
      ok: false,
      error:
        "Background push is not configured — no VAPID public key was supplied. In-browser notifications still work.",
    };
  }
  const reg = (await navigator.serviceWorker.getRegistration(SW_PATH)) ?? (await registerServiceWorker());
  if (!reg) return { ok: false, error: "Could not start the notification service." };

  const wanted = urlBase64ToUint8Array(vapidPublicKey);

  try {
    let existing = await reg.pushManager.getSubscription();

    // A subscription made with a different key can never be delivered to.
    // Drop it and start again rather than storing a dead endpoint.
    if (existing && !sameKey(existing.options?.applicationServerKey, wanted)) {
      try {
        await existing.unsubscribe();
      } catch {
        /* the push service may already have discarded it */
      }
      existing = null;
    }

    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: wanted,
      }));
    return { ok: true, subscription: sub.toJSON() as PushSubscriptionJSON };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not subscribe to push." };
  }
}

/**
 * Do two application server keys describe the same P-256 point?
 *
 * `applicationServerKey` comes back as an ArrayBuffer (or null on a browser
 * that does not expose it). A null is treated as "unknown", and unknown is
 * treated as a match — re-subscribing on every page load would churn the
 * subscription and is worse than trusting an existing one.
 */
function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return true;
  const left = new Uint8Array(a);
  if (left.length !== b.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== b[i]) return false;
  }
  return true;
}

/** VAPID keys are base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Backed by a plain ArrayBuffer (not ArrayBufferLike) so it satisfies
  // BufferSource — a SharedArrayBuffer is not accepted by PushManager.
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
