CREATE FUNCTION public.olt_resumen_mes(p_inicio timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
WITH base AS MATERIALIZED (
  SELECT r.*, (CASE WHEN r.fecha IS NULL THEN 0 ELSE 1 END + CASE WHEN r.area IS NULL OR btrim(r.area) = '' THEN 0 ELSE 1 END + CASE WHEN r.entrega IS NULL OR btrim(r.entrega) = '' THEN 0 ELSE 1 END + CASE WHEN r.factura IS NULL OR btrim(r.factura) = '' THEN 0 ELSE 1 END + CASE WHEN r.gr IS NULL OR btrim(r.gr) = '' THEN 0 ELSE 1 END + CASE WHEN r.turno IS NULL OR btrim(r.turno) = '' THEN 0 ELSE 1 END + CASE WHEN r.cita IS NULL OR btrim(r.cita) = '' THEN 0 ELSE 1 END + CASE WHEN r.razon IS NULL OR btrim(r.razon) = '' THEN 0 ELSE 1 END + CASE WHEN r.distrito IS NULL OR btrim(r.distrito) = '' THEN 0 ELSE 1 END + CASE WHEN r.provincia IS NULL OR btrim(r.provincia) = '' THEN 0 ELSE 1 END + CASE WHEN r.departamento IS NULL OR btrim(r.departamento) = '' THEN 0 ELSE 1 END + CASE WHEN r.linea IS NULL OR btrim(r.linea) = '' THEN 0 ELSE 1 END + CASE WHEN r.bultos IS NULL THEN 0 ELSE 1 END + CASE WHEN r.volumen IS NULL THEN 0 ELSE 1 END + CASE WHEN r.peso IS NULL THEN 0 ELSE 1 END + CASE WHEN r.despacho IS NULL OR btrim(r.despacho) = '' THEN 0 ELSE 1 END + CASE WHEN r.transporte IS NULL OR btrim(r.transporte) = '' THEN 0 ELSE 1 END + CASE WHEN r.mercaderia IS NULL OR btrim(r.mercaderia) = '' THEN 0 ELSE 1 END) AS filled,
    coalesce(nullif(r.archivo_hash, ''), coalesce(r.archivo, '') || '|' || coalesce(r.pestana, '')) AS file_key,
    coalesce(nullif(r.archivo_hash, ''), coalesce(r.archivo, '') || '|' || coalesce(r.pestana, '') || '|' || coalesce(r.usuario, '')) AS history_key
  FROM public.recepcion_olt r
  WHERE r.usuario_id = (SELECT auth.uid()) AND r.created_at >= p_inicio
), totals AS (
  SELECT count(*) AS registros, count(DISTINCT file_key) AS archivos,
    count(*) FILTER (WHERE upper(coalesce(despacho, '')) = 'LIMA') AS lima,
    count(*) FILTER (WHERE upper(coalesce(despacho, '')) = 'PROVINCIA') AS provincia FROM base
), top_line AS (
  SELECT btrim(linea) AS linea, count(*) AS registros FROM base
  WHERE btrim(coalesce(linea, '')) <> '' GROUP BY btrim(linea)
  ORDER BY count(*) DESC, btrim(linea) COLLATE "C" LIMIT 1
), history AS (
  SELECT (array_agg(archivo ORDER BY created_at DESC, id DESC))[1] AS archivo,
    (array_agg(pestana ORDER BY created_at DESC, id DESC))[1] AS pestana,
    (array_agg(usuario ORDER BY created_at DESC, id DESC))[1] AS usuario,
    max(created_at) AS latest, count(*) AS registros,
    round(100.0 * sum(filled) / (count(*) * 18)) AS calidad,
    count(*) FILTER (WHERE upper(coalesce(despacho, '')) = 'LIMA') AS lima,
    count(*) FILTER (WHERE upper(coalesce(despacho, '')) = 'PROVINCIA') AS provincia
  FROM base GROUP BY history_key ORDER BY max(created_at) DESC, history_key LIMIT 10
)
SELECT jsonb_build_object('totales', (SELECT to_jsonb(t) FROM totals t),
  'linea_principal', (SELECT to_jsonb(l) FROM top_line l),
  'historial', coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.latest DESC) FROM history h), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.olt_resumen_mes(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.olt_resumen_mes(timestamptz) TO authenticated;
