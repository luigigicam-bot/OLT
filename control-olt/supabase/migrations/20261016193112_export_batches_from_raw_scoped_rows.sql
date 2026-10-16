create or replace function public.olt_general_export_page_v1(p_before_id bigint default null,p_limit integer default 3000)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $f$
with ids as materialized (
 select r.id from public.recepcion_olt r join olt_control.olt_record_scope_v1 s on s.id=r.id and s.usuario_id=r.usuario_id and s.is_current
 where p_before_id is null or r.id<p_before_id order by r.id desc limit greatest(1,least(coalesce(p_limit,3000),3000))
), raw as materialized (
 select s.*,case when not s.cerrado then jsonb_build_object(
 'fecha',source_data->'fecha','fecha_salida_sap',source_data->'fecha_salida_sap',
 'fec_cargo',source_data->'fec_cargo','linea',source_data->'linea',
 'departamento',source_data->'departamento','despacho',source_data->'despacho') end indicator_input
 from public.olt_metric_source_v1 s join ids on ids.id=s.id
), inputs as materialized(select distinct indicator_input from raw where not cerrado),
metrics as materialized(select indicator_input,public.olt_indicators(indicator_input) result from inputs),
batch as materialized (
 select r.id,r.cerrado,case when r.cerrado then source_data else source_data||m.result end row_data
 from raw r left join metrics m on m.indicator_input=r.indicator_input
)
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(b) order by id desc) from batch b),'[]'::jsonb),
'next_before_id',(select min(id) from batch),
'has_more',(select count(*)=greatest(1,least(coalesce(p_limit,3000),3000)) from batch))
$f$;
notify pgrst,'reload schema';

