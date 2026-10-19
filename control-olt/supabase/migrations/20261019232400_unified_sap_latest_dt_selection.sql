-- Read the same General DT sources without constructing every full document JSON.
create or replace view olt_control.olt_general_dt_v1 with(security_invoker=true) as
with scoped as materialized (
 select r.id,r.usuario_id,r.fecha,r.entrega from public.recepcion_olt r
 join olt_control.olt_record_scope_v1 scope on scope.id=r.id and scope.usuario_id=r.usuario_id and scope.is_current
), current_base as materialized (
 select r.* from scoped r left join olt_control.cierre_mensual c on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date where c.id is null
)
select r.id,r.usuario_id,case when s.id is not null then s.dt else b.dt end dt
from current_base r
left join public.olt_sap_active a on a.usuario_id=r.usuario_id
left join lateral(select s.id,s.dt from olt_control.sap_snapshot s
 where s.usuario_id=r.usuario_id and s.carga_id=a.carga_activa_id and s.referencia=btrim(r.entrega) offset 0) s on true
left join olt_control.bd_legacy_sap_v1 b on b.olt_id=r.id and b.usuario_id=r.usuario_id
union all
select r.id,r.usuario_id,c.snapshot->>'dt' dt from scoped r
join olt_control.cierre_mensual c on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date;
revoke all on olt_control.olt_general_dt_v1 from public,anon;
grant select on olt_control.olt_general_dt_v1 to authenticated;
-- One DT selection rule for every server-side SAP report, scoped by load.
create or replace view olt_control.sap_latest_dt_v1 with(security_invoker=true) as
select distinct on(s.carga_id,btrim(s.dt)) s.*,btrim(s.dt) dt_key
from olt_control.sap_staging s
where nullif(btrim(s.dt),'') is not null and s.referencia not like '500%'
and coalesce(s.raw_data->>'excluido_reporte','false')<>'true'
order by s.carga_id,btrim(s.dt),s.inacttrans desc nulls last,s.hraitr desc nulls last,s.fila_origen,s.id;
revoke all on olt_control.sap_latest_dt_v1 from public,anon;
grant select on olt_control.sap_latest_dt_v1 to authenticated;
-- Additive read-only reports. The source is exclusively the caller's active published load.
-- DT means SAP Transporte; General membership is tested by DT, not by delivery reference.
create or replace function public.olt_sap_dashboard_v1() returns jsonb
language sql stable security invoker set search_path=pg_catalog set jit=off set work_mem='32MB' set enable_nestloop=off as $f$
with chosen as (
 select c.id,c.archivo from olt_control.sap_cargas c
 join olt_control.sap_estado_usuario a on a.carga_activa_id=c.id and a.usuario_id=c.usuario_id
 where c.usuario_id=(select auth.uid()) and c.estado='publicada'
), source as materialized (
 select s.* from olt_control.sap_staging s join chosen c on c.id=s.carga_id
), eligible as (
 select e.dt_key dt,e.estado_viaje,e.et,e.inacttrans,e.hraitr,e.raw_data,e.fila_origen
 from olt_control.sap_latest_dt_v1 e where e.carga_id=(select id from chosen)
), tracked as materialized (
 select distinct btrim(dt) dt from olt_control.olt_general_dt_v1
 where usuario_id=(select auth.uid()) and nullif(btrim(dt),'') is not null
), report as (
 select e.dt,coalesce(nullif(btrim(e.estado_viaje),''),'Sin estado') state,
 coalesce(nullif(btrim(e.et),''),'Sin transportista') et,e.inacttrans,
 case when e.raw_data->>'fecha_despacho' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 and pg_input_is_valid(e.raw_data->>'fecha_despacho','date')
 then (e.raw_data->>'fecha_despacho')::date end dispatch_date,e.fila_origen source_row,e.hraitr,(t.dt is not null) in_general
 from eligible e left join tracked t using(dt)
)
select jsonb_build_object('load_id',(select id from chosen),'filename',(select archivo from chosen),
 'dispatch_column_present',coalesce((select bool_or(raw_data->>'dispatch_column_present'='true') from source),false),
 'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.et,r.dt) from report r),'[]'::jsonb))
$f$;
revoke all on function public.olt_sap_dashboard_v1() from public,anon;
grant execute on function public.olt_sap_dashboard_v1() to authenticated;

-- New caller-scoped SAP report; no snapshot/pointer changes or operational writes.
create or replace function public.olt_sap_dt_report_v1(p_load bigint default null) returns jsonb
language sql stable security invoker set search_path=pg_catalog set jit=off set work_mem='32MB' set enable_nestloop=off as $f$
with chosen as (
 select c.id,c.archivo from olt_control.sap_cargas c
 where c.usuario_id=(select auth.uid()) and c.id=coalesce(p_load,(select carga_activa_id from olt_control.sap_estado_usuario where usuario_id=(select auth.uid())))
), source as materialized (
 select s.* from olt_control.sap_staging s join chosen c on c.id=s.carga_id
), eligible as (
 select e.dt_key dt,e.estado_viaje,e.et,e.placa,e.inacttrans,e.hraitr,e.fila_origen,e.raw_data
 from olt_control.sap_latest_dt_v1 e where e.carga_id=(select id from chosen)
), alternatives as (
 select dt,case when raw_data->>'report_version'='1'
 and pg_input_is_valid(nullif(raw_data->>'fecha_alternativa',''),'date')
 then nullif(raw_data->>'fecha_alternativa','')::date end alternative
 from eligible
), tracked as materialized (
 select distinct btrim(dt) dt from olt_control.olt_general_dt_v1 where nullif(btrim(dt),'') is not null
), report as (
 select e.dt,coalesce(nullif(btrim(e.estado_viaje),''),'Sin estado') state,
 coalesce(nullif(btrim(e.et),''),'Sin transportista') et,coalesce(e.placa,'') plate,e.inacttrans,a.alternative,
 coalesce(e.inacttrans,a.alternative) date,
 case when e.inacttrans is not null then 'InActTrans' when a.alternative is not null then 'Fecha alternativa' else 'Sin fecha' end date_type,
 e.fila_origen source_row,e.hraitr,(t.dt is not null) in_tracking
 from eligible e left join alternatives a using(dt) left join tracked t on t.dt=e.dt
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
