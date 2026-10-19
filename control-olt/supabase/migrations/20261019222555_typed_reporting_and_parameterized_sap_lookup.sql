create or replace view public.olt_reporting_rows_v1 with(security_invoker=true) as
with scope_rows as materialized(select id,usuario_id,is_current from olt_control.olt_record_scope_v1),
current_base as materialized (
 select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,r.departamento,r.linea,r.despacho,r.transporte
 from public.recepcion_olt r join scope_rows scope on scope.id=r.id and scope.usuario_id=r.usuario_id and scope.is_current
 left join olt_control.cierre_mensual c on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date where c.id is null
), live as materialized (
 select r.*,g.fec_cargo,g.responsable,g.motivo,
 case when s.id is not null then s.inacttrans else b.fecha_salida_sap end fecha_sap,
 case when s.id is not null then s.et else b.et end et,
 jsonb_build_object('fecha',r.fecha,'fecha_salida_sap',case when s.id is not null then s.inacttrans else b.fecha_salida_sap end,
 'fec_cargo',g.fec_cargo,'linea',r.linea,'departamento',r.departamento,'despacho',r.despacho) indicator_input
 from current_base r left join olt_control.gestion_olt g on g.olt_id=r.id
 left join public.olt_sap_active a on a.usuario_id=r.usuario_id
 left join lateral (select s.* from olt_control.sap_snapshot s where s.usuario_id=r.usuario_id and s.carga_id=a.carga_activa_id and s.referencia=btrim(r.entrega) offset 0) s on true
 left join olt_control.bd_legacy_sap_v1 b on b.olt_id=r.id and b.usuario_id=r.usuario_id
), inputs as materialized(select distinct indicator_input from live),
metrics as materialized(select indicator_input,public.olt_indicators(indicator_input)->>'indicador' indicador from inputs)
select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,false cerrado,
upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE' reporting_included,
upper(btrim(coalesce(r.despacho,''))) zona,coalesce(nullif(btrim(r.linea),''),'Sin línea') linea,
coalesce(nullif(btrim(r.et),''),'Sin transportista') et,coalesce(nullif(btrim(r.responsable),''),'Sin responsable') responsable,
coalesce(nullif(btrim(r.motivo),''),'Sin motivo registrado') motivo,coalesce(m.indicador,'') indicador,r.fecha_sap,
extract(month from r.fecha)::integer mes_despacho,false historical_consolidated
from live r left join metrics m using(indicator_input)
union all
select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,true,
upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE',upper(btrim(coalesce(c.metric_values[1],''))),
coalesce(nullif(btrim(c.metric_values[2]),''),'Sin línea'),coalesce(nullif(btrim(c.metric_values[3]),''),'Sin transportista'),
coalesce(nullif(btrim(c.metric_values[4]),''),'Sin responsable'),coalesce(nullif(btrim(c.metric_values[5]),''),'Sin motivo registrado'),
coalesce(c.metric_values[6],''),nullif(c.metric_values[7],'')::date,extract(month from r.fecha)::integer,coalesce(c.metric_values[8]='true',false)
from public.recepcion_olt r join olt_control.cierre_mensual c on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date
join scope_rows scope on scope.id=r.id and scope.usuario_id=r.usuario_id and scope.is_current;
revoke all on public.olt_reporting_rows_v1 from public,anon;
grant select on public.olt_reporting_rows_v1 to authenticated;

