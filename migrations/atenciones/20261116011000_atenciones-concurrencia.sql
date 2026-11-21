-- Protege una atención nueva de pestañas antiguas de la misma mesa.
BEGIN;
DO $guard$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.flujo_operar(text,jsonb)'::regprocedure) INTO definition;
 IF position('La atención de esta mesa cambió' IN definition)>0 THEN RETURN; END IF;
 definition:=replace(definition,'WHEN ''abrir'',''adicional'' THEN',
 'WHEN ''abrir'',''adicional'' THEN
  IF p_accion=''adicional'' AND (p_datos->>''atencion'') IS DISTINCT FROM a.id::text THEN
   RAISE EXCEPTION ''La atención de esta mesa cambió. Actualiza antes de abrir otra cuenta.'' USING ERRCODE=''40001'';
  END IF;');
 definition:=replace(definition,E'\n WHEN ''cerrar'' THEN',
 E'\n WHEN ''cerrar'' THEN
  IF (p_datos->>''atencion'') IS DISTINCT FROM a.id::text THEN
   RAISE EXCEPTION ''La atención de esta mesa cambió. No se puede cerrar desde una pestaña anterior.'' USING ERRCODE=''40001'';
  END IF;');
 EXECUTE definition;
END; $guard$;
COMMIT;
