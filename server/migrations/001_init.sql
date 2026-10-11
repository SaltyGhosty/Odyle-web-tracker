create table users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  token_version integer not null default 0,
  created_at timestamptz not null default now(),
  failed_logins integer not null default 0,
  locked_until timestamptz
);

create table refresh_tokens (
  id text primary key,
  user_id text not null,
  family_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  user_agent text
);
create index refresh_tokens_user_idx on refresh_tokens (user_id);
create index refresh_tokens_family_idx on refresh_tokens (family_id);

create table email_tokens (
  id text primary key,
  user_id text not null,
  kind text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index email_tokens_user_idx on email_tokens (user_id);

create table docs (
  path text primary key,
  parent text not null,
  data jsonb not null,
  updated_at bigint not null
);
create index docs_parent_idx on docs (parent);

create table legion_codes (
  legion_id text primary key,
  code_hash text not null unique,
  code_enc text not null
);
