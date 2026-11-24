import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function firebaseAdminApp() {
  const existing = getApps().find((app) => app.name === "jova-firebase-admin");
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("Firebase server authentication is not configured.");
  }

  let serviceAccount: {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }

  if (
    !serviceAccount.project_id ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key
  ) {
    throw new Error("Firebase service account JSON is missing required fields.");
  }

  const expectedProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (expectedProject && serviceAccount.project_id !== expectedProject) {
    throw new Error("Firebase service account belongs to a different project.");
  }

  return initializeApp(
    {
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
      }),
      projectId: serviceAccount.project_id,
    },
    "jova-firebase-admin",
  );
}

/** Verify signature, issuer, audience, expiry and revocation with Firebase. */
export async function verifyFirebaseIdToken(idToken: string) {
  if (!idToken || idToken.length > 10_000) {
    throw new Error("Your sign-in token is invalid. Please sign in again.");
  }

  const decoded = await getAuth(firebaseAdminApp()).verifyIdToken(idToken, true);
  if (!decoded.email || decoded.email_verified !== true) {
    throw new Error("Please verify your email address before continuing.");
  }

  return {
    uid: decoded.uid,
    email: decoded.email.trim().toLowerCase(),
    name:
      typeof decoded.name === "string" && decoded.name.trim()
        ? decoded.name.trim()
        : null,
    picture: typeof decoded.picture === "string" ? decoded.picture : null,
  };
}
