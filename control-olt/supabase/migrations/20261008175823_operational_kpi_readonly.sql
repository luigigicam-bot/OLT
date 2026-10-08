-- Additive, caller-scoped read layer. No existing table/view/function/grant is changed.
-- No writes to business data, snapshots, pointers, calendars or closed months.
create view public.olt_metric_rows_v1 with (security_invoker=true) as
with corrected as (
 select r.*, case
  when not r.cerrado and r.row_data->>'carga_id' is not null
   and (r.row_data->>'carga_id')::bigint is distinct from a.carga_activa_id
  then r.row_data-array['carga_id','inacttrans','hraitr','dt','et','placa','fecha_salida_sap','estado_viaje','estado_entrega','fec_reg','hor_reg','usua_ctrl_re']
  else r.row_data end as source_data
 from public.olt_control_rows r left join public.olt_sap_active a on a.usuario_id=r.usuario_id
), official as (
 select id,usuario_id,fecha,entrega,razon,distrito,provincia,cerrado,reporting_included,
 case when cerrado then source_data else source_data||public.olt_indicators(source_data) end as row_data from corrected
)
select *,upper(btrim(coalesce(row_data->>'despacho',''))) as zona,
 coalesce(nullif(btrim(row_data->>'linea'),''),'Sin línea') as linea,
 coalesce(nullif(btrim(row_data->>'et'),''),'Sin transportista') as et,
 coalesce(nullif(btrim(row_data->>'responsable'),''),'Sin responsable') as responsable,
 coalesce(nullif(btrim(row_data->>'motivo'),''),'Sin motivo registrado') as motivo,
 coalesce(row_data->>'indicador','') as indicador,
 nullif(row_data->>'inacttrans','')::date as fecha_sap,
 extract(month from fecha)::integer as mes_despacho
from official;

create function public.olt_metric_filtered_v1(p_filters jsonb default '{}'::jsonb)
returns setof public.olt_metric_rows_v1 language sql stable security invoker set search_path=pg_catalog as $f$
select r.* from public.olt_metric_rows_v1 r
where (nullif(p_filters->>'date_from','') is null or r.fecha_sap>=(p_filters->>'date_from')::date)
 and (nullif(p_filters->>'date_to','') is null or r.fecha_sap<=(p_filters->>'date_to')::date)
 and (nullif(p_filters->>'month','') is null or r.mes_despacho=(p_filters->>'month')::integer)
 and (nullif(p_filters->>'line','') is null or r.linea=p_filters->>'line')
 and (nullif(p_filters->>'indicator','') is null or r.indicador=p_filters->>'indicator')
 and (nullif(p_filters->>'zone','') is null or r.zona=p_filters->>'zone')
 and (nullif(p_filters->>'et','') is null or r.et=p_filters->>'et')
 and (nullif(p_filters->>'responsible','') is null or r.responsable=p_filters->>'responsible')
 and (nullif(p_filters->>'reason','') is null or r.motivo=p_filters->>'reason')
 and (not coalesce((p_filters->>'reporting_only')::boolean,false) or r.reporting_included)
 and (nullif(p_filters->>'search','') is null or position(lower(p_filters->>'search') in lower(concat_ws(' ',r.entrega,r.razon,r.linea,r.distrito,r.provincia,r.et)))>0)
$f$;

create function public.olt_metric_options_v1() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
select jsonb_build_object(
 'lines',coalesce((select jsonb_agg(linea order by linea) from(select distinct linea from public.olt_metric_rows_v1) l),'[]'::jsonb),
 'ets',coalesce((select jsonb_agg(et order by et) from(select distinct et from public.olt_metric_rows_v1) e),'[]'::jsonb))
$f$;

create function public.olt_metric_page_v1(p_filters jsonb default '{}'::jsonb,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $f$
with page as materialized (
 select id,row_data,cerrado,fecha from public.olt_metric_filtered_v1(p_filters)
 order by fecha desc nulls last,id desc limit 101 offset greatest(p_offset,0)
)
select jsonb_build_object('has_next',(select count(*)>100 from page),
 'rows',coalesce((select jsonb_agg(to_jsonb(t)-'fecha' order by t.fecha desc nulls last,t.id desc)
 from(select * from page order by fecha desc nulls last,id desc limit 100) t),'[]'::jsonb))
$f$;

create function public.olt_metric_kpi_v1(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $f$
with b as materialized (
 select * from public.olt_metric_filtered_v1(coalesce(p_filters,'{}'::jsonb)||'{"reporting_only":true}'::jsonb)
), totals as (
 select count(*) total,count(*) filter(where indicador='En Fecha') en_fecha,
 count(*) filter(where indicador='Fuera de Fecha') fuera_fecha,
 count(*) filter(where indicador not in ('En Fecha','Fuera de Fecha')) sin_indicador,
 count(*) filter(where zona not in ('LIMA','PROVINCIA')) sin_zona from b
), zones as (
 select z.zona,count(b.id) total,count(b.id) filter(where b.indicador='En Fecha') en_fecha,
 count(b.id) filter(where b.indicador='Fuera de Fecha') fuera_fecha,
 count(b.id) filter(where b.indicador not in ('En Fecha','Fuera de Fecha')) sin_indicador
 from(values('LIMA'),('PROVINCIA')) z(zona) left join b on b.zona=z.zona group by z.zona
), lines as (
 select zona,linea,count(*) total,count(*) filter(where indicador='En Fecha') en_fecha,
 count(*) filter(where indicador='Fuera de Fecha') fuera_fecha,
 count(*) filter(where indicador not in ('En Fecha','Fuera de Fecha')) sin_indicador from b
 where zona in ('LIMA','PROVINCIA') group by zona,linea
), incidents as (
 select zona,responsable,motivo,count(*) total from b
 where indicador='Fuera de Fecha' and zona in ('LIMA','PROVINCIA') group by zona,responsable,motivo
), transports as (
 select zona,et,count(*) total,count(*) filter(where indicador='En Fecha') en_fecha,
 count(*) filter(where indicador='Fuera de Fecha') fuera_fecha,
 count(*) filter(where indicador not in ('En Fecha','Fuera de Fecha')) sin_indicador from b group by zona,et
)
select jsonb_build_object('totals',(select to_jsonb(t) from totals t),
 'zones',(select jsonb_agg(to_jsonb(z) order by zona) from zones z),
 'lines',coalesce((select jsonb_agg(to_jsonb(l) order by zona,total desc,linea) from lines l),'[]'::jsonb),
 'incidents',coalesce((select jsonb_agg(to_jsonb(i) order by zona,total desc,responsable,motivo) from incidents i),'[]'::jsonb),
 'transports',coalesce((select jsonb_agg(to_jsonb(t) order by zona,total desc,et) from transports t),'[]'::jsonb),
 'generated_at',now(),'rules','Indicador: En Fecha / Fuera de Fecha; cada fila OLT = un documento')
$f$;

-- Only grants for NEW read objects; no changes to existing access or writes.
revoke all on public.olt_metric_rows_v1 from public,anon;
grant select on public.olt_metric_rows_v1 to authenticated;
revoke all on function public.olt_metric_filtered_v1(jsonb),public.olt_metric_options_v1(),public.olt_metric_page_v1(jsonb,integer),public.olt_metric_kpi_v1(jsonb) from public,anon;
grant execute on function public.olt_metric_filtered_v1(jsonb),public.olt_metric_options_v1(),public.olt_metric_page_v1(jsonb,integer),public.olt_metric_kpi_v1(jsonb) to authenticated;
notify pgrst,'reload schema';
