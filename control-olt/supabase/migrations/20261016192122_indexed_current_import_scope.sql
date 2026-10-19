create index if not exists bd_scope_owner_import_olt_idx on olt_control.bd_import_rows(usuario_id,import_id,olt_id);
create or replace view olt_control.olt_record_scope_v1 with(security_invoker=true) as
with latest_import as materialized (
 select distinct on(usuario_id) id import_id,usuario_id,created_at import_created_at
 from olt_control.bd_imports where pestana='BD' order by usuario_id,created_at desc,id desc
), current_ids as materialized (
 select b.olt_id,b.usuario_id from latest_import li
 join olt_control.bd_import_rows b on b.import_id=li.import_id and b.usuario_id=li.usuario_id
 where b.olt_id is not null
), flags as (
 select r.id,r.usuario_id,r.created_at,li.import_id,li.import_created_at,b.olt_id,
 exists(select 1 from olt_control.cierre_mensual c where c.olt_id=r.id and c.snapshot->>'historico_consolidado'='true') historical
 from public.recepcion_olt r left join latest_import li on li.usuario_id=r.usuario_id
 left join current_ids b on b.olt_id=r.id and b.usuario_id=r.usuario_id
)
select id,usuario_id,(historical or import_id is null or olt_id is not null or created_at>import_created_at) is_current,
case when historical then 'historico_consolidado' when import_id is null then 'sin_snapshot_bd'
when olt_id is not null then 'snapshot_bd_actual' when created_at>import_created_at then 'posterior_snapshot_bd' else 'historico_pre_snapshot' end scope_reason,
import_id,import_created_at from flags;
create or replace view olt_control.bd_legacy_sap_v1 with(security_invoker=true) as
select distinct on(b.olt_id) b.olt_id,b.usuario_id,b.dt,b.et,b.placa,b.fecha_salida_sap,
b.estado_viaje,b.estado_entrega,b.fec_reg,b.hor_reg,b.usua_ctrl_re,b.source_row,b.import_id
from olt_control.bd_import_rows b join olt_control.bd_imports i on i.id=b.import_id and i.usuario_id=b.usuario_id
where b.olt_id is not null and i.pestana='BD'
order by b.olt_id,i.created_at desc,i.id desc,b.source_row desc;
notify pgrst,'reload schema';

