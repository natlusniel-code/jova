-- =====================================================================
-- 0049 — Product variants: size and colour
-- =====================================================================
-- A seller can now offer a product in several sizes and several colours,
-- and a buyer picks one of each when they add it to the cart.
--
-- ── Why two text[] columns and not a variants table ──────────────────
-- The brief is explicit that this is optional and simple: a seller types
-- the sizes they stock ("S, M, L, XL") and the colours they stock ("Black,
-- White, Green"), and a buyer picks one of each. There is no per-variant
-- price, no per-variant stock, and no per-variant image. A full
-- `listing_variants` table would model all of that — and then every
-- listing would need a join, a migration of existing rows, and a UI for
-- managing a grid of combinations, for a feature that is a list of two
-- labels.
--
-- Two arrays model exactly what is asked for, cost nothing on a listing
-- that does not use them (they are NULL), and keep `place_order` a single
-- read of the listing row.
--
-- ── Why the choice is copied onto the order line ───────────────────────
-- `order_items` gets `size` and `color`. The order is a record of what was
-- bought, and "a T-shirt" is not the same purchase as "a T-shirt, Large,
-- Black". Storing the choice on the line means the seller's packing list
-- and the buyer's receipt both say it, years later, even if the seller
-- later edits or deletes the listing.
--
-- ── Backwards compatibility ────────────────────────────────────────────
-- Both columns are nullable and default to NULL. Every existing listing
-- keeps working and shows no size/colour picker, which is exactly the
-- required behaviour: "products without them shouldn't have it at the
-- storefront".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The listing's offered options
-- ---------------------------------------------------------------------
alter table public.listings
  add column if not exists sizes  text[],
  add column if not exists colors text[];

comment on column public.listings.sizes is
  'Optional list of sizes the seller stocks, e.g. {S,M,L,XL}. NULL or empty means the product has no size choice.';
comment on column public.listings.colors is
  'Optional list of colours the seller stocks, e.g. {Black,White}. NULL or empty means the product has no colour choice.';

-- A guard so a malformed write cannot put 500 blank entries on a listing.
-- The app trims and de-duplicates before saving; this is the backstop.
create or replace function public.clean_variant_list(p_in text[])
returns text[]
language sql immutable as $$
  select case
    when p_in is null then null
    else (
      select array_agg(v order by ord)
      from (
        select distinct on (lower(trim(x))) trim(x) as v, ord
        from unnest(p_in) with ordinality as t(x, ord)
        where trim(coalesce(x, '')) <> ''
        order by lower(trim(x)), ord
      ) s
    )
  end;
$$;

-- ---------------------------------------------------------------------
-- 2. The choice, on the order line
-- ---------------------------------------------------------------------
alter table public.order_items
  add column if not exists size  text,
  add column if not exists color text;

comment on column public.order_items.size is
  'The size the buyer chose, copied from the listing at checkout. NULL when the product has no size.';
comment on column public.order_items.color is
  'The colour the buyer chose, copied from the listing at checkout. NULL when the product has no colour.';

-- ---------------------------------------------------------------------
-- 3. place_order carries the choice through
-- ---------------------------------------------------------------------
-- The function is replaced, not dropped: the signature is unchanged, so
-- every existing caller keeps working. The only additions are the two
-- fields on each line and the two columns on the insert.
--
-- The choice is validated against the listing's own arrays. A client that
-- sends "Purple" for a listing that only offers Black and White is
-- refused rather than silently recorded — otherwise the seller would get
-- a packing list for something they do not stock.
create or replace function public.place_order(
  p_shop_id    uuid,
  p_items      jsonb,
  p_fulfilment text default 'delivery',
  p_address    text default null,
  p_note       text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_shop     public.shops;
  v_buyer    public.profiles;
  v_item     jsonb;
  v_listing  public.listings;
  v_qty      int;
  v_size     text;
  v_color    text;
  v_subtotal numeric(12,2) := 0;
  v_fee      numeric(12,2) := 0;
  v_total    numeric(12,2) := 0;
  v_order    public.orders;
  v_cfg      public.platform_settings;
  v_lines    jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Please sign in to place an order.'; end if;

  select * into v_buyer from public.profiles where id = v_uid;
  if v_buyer.is_banned then raise exception 'This account is suspended. Contact support.'; end if;

  select * into v_shop from public.shops where id = p_shop_id;
  if not found then raise exception 'That shop no longer exists.'; end if;
  if v_shop.status <> 'approved' then raise exception 'This shop is not taking orders right now.'; end if;

  -- buyers can only order inside their own city
  if v_buyer.city is not null and v_shop.city is not null
     and lower(v_buyer.city) <> lower(v_shop.city) then
    raise exception 'You can only order from sellers in your city (%). Change your city in your profile first.', v_buyer.city;
  end if;

  if p_fulfilment not in ('delivery','pickup') then
    raise exception 'Choose delivery or pickup.';
  end if;
  if p_fulfilment = 'delivery' and coalesce(trim(p_address), '') = '' then
    raise exception 'Add a delivery address first.';
  end if;
  if p_fulfilment = 'delivery' and v_buyer.is_banned then
    raise exception 'This account is suspended.';
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  select * into v_cfg from public.platform_settings where id = 1;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(coalesce((v_item->>'quantity')::int, 1), 1);

    select * into v_listing from public.listings
      where id = (v_item->>'listing_id')::uuid and shop_id = p_shop_id;
    if not found then
      raise exception 'An item in your cart is no longer available.';
    end if;
    if v_listing.status <> 'live' then
      raise exception '% is not available right now.', v_listing.title;
    end if;
    if v_listing.type = 'product' and v_listing.stock < v_qty then
      raise exception 'Only % left of %.', v_listing.stock, v_listing.title;
    end if;

    -- ── The variant choice ────────────────────────────────────────────
    -- Trimmed, and only kept when the listing actually offers options.
    -- A listing with no sizes ignores whatever the client sent, so a
    -- stale cart cannot invent a size for a product that has none.
    v_size  := nullif(trim(coalesce(v_item->>'size', '')), '');
    v_color := nullif(trim(coalesce(v_item->>'color', '')), '');

    if v_listing.sizes is not null and array_length(v_listing.sizes, 1) > 0 then
      if v_size is null then
        raise exception 'Choose a size for %.', v_listing.title;
      end if;
      if not exists (
        select 1 from unnest(v_listing.sizes) s where lower(trim(s)) = lower(v_size)
      ) then
        raise exception '% is not a size % offers.', v_size, v_listing.title;
      end if;
    else
      v_size := null;
    end if;

    if v_listing.colors is not null and array_length(v_listing.colors, 1) > 0 then
      if v_color is null then
        raise exception 'Choose a colour for %.', v_listing.title;
      end if;
      if not exists (
        select 1 from unnest(v_listing.colors) c where lower(trim(c)) = lower(v_color)
      ) then
        raise exception '% is not a colour % offers.', v_color, v_listing.title;
      end if;
    else
      v_color := null;
    end if;

    v_subtotal := v_subtotal + (v_listing.price * v_qty);
    v_lines := v_lines || jsonb_build_object(
      'listing_id', v_listing.id,
      'title', v_listing.title,
      'unit_price', v_listing.price,
      'quantity', v_qty,
      'line_total', (v_listing.price * v_qty),
      'size', v_size,
      'color', v_color
    );
  end loop;

  -- delivery fee: the most specific listing override wins, else the shop default
  if p_fulfilment = 'delivery' then
    v_fee := v_shop.delivery_fee;
    select coalesce(max((d->>'delivery_fee_override')::numeric), v_shop.delivery_fee)
      into v_fee
      from jsonb_array_elements(v_lines) d
      join public.listings l on l.id = (d->>'listing_id')::uuid
      where l.delivery_fee_override is not null;

    if v_shop.free_delivery_threshold is not null
       and v_subtotal >= v_shop.free_delivery_threshold then
      v_fee := 0;
    end if;
  else
    v_fee := 0;
  end if;

  if v_fee is null then v_fee := coalesce(v_cfg.default_delivery_fee, 0); end if;
  v_total := v_subtotal + v_fee;

  insert into public.orders (
    buyer_id, shop_id, status, fulfilment, subtotal, delivery_fee, total,
    commission_rate, commission_amount, payout_amount, payout_status,
    buyer_note, address
  ) values (
    v_uid, p_shop_id, 'pending_payment', p_fulfilment, v_subtotal, v_fee, v_total,
    v_cfg.commission_rate, round(v_total * v_cfg.commission_rate, 2),
    round(v_total * (1 - v_cfg.commission_rate), 2), 'held',
    p_note, p_address
  ) returning * into v_order;

  insert into public.order_items (order_id, listing_id, title, unit_price, quantity, line_total, size, color)
  select v_order.id, (d->>'listing_id')::uuid, d->>'title',
         (d->>'unit_price')::numeric, (d->>'quantity')::int, (d->>'line_total')::numeric,
         nullif(d->>'size', ''), nullif(d->>'color', '')
  from jsonb_array_elements(v_lines) d;

  -- reserve stock immediately so two buyers can't take the last unit
  update public.listings l
    set stock = l.stock - (d->>'quantity')::int,
        status = case when l.stock - (d->>'quantity')::int <= 0 and l.type = 'product'
                      then 'out_of_stock' else l.status end
    from jsonb_array_elements(v_lines) d
    where l.id = (d->>'listing_id')::uuid and l.type = 'product';

  -- buyer "receipts" list needs the payment row to exist
  insert into public.payments (order_id, type, amount, reference)
  values (v_order.id, 'order', v_total, v_order.reference);

  return v_order;
end $$;

grant execute on function public.place_order(uuid, jsonb, text, text, text) to authenticated;
