create function public.olt_general_export_page_v1(p_before_id bigint default null,p_limit integer default 5000)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $f$
with batch as materialized (
 select id,cerrado,row_data from public.olt_metric_rows_v1
 where p_before_id is null or id<p_before_id
 order by id desc limit greatest(1,least(coalesce(p_limit,5000),5000))
)
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(b) order by id desc) from batch b),'[]'::jsonb),
'next_before_id',(select min(id) from batch),
'has_more',(select count(*)=greatest(1,least(coalesce(p_limit,5000),5000)) from batch))
$f$;
revoke all on function public.olt_general_export_page_v1(bigint,integer) from public,anon;
grant execute on function public.olt_general_export_page_v1(bigint,integer) to authenticated;
notify pgrst,'reload schema';

