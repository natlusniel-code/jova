"use client";

import { useEffect, useState } from "react";
import {
  enableBrowserNotifications,
  notificationPermission,
  notificationsSupported,
  registerServiceWorker,
  subscribeToPush,
} from "@/lib/browser-notify";
import { createClient } from "@/lib/supabase/client";
import { VAPID_PUBLIC_KEY } from "@/lib/push-public";
import { Alert, Spinner } from "@/components/ui";

type State = "unsupported" | "default" | "granted" | "denied";

/**
 * "Turn on phone notifications" control.
 *
 * The permission prompt must come from a click, so this is a button and never
 * an automatic request on load. It also states what will and will not work,
 * because a buyer who is told "notifications on" and then misses an order
 * because the browser was closed has been misled.
 */
export function PushOptIn() {
  const [state, setState] = useState<State>("default");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pushNote, setPushNote] = useState("");
  // Whether this device actually holds a push subscription — not merely
  // whether permission was granted. The two are different, and conflating
  // them is what made the old panel say "notifications are on" over a device
  // the server could not reach.
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!notificationsSupported()) {
      setState("unsupported");
      return;
    }
    setState(notificationPermission() as State);
    // Register early so the worker is ready the moment permission is granted.
    void registerServiceWorker();

    // Ask the browser whether a live subscription exists. This is the only
    // honest answer to "will a notification reach this phone?".
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        setSubscribed(Boolean(sub));
      } catch {
        setSubscribed(false);
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setNote("");
    setPushNote("");
    const res = await enableBrowserNotifications();
    setState(res.permission as State);

    if (!res.ok) {
      setBusy(false);
      setNote(res.error ?? "Notifications were not enabled.");
      return;
    }
    setNote("Notifications are on for this browser.");

    // Store a push subscription. The VAPID public key is the site's original
    // one, restored in code (src/lib/push-public.ts) — the same key existing
    // subscribers are bound to, so this re-registers them against it.
    const sub = await subscribeToPush(VAPID_PUBLIC_KEY);
    if (sub.ok && sub.subscription) {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setBusy(false);
        setSubscribed(false);
        setPushNote("Sign in to receive notifications when the app is closed.");
        return;
      }
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: uid,
          endpoint: sub.subscription.endpoint,
          p256dh: sub.subscription.keys?.p256dh ?? "",
          auth: sub.subscription.keys?.auth ?? "",
          user_agent: navigator.userAgent.slice(0, 200),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      setBusy(false);
      if (error) {
        // The browser subscribed but the row was not saved, so the server
        // still cannot reach this device. Say so instead of claiming success.
        setSubscribed(false);
        setPushNote(`This device could not be registered: ${error.message}`);
        return;
      }
      setSubscribed(true);
      setPushNote("This device is also registered for background push.");
    } else {
      setBusy(false);
      setSubscribed(false);
      setPushNote(sub.error ?? "Background push could not be enabled on this device.");
    }
  }

  if (state === "unsupported") {
    return (
      <Alert tone="amber" title="This browser can't show notifications">
        Order updates still appear in the list below and in the bell at the top of the page.
      </Alert>
    );
  }

  if (state === "granted") {
    // Permission granted but no subscription is a real, common state — the
    // user allowed notifications on an earlier visit, before the subscription
    // code existed, or the push service dropped it. Saying "you're all set"
    // there is a lie the user only discovers when an order ships silently.
    if (subscribed === false) {
      return (
        <Alert tone="amber" title="Notifications are allowed, but this device isn't registered">
          Your browser allows notifications, but this device has no push subscription, so nothing can reach it while
          the app is closed.{" "}
          <button onClick={enable} disabled={busy} className="font-semibold underline underline-offset-2">
            {busy ? "Registering…" : "Register this device"}
          </button>
          {pushNote && <span className="mt-1 block opacity-80">{pushNote}</span>}
        </Alert>
      );
    }
    return (
      <Alert tone="green" title="Phone notifications are on">
        You&apos;ll get a notification when an order moves — payment confirmed, shipped, delivered.{" "}
        {pushNote && <span className="opacity-80">{pushNote}</span>}
      </Alert>
    );
  }

  if (state === "denied") {
    return (
      <Alert tone="amber" title="Notifications are blocked for this site">
        Your browser is blocking them. To turn them on, open this site&apos;s settings in your browser (the padlock
        icon in the address bar) and allow notifications, then reload this page.
      </Alert>
    );
  }

  return (
    <div className="rounded-xl border border-brand-500/25 bg-brand-50 px-3.5 py-3">
      <p className="text-[13px] font-semibold text-brand-900">Get order updates on your phone</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-brand-900/80">
        Turn on browser notifications and we&apos;ll tell you the moment your payment is confirmed, your order ships, or
        it&apos;s ready to collect — even when this tab is in the background.
      </p>
      <button onClick={enable} disabled={busy} className="nm-btn-primary mt-2.5 !py-2 !text-[12.5px]">
        {busy ? <><Spinner /> Turning on…</> : "Turn on notifications"}
      </button>
      {note && <p className="mt-2 text-[11.5px] text-brand-900/80">{note}</p>}
    </div>
  );
}
