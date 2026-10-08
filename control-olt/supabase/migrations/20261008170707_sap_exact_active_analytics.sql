-- Applied over the existing OLT v3 canonical schema. No legacy data is deleted.
create or replace view public.olt_control_live with (security_invoker=true) as
select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.linea,r.distrito,r.provincia,
 (to_jsonb(r)-array['usuario','archivo','archivo_hash','pestana','created_at'])
 || (coalesce(to_jsonb(g),'{}'::jsonb)-array['olt_id','updated_by','updated_at'])
 || (coalesce(to_jsonb(s),'{}'::jsonb)-array['id','usuario_id','referencia','raw_data']) as row_data,
 upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE' as reporting_included
from public.recepcion_olt r
left join olt_control.gestion_olt g on g.olt_id=r.id
left join olt_control.sap_estado_usuario e on e.usuario_id=r.usuario_id
left join olt_control.sap_snapshot s on s.usuario_id=r.usuario_id and s.carga_id=e.carga_activa_id and s.referencia=btrim(r.entrega);

create or replace view public.olt_sap_snapshots with (security_invoker=true) as
select * from olt_control.sap_snapshot;
grant select on public.olt_sap_snapshots to authenticated;
revoke all on public.olt_sap_snapshots from anon;

create or replace function public.olt_sap_summary(p_load bigint) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
with c as(select * from olt_control.sap_cargas where id=p_load and usuario_id=(select auth.uid()) and estado='validando'),
 selected as(select distinct on(s.referencia) s.* from olt_control.sap_staging s join c on c.id=s.carga_id order by s.referencia,s.inacttrans desc nulls last,s.hraitr desc nulls last,s.fila_origen),
 compared as(select n.*,o.referencia as old_ref,
 (to_jsonb(n)-array['id','carga_id','fila_origen','raw_data','fecha_salida_sap']) is distinct from
 (to_jsonb(o)-array['id','usuario_id','carga_id','raw_data','fecha_salida_sap']) as changed
 from selected n join c on true left join olt_control.sap_snapshot o on o.usuario_id=c.usuario_id and o.referencia=n.referencia and o.carga_id=c.base_carga_id)
select jsonb_build_object('carga_id',c.id,'archivo',c.archivo,'total',c.total_filas,'invalid',c.filas_invalidas,
 'valid',(select count(*) from olt_control.sap_staging s where s.carga_id=c.id),'unique',(select count(*) from selected),
 'new',(select count(*) from compared where old_ref is null),'modified',(select count(*) from compared where old_ref is not null and changed),
 'previous_unique',coalesce((select referencias_unicas from olt_control.sap_cargas where id=c.base_carga_id),0),
 'future',(select count(*) from selected where inacttrans>(now() at time zone 'America/Lima')::date)) from c
$f$;

-- All analytics run as caller: existing RLS applies to every source.
create or replace function public.olt_control_analytics(p_period date default null,p_line text default null,p_transport text default null,p_zone text default null)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $f$
with b as materialized (
 select * from public.olt_reporting
 where (p_period is null or (fecha>=p_period and fecha<(p_period+interval '1 month')::date))
 and (p_line is null or linea=p_line)
 and (p_transport is null or row_data->>'transporte'=p_transport)
 and (p_zone is null or upper(btrim(row_data->>'despacho'))=p_zone)
), totals as (
 select count(*) total,count(*) filter(where row_data->>'estado_cargo'='Cumple') cumple,
 count(*) filter(where row_data->>'estado_cargo'='No Cumple') no_cumple,
 count(*) filter(where row_data->>'estado_cargo' in ('Por Vencer','Vencen Hoy')) por_vencer,
 count(*) filter(where row_data->>'estado_cargo'='Cargo Pendiente') pendientes,
 count(*) filter(where row_data->>'carga_id' is not null) con_sap from b
), segments as (
 select d.dimension,d.segment,count(*) total,count(*) filter(where b.row_data->>'carga_id' is not null) con_sap
 from b cross join lateral (values ('Zona',b.row_data->>'despacho'),('Línea',b.linea),('Transporte',b.row_data->>'transporte'),('Área OLT',b.row_data->>'area')) d(dimension,segment)
 group by d.dimension,d.segment
), choices as (select * from public.olt_control_rows)
select jsonb_build_object('totals',(select to_jsonb(t) from totals t),
 'segments',coalesce((select jsonb_agg(to_jsonb(s) order by s.dimension,1.0*s.con_sap/nullif(s.total,0),s.segment) from segments s),'[]'::jsonb),
 'lines',coalesce((select jsonb_agg(x.linea order by x.linea) from (select distinct linea from choices where linea is not null) x),'[]'::jsonb),
 'transports',coalesce((select jsonb_agg(x.transport order by x.transport) from (select distinct row_data->>'transporte' transport from choices where row_data->>'transporte' is not null) x),'[]'::jsonb))
