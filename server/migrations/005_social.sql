-- Amigos, bloqueos, mensajes y denuncias (spec 2026-10-13 §3). Sin CHECK ni índices parciales: pg-mem no los soporta;
-- los valores permitidos se validan en el código. Fechas en milisegundos (bigint), como docs.updated_at.
create table friendships (
  user_a text not null references users (id) on delete cascade,
  user_b text not null references users (id) on delete cascade,
  status text not null,
  requested_by text not null references users (id) on delete cascade,
  created_at bigint not null,
  accepted_at bigint,
  primary key (user_a, user_b)
);
create index friendships_b_idx on friendships (user_b);

create table blocks (
  blocker text not null references users (id) on delete cascade,
  blocked text not null references users (id) on delete cascade,
  created_at bigint not null,
  primary key (blocker, blocked)
);
create index blocks_blocked_idx on blocks (blocked);

create table messages (
  id text primary key,
  pair_key text not null,
  sender text not null references users (id) on delete cascade,
  recipient text not null references users (id) on delete cascade,
  kind text not null,
  body jsonb not null,
  created_at bigint not null,
  read_at bigint,
  client_id text not null,
  unique (sender, client_id)
);
create index messages_pair_idx on messages (pair_key, created_at);
create index messages_recipient_idx on messages (recipient, read_at);

create table reports (
  id text primary key,
  reporter text not null references users (id) on delete cascade,
  reported text not null references users (id) on delete cascade,
  message_id text references messages (id) on delete set null,
  reason text not null,
  note text,
  created_at bigint not null
);
