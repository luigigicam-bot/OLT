create table public.olt_upload_batches (
 usuario_id uuid not null default auth.uid(),job_id uuid not null,batch_no integer not null check(batch_no>=0),
 payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(usuario_id,job_id,batch_no)
);
alter table public.olt_upload_batches enable row level security;
create policy upload_receipts_owner_read on public.olt_upload_batches for select to authenticated using(usuario_id=(select auth.uid()));
revoke all on public.olt_upload_batches from public,anon,authenticated;
grant select on public.olt_upload_batches to authenticated;
create function olt_private.insertar_lote_durable(p_job uuid,p_batch integer,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $f$
declare u uuid:=auth.uid(); h text; receipt public.olt_upload_batches; r jsonb;
begin
 if u is null then raise exception 'Se requiere sesión' using errcode='42501'; end if;
 if p_job is null or p_batch is null or p_batch<0 or p_batch>10000 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>500 or jsonb_array_length(p_rows)<1 then raise exception 'Lote inválido'; end if;
 h:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_job::text,812021));
 select * into receipt from public.olt_upload_batches where usuario_id=u and job_id=p_job and batch_no=p_batch;
 if receipt.job_id is not null then
  if receipt.payload_hash<>h then raise exception 'El lote ya confirmado tiene contenido diferente'; end if;
  return receipt.result;
 end if;
 r:=public.olt_insertar_lote(p_rows);
 insert into public.olt_upload_batches(usuario_id,job_id,batch_no,payload_hash,result) values(u,p_job,p_batch,h,r);
 return r;
end $f$;
revoke all on function olt_private.insertar_lote_durable(uuid,integer,jsonb) from public,anon;
grant execute on function olt_private.insertar_lote_durable(uuid,integer,jsonb) to authenticated;
create function public.olt_insertar_lote_v2(p_job uuid,p_batch integer,p_rows jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $f$ select olt_private.insertar_lote_durable(p_job,p_batch,p_rows) $f$;
revoke all on function public.olt_insertar_lote_v2(uuid,integer,jsonb) from public,anon;
grant execute on function public.olt_insertar_lote_v2(uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
