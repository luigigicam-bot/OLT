-- Additive General-only header filters. Existing RPCs and operational data stay unchanged.
-- SECURITY INVOKER uses the same caller-scoped metric view and private edit-version join.
create function public.olt_column_filter_validate_v1(p_columns jsonb default '{}'::jsonb)
returns jsonb language plpgsql immutable security invoker set search_path=pg_catalog as $f$
declare pair record; allowed text[] := array['nro_cargo','fec_cargo','fec_vencto','indicador','estado_cargo','fecha','area','entrega','factura','gr','turno','cita','razon','distrito','provincia','departamento','linea','bultos','volumen','peso','despacho','transporte','mercaderia','observacion','codigo_transporte','placa_prog','dt_prog','transporte_prog','dt','et','placa','fecha_salida_sap','estado_viaje','estado_entrega','fec_reg','hor_reg','usua_ctrl_re','responsable','motivo','mes_olt','mes_sap','retraso','dias_plan_salida'];
begin
  if p_columns is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p_columns) <> 'object' then raise exception 'Invalid column filters' using errcode='22023'; end if;
  for pair in select * from jsonb_each(p_columns) loop
    if not (pair.key = any(allowed)) or jsonb_typeof(pair.value) <> 'array' then
      raise exception 'Invalid column filters' using errcode='22023';
    end if;
    if jsonb_array_length(pair.value) > 10000 or exists (
      select 1 from jsonb_array_elements(pair.value) x where jsonb_typeof(x.value) <> 'string'
    ) then raise exception 'Invalid column selection' using errcode='22023'; end if;
  end loop;
  return p_columns;
end $f$;

create function public.olt_column_filter_rows_v1(p_filters jsonb default '{}'::jsonb,p_columns jsonb default '{}'::jsonb)
returns setof public.olt_metric_rows_v1 language sql stable security invoker set search_path=pg_catalog as $f$
with rules as materialized (
  select c.key, coalesce((select jsonb_object_agg(v.value,true) from jsonb_array_elements_text(c.value) v),'{}'::jsonb) allowed
  from jsonb_each(public.olt_column_filter_validate_v1(p_columns)) c
)
select r.* from public.olt_metric_filtered_v1(p_filters) r
where not exists (select 1 from rules c where not (c.allowed ? coalesce(r.row_data->>c.key,'')))
$f$;

create function public.olt_column_filter_options_v1(p_key text,p_filters jsonb default '{}'::jsonb,p_columns jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare result jsonb; validated jsonb;
begin
  if p_key is null then raise exception 'Missing column' using errcode='22023'; end if;
  perform public.olt_column_filter_validate_v1(jsonb_build_object(p_key,'[]'::jsonb));
  validated := public.olt_column_filter_validate_v1(p_columns);
  select jsonb_build_object('values',coalesce(jsonb_agg(to_jsonb(v) order by v.value),'[]'::jsonb)) into result
  from (select coalesce(r.row_data->>p_key,'') value,count(*) count
    from public.olt_column_filter_rows_v1(p_filters,validated-p_key) r
    group by coalesce(r.row_data->>p_key,'')) v;
  return result;
end $f$;

create function public.olt_column_filter_page_v1(p_filters jsonb default '{}'::jsonb,p_columns jsonb default '{}'::jsonb,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $f$
with base as materialized (
  select id,row_data,cerrado,fecha from public.olt_column_filter_rows_v1(p_filters,p_columns)
), page as materialized (
  select * from base order by fecha desc nulls last,id desc limit 101 offset greatest(coalesce(p_offset,0),0)
), visible as (
  select * from page order by fecha desc nulls last,id desc limit 100
)
select jsonb_build_object(
 'total',(select count(*) from base),
 'has_next',(select count(*)>100 from page),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'cerrado',p.cerrado,'row_data',
   p.row_data||jsonb_build_object('gestion_version',g.updated_at)) order by p.fecha desc nulls last,p.id desc)
   from visible p left join olt_control.gestion_olt g on g.olt_id=p.id),'[]'::jsonb))
$f$;

revoke all on function public.olt_column_filter_validate_v1(jsonb), public.olt_column_filter_rows_v1(jsonb,jsonb),
 public.olt_column_filter_options_v1(text,jsonb,jsonb), public.olt_column_filter_page_v1(jsonb,jsonb,integer) from public,anon;
grant execute on function public.olt_column_filter_validate_v1(jsonb), public.olt_column_filter_rows_v1(jsonb,jsonb),
 public.olt_column_filter_options_v1(text,jsonb,jsonb), public.olt_column_filter_page_v1(jsonb,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
