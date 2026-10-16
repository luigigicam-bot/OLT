
create or replace function public.olt_norm_text_v1(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
select nullif(
  translate(
    lower(regexp_replace(btrim(coalesce(p_value,'')), '[[:space:]]+', ' ', 'g')),
    'áéíóúüñ',
    'aeiouun'
  ),
  ''
)
$function$;

create or replace function public.olt_metric_filtered_v1(p_filters jsonb default '{}'::jsonb)
returns setof public.olt_metric_rows_v1
language sql
stable
set search_path = pg_catalog
as $function$
select r.*
from public.olt_metric_rows_v1 r
where (nullif(p_filters->>'date_from','') is null or r.fecha_sap >= (p_filters->>'date_from')::date)
  and (nullif(p_filters->>'date_to','') is null or r.fecha_sap <= (p_filters->>'date_to')::date)
  and (nullif(p_filters->>'month','') is null or r.mes_despacho = (p_filters->>'month')::integer)
  and (nullif(p_filters->>'year','') is null or extract(year from r.fecha)::integer = (p_filters->>'year')::integer)
  and (nullif(p_filters->>'line','') is null or r.linea = p_filters->>'line')
  and (nullif(p_filters->>'indicator','') is null or r.indicador = p_filters->>'indicator')
  and (nullif(p_filters->>'zone','') is null or r.zona = p_filters->>'zone')
  and (nullif(p_filters->>'et','') is null or r.et = p_filters->>'et')
  and (
    nullif(p_filters->>'responsible','') is null
    or public.olt_norm_text_v1(r.responsable) = public.olt_norm_text_v1(p_filters->>'responsible')
  )
  and (
    nullif(p_filters->>'reason','') is null
    or public.olt_norm_text_v1(r.motivo) = public.olt_norm_text_v1(p_filters->>'reason')
  )
  and (not coalesce((p_filters->>'reporting_only')::boolean,false) or r.reporting_included)
  and (
    nullif(p_filters->>'search','') is null
    or position(lower(p_filters->>'search') in lower(concat_ws(' ',r.entrega,r.razon,r.linea,r.distrito,r.provincia,r.et))) > 0
  )
$function$;

create or replace function public.olt_metric_kpi_v1(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
with b as materialized (
 select * from public.olt_metric_filtered_v1(coalesce(p_filters,'{}'::jsonb)||'{"reporting_only":true}'::jsonb)
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
$function$;
