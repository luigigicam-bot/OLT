-- Compatible with the existing browser: SELECT and INSERT ownership are unchanged.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- This event trigger auto-enables RLS on future public tables. Keep it installed.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- TRUNCATE is not governed by RLS. Neither public role needs these privileges.
REVOKE ALL ON TABLE public.recepcion_olt FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.recepcion_olt TO authenticated;
REVOKE ALL ON SEQUENCE public.recepcion_olt_id_seq FROM anon, authenticated;
GRANT USAGE ON SEQUENCE public.recepcion_olt_id_seq TO authenticated;

DO $$
DECLARE max_id bigint; sequence_id bigint; called boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.recepcion_olt WHERE id IS NULL) OR
     EXISTS (SELECT 1 FROM public.recepcion_olt GROUP BY id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Primary key preflight failed: null or duplicate ids';
  END IF;
  SELECT max(id) INTO max_id FROM public.recepcion_olt;
  SELECT last_value, is_called INTO sequence_id, called FROM public.recepcion_olt_id_seq;
  IF max_id IS NOT NULL AND (sequence_id < max_id OR (sequence_id = max_id AND NOT called)) THEN
    RAISE EXCEPTION 'Identity sequence needs a separate reviewed repair';
  END IF;
END $$;

ALTER TABLE public.recepcion_olt ADD CONSTRAINT recepcion_olt_pkey PRIMARY KEY (id);
CREATE INDEX recepcion_olt_usuario_created_idx ON public.recepcion_olt (usuario_id, created_at DESC);
CREATE INDEX recepcion_olt_usuario_entrega_idx ON public.recepcion_olt (usuario_id, entrega);
CREATE INDEX recepcion_olt_usuario_archivo_idx ON public.recepcion_olt (usuario_id, archivo_hash, pestana, created_at DESC);

ALTER POLICY "usuarios leen sus registros" ON public.recepcion_olt
  TO authenticated USING ((SELECT auth.uid()) = usuario_id);
ALTER POLICY "usuarios insertan sus registros" ON public.recepcion_olt
  TO authenticated WITH CHECK ((SELECT auth.uid()) = usuario_id);
