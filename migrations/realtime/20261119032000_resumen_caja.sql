CREATE INDEX IF NOT EXISTS pagos_creado_en_caja_idx ON public.pagos(creado_en);

CREATE OR REPLACE FUNCTION public.obtener_resumen_caja(p_dia date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.rol_actual(), '') NOT IN ('caja', 'admin') THEN
    RAISE EXCEPTION 'Acceso restringido a caja' USING ERRCODE = '42501';
  END IF;
  IF p_dia IS NULL THEN RAISE EXCEPTION 'Fecha requerida' USING ERRCODE = '22023'; END IF;

  RETURN (
    SELECT jsonb_build_object(
      'ventas', COALESCE(sum(monto), 0),
      'efectivo', COALESCE(sum(monto) FILTER (WHERE metodo = 'efectivo'), 0),
      'cobrados', count(*)
    )
    FROM public.pagos
    WHERE creado_en >= (p_dia::timestamp AT TIME ZONE 'America/Lima')
      AND creado_en < ((p_dia + 1)::timestamp AT TIME ZONE 'America/Lima')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_resumen_caja(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_resumen_caja(date) TO authenticated;
NOTIFY pgrst, 'reload schema';
