-- Frozen historical rows remain in General alongside the current BD snapshot.
-- Historical imports use pestaña General and never replace the active BD scope.
create or replace view olt_control.olt_record_scope_v1 with(security_invoker=true) as
with latest_import as (
 select distinct on(usuario_id) id import_id,usuario_id,created_at import_created_at
 from olt_control.bd_imports where pestana='BD'
 order by usuario_id,created_at desc,id desc
), flags as (
 select r.id,r.usuario_id,r.created_at,li.import_id,li.import_created_at,b.olt_id,
 exists(select 1 from olt_control.cierre_mensual c where c.olt_id=r.id
 and c.snapshot->>'historico_consolidado'='true') historical
 from public.recepcion_olt r left join latest_import li on li.usuario_id=r.usuario_id
 left join olt_control.bd_import_rows b on b.import_id=li.import_id and b.olt_id=r.id
)
select id,usuario_id,
 (historical or import_id is null or olt_id is not null or created_at>import_created_at) is_current,
 case when historical then 'historico_consolidado'
 when import_id is null then 'sin_snapshot_bd' when olt_id is not null then 'snapshot_bd_actual'
 when created_at>import_created_at then 'posterior_snapshot_bd' else 'historico_pre_snapshot' end scope_reason,
 import_id,import_created_at from flags;

create function public.olt_monthly_summary_v1(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $f$
with b as materialized (
 select * from public.olt_metric_filtered_v1(coalesce(p_filters,'{}'::jsonb)||'{"reporting_only":true}'::jsonb)
), monthly as (
 select extract(year from fecha)::int as "year",extract(month from fecha)::int as "month",zona,
 count(*) total,count(*) filter(where indicador='En Fecha') en_fecha,
 count(*) filter(where indicador='Fuera de Fecha') fuera_fecha,
 count(*) filter(where indicador not in('En Fecha','Fuera de Fecha')) sin_indicador,
 count(*) filter(where row_data->>'historico_consolidado'='true') historical
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
 'target',case when p_filters->>'line'='TECNOFARMA' then 0.96 else null end,
 'generated_at',now(),
 'basis','Mes de Fec. Despacho. Histórico consolidado conserva los resultados de origen.')
$f$;
revoke all on function public.olt_monthly_summary_v1(jsonb) from public,anon;
grant execute on function public.olt_monthly_summary_v1(jsonb) to authenticated;
notify pgrst,'reload schema';

