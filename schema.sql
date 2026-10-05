-- =====================================================================
--  LA REGATTA · Taplink + Registro + Encuesta + Juego + Dashboard
--  Ejecutar completo en Supabase > SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. CONFIGURACIÓN (una sola fila) — el admin activa / apaga el juego
-- ---------------------------------------------------------------------
create table if not exists settings (
  id               int primary key default 1 check (id = 1),
  game_active      boolean not null default false,
  win_probability  numeric(4,3) not null default 0.300 check (win_probability between 0 and 1),
  max_attempts     int not null default 3 check (max_attempts >= 1),
  updated_at       timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. PREMIOS con inventario: 5 × 10 %, 5 × 5 %, 1 × cena para 2
-- ---------------------------------------------------------------------
create table if not exists prizes (
  id               serial primary key,
  code             text unique not null,
  label            text not null,
  stock_total      int not null check (stock_total >= 0),
  stock_remaining  int not null check (stock_remaining >= 0),
  active           boolean not null default true,
  sort             int not null default 0
);
insert into prizes (code, label, stock_total, stock_remaining, sort) values
  ('DESC10', '10% de descuento en tu cena', 5, 5, 1),
  ('DESC5',  '5% de descuento en tu cena',  5, 5, 2),
  ('CENA2',  'Cena para 2 personas',        1, 1, 3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 3. REGISTROS
-- ---------------------------------------------------------------------
create table if not exists registrations (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  email              text not null,
  phone              text not null,
  city               text not null,
  attempts           int not null default 0,
  prize_id           int references prizes(id),
  voucher            text unique,
  survey_completed   boolean not null default false,
  created_at         timestamptz not null default now()
);
create unique index if not exists registrations_email_uq on registrations (lower(email));

-- ---------------------------------------------------------------------
-- 4. EVENTOS (visitas a URLs y clics en botones)
-- ---------------------------------------------------------------------
create table if not exists events (
  id           bigserial primary key,
  type         text not null check (type in ('visit','click')),
  target       text,            -- nombre del botón o ruta visitada
  path         text,
  session_id   text,
  created_at   timestamptz not null default now()
);
create index if not exists events_type_idx on events (type, target);
create index if not exists events_created_idx on events (created_at);

-- ---------------------------------------------------------------------
-- 5. ENCUESTA (preguntas editables por el admin)
--    type: single   = selección única
--          multiple = selección múltiple (casillas)
--          text     = respuesta libre
--          scale    = escala 1..5 (cuantitativa)
--          number   = número libre (cuantitativa)
--    measure: cuantitativa | cualitativa (para clasificar en el dashboard)
-- ---------------------------------------------------------------------
create table if not exists survey_questions (
  id          serial primary key,
  question    text not null,
  type        text not null check (type in ('single','multiple','text','scale','number')),
  measure     text not null default 'cualitativa' check (measure in ('cuantitativa','cualitativa')),
  options     jsonb not null default '[]'::jsonb,
  required    boolean not null default true,
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists survey_answers (
  id               bigserial primary key,
  registration_id  uuid not null references registrations(id) on delete cascade,
  question_id      int references survey_questions(id) on delete set null,
  question_text    text not null,           -- copia del texto por si luego se edita/elimina
  answer           jsonb not null,
  created_at       timestamptz not null default now()
);

-- Preguntas de ejemplo (puedes editarlas/eliminarlas desde /admin)
insert into survey_questions (question, type, measure, options, sort)
select * from (values
  ('¿Cómo nos conociste?', 'single', 'cualitativa',
     '["Instagram","Facebook","Recomendación","Hotel / agencia","Caminando por la isla"]'::jsonb, 1),
  ('¿Qué te gustaría probar?', 'multiple', 'cualitativa',
     '["Mariscos","Pescado del día","Langosta","Cócteles","Postres"]'::jsonb, 2),
  ('Del 1 al 5, ¿qué tan probable es que nos visites?', 'scale', 'cuantitativa', '[]'::jsonb, 3),
  ('¿Cuántas personas viajan contigo?', 'number', 'cuantitativa', '[]'::jsonb, 4),
  ('¿Algo que quieras contarnos?', 'text', 'cualitativa', '[]'::jsonb, 5)
) v
where not exists (select 1 from survey_questions);

-- ---------------------------------------------------------------------
-- 6. HISTORIAL DE JUGADAS
-- ---------------------------------------------------------------------
create table if not exists spins (
  id               bigserial primary key,
  registration_id  uuid not null references registrations(id) on delete cascade,
  result           text not null,           -- 'win' | 'lose'
  prize_id         int references prizes(id),
  created_at       timestamptz not null default now()
);

-- =====================================================================
--  FUNCIONES (RPC)
-- =====================================================================

-- Registro: si el correo ya existe devuelve el mismo registro (no crea duplicados)
create or replace function register_user(p_name text, p_email text, p_phone text, p_city text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_email),'') = ''
     or coalesce(trim(p_phone),'') = '' or coalesce(trim(p_city),'') = '' then
    raise exception 'Todos los campos son obligatorios';
  end if;

  select id into v_id from registrations where lower(email) = lower(trim(p_email));
  if v_id is not null then
    return v_id;
  end if;

  insert into registrations (full_name, email, phone, city)
  values (trim(p_name), lower(trim(p_email)), trim(p_phone), initcap(trim(p_city)))
  returning id into v_id;
  return v_id;
end $$;

-- Estado del registro (para retomar el flujo si recarga la página)
create or replace function registration_status(p_reg uuid)
returns json
language sql security definer set search_path = public as $$
  select json_build_object(
    'survey_completed', r.survey_completed,
    'attempts', r.attempts,
    'max_attempts', s.max_attempts,
    'game_active', s.game_active,
    'prize', p.label,
    'voucher', r.voucher
  )
  from registrations r
  cross join settings s
  left join prizes p on p.id = r.prize_id
  where r.id = p_reg;
$$;

-- Guardar encuesta. p_answers = [{ "question_id": 1, "answer": ... }, ...]
create or replace function submit_survey(p_reg uuid, p_answers jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  if not exists (select 1 from registrations where id = p_reg) then
    raise exception 'Registro no encontrado';
  end if;
  if exists (select 1 from registrations where id = p_reg and survey_completed) then
    return;
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) loop
    insert into survey_answers (registration_id, question_id, question_text, answer)
    select p_reg, q.id, q.question, a->'answer'
    from survey_questions q
    where q.id = (a->>'question_id')::int;
  end loop;

  update registrations set survey_completed = true where id = p_reg;
end $$;

-- JUGAR: el resultado se decide en el servidor y respeta el inventario
create or replace function play_game(p_reg uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  s        settings%rowtype;
  r        registrations%rowtype;
  v_prize  prizes%rowtype;
  v_code   text;
  v_left   int;
begin
  select * into s from settings where id = 1;
  if not s.game_active then
    return json_build_object('status','inactive');
  end if;

  select * into r from registrations where id = p_reg for update;
  if not found then
    return json_build_object('status','not_found');
  end if;
  if r.prize_id is not null then
    return json_build_object('status','already_won','prize',(select label from prizes where id = r.prize_id),'voucher',r.voucher);
  end if;
  if r.attempts >= s.max_attempts then
    return json_build_object('status','no_attempts','attempts_left',0);
  end if;

  update registrations set attempts = attempts + 1 where id = p_reg;
  v_left := s.max_attempts - r.attempts - 1;

  if random() < s.win_probability then
    -- elige al azar un premio con stock (bloqueando la fila para evitar sobre-entregas)
    select * into v_prize from prizes
      where active and stock_remaining > 0
      order by random() limit 1
      for update skip locked;

    if found then
      update prizes set stock_remaining = stock_remaining - 1 where id = v_prize.id;
      v_code := 'REG-' || v_prize.code || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
      update registrations set prize_id = v_prize.id, voucher = v_code where id = p_reg;
      insert into spins (registration_id, result, prize_id) values (p_reg, 'win', v_prize.id);
      return json_build_object('status','win','prize_code',v_prize.code,'prize',v_prize.label,
                               'voucher',v_code,'attempts_left',v_left);
    end if;
  end if;

  insert into spins (registration_id, result) values (p_reg, 'lose');
  return json_build_object('status','lose','attempts_left',v_left);
end $$;

-- Estadísticas para el dashboard
create or replace function admin_stats()
returns json
language sql security definer set search_path = public as $$
  select json_build_object(
    'visits',          (select count(*) from events where type = 'visit'),
    'unique_visitors', (select count(distinct session_id) from events where type = 'visit'),
    'clicks',          (select count(*) from events where type = 'click'),
    'registrations',   (select count(*) from registrations),
    'reservations',    (select count(*) from events where type = 'click' and target = 'reservar'),
    'surveys',         (select count(*) from registrations where survey_completed),
    'spins',           (select count(*) from spins),
    'winners',         (select count(*) from registrations where prize_id is not null),
    'visits_by_path',  (select coalesce(json_agg(t order by t.total desc), '[]') from
                          (select coalesce(target, path) as name, count(*) as total
                           from events where type = 'visit' group by 1) t),
    'clicks_by_button',(select coalesce(json_agg(t order by t.total desc), '[]') from
                          (select target as name, count(*) as total
                           from events where type = 'click' group by 1) t),
    'cities',          (select coalesce(json_agg(t order by t.total desc), '[]') from
                          (select city as name, count(*) as total from registrations group by 1) t),
    'daily',           (select coalesce(json_agg(t order by t.day), '[]') from
                          (select d::date as day,
                                  (select count(*) from events e where e.type='visit' and e.created_at::date = d::date) as visits,
                                  (select count(*) from registrations g where g.created_at::date = d::date) as registrations
                           from generate_series(current_date - 13, current_date, interval '1 day') d) t)
  );
$$;

-- =====================================================================
--  SEGURIDAD (RLS)
--  El /admin NO tiene usuario ni clave (requisito del proyecto), por eso
--  la llave pública "anon" puede leer y administrar. Ver README.
-- =====================================================================
alter table settings          enable row level security;
alter table prizes            enable row level security;
alter table registrations     enable row level security;
alter table events            enable row level security;
alter table survey_questions  enable row level security;
alter table survey_answers    enable row level security;
alter table spins             enable row level security;

drop policy if exists "anon all settings"  on settings;
drop policy if exists "anon all prizes"    on prizes;
drop policy if exists "anon read regs"     on registrations;
drop policy if exists "anon insert events" on events;
drop policy if exists "anon read events"   on events;
drop policy if exists "anon all questions" on survey_questions;
drop policy if exists "anon read answers"  on survey_answers;
drop policy if exists "anon read spins"    on spins;

create policy "anon all settings"  on settings          for all    using (true) with check (true);
create policy "anon all prizes"    on prizes            for all    using (true) with check (true);
create policy "anon read regs"     on registrations     for select using (true);
create policy "anon insert events" on events            for insert with check (true);
create policy "anon read events"   on events            for select using (true);
create policy "anon all questions" on survey_questions  for all    using (true) with check (true);
create policy "anon read answers"  on survey_answers    for select using (true);
create policy "anon read spins"    on spins             for select using (true);
-- registrations / survey_answers / spins solo se escriben vía las funciones RPC

grant execute on function register_user(text,text,text,text) to anon, authenticated;
grant execute on function registration_status(uuid)        to anon, authenticated;
grant execute on function submit_survey(uuid,jsonb)         to anon, authenticated;
grant execute on function play_game(uuid)                   to anon, authenticated;
grant execute on function admin_stats()                     to anon, authenticated;
