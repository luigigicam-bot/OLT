-- Frozen imports bypass SAP joins and current-day indicator calculations.
-- Both branches remain SECURITY INVOKER and inherit the original caller RLS.
create or replace view public.olt_metric_source_v1 with(security_invoker=true) as
with frozen as materialized (
 select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,
 upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE' reporting_included,
 true cerrado,c.snapshot source_data
 from public.recepcion_olt r join olt_control.cierre_mensual c
 on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date
 where c.snapshot->>'historico_consolidado'='true'
), current_rows as (
 select l.id,l.usuario_id,l.fecha,l.entrega,l.razon,l.distrito,l.provincia,l.reporting_included,
 c.id is not null cerrado,case when c.id is null then l.row_data else c.snapshot end row_data,
 a.carga_activa_id
 from public.olt_control_live l
 left join olt_control.cierre_mensual c on c.olt_id=l.id and c.periodo=date_trunc('month',l.fecha)::date
 left join public.olt_sap_active a on a.usuario_id=l.usuario_id
 where not exists(select 1 from frozen f where f.id=l.id)
)
select id,usuario_id,fecha,entrega,razon,distrito,provincia,reporting_included,cerrado,
case when not cerrado and row_data->>'carga_id' is not null
 and (row_data->>'carga_id')::bigint is distinct from carga_activa_id
then row_data-array['carga_id','inacttrans','hraitr','dt','et','placa','fecha_salida_sap','estado_viaje','estado_entrega','fec_reg','hor_reg','usua_ctrl_re']
else row_data end source_data from current_rows
union all select id,usuario_id,fecha,entrega,razon,distrito,provincia,reporting_included,cerrado,source_data from frozen;
notify pgrst,'reload schema';

