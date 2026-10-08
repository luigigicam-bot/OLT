create function public.olt_metric_page_v2(p_filters jsonb default '{}'::jsonb,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
with page as materialized(select public.olt_metric_page_v1(p_filters,p_offset) j)
select jsonb_set(j,'{rows}',coalesce((select jsonb_agg(jsonb_set(x.value,'{row_data}',(x.value->'row_data')||jsonb_build_object('gestion_version',g.updated_at)) order by x.ordinality)
from jsonb_array_elements(j->'rows') with ordinality x left join olt_control.gestion_olt g on g.olt_id=(x.value->>'id')::bigint),'[]'::jsonb)) from page $f$;
revoke all on function public.olt_metric_page_v2(jsonb,integer) from public,anon;
grant execute on function public.olt_metric_page_v2(jsonb,integer) to authenticated;
create function olt_private.save_cell_checked(p_id bigint,p_key text,p_value text,p_expected timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $f$
declare u uuid:=auth.uid(); v timestamptz; result jsonb;
begin
 if u is null or not exists(select 1 from public.recepcion_olt where id=p_id and usuario_id=u) then raise exception 'Registro no disponible' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,817));
 select updated_at into v from olt_control.gestion_olt where olt_id=p_id;
 if v is distinct from p_expected then raise exception 'La fila cambió en otra sesión. Actualiza antes de editar.' using errcode='40001'; end if;
 result:=olt_private.save_cell(p_id,p_key,p_value);
 select updated_at into v from olt_control.gestion_olt where olt_id=p_id;
 return result||jsonb_build_object('gestion_version',v);
end $f$;
revoke all on function olt_private.save_cell_checked(bigint,text,text,timestamptz) from public,anon;
grant execute on function olt_private.save_cell_checked(bigint,text,text,timestamptz) to authenticated;
create function public.olt_save_cell_v2(p_id bigint,p_key text,p_value text,p_expected timestamptz default null) returns jsonb
language sql security invoker set search_path=pg_catalog as $f$ select olt_private.save_cell_checked(p_id,p_key,p_value,p_expected) $f$;
revoke all on function public.olt_save_cell_v2(bigint,text,text,timestamptz) from public,anon;
grant execute on function public.olt_save_cell_v2(bigint,text,text,timestamptz) to authenticated;
notify pgrst,'reload schema';
