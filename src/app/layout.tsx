import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { INSTALL_CAPTURE_SCRIPT } from "@/lib/install-capture";
import { GlobalLoader } from "@/components/global-loader";
import { GlobalLoaderTriggers } from "@/components/global-loader-triggers";
import { NotificationBridge } from "@/components/notification-bridge";
import "./globals.css";
// Responsive guards, imported separately so globals.css stays as it was.
import "./responsive-guards.css";
// Remaps the app's older cool-grey utilities onto the warm palette. Imported
// after globals.css so it wins on cascade order. See the file's own comment.
import "./legacy-palette.css";

// The reference components — the glass header, the floating tab bar, the
// seller card, the swipe gallery, the chat shell, the notification rows,
// the compact footer and the profile cards. Imported last so these rules
// win where they overlap the base system. See the file's own comment.
import "./reference.css";
