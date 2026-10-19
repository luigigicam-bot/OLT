-- Read performance only: preserve exact active SAP, closures and caller RLS.
create view public.olt_metric_source_v1 with(security_invoker=true) as
with raw as (
 select l.id,l.usuario_id,l.fecha,l.entrega,l.razon,l.distrito,l.provincia,l.reporting_included,
 c.id is not null as cerrado,case when c.id is null then l.row_data else c.snapshot end as row_data,
 a.carga_activa_id
 from public.olt_control_live l
 left join olt_control.cierre_mensual c on c.olt_id=l.id and c.periodo=date_trunc('month',l.fecha)::date
 left join public.olt_sap_active a on a.usuario_id=l.usuario_id
)
select id,usuario_id,fecha,entrega,razon,distrito,provincia,reporting_included,cerrado,
case when not cerrado and row_data->>'carga_id' is not null
 and (row_data->>'carga_id')::bigint is distinct from carga_activa_id
then row_data-array['carga_id','inacttrans','hraitr','dt','et','placa','fecha_salida_sap','estado_viaje','estado_entrega','fec_reg','hor_reg','usua_ctrl_re']
else row_data end as source_data from raw;
revoke all on public.olt_metric_source_v1 from public,anon;
grant select on public.olt_metric_source_v1 to authenticated;

create or replace view public.olt_metric_rows_v1 with(security_invoker=true) as
with official as materialized (
 select id,usuario_id,fecha,entrega,razon,distrito,provincia,cerrado,reporting_included,
 case when cerrado then source_data else source_data||public.olt_indicators(source_data) end as row_data
 from public.olt_metric_source_v1
)
select id,usuario_id,fecha,entrega,razon,distrito,provincia,cerrado,reporting_included,row_data,upper(btrim(coalesce(row_data->>'despacho',''))) as zona,
 coalesce(nullif(btrim(row_data->>'linea'),''),'Sin línea') as linea,
 coalesce(nullif(btrim(row_data->>'et'),''),'Sin transportista') as et,
 coalesce(nullif(btrim(row_data->>'responsable'),''),'Sin responsable') as responsable,
 coalesce(nullif(btrim(row_data->>'motivo'),''),'Sin motivo registrado') as motivo,
 coalesce(row_data->>'indicador','') as indicador,
 nullif(row_data->>'inacttrans','')::date as fecha_sap,
 extract(month from fecha)::integer as mes_despacho
from official;

create or replace function public.olt_metric_options_v1() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
with options as materialized (
 select coalesce(nullif(btrim(source_data->>'linea'),''),'Sin línea') linea,
 coalesce(nullif(btrim(source_data->>'et'),''),'Sin transportista') et
 from public.olt_metric_source_v1
)
select jsonb_build_object(
 'lines',coalesce((select jsonb_agg(linea order by linea) from(select distinct linea from options) l),'[]'::jsonb),
 'ets',coalesce((select jsonb_agg(et order by et) from(select distinct et from options) e),'[]'::jsonb))
$f$;
notify pgrst,'reload schema';
