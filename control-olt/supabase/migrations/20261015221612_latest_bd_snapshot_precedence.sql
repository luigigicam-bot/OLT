-- Prefer the most recent BD import, independently of source row numbering.
-- Caller permissions and active SAP precedence remain unchanged.
create or replace view olt_control.bd_legacy_sap_v1
with (security_invoker = true)
as
select distinct on (b.olt_id)
 b.olt_id,b.usuario_id,b.dt,b.et,b.placa,b.fecha_salida_sap,
 b.estado_viaje,b.estado_entrega,b.fec_reg,b.hor_reg,b.usua_ctrl_re,
 b.source_row,b.import_id
from olt_control.bd_import_rows b
join olt_control.bd_imports i on i.id=b.import_id and i.usuario_id=b.usuario_id
where b.olt_id is not null
order by b.olt_id,i.created_at desc,i.id desc,b.source_row desc;
notify pgrst,'reload schema';

