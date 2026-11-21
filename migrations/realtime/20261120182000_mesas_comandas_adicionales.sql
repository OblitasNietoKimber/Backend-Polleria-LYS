DO $patch$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.flujo_mesas()'::regprocedure);
  IF position('''cuenta_principal_id''' IN def) = 0 THEN
    IF position('''id'', p.id, ''atencion_id''' IN def) = 0 THEN
      RAISE EXCEPTION 'No se encontró la proyección de cuentas de salón';
    END IF;
    EXECUTE replace(def, '''id'', p.id, ''atencion_id''',
      '''id'', p.id, ''cuenta_principal_id'', p.cuenta_principal_id, ''comanda_editable'', public.comanda_salon_editable(p), ''atencion_id''');
  END IF;
END;
$patch$;
