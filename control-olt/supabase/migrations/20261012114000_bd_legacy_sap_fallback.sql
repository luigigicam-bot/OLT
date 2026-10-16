-- Finalize legacy BD integration without duplicating canonical OLT rows.
-- Active SAP always wins. BD historical SAP is only a fallback when the active
-- snapshot has no row for the OLT record.

create or replace view olt_control.bd_legacy_sap_v1
with (security_invoker = true)
as
select distinct on (b.olt_id)
  b.olt_id,
  b.usuario_id,
  b.dt,
  b.et,
  b.placa,
  b.fecha_salida_sap,
  b.estado_viaje,
  b.estado_entrega,
  b.fec_reg,
  b.hor_reg,
  b.usua_ctrl_re,
  b.source_row,
  b.import_id
from olt_control.bd_import_rows b
where b.olt_id is not null
order by b.olt_id, b.source_row desc;

grant select on olt_control.bd_legacy_sap_v1 to authenticated;

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
    || jsonb_build_object('gestion_version',g.updated_at)
  ) as row_data,
  upper(btrim(coalesce(r.transporte,''))) <> 'RECOGE CLIENTE' as reporting_included
from public.recepcion_olt r
left join olt_control.gestion_olt g on g.olt_id = r.id
left join olt_control.sap_estado_usuario e on e.usuario_id = r.usuario_id
left join olt_control.sap_snapshot s
  on s.usuario_id = r.usuario_id
 and s.carga_id = e.carga_activa_id
 and s.referencia = btrim(r.entrega)
left join olt_control.bd_legacy_sap_v1 b
  on b.olt_id = r.id
 and b.usuario_id = r.usuario_id;
