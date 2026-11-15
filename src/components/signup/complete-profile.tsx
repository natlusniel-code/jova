"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeGoogleProfileAction } from "@/app/auth/actions";
import { NIGERIA_STATES, lgasFor, cn } from "@/lib/utils";
import { Spinner, Alert } from "@/components/ui";

/**
 * The buyer's last signup step after Google.
 *
 * Google already gave us the name and email, so this form asks only for what
 * is genuinely missing: a phone number and a local government. Both are
 * required — the phone is the password-reset factor, and the LGA decides which
 * sellers the buyer can order from.
 *
 * The name is shown but editable, because a Google display name is often not
 * the name someone wants on their orders ("Tunde A." rather than "Tunde
 * Adebayo"). It is prefilled, so the common case is one tap.
 */
export function CompleteProfile({
  initial,
}: {
  initial: { full_name: string; phone: string; state: string; city: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: initial.full_name,
    phone: initial.phone,
    state: initial.state,
    city: initial.city,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const lg = lgasFor(form.state);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();

    const e: Record<string, string> = {};
    if (form.full_name.trim().length < 3) e.full_name = "Enter your full name.";
    if (!/^0\d{10}$/.test(form.phone.replace(/\s/g, "")))
      e.phone = "Use 11 digits, like 08012345678.";
    if (!form.city) e.city = "Choose your local government.";
    setErrors(e);
    if (Object.keys(e).length) return;

    const fd = new FormData();
    fd.set("full_name", form.full_name.trim());
    fd.set("phone", form.phone.replace(/\s/g, ""));
    fd.set("state", form.state);
    fd.set("city", form.city);

    startTransition(async () => {
      const result = await completeGoogleProfileAction(fd);
      if (!result.ok) {
        if (result.field) setErrors({ [result.field]: result.error });
        else setErrors({ form: result.error });
        return;
      }
      router.push(result.next ?? "/");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 text-[12px] font-semibold text-ink-400">
        <span className="flex items-center gap-1.5 text-brand-600">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-[11px] text-white">1</span>
          Google
        </span>
        <span className="h-px w-5 bg-slate-200" />
        <span className="flex items-center gap-1.5 text-brand-600">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-[11px] text-white">2</span>
          Your details
        </span>
        <span className="h-px w-5 bg-slate-200" />
        <span className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-[11px] text-ink-500">3</span>
          Shop
        </span>
      </div>

      <h1 className="text-[25px] font-extrabold tracking-tight text-ink-900">
        Almost there
      </h1>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500">
        Your Google account is connected. We just need two more things so sellers
        can reach you and so we show you goods near you.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3.5" noValidate>
        <div>
          <label className="nm-label" htmlFor="full_name">Full name</label>
          <input
            id="full_name"
            className="nm-input"
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            placeholder="Adaeze Okonkwo"
            autoComplete="name"
          />
          {errors.full_name && <p className="mt-1 text-[12px] font-medium text-red-600">{errors.full_name}</p>}
        </div>

        <div>
          <label className="nm-label" htmlFor="phone">Phone number</label>
          <input
            id="phone"
            inputMode="tel"
            className={cn("nm-input", errors.phone && "border-red-400")}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="08012345678"
            autoComplete="tel"
          />
          {errors.phone && <p className="mt-1 text-[12px] font-medium text-red-600">{errors.phone}</p>}
          <p className="mt-1 text-[11.5px] text-ink-400">
            Keep this accurate — it&apos;s how you&apos;ll reset your password.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nm-label" htmlFor="state">State</label>
            <select
              id="state"
              className="nm-input"
              value={form.state}
              onChange={(e) => {
                const st = e.target.value;
                const first = lgasFor(st)[0] ?? "";
                setForm((f) => ({ ...f, state: st, city: first }));
              }}
            >
              {NIGERIA_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="nm-label" htmlFor="city">Local government</label>
            <select
              id="city"
              className={cn("nm-input", errors.city && "border-red-400")}
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            >
              {(lg.length ? lg : [form.city]).filter(Boolean).map((c) => <option key={c}>{c}</option>)}
            </select>
            {errors.city && <p className="mt-1 text-[12px] font-medium text-red-600">{errors.city}</p>}
          </div>
        </div>

        <Alert tone="blue">
          Buyers can only order from sellers in their own city. Choose the local
          government where you actually want deliveries.
        </Alert>

        {errors.form && <Alert tone="red">{errors.form}</Alert>}

        <button type="submit" disabled={pending} className="nm-btn-primary w-full !py-3">
          {pending ? <><Spinner /> Saving…</> : "Finish and start shopping"}
        </button>
      </form>
    </div>
  );
}
