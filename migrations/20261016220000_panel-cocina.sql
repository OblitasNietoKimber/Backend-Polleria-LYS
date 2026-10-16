-- Requiere las migraciones de autenticación, pedidos, salón y caja.
DO $$ BEGIN
  IF to_regprocedure('public.registrar_cobro(uuid,text,numeric,uuid,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'Aplica primero las migraciones de Caja y Pagos';
  END IF;
END; $$;

CREATE POLICY mesas_lectura_cocina ON public.mesas FOR SELECT TO authenticated
USING (public.rol_actual() = 'cocina');
