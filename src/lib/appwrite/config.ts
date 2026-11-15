/**
 * Public Appwrite configuration.
 *
 * Both values are safe to ship to the browser: the endpoint is a URL and the
 * project ID identifies the project, it does not authorise anything. Access is
 * controlled by the Appwrite session and by the Google OAuth client secret,
 * which lives ONLY in the Appwrite Console and never appears in this repo.
 *
 * Kept in its own module (no `"use client"`, no SDK import) so both the browser
 * client and the server bridge can read it without dragging the Web SDK into a
 * Server Component.
 */

export const APPWRITE_ENDPOINT = "https://nyc.cloud.appwrite.io/v1";
export const APPWRITE_PROJECT_ID = "6af94f00001c084b1bdf";
