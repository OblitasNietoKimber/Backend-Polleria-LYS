BEGIN;

ALTER TABLE public.pedidos
  ADD COLUMN cuenta_principal_id uuid REFERENCES public.pedidos(id),
  ADD CONSTRAINT comanda_adicional_salon CHECK (
    cuenta_principal_id IS NULL OR (tipo = 'salon' AND atencion_id IS NOT NULL AND cuenta_principal_id <> id)
  );
CREATE INDEX pedidos_cuenta_principal_idx ON public.pedidos(cuenta_principal_id)
  WHERE cuenta_principal_id IS NOT NULL;
DROP INDEX public.pedidos_salon_cuenta_abierta_idx;
CREATE UNIQUE INDEX pedidos_salon_cuenta_abierta_idx ON public.pedidos(mesa_id)
  WHERE tipo = 'salon' AND estado_pago = 'pendiente' AND estado NOT IN ('entregado','cancelado')
    AND cuenta_principal_id IS NULL;

-- Cada comanda conserva sus detalles para cocina e inventario. Solo el subtotal
-- de la cuenta principal incorpora las comandas adicionales vigentes.
CREATE FUNCTION public.subtotal_cuenta_salon(p_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT sum(cantidad * precio_unitario)
    FROM public.detalles_pedido WHERE pedido_id = p_id), 0)
    + COALESCE((SELECT sum(subtotal) FROM public.pedidos
      WHERE cuenta_principal_id = p_id AND estado <> 'cancelado'), 0);
$$;

CREATE OR REPLACE FUNCTION public.recalcular_subtotal_pedido() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE nuevo uuid; anterior uuid; pedido uuid;
BEGIN
  IF TG_OP <> 'DELETE' THEN nuevo := NEW.pedido_id; END IF;
  IF TG_OP <> 'INSERT' THEN anterior := OLD.pedido_id; END IF;
  FOR pedido IN SELECT id FROM public.pedidos WHERE id IN (nuevo, anterior) ORDER BY id FOR UPDATE LOOP
    UPDATE public.pedidos SET subtotal = public.subtotal_cuenta_salon(pedido) WHERE id = pedido;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.actualizar_cuenta_por_comanda() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.pedidos SET subtotal = public.subtotal_cuenta_salon(NEW.cuenta_principal_id)
  WHERE id = NEW.cuenta_principal_id AND estado_pago = 'pendiente';
  RETURN NULL;
END;
$$;
CREATE TRIGGER comanda_actualiza_cuenta AFTER UPDATE ON public.pedidos
  FOR EACH ROW WHEN (NEW.cuenta_principal_id IS NOT NULL)
  EXECUTE FUNCTION public.actualizar_cuenta_por_comanda();

CREATE FUNCTION public.comanda_salon_editable(p public.pedidos) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.estado = 'pendiente' AND NOT EXISTS (
    SELECT 1 FROM public.historial_estados_pedido
    WHERE pedido_id = p.id AND estado IN ('en_preparacion', 'listo', 'entregado')
  );
$$;
REVOKE ALL ON FUNCTION public.comanda_salon_editable(public.pedidos) FROM PUBLIC, anon, authenticated;

-- Relación de lectura de Caja con cardinalidad explícita para PostgREST.
CREATE FUNCTION public.comandas_cuenta(cuenta public.pedidos) RETURNS SETOF public.pedidos
LANGUAGE sql STABLE AS $$
  SELECT * FROM public.pedidos WHERE cuenta_principal_id = cuenta.id;
$$;
REVOKE ALL ON FUNCTION public.comandas_cuenta(public.pedidos) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comandas_cuenta(public.pedidos) TO authenticated;

REVOKE ALL ON FUNCTION public.subtotal_cuenta_salon(uuid), public.actualizar_cuenta_por_comanda()
  FROM PUBLIC, anon, authenticated;

