-- Requiere las migraciones de autenticación, pedidos, salón y caja.
DO $$ BEGIN
  IF to_regprocedure('public.registrar_cobro(uuid,text,numeric,uuid,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'Aplica primero las migraciones de Caja y Pagos';
  END IF;
END; $$;

CREATE POLICY mesas_lectura_cocina ON public.mesas FOR SELECT TO authenticated
USING (public.rol_actual() = 'cocina');

CREATE FUNCTION public.validar_transicion_cocina() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rol text := COALESCE(public.rol_actual(), '');
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  -- Las reparaciones administrativas sin sesión Auth mantienen su acceso previo.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (
    (OLD.estado = 'pendiente' AND NEW.estado = 'en_preparacion'
      AND (v_rol IN ('cocina','admin') OR (v_rol = 'mesera' AND NEW.tipo = 'salon')))
    OR (OLD.estado = 'en_preparacion' AND NEW.estado = 'listo' AND v_rol IN ('cocina','admin'))
    -- Caja puede cerrar una atención ya cobrada, incluso si cocina no la marcó lista.
    OR (OLD.estado NOT IN ('entregado','cancelado') AND NEW.estado = 'entregado'
      AND NEW.tipo = 'salon' AND NEW.estado_pago = 'pagado' AND v_rol IN ('caja','admin')
      AND EXISTS (SELECT 1 FROM public.pagos WHERE pedido_id = NEW.id))
    OR (OLD.estado = 'listo' AND NEW.estado = 'entregado' AND NEW.tipo <> 'salon'
      AND NEW.estado_pago = 'pagado' AND v_rol = 'admin')
    OR (OLD.estado NOT IN ('entregado','cancelado') AND NEW.estado = 'cancelado' AND v_rol = 'admin')
    OR (OLD.estado = 'pendiente' AND NEW.estado = 'cancelado' AND v_rol = 'mesera'
      AND NEW.tipo = 'salon' AND NOT EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = NEW.id))
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Transición de estado no permitida: % → %', OLD.estado, NEW.estado USING ERRCODE = '22023';
  END IF;
  IF NEW.estado IN ('en_preparacion','listo') AND NOT EXISTS (
    SELECT 1 FROM public.detalles_pedido WHERE pedido_id = NEW.id
  ) THEN RAISE EXCEPTION 'El pedido debe contener productos' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_transicion_cocina() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pedido_transicion_cocina BEFORE UPDATE OF estado ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.validar_transicion_cocina();

CREATE FUNCTION public.cambiar_estado_cocina(p_pedido_id uuid, p_estado_actual text, p_nuevo_estado text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pedido public.pedidos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(public.rol_actual(),'') NOT IN ('cocina','admin') THEN
    RAISE EXCEPTION 'Solo cocina o administración pueden actualizar este panel' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = '22023'; END IF;
  IF v_pedido.estado IS DISTINCT FROM p_estado_actual THEN
    RAISE EXCEPTION 'Otro usuario cambió el pedido. Actualiza el panel.' USING ERRCODE = '40001';
  END IF;
  IF ((p_estado_actual = 'pendiente' AND p_nuevo_estado = 'en_preparacion')
    OR (p_estado_actual = 'en_preparacion' AND p_nuevo_estado = 'listo')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Transición de cocina no permitida' USING ERRCODE = '22023';
  END IF;
  UPDATE public.pedidos SET estado = p_nuevo_estado WHERE id = p_pedido_id;
  RETURN p_pedido_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cambiar_estado_cocina(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_cocina(uuid,text,text) TO authenticated;
CREATE INDEX pedidos_cocina_fecha_idx ON public.pedidos(estado,creado_en,id);
