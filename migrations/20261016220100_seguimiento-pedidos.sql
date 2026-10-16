-- Configurar Realtime es obligatorio en el backend; las pruebas locales también lo simulan.
DO $$ BEGIN
  IF to_regprocedure('realtime.publish(text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Este backend requiere las funciones nativas de Realtime de InsForge';
  END IF;
END; $$;
INSERT INTO realtime.channels(pattern,description,enabled) VALUES
  ('lys:staff','Cambios de pedidos para el personal',true),
  ('lys:client:%','Cambios privados de los pedidos del cliente',true)
ON CONFLICT (pattern) DO UPDATE SET enabled = true;
ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY lys_personal_suscribir ON realtime.channels FOR SELECT TO authenticated
USING (pattern = 'lys:staff' AND public.rol_actual() IN ('cocina','mesera','caja','admin'));
CREATE POLICY lys_cliente_suscribir ON realtime.channels FOR SELECT TO authenticated
USING (pattern = 'lys:client:%' AND public.rol_actual() = 'cliente'
  AND realtime.channel_name() = 'lys:client:' || auth.uid()::text);
-- Una política permisiva futura tampoco debe exponer estos canales ni falsificar eventos.
CREATE POLICY lys_canales_privados ON realtime.channels AS RESTRICTIVE FOR SELECT TO authenticated
USING (pattern NOT IN ('lys:staff','lys:client:%') OR
  (auth.uid() IS NOT NULL AND (
    (pattern = 'lys:staff' AND public.rol_actual() IN ('cocina','mesera','caja','admin'))
    OR (pattern = 'lys:client:%' AND public.rol_actual() = 'cliente'
      AND realtime.channel_name() = 'lys:client:' || auth.uid()::text))));
CREATE POLICY lys_canales_anonimos ON realtime.channels AS RESTRICTIVE FOR SELECT TO anon
USING (pattern NOT IN ('lys:staff','lys:client:%'));
CREATE POLICY lys_eventos_servidor ON realtime.messages AS RESTRICTIVE FOR INSERT TO anon,authenticated
WITH CHECK (channel_name NOT LIKE 'lys:%');
