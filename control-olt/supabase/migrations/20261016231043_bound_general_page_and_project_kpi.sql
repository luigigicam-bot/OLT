create or replace function public.olt_metric_page_v1(p_filters jsonb default '{}'::jsonb,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog set jit=off set work_mem='32MB' as $f$
declare result jsonb; begin execute $q$
with page as materialized (
select id,row_data,cerrado,fecha from public.olt_metric_rows_v1 r

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
 order by fecha desc nulls last,id desc limit 101 offset greatest($2,0)
) select jsonb_build_object('has_next',(select count(*)>100 from page),
'rows',coalesce((select jsonb_agg(to_jsonb(t)-'fecha' order by t.fecha desc nulls last,t.id desc)
from(select * from page order by fecha desc nulls last,id desc limit 100) t),'[]'::jsonb))
$q$ into result using coalesce(p_filters,'{}'::jsonb),p_offset; return result; end $f$;
create or replace function public.olt_metric_kpi_v1(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security invoker
stable
set search_path=pg_catalog set jit=off set work_mem='32MB'
as $function$
declare result jsonb; begin execute $query$
with b as materialized (
 select r.id,r.zona,r.linea,r.et,r.indicador,r.responsable,r.motivo from public.olt_metric_rows_v1 r
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
