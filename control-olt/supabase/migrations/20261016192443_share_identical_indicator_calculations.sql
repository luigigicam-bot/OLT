create or replace view public.olt_metric_rows_v1 with(security_invoker=true) as
with current_source as materialized (
 select *,case when not cerrado then jsonb_build_object(
 'fecha',source_data->'fecha','fecha_salida_sap',source_data->'fecha_salida_sap',
 'fec_cargo',source_data->'fec_cargo','linea',source_data->'linea',
 'departamento',source_data->'departamento','despacho',source_data->'despacho') end indicator_input
 from public.olt_metric_source_v1
 where not(cerrado and coalesce(source_data->>'historico_consolidado','')='true')
), inputs as materialized (
 select distinct indicator_input from current_source where not cerrado
), indicator_values as materialized (
 select indicator_input,public.olt_indicators(indicator_input) metrics from inputs
), current_official as materialized (
 select s.id,s.usuario_id,s.fecha,s.entrega,s.razon,s.distrito,s.provincia,s.cerrado,s.reporting_included,
 case when s.cerrado then s.source_data else s.source_data||i.metrics end row_data
 from current_source s left join indicator_values i on i.indicator_input=s.indicator_input
)
select id,usuario_id,fecha,entrega,razon,distrito,provincia,cerrado,reporting_included,row_data,
upper(btrim(coalesce(row_data->>'despacho',''))) zona,
coalesce(nullif(btrim(row_data->>'linea'),''),'Sin línea') linea,
coalesce(nullif(btrim(row_data->>'et'),''),'Sin transportista') et,
coalesce(nullif(btrim(row_data->>'responsable'),''),'Sin responsable') responsable,
coalesce(nullif(btrim(row_data->>'motivo'),''),'Sin motivo registrado') motivo,
coalesce(row_data->>'indicador','') indicador,nullif(row_data->>'inacttrans','')::date fecha_sap,
extract(month from fecha)::integer mes_despacho from current_official
union all
select id,usuario_id,fecha,entrega,razon,distrito,provincia,cerrado,reporting_included,row_data,
upper(btrim(coalesce(row_data->>'despacho',''))) zona,
coalesce(nullif(btrim(row_data->>'linea'),''),'Sin línea') linea,
coalesce(nullif(btrim(row_data->>'et'),''),'Sin transportista') et,
coalesce(nullif(btrim(row_data->>'responsable'),''),'Sin responsable') responsable,
coalesce(nullif(btrim(row_data->>'motivo'),''),'Sin motivo registrado') motivo,
coalesce(row_data->>'indicador','') indicador,nullif(row_data->>'inacttrans','')::date fecha_sap,
extract(month from fecha)::integer mes_despacho from (
select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,true cerrado,
upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE' reporting_included,c.snapshot row_data
from public.recepcion_olt r join olt_control.cierre_mensual c
on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date
where c.snapshot->>'historico_consolidado'='true'
) frozen;
notify pgrst,'reload schema';

