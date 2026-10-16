-- Additive read-only reports. The source is exclusively the caller's active published load.
-- DT means SAP Transporte; General membership is tested by DT, not by delivery reference.
create function public.olt_sap_dashboard_v1() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
with chosen as (
 select c.id,c.archivo from olt_control.sap_cargas c
 join olt_control.sap_estado_usuario a on a.carga_activa_id=c.id and a.usuario_id=c.usuario_id
 where c.usuario_id=(select auth.uid()) and c.estado='publicada'
), source as materialized (
 select s.* from olt_control.sap_staging s join chosen c on c.id=s.carga_id
), eligible as (
 select distinct on (btrim(dt)) btrim(dt) dt,estado_viaje,et,inacttrans,raw_data,fila_origen
 from source where nullif(btrim(dt),'') is not null
 and referencia not like '500%' and coalesce(raw_data->>'excluido_reporte','false')<>'true'
 order by btrim(dt),fila_origen,id
), tracked as materialized (
 select distinct btrim(source_data->>'dt') dt from public.olt_metric_source_v1
 where usuario_id=(select auth.uid()) and nullif(btrim(source_data->>'dt'),'') is not null
), report as (
 select e.dt,coalesce(nullif(btrim(e.estado_viaje),''),'Sin estado') state,
 coalesce(nullif(btrim(e.et),''),'Sin transportista') et,e.inacttrans,
 case when e.raw_data->>'fecha_despacho' ~ '^\d{4}-\d{2}-\d{2}$'
 and pg_input_is_valid(e.raw_data->>'fecha_despacho','date')
 then (e.raw_data->>'fecha_despacho')::date end dispatch_date,(t.dt is not null) in_general
 from eligible e left join tracked t using(dt)
)
select jsonb_build_object('load_id',(select id from chosen),'filename',(select archivo from chosen),
 'dispatch_column_present',coalesce((select bool_or(raw_data->>'dispatch_column_present'='true') from source),false),
 'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.et,r.dt) from report r),'[]'::jsonb))
$f$;
revoke all on function public.olt_sap_dashboard_v1() from public,anon;
grant execute on function public.olt_sap_dashboard_v1() to authenticated;

-- One database snapshot, all General rows; no UI filters or pagination are applied.
-- Frozen monthly values remain frozen through the existing metric read layer.
create function public.olt_general_export_v1() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'cerrado',r.cerrado,'row_data',r.row_data) order by r.fecha desc nulls last,r.id desc),'[]'::jsonb))
from public.olt_metric_rows_v1 r where r.usuario_id=(select auth.uid())
$f$;
revoke all on function public.olt_general_export_v1() from public,anon;
grant execute on function public.olt_general_export_v1() to authenticated;
notify pgrst,'reload schema';