-- Reusa las funciones vigentes y exige que cada fragmento que se modifica
-- exista exactamente una vez para evitar instalar una integración parcial.
CREATE FUNCTION pg_temp.reemplazar(def text, antes text, despues text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  IF length(def) - length(replace(def, antes, '')) <> length(antes) THEN
    RAISE EXCEPTION 'No se encontró un fragmento único para integrar comandas: %', antes;
  END IF;
  RETURN replace(def, antes, despues);
END;
$$;

DO $patch$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.flujo_operar(text,jsonb)'::regprocedure);
  def := pg_temp.reemplazar(def, $old$'abrir','adicional','editar','solicitar'$old$,
    $new$'abrir','adicional','comanda_adicional','editar','solicitar'$new$);

  def := pg_temp.reemplazar(def, $old$
 WHEN 'editar' THEN$old$, $new$
 WHEN 'comanda_adicional' THEN
  IF p.id IS NULL OR p.tipo <> 'salon' OR a.id IS NULL OR p.atencion_id IS DISTINCT FROM a.id
     OR p.cuenta_principal_id IS NOT NULL OR p.estado_pago <> 'pendiente' OR p.estado = 'cancelado' THEN
   RAISE EXCEPTION 'La cuenta de esta mesa ya no admite comandas adicionales';
  END IF;
  IF p.cuenta_solicitada THEN RAISE EXCEPTION 'Reabre la cuenta antes de añadir otra comanda'; END IF;
  IF public.comanda_salon_editable(p) THEN RAISE EXCEPTION 'La comanda original todavía se puede editar'; END IF;
  IF p_datos->'items' IS NULL OR jsonb_typeof(p_datos->'items') <> 'array'
     OR jsonb_array_length(p_datos->'items') = 0 THEN
   RAISE EXCEPTION 'La comanda debe contener productos';
  END IF;
  nuevo_id := gen_random_uuid();
  INSERT INTO public.pedidos(
    id, creado_por, mesa_id, tipo, estado, comensales, total, subtotal,
    atencion_id, cuenta_principal_id, huella_solicitud
  ) VALUES (
    nuevo_id, u, mesa, 'salon', 'pendiente', p.comensales, 0, 0,
    a.id, p.id, md5(op::text)
  );
  PERFORM public.modificar_cuenta_atencion(nuevo_id, p_datos->'items', COALESCE(p_datos->>'notas',''));
  resultado := jsonb_build_object('pedido', nuevo_id, 'atencion', a.id, 'cuenta', p.id);
 WHEN 'editar' THEN$new$);

  def := pg_temp.reemplazar(def, $old$  IF p.estado IN ('en_preparacion','listo') AND EXISTS (
   SELECT 1 FROM public.detalles_pedido d LEFT JOIN (SELECT (x->>'id')::bigint producto_id,sum((x->>'qty')::integer) qty FROM jsonb_array_elements(p_datos->'items') x GROUP BY 1) n USING(producto_id)
   WHERE d.pedido_id=p.id AND d.requiere_preparacion AND COALESCE(n.qty,0)<d.cantidad
  ) THEN RAISE EXCEPTION 'Solicita autorización para retirar platos en preparación'; END IF;$old$, $new$  IF p.estado_pago = 'pagado' THEN RAISE EXCEPTION 'No se puede editar una comanda cobrada'; END IF;
  IF p.cuenta_principal_id IS NOT NULL OR NOT public.comanda_salon_editable(p) THEN
   RAISE EXCEPTION 'La comanda ya no se puede editar. Registra una comanda adicional.';
  END IF;$new$);
  def := pg_temp.reemplazar(def, $old$  IF p.total<=0 THEN RAISE EXCEPTION 'La cuenta está vacía'; END IF;$old$, $new$  IF p.cuenta_principal_id IS NOT NULL THEN
   RAISE EXCEPTION 'Solicita o reabre la cuenta principal de la mesa';
  END IF;
  IF p.total<=0 THEN RAISE EXCEPTION 'La cuenta está vacía'; END IF;$new$);

  def := pg_temp.reemplazar(def, $old$  IF p.estado='cancelado' THEN RAISE EXCEPTION 'La cuenta está anulada'; END IF;$old$, $new$  IF p.estado='cancelado' THEN RAISE EXCEPTION 'La cuenta está anulada'; END IF;
  IF p.cuenta_principal_id IS NOT NULL THEN RAISE EXCEPTION 'Cobra la cuenta principal de la mesa'; END IF;
  IF EXISTS (
   SELECT 1 FROM public.pedidos q JOIN public.incidencias_atencion x ON x.pedido_id = q.id
   WHERE q.cuenta_principal_id = p.id AND x.estado IN ('solicitada','autorizada')
  ) THEN RAISE EXCEPTION 'Resuelve primero las incidencias de las comandas adicionales'; END IF;$new$);
  def := pg_temp.reemplazar(def, $old$mesa_id=mesa AND id<>p.id AND estado_pago='pendiente'$old$,
    $new$mesa_id=mesa AND id<>p.id AND cuenta_principal_id IS NULL AND estado_pago='pendiente'$new$);
  def := pg_temp.reemplazar(def, $old$p_datos->>'referencia');
 WHEN 'cerrar' THEN$old$, $new$p_datos->>'referencia');
  UPDATE public.pedidos SET estado_pago = 'pagado'
  WHERE cuenta_principal_id = p.id AND estado <> 'cancelado' AND estado_pago = 'pendiente';
  PERFORM public.cerrar_salon_si_completo(q.id) FROM public.pedidos q
  WHERE q.cuenta_principal_id = p.id AND q.estado = 'listo' AND q.estado_pago = 'pagado';
 WHEN 'cerrar' THEN$new$);

  def := pg_temp.reemplazar(def, $old$
 WHEN 'incidencia' THEN$old$, $new$
 WHEN 'incidencia' THEN
  IF p.cuenta_principal_id IS NOT NULL AND p.estado_pago = 'pagado' THEN
   RAISE EXCEPTION 'Solicita la devolución desde la cuenta principal';
  END IF;
  IF p.estado_pago = 'pendiente' AND EXISTS (
   SELECT 1 FROM public.pedidos WHERE cuenta_principal_id = p.id AND estado <> 'cancelado'
  ) THEN RAISE EXCEPTION 'Resuelve primero las comandas adicionales antes de anular la comanda principal'; END IF;$new$);
  def := pg_temp.reemplazar(def, $old$  IF public.tiene_pendientes_cocina(p.id) THEN RAISE EXCEPTION 'Resuelve primero la entrega de cocina'; END IF;$old$,
    $new$  IF public.tiene_pendientes_cocina(p.id) OR EXISTS (
   SELECT 1 FROM public.pedidos q WHERE q.cuenta_principal_id = p.id AND q.estado <> 'cancelado'
   AND public.tiene_pendientes_cocina(q.id)
  ) THEN RAISE EXCEPTION 'Resuelve primero la entrega de cocina'; END IF;$new$);

  def := pg_temp.reemplazar(def, $old$WHEN 'adicional' THEN 'Cuenta adicional abierta'$old$,
    $new$WHEN 'adicional' THEN 'Cuenta adicional abierta' WHEN 'comanda_adicional' THEN 'Comanda adicional registrada'$new$);
  def := pg_temp.reemplazar(def, $old$COALESCE(p.id::text,nuevo_id::text,'')$old$,
    $new$COALESCE(nuevo_id::text,p.id::text,'')$new$);
  EXECUTE def;

  def := pg_get_functiondef('public.registrar_cobro_atencion(uuid,text,numeric,uuid,numeric,text)'::regprocedure);
  def := pg_temp.reemplazar(def, $old$AND estado_pago = 'pendiente' AND estado NOT IN$old$,
    $new$AND cuenta_principal_id IS NULL AND estado_pago = 'pendiente' AND estado NOT IN$new$);
  def := pg_temp.reemplazar(def,
    $old$'cantidad', cantidad, 'precio', precio_unitario) ORDER BY id) FROM public.detalles_pedido WHERE pedido_id = pedido.id$old$,
    $new$'cantidad', d.cantidad, 'precio', d.precio_unitario)
      ORDER BY (q.id <> pedido.id), q.creado_en, q.id, d.id)
      FROM public.detalles_pedido d JOIN public.pedidos q ON q.id = d.pedido_id
      WHERE q.id = pedido.id OR (q.cuenta_principal_id = pedido.id AND q.estado <> 'cancelado')$new$);
  EXECUTE def;

  def := pg_get_functiondef('public.proteger_pedido_cobrado()'::regprocedure);
  def := pg_temp.reemplazar(def, $old$pedido_id = NEW.id) THEN$old$,
    $new$pedido_id = COALESCE(NEW.cuenta_principal_id, NEW.id)) THEN$new$);
  EXECUTE def;

  def := pg_get_functiondef('public.proteger_detalle_cobrado()'::regprocedure);
  def := pg_temp.reemplazar(def, $old$WHERE pedido_id = v_pedido_id) THEN$old$,
    $new$WHERE pedido_id = (SELECT COALESCE(cuenta_principal_id, id) FROM public.pedidos WHERE id = v_pedido_id)) THEN$new$);
  EXECUTE def;

  def := pg_get_functiondef('public.obtener_dashboard_admin(date,date)'::regprocedure);
  def := pg_temp.reemplazar(def, $old$JOIN public.detalles_pedido detalle ON detalle.pedido_id = venta.pedido_id$old$,
    $new$JOIN public.pedidos comanda ON comanda.id = venta.pedido_id
      OR (comanda.cuenta_principal_id = venta.pedido_id AND comanda.estado <> 'cancelado')
    JOIN public.detalles_pedido detalle ON detalle.pedido_id = comanda.id$new$);
  EXECUTE def;
END;
$patch$;
DROP FUNCTION pg_temp.reemplazar(text,text,text);

NOTIFY pgrst, 'reload schema';
COMMIT;
