-- ─────────────────────────────────────────────────────────────────────
-- CHASSIS — schéma Supabase (Postgres)
-- Doctrine encodée en base :
--   * memory_tokens exige une provenance (verdict ou settlement) :
--     pas d'insertion de mémoire sans preuve (contrainte CHECK).
--   * Les verdicts sont immuables (pas d'UPDATE accordé).
--   * RLS : chaque membre ne voit que les instances dont il est membre.
-- ─────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── Instances (un vertical instancié par un client) ──────────────────
create table public.instances (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  domain      text not null,                  -- ex. "paie", "douanes", "facturation"
  created_at  timestamptz not null default now()
);

create table public.instance_members (
  instance_id uuid not null references public.instances(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','member')),
  primary key (instance_id, user_id)
);

-- ── Catégories & autonomie ────────────────────────────────────────────
create table public.categories (
  id                  uuid primary key default gen_random_uuid(),
  instance_id         uuid not null references public.instances(id) on delete cascade,
  label               text not null,
  autonomy            text not null default 'shadow'
                      check (autonomy in ('shadow','copilot','auto')),
  autonomy_threshold  numeric not null default 0.98
                      check (autonomy_threshold between 0 and 1)
);

-- ── Intentions (l'unité de travail) ───────────────────────────────────
create table public.intentions (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references public.instances(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  title        text not null,
  payload      jsonb,
  -- critère de vérification : null = hors périmètre par construction
  criterion    jsonb,
  status       text not null default 'queued'
               check (status in ('queued','processing','verified','anomaly',
                                 'out_of_scope','applied','settled')),
  created_at   timestamptz not null default now()
);
create index on public.intentions (instance_id, status);

-- ── Candidats produits par la boucle ─────────────────────────────────
create table public.candidates (
  id            uuid primary key default gen_random_uuid(),
  intention_id  uuid not null references public.intentions(id) on delete cascade,
  content       jsonb,
  produced_by   text not null,                -- id du moteur (traçabilité)
  cost_usd      numeric not null default 0,
  latency_ms    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ── Règles du harness (versionnées, auditables) ──────────────────────
create table public.harness_rules (
  id           text not null,
  version      integer not null,
  instance_id  uuid not null references public.instances(id) on delete cascade,
  description  text not null,
  origin       text not null check (origin in ('declared','learned')),
  spec         jsonb not null,                -- définition exécutable de la règle
  created_at   timestamptz not null default now(),
  primary key (instance_id, id, version)
);

-- ── Verdicts (immuables) ──────────────────────────────────────────────
create table public.verdicts (
  id                   uuid primary key default gen_random_uuid(),
  candidate_id         uuid not null references public.candidates(id) on delete cascade,
  intention_id         uuid not null references public.intentions(id) on delete cascade,
  outcome              text not null check (outcome in ('passed','rejected','unverifiable')),
  findings             jsonb not null default '[]',
  harness_reliability  numeric not null,
  issued_at            timestamptz not null default now()
);
create index on public.verdicts (intention_id);

-- ── Verdicts du monde réel (la boucle fermée) ─────────────────────────
create table public.settlements (
  intention_id  uuid primary key references public.intentions(id) on delete cascade,
  accepted      boolean not null,
  motive        text,
  settled_at    timestamptz not null default now()
);

-- ── Mémoire darwinienne ───────────────────────────────────────────────
create table public.memory_tokens (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null references public.instances(id) on delete cascade,
  kind           text not null check (kind in ('validated_fix','learned_rejection','convention')),
  summary        text not null,
  -- provenance OBLIGATOIRE : un jeton sans preuve d'origine est impossible
  verdict_id     uuid references public.verdicts(id),
  settlement_id  uuid references public.settlements(intention_id),
  revoked        boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint memory_requires_provenance
    check (verdict_id is not null or settlement_id is not null)
);
create index on public.memory_tokens (instance_id) where not revoked;

-- ── La courbe (principe 8) ────────────────────────────────────────────
create table public.curve_points (
  instance_id      uuid not null references public.instances(id) on delete cascade,
  week_iso         text not null,             -- ex. "2026-W23"
  with_memory      boolean not null,
  first_pass_rate  numeric not null check (first_pass_rate between 0 and 1),
  sample_size      integer not null,
  primary key (instance_id, week_iso, with_memory)
);

-- ─────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────
alter table public.instances        enable row level security;
alter table public.instance_members enable row level security;
alter table public.categories       enable row level security;
alter table public.intentions       enable row level security;
alter table public.candidates       enable row level security;
alter table public.harness_rules    enable row level security;
alter table public.verdicts         enable row level security;
alter table public.settlements      enable row level security;
alter table public.memory_tokens    enable row level security;
alter table public.curve_points     enable row level security;

create or replace function public.is_member(p_instance uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.instance_members m
    where m.instance_id = p_instance and m.user_id = auth.uid()
  );
$$;

create policy "membres : lecture instance" on public.instances
  for select using (public.is_member(id));

create policy "membres : lecture membres" on public.instance_members
  for select using (public.is_member(instance_id));

create policy "membres : catégories" on public.categories
  for all using (public.is_member(instance_id)) with check (public.is_member(instance_id));

create policy "membres : intentions" on public.intentions
  for all using (public.is_member(instance_id)) with check (public.is_member(instance_id));

create policy "membres : candidats" on public.candidates
  for all using (public.is_member((select instance_id from public.intentions i where i.id = intention_id)))
  with check (public.is_member((select instance_id from public.intentions i where i.id = intention_id)));

create policy "membres : règles" on public.harness_rules
  for all using (public.is_member(instance_id)) with check (public.is_member(instance_id));

-- Verdicts : lecture + insertion seulement. AUCUNE policy UPDATE/DELETE
-- → immuables pour les clients (seul le service_role pourrait y toucher).
create policy "membres : verdicts lecture" on public.verdicts
  for select using (public.is_member((select instance_id from public.intentions i where i.id = intention_id)));
create policy "membres : verdicts insertion" on public.verdicts
  for insert with check (public.is_member((select instance_id from public.intentions i where i.id = intention_id)));

create policy "membres : settlements" on public.settlements
  for all using (public.is_member((select instance_id from public.intentions i where i.id = intention_id)))
  with check (public.is_member((select instance_id from public.intentions i where i.id = intention_id)));

create policy "membres : mémoire" on public.memory_tokens
  for all using (public.is_member(instance_id)) with check (public.is_member(instance_id));

create policy "membres : courbe" on public.curve_points
  for all using (public.is_member(instance_id)) with check (public.is_member(instance_id));

-- ─────────────────────────────────────────────────────────────────────
-- Bootstrap : création d'instance par un utilisateur connecté.
-- instances/instance_members n'ont volontairement AUCUNE policy INSERT :
-- cette fonction (security definer) est la seule voie, et elle attache
-- toujours le créateur comme owner + crée la catégorie par défaut.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.create_instance(p_name text, p_domain text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_domain), '') = '' then
    raise exception 'Nom et domaine requis.';
  end if;
  insert into public.instances (name, domain) values (trim(p_name), trim(p_domain))
    returning id into v_id;
  insert into public.instance_members (instance_id, user_id, role)
    values (v_id, auth.uid(), 'owner');
  insert into public.categories (instance_id, label) values (v_id, 'Général');
  return v_id;
end;
$$;

revoke execute on function public.create_instance(text, text) from public, anon;
grant execute on function public.create_instance(text, text) to authenticated;
