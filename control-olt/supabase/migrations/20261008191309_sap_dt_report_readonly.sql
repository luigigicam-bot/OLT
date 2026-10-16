-- New caller-scoped SAP report; no snapshot/pointer changes or operational writes.
create function public.olt_sap_dt_report_v1(p_load bigint default null) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
with chosen as (
 select c.id,c.archivo from olt_control.sap_cargas c
 where c.usuario_id=(select auth.uid()) and c.id=coalesce(p_load,(select carga_activa_id from olt_control.sap_estado_usuario where usuario_id=(select auth.uid())))
), source as materialized (
 select s.* from olt_control.sap_staging s join chosen c on c.id=s.carga_id
), eligible as (
 select distinct on (dt) dt,estado_viaje,et,placa,inacttrans,fila_origen
 from source where nullif(btrim(dt),'') is not null
 and referencia not like '500%'
 and coalesce(raw_data->>'excluido_reporte','false')<>'true'
 order by dt,fila_origen,id
), alternatives as (
 select dt,max(case when raw_data->>'report_version'='1' then nullif(raw_data->>'fecha_alternativa','')::date end) alternative
 from source group by dt
), tracked as (
 select distinct source_data->>'dt' dt from public.olt_metric_source_v1 where nullif(source_data->>'dt','') is not null
), report as (
 select e.dt,coalesce(nullif(btrim(e.estado_viaje),''),'Sin estado') state,
 coalesce(nullif(btrim(e.et),''),'Sin transportista') et,coalesce(e.placa,'') plate,e.inacttrans,a.alternative,
 coalesce(e.inacttrans,a.alternative) date,
 case when e.inacttrans is not null then 'InActTrans' when a.alternative is not null then 'Fecha alternativa' else 'Sin fecha' end date_type,
 e.fila_origen source_row,exists(select 1 from tracked t where t.dt=e.dt) in_tracking
 from eligible e left join alternatives a using(dt)
)
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.dt) from report r),'[]'::jsonb),
 'excluded',(select count(*) from source where referencia like '500%' or raw_data->>'excluido_reporte'='true'),
 'blankDt',(select count(*) from source where nullif(btrim(dt),'') is null),
 'complete',coalesce((select bool_and(coalesce(raw_data->>'report_version','')='1') from source),false),
 'tracking_source','DT registrados en Control OLT','filename',(select archivo from chosen),'load_id',(select id from chosen),'source_rows',(select count(*) from source))
$f$;
revoke all on function public.olt_sap_dt_report_v1(bigint) from public,anon;
grant execute on function public.olt_sap_dt_report_v1(bigint) to authenticated;
notify pgrst,'reload schema';
