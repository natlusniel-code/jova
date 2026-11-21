import { AuthSplit } from "@/components/auth-split";
import { ClerkAuthPanel } from "@/components/clerk-auth-panel";
import { getSession, createClient } from "@/lib/supabase/server";
import { postAuthDestination } from "@/lib/post-auth";
import { bridgeClerkSession } from "@/app/auth/clerk-actions";
import { auth } from "@clerk/nextjs/server";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

export default async function SignupPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ role?: string; next?: string; existing?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const initialRole =
    searchParams?.role === "seller"
      ? ("seller" as const)
      : searchParams?.role === "buyer"
        ? ("buyer" as const)
        : null;

  const raw = searchParams?.next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;

  // If the Jova session already exists, this is a login continuation, not a
  // second signup. Skip the auth form and go to the user's real destination.
  const session = await getSession();
  if (session) {
    const destination = await postAuthDestination(
      createClient(),
      session.user.id,
      next,
      session.profile.role,
    );
    redirect(destination);
  }

  // Clerk can remain signed in even when the Supabase bridge was interrupted.
  // Resume that verified session instead of showing "You're already signed in"
  // from Clerk's sign-up resource. Try login first for existing Jova users;
  // if the profile does not exist yet, finish the signup with the selected role.
  if (CLERK_CONFIGURED) {
    const { userId } = await auth();
    if (userId) {
      const loginResult = await bridgeClerkSession({ mode: "signin", next });
      if (loginResult.ok) redirect(loginResult.next);

      if (loginResult.noAccount) {
        const signupResult = await bridgeClerkSession({
          mode: "signup",
          role: initialRole ?? "buyer",
          next,
        });
        if (signupResult.ok) redirect(signupResult.next);
      }
    }
  }

  return (
    <AuthSplit>
      <ClerkAuthPanel
        mode="signup"
        initialRole={initialRole}
        next={next}
        existing={searchParams?.existing === "1"}
      />
    </AuthSplit>
  );
}
