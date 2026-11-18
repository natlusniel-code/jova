-- =====================================================================
-- Jova — 0043 Admin RPCs are the single source of truth
--
-- Problem this fixes
-- ------------------
-- The admin console (src/app/admin-fuckliving/actions.ts) performed direct
-- writes with the service-role client and re-implemented, in TypeScript, the
-- business rules of:
--
--   admin_verify_payment, admin_resolve_dispute, admin_mark_payout_paid,
--   admin_set_shop_status, admin_save_payment_account,
--   admin_delete_payment_account
--
-- Two copies of the same rules drift. They already had: the TS copy of
-- `admin_resolve_dispute` hardcoded a one-day payout hold while the SQL used
-- `payout_hold_days`, and the TS copy of `admin_verify_payment` cancelled the
-- order and notified the buyer on rejection while the SQL copy only restored
-- stock.
--
-- Why the console could not just call the RPCs
-- --------------------------------------------
-- Every `admin_*` RPC opens with `if not public.is_admin()`, and
-- `public.is_admin()` was true only for a caller with `auth.uid()` in
-- `admin_users`. A Server Action authenticates with the SERVICE ROLE key, which
-- has no `auth.uid()` — so the guard rejected the one caller that had already
-- been authorised by `requireAdmin()` against the session.
--
-- The fix
-- -------
-- `is_admin()` now also returns true when the request is authenticated as
-- `service_role`. That is not a weakening:
--   * the service-role key is server-only and never reaches the browser;
--   * a browser holding the public anon key cannot claim the `service_role`
--     role — PostgREST derives the role from the verified JWT, not from a
--     client-supplied value;
--   * the service role already bypasses RLS entirely, so it was never
--     constrained by `is_admin()` in a policy.
--
-- The RPCs also gain an optional `p_actor uuid` used ONLY for the audit columns
-- (`verified_by`, `resolved_by`). It is never used for authorisation, so a
-- caller cannot escalate by passing someone else's id.
--
-- Run AFTER 0042.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. is_admin(): accept the service role as an authenticated admin caller
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select
    -- a signed-in user with an admin_users row (browser / anon client)
    exists (select 1 from public.admin_users a where a.user_id = auth.uid())
    -- a server-side caller using the service-role key (Server Actions).
    -- PostgREST puts the verified JWT role in the request settings; a client
    -- cannot forge it, because the claim comes from the signed token.
    -- Both spellings are checked so this works across PostgREST versions:
    --   request.jwt.claim.role  — the per-claim text setting (legacy)
    --   request.jwt.claims      — the whole claims object as JSON
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or coalesce(
         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
         ''
       ) = 'service_role';
$$;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- 2. admin_verify_payment — the escrow gate
--
--    Adds p_actor (audit only) and moves the rejection side-effects that only
--    existed in TypeScript into the RPC: a denied receipt now cancels the
--    unpaid order and tells the buyer why, so the buyer's tracking page, the
--    seller's view and the admin queue all agree.
-- ---------------------------------------------------------------------
drop function if exists public.admin_verify_payment(uuid, boolean, text);

