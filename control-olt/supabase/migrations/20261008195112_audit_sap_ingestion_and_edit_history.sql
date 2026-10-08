-- Targeted ingestion correction: same signature, ownership/state checks and 400-row limit.
create unique index sap_staging_load_physical_row_uidx on olt_control.sap_staging(carga_id,fila_origen);
create or replace function olt_private.sap_append(p_load bigint,p_rows jsonb) returns integer
language plpgsql security definer set search_path=pg_catalog as $f$
declare u uuid:=auth.uid(); c olt_control.sap_cargas; n integer;
begin
 if u is null then raise exception 'Se requiere sesión' using errcode='42501'; end if;
 select * into c from olt_control.sap_cargas where id=p_load and usuario_id=u for update;
 if c.id is null or c.estado<>'validando' then raise exception 'Carga no disponible'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>400 or jsonb_array_length(p_rows)<1 then raise exception 'Lote inválido'; end if;
 if exists(select 1 from jsonb_populate_recordset(null::olt_control.sap_staging,p_rows) r where
 r.referencia is null or length(btrim(r.referencia))=0 or length(r.referencia)>100 or r.fila_origen is null or r.fila_origen<1
 or (r.raw_data is not null and (jsonb_typeof(r.raw_data)<>'object' or length(r.raw_data::text)>8192
 or (r.raw_data ? 'report_version' and r.raw_data->>'report_version'<>'1')
 or (r.raw_data ? 'excluido_reporte' and jsonb_typeof(r.raw_data->'excluido_reporte')<>'boolean')
 or (nullif(r.raw_data->>'fecha_alternativa','') is not null and (r.raw_data->>'fecha_alternativa')!~ '^\d{4}-\d{2}-\d{2}$')))) then raise exception 'Fila o metadatos SAP inválidos'; end if;
 -- Cast alternatives before insertion, rejecting impossible dates atomically.
 perform (r.raw_data->>'fecha_alternativa')::date from jsonb_populate_recordset(null::olt_control.sap_staging,p_rows) r where nullif(r.raw_data->>'fecha_alternativa','') is not null;
 if exists(select 1 from jsonb_populate_recordset(null::olt_control.sap_staging,p_rows) group by fila_origen having count(*)>1) then raise exception 'Fila física repetida en el lote'; end if;
 if exists(select 1 from jsonb_populate_recordset(null::olt_control.sap_staging,p_rows) r join olt_control.sap_staging s on s.carga_id=p_load and s.fila_origen=r.fila_origen
 where row(s.referencia,s.inacttrans,s.hraitr,s.dt,s.et,s.placa,s.estado_viaje,s.estado_entrega,s.fec_reg,s.hor_reg,s.usua_ctrl_re,s.raw_data)
 is distinct from row(btrim(r.referencia),r.inacttrans,r.hraitr,r.dt,r.et,r.placa,r.estado_viaje,r.estado_entrega,r.fec_reg,r.hor_reg,r.usua_ctrl_re,coalesce(r.raw_data,'{}'::jsonb))) then raise exception 'El lote repetido contiene datos diferentes'; end if;
 insert into olt_control.sap_staging(carga_id,fila_origen,referencia,inacttrans,hraitr,dt,et,placa,fecha_salida_sap,estado_viaje,estado_entrega,fec_reg,hor_reg,usua_ctrl_re,raw_data)
 select p_load,r.fila_origen,btrim(r.referencia),r.inacttrans,r.hraitr,r.dt,r.et,r.placa,r.inacttrans,r.estado_viaje,r.estado_entrega,r.fec_reg,r.hor_reg,r.usua_ctrl_re,coalesce(r.raw_data,'{}'::jsonb)
 from jsonb_populate_recordset(null::olt_control.sap_staging,p_rows) r on conflict(carga_id,fila_origen) do nothing;
 select count(*) into n from olt_control.sap_staging where carga_id=p_load;
 if n>c.total_filas-c.filas_invalidas then raise exception 'Más filas que las declaradas'; end if;
 return jsonb_array_length(p_rows);
end $f$;

-- Durable resume reads only the caller's validating load; no pointer mutation.
create function public.olt_sap_resume_v1(p_hash text,p_valid integer) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
select jsonb_build_object('load_id',c.id,'confirmed',(select count(*) from olt_control.sap_staging where carga_id=c.id))
from olt_control.sap_cargas c where c.usuario_id=(select auth.uid()) and c.archivo_hash=p_hash and c.total_filas-c.filas_invalidas=p_valid and c.estado='validando'
order by c.id desc limit 1 $f$;
revoke all on function public.olt_sap_resume_v1(text,integer) from public,anon;
grant execute on function public.olt_sap_resume_v1(text,integer) to authenticated;

-- Append-only cell history. Clients can only read history of their own OLT rows.
create table olt_control.gestion_audit (
 id bigint generated always as identity primary key,olt_id bigint not null references public.recepcion_olt(id),
 actor uuid,changed_at timestamptz not null default now(),changes jsonb not null
);
alter table olt_control.gestion_audit enable row level security;
create policy gestion_audit_owner_read on olt_control.gestion_audit for select to authenticated
using(exists(select 1 from public.recepcion_olt r where r.id=olt_id and r.usuario_id=(select auth.uid())));
grant select on olt_control.gestion_audit to authenticated;
revoke all on olt_control.gestion_audit from public,anon;
create function olt_private.audit_gestion_change() returns trigger language plpgsql security definer set search_path=pg_catalog as $f$
declare delta jsonb;
begin
 select jsonb_object_agg(k,jsonb_build_object('before',to_jsonb(old)->k,'after',to_jsonb(new)->k)) into delta
 from unnest(array['nro_cargo','fec_cargo','codigo_transporte','placa_prog','dt_prog','transporte_prog','responsable','motivo']) k
 where (to_jsonb(old)->k) is distinct from (to_jsonb(new)->k);
 if delta is not null then insert into olt_control.gestion_audit(olt_id,actor,changes) values(new.olt_id,coalesce(auth.uid(),new.updated_by),delta); end if;
 return new;
end $f$;
revoke all on function olt_private.audit_gestion_change() from public,anon,authenticated;
create trigger gestion_cell_history after insert or update on olt_control.gestion_olt for each row execute function olt_private.audit_gestion_change();
create function public.olt_cell_history_v1(p_id bigint) returns jsonb language sql stable security invoker set search_path=pg_catalog as $f$
select coalesce(jsonb_agg(to_jsonb(t) order by t.changed_at desc,t.id desc),'[]'::jsonb) from (select * from olt_control.gestion_audit where olt_id=p_id order by changed_at desc,id desc limit 100) t $f$;
revoke all on function public.olt_cell_history_v1(bigint) from public,anon;
grant execute on function public.olt_cell_history_v1(bigint) to authenticated;
notify pgrst,'reload schema';
