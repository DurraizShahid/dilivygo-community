-- POS checkout mode: quick (walk-in sale, completed immediately) vs kitchen (in-store prep queue, no rider dispatch).

alter table orders add column if not exists pos_checkout_mode text;

alter table orders drop constraint if exists orders_pos_checkout_mode_check;
alter table orders add constraint orders_pos_checkout_mode_check check (
  pos_checkout_mode is null or pos_checkout_mode in ('quick', 'kitchen')
);

create index if not exists orders_shop_pos_checkout_mode_idx
  on orders (shop_id, pos_checkout_mode)
  where pos_checkout_mode is not null;
