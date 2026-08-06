-- snowballwise OPC 系统 · Supabase 表结构
-- 用法：在 Supabase 后台 → SQL Editor → 粘贴全部执行。
-- 应用使用 service_role key 访问（绕过 RLS），所以此处关闭 RLS 即可。
-- 对应 src/db.js 的 JSON 结构：users / orders / ledger / clicks / sessions / seq

-- 1. 用户表
create table if not exists users (
  id            text primary key,
  email         text unique not null,
  password_hash text not null,
  promo_code    text unique not null,
  referrer_id   text references users(id),
  depth         int not null default 0,
  balance       numeric(12,2) not null default 0,
  destination   text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists idx_users_promo on users(promo_code);
create index if not exists idx_users_referrer on users(referrer_id);

-- 2. 订单表（联盟报表导入）
create table if not exists orders (
  id           text primary key,
  promo_code   text not null,
  order_amount numeric(12,2) not null,
  commission   numeric(12,2) not null,
  source       text not null default 'unknown',
  imported_at  timestamptz not null default now()
);
create index if not exists idx_orders_promo on orders(promo_code);

-- 3. 账本（每笔分佣/返现一条）
create table if not exists ledger (
  id         text primary key,
  user_id    text not null references users(id),
  type       text not null,
  amount     numeric(12,2) not null,
  order_id   text,
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_ledger_user on ledger(user_id);

-- 4. 点击（专属链接跳转记录）
create table if not exists clicks (
  id          text primary key,
  promo_code  text not null,
  ts          timestamptz not null default now(),
  ip          text
);

-- 5. 会话（token -> user_id）
create table if not exists sessions (
  token   text primary key,
  user_id text not null references users(id)
);

-- 6. 自增序列
create table if not exists seq (
  key text primary key,
  val int not null default 0
);
insert into seq (key, val) values ('userId',0),('orderId',0),('ledgerId',0)
  on conflict (key) do nothing;

-- 关闭 RLS（应用用 service_role 访问）
alter table users      disable row level security;
alter table orders     disable row level security;
alter table ledger     disable row level security;
alter table clicks     disable row level security;
alter table sessions   disable row level security;
alter table seq        disable row level security;
