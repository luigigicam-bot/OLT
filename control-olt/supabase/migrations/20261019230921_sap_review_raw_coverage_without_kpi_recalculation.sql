create or replace function public.olt_sap_analysis(p_load bigint) returns jsonb
language sql stable security invoker set search_path=pg_catalog set jit=off set work_mem='32MB' set enable_nestloop=off as $f$
with c as(select * from olt_control.sap_cargas where id=p_load and usuario_id=(select auth.uid())),
 n as materialized (
 select referencia,inacttrans,hraitr,dt,et,placa,estado_viaje,estado_entrega,fec_reg,hor_reg,usua_ctrl_re
 from olt_control.sap_snapshot where carga_id=p_load and exists(select 1 from c where estado='publicada')
 union all
 select referencia,inacttrans,hraitr,dt,et,placa,estado_viaje,estado_entrega,fec_reg,hor_reg,usua_ctrl_re
 from (select distinct on(s.referencia) s.* from olt_control.sap_staging s join c on c.id=s.carga_id and c.estado='validando'
 order by s.referencia,s.inacttrans desc nulls last,s.hraitr desc nulls last,s.fila_origen) t
), o as materialized (select referencia,inacttrans,hraitr,dt,et,placa,estado_viaje,estado_entrega,fec_reg,hor_reg,usua_ctrl_re from olt_control.sap_snapshot s join c on s.carga_id=c.base_carga_id),
 diff as (
 select coalesce(n.referencia,o.referencia) entrega,to_jsonb(o) antes,to_jsonb(n) ahora,
 case when o.referencia is null then 'Nueva' when n.referencia is null then 'Desaparecida' else 'Modificada' end tipo,
 n.dt is distinct from o.dt dt,n.placa is distinct from o.placa placa,n.et is distinct from o.et et,
 (n.estado_viaje is distinct from o.estado_viaje or n.estado_entrega is distinct from o.estado_entrega) estado
 from n full join o using(referencia)
 where n.referencia is null or o.referencia is null or to_jsonb(n) is distinct from to_jsonb(o)
), olt as materialized (
 select r.id,r.fecha,r.entrega,r.linea,r.despacho,r.transporte,r.area
 from public.recepcion_olt r join olt_control.olt_record_scope_v1 scope on scope.id=r.id and scope.usuario_id=r.usuario_id and scope.is_current
 where upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE'
),
 coverage as (
 select d.dimension,d.segment,count(*) total,count(*) filter(where n.referencia is not null) con_sap
 from olt left join n on n.referencia=btrim(olt.entrega)
 cross join lateral(values ('Zona',olt.despacho),('Línea',olt.linea),('Transporte',olt.transporte),('Área OLT',olt.area)) d(dimension,segment)
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
