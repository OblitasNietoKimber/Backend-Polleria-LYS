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

CREATE FUNCTION public.notificar_pedido_cocina() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_cliente uuid;
BEGIN
  IF TG_TABLE_NAME = 'pedidos' THEN
    IF TG_OP = 'DELETE' THEN v_id := OLD.id; v_cliente := OLD.cliente_id;
    ELSE v_id := NEW.id; v_cliente := NEW.cliente_id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN v_id := OLD.pedido_id; ELSE v_id := NEW.pedido_id; END IF;
    SELECT cliente_id INTO v_cliente FROM public.pedidos WHERE id = v_id;
    -- El sello ya es utilizado por Caja para recuperar actualizaciones perdidas.
    UPDATE public.pedidos SET actualizado_en = clock_timestamp() WHERE id = v_id;
    -- El UPDATE anterior publica la notificación mediante el trigger del encabezado.
    RETURN NULL;
  END IF;
  PERFORM realtime.publish('lys:staff','lys:pedido-actualizado',jsonb_build_object('pedidoId',v_id));
  IF v_cliente IS NOT NULL THEN
    PERFORM realtime.publish('lys:client:' || v_cliente::text,'lys:pedido-actualizado',jsonb_build_object('pedidoId',v_id));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.notificar_pedido_cocina() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pedido_cocina_notificar AFTER INSERT OR UPDATE OR DELETE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.notificar_pedido_cocina();
CREATE TRIGGER detalles_cocina_notificar AFTER INSERT OR UPDATE OR DELETE ON public.detalles_pedido
FOR EACH ROW EXECUTE FUNCTION public.notificar_pedido_cocina();
