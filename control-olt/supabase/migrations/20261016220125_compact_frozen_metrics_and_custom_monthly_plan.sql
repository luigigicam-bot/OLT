alter table olt_control.cierre_mensual add column metric_values text[] generated always as (array[snapshot->>'despacho',snapshot->>'linea',snapshot->>'et',snapshot->>'responsable',snapshot->>'motivo',snapshot->>'indicador',snapshot->>'inacttrans',snapshot->>'historico_consolidado']) stored;
create or replace view public.olt_metric_rows_v1 with(security_invoker=true) as
with current_source as materialized (
 select *,case when not cerrado then jsonb_build_object(
 'fecha',source_data->'fecha','fecha_salida_sap',source_data->'fecha_salida_sap',
 'fec_cargo',source_data->'fec_cargo','linea',source_data->'linea',
 'departamento',source_data->'departamento','despacho',source_data->'despacho') end indicator_input
 from public.olt_metric_source_v1
 where not cerrado
 union all
 select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,
 upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE',true,c.snapshot,null::jsonb
 from public.recepcion_olt r join olt_control.cierre_mensual c on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date
 join olt_control.olt_record_scope_v1 scope on scope.id=r.id and scope.usuario_id=r.usuario_id and scope.is_current
 where coalesce(c.snapshot->>'historico_consolidado','')<>'true'
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
extract(month from fecha)::integer mes_despacho,false historical_consolidated from current_official
union all
select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,true,
upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE',c.snapshot,
upper(btrim(coalesce(c.metric_values[1],''))),
coalesce(nullif(btrim(c.metric_values[2]),''),'Sin línea'),
coalesce(nullif(btrim(c.metric_values[3]),''),'Sin transportista'),
coalesce(nullif(btrim(c.metric_values[4]),''),'Sin responsable'),
coalesce(nullif(btrim(c.metric_values[5]),''),'Sin motivo registrado'),
coalesce(c.metric_values[6],''),nullif(c.metric_values[7],'')::date,
extract(month from r.fecha)::integer,true
from public.recepcion_olt r join olt_control.cierre_mensual c
on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date
where c.metric_values[8]='true';
notify pgrst,'reload schema';
create or replace function public.olt_monthly_summary_v1(p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog set jit=off set work_mem='32MB' as $f$
declare result jsonb; begin
 execute $q$
with b as materialized (
 select r.fecha,r.zona,r.indicador,r.responsable,r.motivo,r.historical_consolidated historical from public.olt_metric_rows_v1 r
where (nullif($1->>'date_from','') is null or r.fecha_sap >= ($1->>'date_from')::date)
  and (nullif($1->>'date_to','') is null or r.fecha_sap <= ($1->>'date_to')::date)
  and (nullif($1->>'month','') is null or r.mes_despacho = ($1->>'month')::integer)
  and (nullif($1->>'year','') is null or extract(year from r.fecha)::integer = ($1->>'year')::integer)
  and (nullif($1->>'line','') is null or r.linea = $1->>'line')
  and (nullif($1->>'indicator','') is null or r.indicador = $1->>'indicator')
  and (nullif($1->>'zone','') is null or r.zona = $1->>'zone')
  and (nullif($1->>'et','') is null or r.et = $1->>'et')
  and (
    nullif($1->>'responsible','') is null
    or public.olt_norm_text_v1(r.responsable) = public.olt_norm_text_v1($1->>'responsible')
  )
  and (
    nullif($1->>'reason','') is null
    or public.olt_norm_text_v1(r.motivo) = public.olt_norm_text_v1($1->>'reason')
  )
  and r.reporting_included
  and (
    nullif($1->>'search','') is null
    or position(lower($1->>'search') in lower(concat_ws(' ',r.entrega,r.razon,r.linea,r.distrito,r.provincia,r.et))) > 0
  )

), monthly as (
 select extract(year from fecha)::int as "year",extract(month from fecha)::int as "month",zona,
 count(*) total,count(*) filter(where indicador='En Fecha') en_fecha,
 count(*) filter(where indicador='Fuera de Fecha') fuera_fecha,
 count(*) filter(where indicador not in('En Fecha','Fuera de Fecha')) sin_indicador,
 count(*) filter(where historical) historical
 from b group by 1,2,3
), incidents as (
 select extract(year from fecha)::int as "year",extract(month from fecha)::int as "month",zona,
 coalesce(nullif(nullif(btrim(responsable),'-'),''),'Sin responsable') responsable,
 coalesce(nullif(nullif(btrim(motivo),'-'),''),'Sin motivo registrado') motivo,count(*) total
 from b where indicador='Fuera de Fecha' group by 1,2,3,4,5
), months as (
 select distinct extract(year from fecha)::int as "year",extract(month from fecha)::int as "month" from b
)
select jsonb_build_object(
 'monthly',coalesce((select jsonb_agg(to_jsonb(m) order by "year","month",zona) from monthly m),'[]'::jsonb),
 'incidents',coalesce((select jsonb_agg(to_jsonb(i) order by total desc,"year","month",responsable,motivo) from incidents i),'[]'::jsonb),
 'months',coalesce((select jsonb_agg(to_jsonb(m) order by "year","month") from months m),'[]'::jsonb),
 'target',case when $1->>'line'='TECNOFARMA' then 0.96 else null end,
 'generated_at',now(),
 'basis','Mes de Fec. Despacho. Histórico consolidado conserva los resultados de origen.')
$q$ into result using coalesce(p_filters,'{}'::jsonb);
return result; end
$f$;
revoke all on function public.olt_monthly_summary_v1(jsonb) from public,anon;
grant execute on function public.olt_monthly_summary_v1(jsonb) to authenticated;

notify pgrst,'reload schema';
