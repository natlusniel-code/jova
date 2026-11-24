import { FirebaseVerifyClient } from "@/components/firebase-verify-client";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ oobCode?: string; role?: string; next?: string }>;
}) {
  const params = await searchParamsPromise;
  const role = params.role === "seller" ? "seller" : "buyer";
  const next =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : null;

  return (
    <FirebaseVerifyClient
      code={params.oobCode ?? null}
      role={role}
      next={next}
    />
  );
}