$f$;

create or replace function public.olt_sap_analysis(p_load bigint) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
with c as(select * from olt_control.sap_cargas where id=p_load and usuario_id=(select auth.uid())),
 n as materialized (
 select referencia,inacttrans,hraitr,dt,et,placa,estado_viaje,estado_entrega,fec_reg,hor_reg,usua_ctrl_re
 from olt_control.sap_snapshot where carga_id=p_load and exists(select 1 from c where estado='publicada')
 union all
 select referencia,inacttrans,hraitr,dt,et,placa,estado_viaje,estado_entrega,fec_reg,hor_reg,usua_ctrl_re
 from (select distinct on(s.referencia) s.* from olt_control.sap_staging s join c on c.id=s.carga_id and c.estado='validando'
 order by s.referencia,s.inacttrans desc nulls last,s.hraitr desc nulls last,s.fila_origen) t
), o as materialized (select s.* from olt_control.sap_snapshot s join c on s.carga_id=c.base_carga_id),
 diff as (
 select coalesce(n.referencia,o.referencia) entrega,to_jsonb(o)-array['id','usuario_id','carga_id','raw_data','fecha_salida_sap'] antes,to_jsonb(n) ahora,
 case when o.referencia is null then 'Nueva' when n.referencia is null then 'Desaparecida' else 'Modificada' end tipo,
 n.dt is distinct from o.dt dt,n.placa is distinct from o.placa placa,n.et is distinct from o.et et,
 (n.estado_viaje is distinct from o.estado_viaje or n.estado_entrega is distinct from o.estado_entrega) estado
 from n full join o using(referencia)
 where n.referencia is null or o.referencia is null or to_jsonb(n) is distinct from (to_jsonb(o)-array['id','usuario_id','carga_id','raw_data','fecha_salida_sap'])
), olt as materialized (select * from public.olt_reporting),
 coverage as (
 select d.dimension,d.segment,count(*) total,count(*) filter(where n.referencia is not null) con_sap
 from olt left join n on n.referencia=btrim(olt.entrega)
 cross join lateral(values ('Zona',olt.row_data->>'despacho'),('Línea',olt.linea),('Transporte',olt.row_data->>'transporte'),('Área OLT',olt.row_data->>'area')) d(dimension,segment)
 group by d.dimension,d.segment
), counts as (
 select count(*) filter(where tipo='Nueva') nuevas,count(*) filter(where tipo='Modificada') modificadas,count(*) filter(where tipo='Desaparecida') desaparecidas,
 count(*) filter(where tipo='Modificada' and dt) dt,count(*) filter(where tipo='Modificada' and placa) placa,
 count(*) filter(where tipo='Modificada' and et) et,count(*) filter(where tipo='Modificada' and estado) estado from diff
)
select jsonb_build_object('changes',(select to_jsonb(x) from counts x),
 'detail',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from diff order by tipo,entrega limit 100) x),'[]'::jsonb),
 'coverage',coalesce((select jsonb_agg(to_jsonb(x) order by dimension,1.0*con_sap/nullif(total,0),segment) from coverage x),'[]'::jsonb),
 'olt_total',(select count(*) from olt),'olt_missing',(select count(*) from olt where not exists(select 1 from n where n.referencia=btrim(olt.entrega))),
 'sap_without_olt',(select count(*) from n where not exists(select 1 from public.recepcion_olt r where btrim(r.entrega)=n.referencia)),
 'missing_detail',coalesce((select jsonb_agg(to_jsonb(x)) from(select entrega,linea,fecha from olt where not exists(select 1 from n where n.referencia=btrim(olt.entrega)) order by fecha desc,id desc limit 100) x),'[]'::jsonb),
 'future',(select count(*) from n where inacttrans>(now() at time zone 'America/Lima')::date),
 'incomplete',(select count(*) from n where dt is null or placa is null or et is null or inacttrans is null),
 'multi_dt',(select count(*) from(select referencia from olt_control.sap_staging where carga_id=p_load group by referencia having count(distinct dt)>1) x),
 'ties',(select count(*) from(select referencia,inacttrans,hraitr from olt_control.sap_staging where carga_id=p_load group by referencia,inacttrans,hraitr having count(*)>1) x)) from c
$f$;
revoke all on function public.olt_control_analytics(date,text,text,text),public.olt_sap_analysis(bigint) from public,anon;
grant execute on function public.olt_control_analytics(date,text,text,text),public.olt_sap_analysis(bigint) to authenticated;
notify pgrst,'reload schema';
