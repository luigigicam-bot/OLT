create index if not exists cierre_current_olt_period_idx on olt_control.cierre_mensual(olt_id,periodo) where coalesce(snapshot->>'historico_consolidado','')<>'true';
-- Reduce live SAP work to current records before joining the frozen archive.
create or replace view public.olt_metric_source_v1 with(security_invoker=true) as
with current_base as materialized (
 select r.*,scope.scope_reason from public.recepcion_olt r
 join olt_control.olt_record_scope_v1 scope on scope.id=r.id and scope.usuario_id=r.usuario_id and scope.is_current
 where not exists(select 1 from olt_control.cierre_mensual h where h.olt_id=r.id and h.snapshot->>'historico_consolidado'='true')
), current_rows as materialized (
 select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,
 upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE' reporting_included,
 c.id is not null cerrado,a.carga_activa_id,
 case when c.id is not null then c.snapshot else
 (to_jsonb(r)-array['usuario','archivo','archivo_hash','pestana','created_at'])
 ||(coalesce(to_jsonb(g),'{}'::jsonb)-array['olt_id','updated_by','updated_at'])
 ||case when s.id is not null then
 (to_jsonb(s)-array['id','usuario_id','referencia','raw_data'])||jsonb_build_object('fecha_salida_sap',s.inacttrans)
 when b.olt_id is not null then jsonb_strip_nulls(jsonb_build_object(
 'dt',b.dt,'et',b.et,'placa',b.placa,'inacttrans',b.fecha_salida_sap,'fecha_salida_sap',b.fecha_salida_sap,
 'estado_viaje',b.estado_viaje,'estado_entrega',b.estado_entrega,'fec_reg',b.fec_reg,'hor_reg',b.hor_reg,'usua_ctrl_re',b.usua_ctrl_re,'sap_origen','BD histórico'))
 else '{}'::jsonb end
 ||jsonb_build_object('gestion_version',g.updated_at,'scope_reason',r.scope_reason) end row_data
 from current_base r
 left join olt_control.gestion_olt g on g.olt_id=r.id
 left join public.olt_sap_active a on a.usuario_id=r.usuario_id
 left join olt_control.sap_snapshot s on s.usuario_id=r.usuario_id and s.carga_id=a.carga_activa_id and s.referencia=btrim(r.entrega)
 left join olt_control.bd_legacy_sap_v1 b on b.olt_id=r.id and b.usuario_id=r.usuario_id
 left join olt_control.cierre_mensual c on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date and coalesce(c.snapshot->>'historico_consolidado','')<>'true'
)
select id,usuario_id,fecha,entrega,razon,distrito,provincia,reporting_included,cerrado,
case when not cerrado and row_data->>'carga_id' is not null
 and (row_data->>'carga_id')::bigint is distinct from carga_activa_id
then row_data-array['carga_id','inacttrans','hraitr','dt','et','placa','fecha_salida_sap','estado_viaje','estado_entrega','fec_reg','hor_reg','usua_ctrl_re']
else row_data end source_data from current_rows
union all
select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,
upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE',true,c.snapshot
from public.recepcion_olt r join olt_control.cierre_mensual c
on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date
where c.snapshot->>'historico_consolidado'='true';
notify pgrst,'reload schema';

