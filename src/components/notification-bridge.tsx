"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensurePushSubscription } from "@/lib/push-subscribe";
import { notificationPermission, showBrowserNotification } from "@/lib/browser-notify";
import { notificationTitle, notificationBody, sourceFor } from "@/lib/notification-source";

/**
 * Site-wide notification wiring — mounted once in the ROOT layout, so it
 * covers the storefront, the seller hub and the admin console alike.
 *
 * Two jobs:
 *
 *   1. Register this device for background push. Permission is never
 *      requested here (that needs a click); this only acts on permission
 *      that already exists, which is what turns "granted" into an actual
 *      `push_subscriptions` row the server can send to.
 *
 *   2. Raise an OS notification for a new row while the tab is open. The
 *      server push covers the closed-app case; this covers the open one
 *      without waiting for the next poll, and it is the only path that
 *      works on a browser with no push service.
 *
 * The bell in the header keeps its own subscription for the badge. This one
 * is deliberately separate and role-agnostic: a seller or an admin has no
 * bell on every page, and they still need to be told.
 */
export function NotificationBridge() {
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    const supabase = createClient();

    // Declared out here, not inside the async IIFE below, because the cleanup
    // function has to be able to remove it. A listener added inside the IIFE
    // would be unreachable from the return, and would leak one handler per
    // mount.
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "nm:resubscribe") void ensurePushSubscription();
    };

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid || cancelled) return;

      // 1. Make this device reachable by the server.
      void ensurePushSubscription();

      // 1b. The push service can invalidate a subscription at any time
      // (`pushsubscriptionchange`). The worker cannot re-subscribe on its own
      // — it has no VAPID key and no session — so it asks an open page to do
      // it. Without this the device keeps a dead endpoint in
      // `push_subscriptions` and silently stops receiving anything.
      navigator.serviceWorker?.addEventListener("message", onSwMessage);

      // 2. Live OS notification for a row that arrives while we are open.
      channel = supabase
        .channel("nm-notify-bridge")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as {
              id: string;
              kind: string;
              title: string;
              body: string | null;
              href: string | null;
            };
            if (notificationPermission() !== "granted") return;
            // The notifications page is where these are read; a popup for a
            // row the user is already looking at is noise.
            if (window.location.pathname.startsWith("/notifications")) return;
            // Name the source, exactly as the server push does — "Message
            // from Ada", "Order update — ...", "Jova — ...". Without
            // this the in-tab popup and the closed-app push would present the
            // same notification differently.
            void showBrowserNotification({
              title: notificationTitle(row.kind, row.title),
              body: notificationBody(row.kind, row.body),
              url: row.href ?? sourceFor(row.kind).href,
              tag: row.id,
              kind: row.kind,
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
