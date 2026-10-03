-- El ranking de La Trampa del Mono en Supabase (SQL editor → Run). Después: url + anon key en ranking.js.
-- Cualquiera con el link puede leer y anotar (no editar ni borrar): alcanza para el grupo.
create table if not exists trampa_marcas (
  id bigint generated always as identity primary key,
  usuario text not null check (char_length(usuario) between 1 and 24),
  apodo text not null,
  emoji text not null,
  golpes int not null check (golpes between 3 and 40),
  vs_par int not null,
  ms int not null check (ms > 0),
  creado timestamptz not null default now()
);
create index if not exists trampa_marcas_orden on trampa_marcas (golpes, ms);

alter table trampa_marcas enable row level security;
create policy "todos leen" on trampa_marcas for select using (true);
create policy "todos anotan" on trampa_marcas for insert with check (true);
