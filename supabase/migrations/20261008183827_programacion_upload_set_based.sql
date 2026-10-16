-- Preserve the existing invoker/RLS/owner contract and serialize per-user RPC uploads.
-- Check exact business keys once per set, instead of rescanning for each inserted row.
create or replace function public.olt_insertar_lote(p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
declare
 v_uid uuid := (select auth.uid()); v_inserted integer; v_latest timestamptz;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>500 then
  raise exception 'Expected an array of at most 500 records' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where jsonb_typeof(x) is distinct from 'object') then
  raise exception 'Each record must be an object' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,142019));
 with incoming as materialized (
  select r.*,item->>'archivo' as source_file,item->>'archivo_hash' as source_hash,item->>'pestana' as source_sheet,
   ord,public.olt_business_key(r.fecha,r.area,r.entrega,r.factura,r.gr,r.turno,r.cita,r.razon,r.distrito,r.provincia,r.departamento,r.linea,r.bultos,r.volumen,r.peso,r.despacho,r.transporte,r.mercaderia,r.observacion) as business_key
  from jsonb_array_elements(p_rows) with ordinality as x(item,ord)
  cross join lateral jsonb_populate_record(null::public.recepcion_olt,jsonb_build_object('fecha',item->'fecha','area',item->'area','entrega',item->'entrega','factura',item->'factura','gr',item->'gr','turno',item->'turno','cita',item->'cita','razon',item->'razon','distrito',item->'distrito','provincia',item->'provincia','departamento',item->'departamento','linea',item->'linea','bultos',item->'bultos','volumen',item->'volumen','peso',item->'peso','despacho',item->'despacho','transporte',item->'transporte','mercaderia',item->'mercaderia','observacion',item->'observacion')) r
 ), unique_rows as materialized (
  select distinct on (business_key) * from incoming order by business_key,ord
 ), existing as materialized (
  select public.olt_business_key(r.fecha,r.area,r.entrega,r.factura,r.gr,r.turno,r.cita,r.razon,r.distrito,r.provincia,r.departamento,r.linea,r.bultos,r.volumen,r.peso,r.despacho,r.transporte,r.mercaderia,r.observacion) as business_key
  from public.recepcion_olt r where r.usuario_id=v_uid
 ), inserted as (
  insert into public.recepcion_olt(fecha,area,entrega,factura,gr,turno,cita,razon,distrito,provincia,departamento,linea,bultos,volumen,peso,despacho,transporte,mercaderia,observacion,usuario_id,usuario,archivo,archivo_hash,pestana)
  select r.fecha,r.area,r.entrega,r.factura,r.gr,r.turno,r.cita,r.razon,r.distrito,r.provincia,r.departamento,r.linea,r.bultos,r.volumen,r.peso,r.despacho,r.transporte,r.mercaderia,r.observacion,v_uid,coalesce(auth.jwt()->>'email',auth.jwt()->>'phone',v_uid::text),r.source_file,r.source_hash,r.source_sheet
  from unique_rows r where not exists(select 1 from existing e where e.business_key=r.business_key)
  order by r.ord returning created_at
 ) select count(*)::int,max(created_at) into v_inserted,v_latest from inserted;
 return jsonb_build_object('insertados',v_inserted,'duplicados',jsonb_array_length(p_rows)-v_inserted,'ultima_fecha',v_latest);
end $fn$;
notify pgrst,'reload schema';