create or replace function public.olt_metric_kpi_v1(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security invoker
stable
set search_path=pg_catalog set jit=off set work_mem='32MB' set enable_nestloop=off
as $function$
declare result jsonb; begin execute $query$
with b as materialized (
 select r.id,r.zona,r.linea,r.et,r.indicador,r.responsable,r.motivo from public.olt_reporting_rows_v1 r
where (nullif($1->>'date_from','') is null or r.fecha_sap >= ($1->>'date_from')::date)
  and (nullif($1->>'date_to','') is null or r.fecha_sap <= ($1->>'date_to')::date)
  and (nullif($1->>'month','') is null or r.mes_despacho = ($1->>'month')::integer)
  and (nullif($1->>'year','') is null or extract(year from r.fecha)::integer = ($1->>'year')::integer)
  and (nullif($1->>'line','') is null or r.linea = $1->>'line')
  and (nullif($1->>'indicator','') is null or r.indicador = $1->>'indicator')
  and (nullif($1->>'zone','') is null or r.zona = $1->>'zone')
  and (nullif($1->>'et','') is null or r.et = $1->>'et')
  and (
    nullif($1->>'responsible','') is null
    or public.olt_norm_text_v1(r.responsable) = public.olt_norm_text_v1($1->>'responsible')
  )
  and (
    nullif($1->>'reason','') is null
    or public.olt_norm_text_v1(r.motivo) = public.olt_norm_text_v1($1->>'reason')
  )
  and r.reporting_included
  and (
    nullif($1->>'search','') is null
    or position(lower($1->>'search') in lower(concat_ws(' ',r.entrega,r.razon,r.linea,r.distrito,r.provincia,r.et))) > 0
  )

), totals as (
 select count(*) total,count(*) filter(where indicador='En Fecha') en_fecha,
 count(*) filter(where indicador='Fuera de Fecha') fuera_fecha,
 count(*) filter(where indicador not in ('En Fecha','Fuera de Fecha')) sin_indicador,
 count(*) filter(where zona not in ('LIMA','PROVINCIA')) sin_zona from b
), zones as (
 select z.zona,count(b.id) total,count(b.id) filter(where b.indicador='En Fecha') en_fecha,
 count(b.id) filter(where b.indicador='Fuera de Fecha') fuera_fecha,
 count(b.id) filter(where b.indicador not in ('En Fecha','Fuera de Fecha')) sin_indicador
 from(values('LIMA'),('PROVINCIA')) z(zona) left join b on b.zona=z.zona group by z.zona
), lines as (
 select zona,linea,count(*) total,count(*) filter(where indicador='En Fecha') en_fecha,
 count(*) filter(where indicador='Fuera de Fecha') fuera_fecha,
 count(*) filter(where indicador not in ('En Fecha','Fuera de Fecha')) sin_indicador from b
 where zona in ('LIMA','PROVINCIA') group by zona,linea
), incidents_raw as (
 select
   zona,
   public.olt_norm_text_v1(responsable) responsable_key,
   public.olt_norm_text_v1(motivo) motivo_key,
   min(btrim(responsable)) responsable_sample,
   min(btrim(motivo)) motivo_sample,
   count(*) total
 from b
 where indicador='Fuera de Fecha'
   and zona in ('LIMA','PROVINCIA')
   and (responsable <> 'Sin responsable' or motivo <> 'Sin motivo registrado')
 group by zona,public.olt_norm_text_v1(responsable),public.olt_norm_text_v1(motivo)
), incidents as (
 select
   zona,
   case
     when responsable_key is null then 'Sin responsable'
     else upper(left(lower(responsable_sample),1)) || substr(lower(responsable_sample),2)
   end responsable,
   case
     when motivo_key is null then 'Sin motivo registrado'
     else upper(left(lower(motivo_sample),1)) || substr(lower(motivo_sample),2)
   end motivo,
   total
 from incidents_raw
), transports as (
 select zona,et,count(*) total,count(*) filter(where indicador='En Fecha') en_fecha,
 count(*) filter(where indicador='Fuera de Fecha') fuera_fecha,
 count(*) filter(where indicador not in ('En Fecha','Fuera de Fecha')) sin_indicador from b group by zona,et
)
select jsonb_build_object('totals',(select to_jsonb(t) from totals t),
 'zones',(select jsonb_agg(to_jsonb(z) order by zona) from zones z),
 'lines',coalesce((select jsonb_agg(to_jsonb(l) order by zona,total desc,linea) from lines l),'[]'::jsonb),
 'incidents',coalesce((select jsonb_agg(to_jsonb(i) order by zona,total desc,responsable,motivo) from incidents i),'[]'::jsonb),
 'transports',coalesce((select jsonb_agg(to_jsonb(t) order by zona,total desc,et) from transports t),'[]'::jsonb),
 'generated_at',now(),'rules','Indicador: En Fecha / Fuera de Fecha; cada fila OLT = un documento; incidencias homologadas por mayúsculas, espacios y acentos')
$query$ into result using coalesce(p_filters,'{}'::jsonb); return result; end
$function$;

create or replace function public.olt_monthly_summary_v1(p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog set jit=off set work_mem='32MB' set enable_nestloop=off as $f$
declare result jsonb; begin
 execute $q$
with b as materialized (
 select r.fecha,r.zona,r.indicador,r.responsable,r.motivo,r.historical_consolidated historical from public.olt_reporting_rows_v1 r
where (nullif($1->>'date_from','') is null or r.fecha_sap >= ($1->>'date_from')::date)
  and (nullif($1->>'date_to','') is null or r.fecha_sap <= ($1->>'date_to')::date)
  and (nullif($1->>'month','') is null or r.mes_despacho = ($1->>'month')::integer)
  and (nullif($1->>'year','') is null or extract(year from r.fecha)::integer = ($1->>'year')::integer)
  and (nullif($1->>'line','') is null or r.linea = $1->>'line')
  and (nullif($1->>'indicator','') is null or r.indicador = $1->>'indicator')
  and (nullif($1->>'zone','') is null or r.zona = $1->>'zone')
  and (nullif($1->>'et','') is null or r.et = $1->>'et')
  and (
    nullif($1->>'responsible','') is null
    or public.olt_norm_text_v1(r.responsable) = public.olt_norm_text_v1($1->>'responsible')
  )
  and (
    nullif($1->>'reason','') is null
    or public.olt_norm_text_v1(r.motivo) = public.olt_norm_text_v1($1->>'reason')
  )
  and r.reporting_included
  and (
    nullif($1->>'search','') is null
    or position(lower($1->>'search') in lower(concat_ws(' ',r.entrega,r.razon,r.linea,r.distrito,r.provincia,r.et))) > 0
  )

), monthly as (
 select extract(year from fecha)::int as "year",extract(month from fecha)::int as "month",zona,
 count(*) total,count(*) filter(where indicador='En Fecha') en_fecha,
 count(*) filter(where indicador='Fuera de Fecha') fuera_fecha,
 count(*) filter(where indicador not in('En Fecha','Fuera de Fecha')) sin_indicador,
 count(*) filter(where historical) historical
 from b group by 1,2,3
), incidents as (
 select extract(year from fecha)::int as "year",extract(month from fecha)::int as "month",zona,
 coalesce(nullif(nullif(btrim(responsable),'-'),''),'Sin responsable') responsable,
 coalesce(nullif(nullif(btrim(motivo),'-'),''),'Sin motivo registrado') motivo,count(*) total
 from b where indicador='Fuera de Fecha' group by 1,2,3,4,5
), months as (
 select distinct extract(year from fecha)::int as "year",extract(month from fecha)::int as "month" from b
)
select jsonb_build_object(
 'monthly',coalesce((select jsonb_agg(to_jsonb(m) order by "year","month",zona) from monthly m),'[]'::jsonb),
 'incidents',coalesce((select jsonb_agg(to_jsonb(i) order by total desc,"year","month",responsable,motivo) from incidents i),'[]'::jsonb),
 'months',coalesce((select jsonb_agg(to_jsonb(m) order by "year","month") from months m),'[]'::jsonb),
 'target',case when $1->>'line'='TECNOFARMA' then 0.96 else null end,
 'generated_at',now(),
 'basis','Mes de Fec. Despacho. Histórico consolidado conserva los resultados de origen.')
$q$ into result using coalesce(p_filters,'{}'::jsonb);
return result; end
$f$;
revoke all on function public.olt_monthly_summary_v1(jsonb) from public,anon;
grant execute on function public.olt_monthly_summary_v1(jsonb) to authenticated;

notify pgrst,'reload schema';

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
 left join lateral (select s.* from olt_control.sap_snapshot s where s.usuario_id=r.usuario_id and s.carga_id=a.carga_activa_id and s.referencia=btrim(r.entrega) offset 0) s on true
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


create or replace function public.olt_metric_page_v1(p_filters jsonb default '{}'::jsonb,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog set jit=off set work_mem='32MB' as $fn$
declare result jsonb; candidate_sql text; begin
if jsonb_strip_nulls(coalesce(p_filters,'{}'::jsonb))='{}'::jsonb then candidate_sql=$base$select r.id,r.fecha from public.recepcion_olt r where
not exists(select 1 from olt_control.bd_imports i where i.pestana='BD' and i.usuario_id=r.usuario_id)
or r.created_at>(select i.created_at from olt_control.bd_imports i where i.pestana='BD' and i.usuario_id=r.usuario_id order by i.created_at desc,i.id desc limit 1)
or exists(select 1 from olt_control.bd_import_rows b where b.olt_id=r.id and b.import_id=(select i.id from olt_control.bd_imports i where i.pestana='BD' and i.usuario_id=r.usuario_id order by i.created_at desc,i.id desc limit 1))
or exists(select 1 from olt_control.cierre_mensual c where c.olt_id=r.id and c.metric_values[8]='true')
order by r.fecha desc nulls last,r.id desc limit 101 offset greatest($2,0)$base$;
else candidate_sql=$filtered$select r.id,r.fecha from public.olt_reporting_rows_v1 r
where (nullif($1->>'date_from','') is null or r.fecha_sap >= ($1->>'date_from')::date)
  and (nullif($1->>'date_to','') is null or r.fecha_sap <= ($1->>'date_to')::date)
  and (nullif($1->>'month','') is null or r.mes_despacho = ($1->>'month')::integer)
  and (nullif($1->>'year','') is null or extract(year from r.fecha)::integer = ($1->>'year')::integer)
  and (nullif($1->>'line','') is null or r.linea = $1->>'line')
  and (nullif($1->>'indicator','') is null or r.indicador = $1->>'indicator')
  and (nullif($1->>'zone','') is null or r.zona = $1->>'zone')
  and (nullif($1->>'et','') is null or r.et = $1->>'et')
  and (
    nullif($1->>'responsible','') is null
    or public.olt_norm_text_v1(r.responsable) = public.olt_norm_text_v1($1->>'responsible')
  )
  and (
    nullif($1->>'reason','') is null
    or public.olt_norm_text_v1(r.motivo) = public.olt_norm_text_v1($1->>'reason')
  )
  and (not coalesce(($1->>'reporting_only')::boolean,false) or r.reporting_included)
  and (
    nullif($1->>'search','') is null
    or position(lower($1->>'search') in lower(concat_ws(' ',r.entrega,r.razon,r.linea,r.distrito,r.provincia,r.et))) > 0
  )
 order by r.fecha desc nulls last,r.id desc limit 101 offset greatest($2,0)$filtered$; end if;
execute 'with candidates as materialized ('||candidate_sql||$query$), source as (with current_base as materialized (
 select r.*,scope.scope_reason from (select * from public.recepcion_olt where id in(select id from candidates)) r
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
 left join lateral (select s.* from olt_control.sap_snapshot s where s.usuario_id=r.usuario_id and s.carga_id=a.carga_activa_id and s.referencia=btrim(r.entrega) offset 0) s on true
 left join (select distinct on(b.olt_id) b.olt_id,b.usuario_id,b.dt,b.et,b.placa,b.fecha_salida_sap,b.estado_viaje,b.estado_entrega,b.fec_reg,b.hor_reg,b.usua_ctrl_re from olt_control.bd_import_rows b join olt_control.bd_imports i on i.id=b.import_id and i.usuario_id=b.usuario_id where b.olt_id in(select id from candidates) and i.pestana='BD' order by b.olt_id,i.created_at desc,i.id desc,b.source_row desc) b on b.olt_id=r.id and b.usuario_id=r.usuario_id
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
from (select * from public.recepcion_olt where id in(select id from candidates)) r join olt_control.cierre_mensual c
on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date
where c.snapshot->>'historico_consolidado'='true'), metrics as (with current_source as materialized (
 select *,case when not cerrado then jsonb_build_object(
 'fecha',source_data->'fecha','fecha_salida_sap',source_data->'fecha_salida_sap',
 'fec_cargo',source_data->'fec_cargo','linea',source_data->'linea',
 'departamento',source_data->'departamento','despacho',source_data->'despacho') end indicator_input
 from source
 where not cerrado
 union all
 select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,
 upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE',true,c.snapshot,null::jsonb
 from (select * from public.recepcion_olt where id in(select id from candidates)) r join olt_control.cierre_mensual c on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date
 join olt_control.olt_record_scope_v1 scope on scope.id=r.id and scope.usuario_id=r.usuario_id and scope.is_current
 where coalesce(c.snapshot->>'historico_consolidado','')<>'true'
), inputs as materialized (
 select distinct indicator_input from current_source where not cerrado
), indicator_values as materialized (
 select indicator_input,public.olt_indicators(indicator_input) metrics from inputs
), current_official as materialized (
 select s.id,s.usuario_id,s.fecha,s.entrega,s.razon,s.distrito,s.provincia,s.cerrado,s.reporting_included,
 case when s.cerrado then s.source_data else s.source_data||i.metrics end row_data
 from current_source s left join indicator_values i on i.indicator_input=s.indicator_input
)
select id,usuario_id,fecha,entrega,razon,distrito,provincia,cerrado,reporting_included,row_data,
upper(btrim(coalesce(row_data->>'despacho',''))) zona,
coalesce(nullif(btrim(row_data->>'linea'),''),'Sin línea') linea,
coalesce(nullif(btrim(row_data->>'et'),''),'Sin transportista') et,
coalesce(nullif(btrim(row_data->>'responsable'),''),'Sin responsable') responsable,
coalesce(nullif(btrim(row_data->>'motivo'),''),'Sin motivo registrado') motivo,
coalesce(row_data->>'indicador','') indicador,nullif(row_data->>'inacttrans','')::date fecha_sap,
extract(month from fecha)::integer mes_despacho,false historical_consolidated from current_official
union all
select r.id,r.usuario_id,r.fecha,r.entrega,r.razon,r.distrito,r.provincia,true,
upper(btrim(coalesce(r.transporte,'')))<>'RECOGE CLIENTE',c.snapshot,
upper(btrim(coalesce(c.metric_values[1],''))),
coalesce(nullif(btrim(c.metric_values[2]),''),'Sin línea'),
coalesce(nullif(btrim(c.metric_values[3]),''),'Sin transportista'),
coalesce(nullif(btrim(c.metric_values[4]),''),'Sin responsable'),
coalesce(nullif(btrim(c.metric_values[5]),''),'Sin motivo registrado'),
coalesce(c.metric_values[6],''),nullif(c.metric_values[7],'')::date,
extract(month from r.fecha)::integer,true
from (select * from public.recepcion_olt where id in(select id from candidates)) r join olt_control.cierre_mensual c
on c.olt_id=r.id and c.periodo=date_trunc('month',r.fecha)::date
where c.metric_values[8]='true'), page as materialized(select id,row_data,cerrado,fecha from metrics)
select jsonb_build_object('has_next',(select count(*)>100 from candidates),
'rows',coalesce((select jsonb_agg(to_jsonb(t)-'fecha' order by t.fecha desc nulls last,t.id desc)
from(select * from page order by fecha desc nulls last,id desc limit 100) t),'[]'::jsonb))
$query$ into result using coalesce(p_filters,'{}'::jsonb),p_offset; return result; end $fn$;

create or replace function public.olt_metric_options_v1() returns jsonb language sql stable security invoker
set search_path=pg_catalog set jit=off set work_mem='32MB' set enable_nestloop=off as $f$
with options as materialized(select linea,et,extract(year from fecha)::integer as "year" from public.olt_reporting_rows_v1)
select jsonb_build_object('lines',coalesce((select jsonb_agg(linea order by linea) from(select distinct linea from options) x),'[]'::jsonb),
'ets',coalesce((select jsonb_agg(et order by et) from(select distinct et from options) x),'[]'::jsonb),
'years',coalesce((select jsonb_agg("year" order by "year" desc) from(select distinct "year" from options where "year" is not null) x),'[]'::jsonb)) $f$;
alter function public.olt_general_export_page_v1(bigint,integer) set jit=off;
alter function public.olt_general_export_page_v1(bigint,integer) set enable_nestloop=off;
alter function public.olt_general_export_page_v1(bigint,integer) set work_mem='32MB';
notify pgrst,'reload schema';
