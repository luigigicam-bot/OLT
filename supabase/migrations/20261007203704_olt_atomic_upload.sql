-- Additive API for the preview. Existing rows (including duplicates) are untouched.
-- All callers use their existing RLS policies. No SECURITY DEFINER.
CREATE FUNCTION public.olt_business_key(p_fecha date, p_area text, p_entrega text, p_factura text, p_gr text, p_turno text, p_cita text, p_razon text, p_distrito text, p_provincia text, p_departamento text, p_linea text, p_bultos bigint, p_volumen numeric, p_peso numeric, p_despacho text, p_transporte text, p_mercaderia text, p_observacion text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT jsonb_build_array(p_fecha - DATE '1970-01-01', coalesce(btrim(p_area, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_entrega, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_factura, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_gr, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_turno, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_cita, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_razon, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_distrito, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_provincia, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_departamento, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_linea, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), p_bultos, trim_scale(p_volumen), trim_scale(p_peso), coalesce(btrim(p_despacho, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_transporte, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_mercaderia, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ''), coalesce(btrim(p_observacion, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '')); $$;
REVOKE ALL ON FUNCTION public.olt_business_key(date, text, text, text, text, text, text, text, text, text, text, text, bigint, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.olt_business_key(date, text, text, text, text, text, text, text, text, text, text, text, bigint, numeric, numeric, text, text, text, text) TO authenticated;

-- Hash is an index locator only: compare the full key too to avoid hash collisions.
CREATE INDEX recepcion_olt_usuario_business_idx ON public.recepcion_olt
(usuario_id, (md5(public.olt_business_key(fecha, area, entrega, factura, gr, turno, cita, razon, distrito, provincia, departamento, linea, bultos, volumen, peso, despacho, transporte, mercaderia, observacion)::text)));

CREATE FUNCTION public.olt_insertar_lote(p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  p_item jsonb; v_row public.recepcion_olt%ROWTYPE; v_key jsonb;
  v_inserted integer := 0; v_duplicates integer := 0; v_latest timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Expected an array of at most 500 records' USING ERRCODE = '22023';
  END IF;
  -- Serializes cooperating RPC uploads for the same owner, including two tabs.
  -- A hash collision only serializes two owners; it cannot reveal or skip their data.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 142019));
  FOR p_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Each record must be an object' USING ERRCODE = '22023';
    END IF;
    -- Populate only business fields. Client-supplied ids, timestamps and owners are ignored.
    SELECT * INTO v_row FROM jsonb_populate_record(NULL::public.recepcion_olt,
      jsonb_build_object('fecha', p_item->'fecha', 'area', p_item->'area', 'entrega', p_item->'entrega', 'factura', p_item->'factura', 'gr', p_item->'gr', 'turno', p_item->'turno', 'cita', p_item->'cita', 'razon', p_item->'razon', 'distrito', p_item->'distrito', 'provincia', p_item->'provincia', 'departamento', p_item->'departamento', 'linea', p_item->'linea', 'bultos', p_item->'bultos', 'volumen', p_item->'volumen', 'peso', p_item->'peso', 'despacho', p_item->'despacho', 'transporte', p_item->'transporte', 'mercaderia', p_item->'mercaderia', 'observacion', p_item->'observacion'));
    v_key := public.olt_business_key(v_row.fecha, v_row.area, v_row.entrega, v_row.factura, v_row.gr, v_row.turno, v_row.cita, v_row.razon, v_row.distrito, v_row.provincia, v_row.departamento, v_row.linea, v_row.bultos, v_row.volumen, v_row.peso, v_row.despacho, v_row.transporte, v_row.mercaderia, v_row.observacion);
    IF EXISTS (SELECT 1 FROM public.recepcion_olt r
        WHERE r.usuario_id = v_uid
          AND md5(public.olt_business_key(r.fecha, r.area, r.entrega, r.factura, r.gr, r.turno, r.cita, r.razon, r.distrito, r.provincia, r.departamento, r.linea, r.bultos, r.volumen, r.peso, r.despacho, r.transporte, r.mercaderia, r.observacion)::text) = md5(v_key::text)
          AND public.olt_business_key(r.fecha, r.area, r.entrega, r.factura, r.gr, r.turno, r.cita, r.razon, r.distrito, r.provincia, r.departamento, r.linea, r.bultos, r.volumen, r.peso, r.despacho, r.transporte, r.mercaderia, r.observacion) = v_key) THEN
      v_duplicates := v_duplicates + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.recepcion_olt (fecha, area, entrega, factura, gr, turno, cita, razon, distrito, provincia, departamento, linea, bultos, volumen, peso, despacho, transporte, mercaderia, observacion, usuario_id, usuario, archivo, archivo_hash, pestana)
    VALUES (v_row.fecha, v_row.area, v_row.entrega, v_row.factura, v_row.gr, v_row.turno, v_row.cita, v_row.razon, v_row.distrito, v_row.provincia, v_row.departamento, v_row.linea, v_row.bultos, v_row.volumen, v_row.peso, v_row.despacho, v_row.transporte, v_row.mercaderia, v_row.observacion, v_uid,
      coalesce(auth.jwt()->>'email', auth.jwt()->>'phone', v_uid::text),
      p_item->>'archivo', p_item->>'archivo_hash', p_item->>'pestana')
    RETURNING created_at INTO v_latest;
    v_inserted := v_inserted + 1;
  END LOOP;
  RETURN jsonb_build_object('insertados', v_inserted, 'duplicados', v_duplicates, 'ultima_fecha', v_latest);
END $$;
REVOKE ALL ON FUNCTION public.olt_insertar_lote(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.olt_insertar_lote(jsonb) TO authenticated;
