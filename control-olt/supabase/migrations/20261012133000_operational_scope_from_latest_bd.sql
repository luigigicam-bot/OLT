-- Operational scope: current audited BD snapshot + records created after that snapshot.
-- Raw historical rows remain in recepcion_olt; this only controls General/KPI/current exports.

create index if not exists bd_imports_user_created_idx
  on olt_control.bd_imports(usuario_id, created_at desc);

create index if not exists bd_import_rows_import_olt_idx
  on olt_control.bd_import_rows(import_id, olt_id);

create or replace view olt_control.olt_record_scope_v1
with (security_invoker = true)
as
with latest_import as (
  select distinct on (usuario_id)
    id as import_id,
    usuario_id,
    created_at as import_created_at
  from olt_control.bd_imports
  order by usuario_id, created_at desc, id desc
)
select
  r.id,
  r.usuario_id,
  case
    when li.import_id is null then true
    when b.olt_id is not null then true
    when r.created_at > li.import_created_at then true
    else false
  end as is_current,
  case
    when li.import_id is null then 'sin_snapshot_bd'
    when b.olt_id is not null then 'snapshot_bd_actual'
    when r.created_at > li.import_created_at then 'posterior_snapshot_bd'
    else 'historico_pre_snapshot'
  end as scope_reason,
  li.import_id,
  li.import_created_at
from public.recepcion_olt r
left join latest_import li
  on li.usuario_id = r.usuario_id
left join olt_control.bd_import_rows b
  on b.import_id = li.import_id
 and b.olt_id = r.id;

grant select on olt_control.olt_record_scope_v1 to authenticated;

create or replace view public.olt_control_live
with (security_invoker = true)
as
select
  r.id,
  r.usuario_id,
  r.fecha,
  r.entrega,
  r.razon,
  r.linea,
  r.distrito,
  r.provincia,
  (
    (to_jsonb(r.*) - array['usuario','archivo','archivo_hash','pestana','created_at'])
    || (coalesce(to_jsonb(g.*),'{}'::jsonb) - array['olt_id','updated_by','updated_at'])
    || case
         when s.id is not null then
           (to_jsonb(s.*) - array['id','usuario_id','referencia','raw_data'])
           || jsonb_build_object('fecha_salida_sap',s.inacttrans)
         when b.olt_id is not null then
           jsonb_strip_nulls(jsonb_build_object(
             'dt',b.dt,
             'et',b.et,
             'placa',b.placa,
             'inacttrans',b.fecha_salida_sap,
             'fecha_salida_sap',b.fecha_salida_sap,
             'estado_viaje',b.estado_viaje,
             'estado_entrega',b.estado_entrega,
             'fec_reg',b.fec_reg,
             'hor_reg',b.hor_reg,
             'usua_ctrl_re',b.usua_ctrl_re,
             'sap_origen','BD histórico'
           ))
         else '{}'::jsonb
       end
    || jsonb_build_object(
         'gestion_version',g.updated_at,
         'scope_reason',scope.scope_reason
       )
  ) as row_data,
  upper(btrim(coalesce(r.transporte,''))) <> 'RECOGE CLIENTE' as reporting_included
from public.recepcion_olt r
join olt_control.olt_record_scope_v1 scope
  on scope.id = r.id
 and scope.usuario_id = r.usuario_id
 and scope.is_current
left join olt_control.gestion_olt g on g.olt_id = r.id
left join olt_control.sap_estado_usuario e on e.usuario_id = r.usuario_id
left join olt_control.sap_snapshot s
  on s.usuario_id = r.usuario_id
 and s.carga_id = e.carga_activa_id
 and s.referencia = btrim(r.entrega)
left join olt_control.bd_legacy_sap_v1 b
  on b.olt_id = r.id
 and b.usuario_id = r.usuario_id;