create or replace function public.admin_verify_payment(
  p_payment_id uuid,
  p_approve    boolean,
  p_reason     text default null,
  p_actor      uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pay   public.payments;
  v_order public.orders;
  v_shop  public.shops;
  v_cfg   public.platform_settings;
  v_first boolean := false;
  v_owner uuid;
  v_offer public.offers;
  v_days  int;
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when rejecting.';
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  if v_pay.status = 'verified' then raise exception 'That payment is already verified.'; end if;

  -- ── Reject ────────────────────────────────────────────────────────────
  if not p_approve then
    update public.payments
       set status = 'rejected', reject_reason = p_reason,
           verified_by = v_actor, verified_at = now()
     where id = p_payment_id;

    if v_pay.type = 'order' and v_pay.order_id is not null then
      select * into v_order from public.orders where id = v_pay.order_id for update;

      if v_order.status = 'pending_payment' then
        -- give back the reserved stock
        update public.listings l
           set stock = l.stock + oi.quantity,
               status = case when l.status = 'out_of_stock' then 'live' else l.status end
          from public.order_items oi
         where oi.order_id = v_order.id and l.id = oi.listing_id and l.type = 'product';

        -- end the order, not just the payment: otherwise the buyer's tracking
        -- page still offers an upload button and the seller still sees it live
        update public.orders
           set status = 'cancelled',
               decline_reason = p_reason,
               payout_status = 'held'
         where id = v_order.id;

        if v_order.buyer_id is not null then
          insert into public.notifications (user_id, kind, title, body, href, order_id)
          values (
            v_order.buyer_id, 'order', 'Payment not verified',
            format('We could not verify your payment for %s. Reason: %s. The order has been cancelled — you can place it again with a valid receipt.',
                   v_order.reference, p_reason),
            '/orders/' || v_order.id, v_order.id
          );
        end if;
      end if;
    end if;

    if v_pay.type = 'subscription' and v_pay.shop_id is not null then
      update public.shops set subscription_status = 'expired' where id = v_pay.shop_id;
    end if;
    return;
  end if;

  -- ── Approve ───────────────────────────────────────────────────────────
  update public.payments
     set status = 'verified', verified_by = v_actor, verified_at = now(), reject_reason = null
   where id = p_payment_id;

  if v_pay.type = 'order' and v_pay.order_id is not null then
    select * into v_order from public.orders where id = v_pay.order_id for update;
    if v_order.status = 'pending_payment' then
      update public.orders
         set status = 'paid', accepted_at = null,
             auto_cancel_at = now() + interval '24 hours'
       where id = v_order.id;
    end if;

    -- ── The seller is told now, and only now ─────────────────────────────
    -- This is the first moment the buyer's money is confirmed. An offer
    -- that was merely accepted is not news the seller can act on.
    select s.owner_id into v_owner from public.shops s where s.id = v_order.shop_id;
    select * into v_offer from public.offers where order_id = v_order.id limit 1;

    if v_owner is not null then
      v_days := coalesce(v_order.delivery_days, v_offer.delivery_days);

      insert into public.notifications (user_id, kind, title, body, href, order_id)
      values (
        v_owner, 'order',
        case when v_offer.id is not null then 'Offer accepted and paid' else 'New order received' end,
        case
          when v_offer.id is not null then
            format('The buyer accepted your offer and payment is verified — %s. %s',
                   v_order.reference,
                   case when v_days is not null
                        then format('You will be delivering in %s day%s.', v_days, case when v_days = 1 then '' else 's' end)
                        else 'Start work when you are ready.' end)
          else
            format('%s — N%s. Accept it within 24 hours.', v_order.reference, to_char(v_order.total, 'FM999,999,999.00'))
        end,
        '/seller/orders', v_order.id
      );
    end if;

    perform public.nm_notify_admin(
      'Payment verified',
      format('%s — N%s verified for %s.', v_order.reference,
             to_char(v_order.total, 'FM999,999,999.00'),
             coalesce((select s.name from public.shops s where s.id = v_order.shop_id), 'a shop')),
      '/admin-fuckliving/payments', 'order'
    );

  elsif v_pay.type = 'subscription' and v_pay.shop_id is not null then
    select * into v_shop from public.shops where id = v_pay.shop_id for update;
    select * into v_cfg from public.platform_settings where id = 1;

    v_first := not coalesce(v_shop.first_payment_deducted, false);

    update public.shops
       set subscription_status = 'pending',
           first_payment_deducted = true
     where id = v_shop.id;

    if v_first then
      update public.shops
         set subscription_status = 'active',
             subscription_expires_at = now() + interval '30 days'
       where id = v_shop.id;
    else
      update public.shops
         set subscription_status = 'active',
             subscription_expires_at = greatest(coalesce(subscription_expires_at, now()), now()) + interval '30 days'
       where id = v_shop.id;
    end if;

    update public.listings set status = 'live'
     where shop_id = v_shop.id and status = 'hidden';

    perform public.nm_notify_admin(
      'Subscription verified',
      format('%s renewed for 30 days.', v_shop.name),
      '/admin-fuckliving/payments', 'order'
    );
  end if;
end $$;

grant execute on function public.admin_verify_payment(uuid, boolean, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. admin_resolve_dispute — adds p_actor (audit only)
-- ---------------------------------------------------------------------
drop function if exists public.admin_resolve_dispute(uuid, text, text);

create or replace function public.admin_resolve_dispute(
  p_dispute_id uuid, p_outcome text, p_note text default null, p_actor uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_d public.disputes; v_order public.orders; v_days int;
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_outcome not in ('resolved_buyer','resolved_seller') then
    raise exception 'Choose who the dispute resolves in favour of.';
  end if;

  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found.'; end if;
  select * into v_order from public.orders where id = v_d.order_id for update;

  update public.disputes
     set status = p_outcome, resolution_note = p_note,
         resolved_by = v_actor, resolved_at = now()
   where id = p_dispute_id;

  if p_outcome = 'resolved_buyer' then
    update public.orders set status = 'cancelled', payout_status = 'held' where id = v_order.id;
    delete from public.payouts where order_id = v_order.id and status = 'queued';
  else
    select coalesce(payout_hold_days, 4) into v_days from public.platform_settings where id = 1;
    v_days := coalesce(v_days, 4);

    update public.orders
       set status = 'delivered', delivered_at = coalesce(delivered_at, now()), payout_status = 'released'
     where id = v_order.id;
    insert into public.payouts (shop_id, order_id, amount, gross_amount, commission_amount, kind, status, available_at)
    values (v_order.shop_id, v_order.id, v_order.payout_amount, v_order.total,
            v_order.commission_amount, 'order', 'queued', now() + make_interval(days => v_days));
  end if;
end $$;

grant execute on function public.admin_resolve_dispute(uuid, text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. admin_mark_payout_paid — adds p_actor (accepted, unused for auth)
-- ---------------------------------------------------------------------
drop function if exists public.admin_mark_payout_paid(uuid, text);

create or replace function public.admin_mark_payout_paid(
  p_payout_id uuid, p_reference text default null, p_actor uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;

  update public.payouts
     set status = 'paid', paid_at = now(),
         reference = coalesce(nullif(btrim(p_reference), ''), reference,
                              'PO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)))
   where id = p_payout_id and status = 'queued';
  if not found then raise exception 'Payout not found or already paid.'; end if;

  update public.orders o set payout_status = 'paid'
    from public.payouts p where p.id = p_payout_id and o.id = p.order_id;
end $$;

grant execute on function public.admin_mark_payout_paid(uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. admin_set_shop_status — adds p_actor (audit only)
-- ---------------------------------------------------------------------
drop function if exists public.admin_set_shop_status(uuid, text, text, boolean);

create or replace function public.admin_set_shop_status(
  p_shop_id uuid, p_status text, p_note text default null,
  p_verified boolean default null, p_actor uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_status not in ('pending','approved','suspended','rejected') then
    raise exception 'Unknown status.';
  end if;
  if p_status <> 'approved' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Write a short message — the seller receives it.';
  end if;

  update public.shops
     set status = p_status,
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         verified = coalesce(p_verified, verified)
   where id = p_shop_id;
  if not found then raise exception 'Shop not found.'; end if;

  if p_status = 'approved' then
    update public.listings set status = 'live'
     where shop_id = p_shop_id and status = 'hidden';
    insert into public.seller_scores (shop_id, new_seller_boost_until)
    values (p_shop_id, now() + interval '30 days')
    on conflict (shop_id) do update set new_seller_boost_until = excluded.new_seller_boost_until;
  end if;

  if p_status in ('suspended','rejected') then
    update public.listings set status = 'hidden'
     where shop_id = p_shop_id and status = 'live';
  end if;
end $$;

grant execute on function public.admin_set_shop_status(uuid, text, text, boolean, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Payment accounts — the RPCs already hold the rules; only the guard
--    needed fixing, which section 1 did. Re-grant for the service role.
-- ---------------------------------------------------------------------
grant execute on function public.admin_save_payment_account(uuid, text, text, text, text, text, boolean, int)
  to authenticated, service_role;
grant execute on function public.admin_delete_payment_account(uuid)
  to authenticated, service_role;
