-- Sustituye la migración 20261115010000 cuando todavía no fue aplicada.
-- Puede ejecutarse directamente en el editor SQL, incluso después de un intento fallido.
-- Un único bloque garantiza rollback de columna, funciones y triggers si ocurre un error.
DO $servicio_directo$ BEGIN
LOCK TABLE public.mesas, public.pedidos, public.detalles_pedido, public.pagos IN SHARE ROW EXCLUSIVE MODE;
-- Distingue productos que se preparan de los que solo se sirven.
-- Aplicar después de Caja, Cocina y Dashboard; conserva los importes y los pagos.
ALTER TABLE public.detalles_pedido ADD COLUMN IF NOT EXISTS requiere_preparacion boolean NOT NULL DEFAULT true;
-- Solo cambia la clasificación; los triggers que protegen importes y cobranza
-- se restauran dentro de esta misma transacción, antes de habilitar otros escritores.
ALTER TABLE public.detalles_pedido DISABLE TRIGGER detalle_cobrado;
ALTER TABLE public.detalles_pedido DISABLE TRIGGER detalle_importes;
ALTER TABLE public.detalles_pedido DISABLE TRIGGER detalles_cocina_notificar;
UPDATE public.detalles_pedido d SET requiere_preparacion = p.categoria_id NOT IN ('bebidas','postres')
FROM public.productos p WHERE p.id = d.producto_id
  AND d.requiere_preparacion IS DISTINCT FROM (p.categoria_id NOT IN ('bebidas','postres'));
ALTER TABLE public.detalles_pedido ENABLE TRIGGER detalle_cobrado;
ALTER TABLE public.detalles_pedido ENABLE TRIGGER detalle_importes;
ALTER TABLE public.detalles_pedido ENABLE TRIGGER detalles_cocina_notificar;

CREATE OR REPLACE FUNCTION public.preparar_nombre_detalle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.producto_id IS DISTINCT FROM OLD.producto_id THEN
    SELECT nombre, categoria_id NOT IN ('bebidas','postres')
    INTO NEW.nombre_producto, NEW.requiere_preparacion FROM public.productos WHERE id = NEW.producto_id;
  ELSE
    NEW.requiere_preparacion := OLD.requiere_preparacion;
  END IF;
  RETURN NEW;
END;
$$;
-- El trigger existente también se ejecuta al cambiar producto_id.

CREATE OR REPLACE FUNCTION public.validar_transicion_cocina() RETURNS trigger
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
    -- Los artículos de servicio directo nunca pasan por preparación.
    OR (OLD.estado IN ('pendiente','en_preparacion') AND NEW.estado = 'listo'
      AND v_rol IN ('cliente','mesera','cocina','admin')
      AND EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = NEW.id)
      AND NOT EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = NEW.id AND requiere_preparacion))
    -- Una comanda lista que recibe platos nuevos vuelve al panel de cocina.
    OR (OLD.estado = 'listo' AND NEW.estado = 'pendiente' AND NEW.tipo = 'salon'
      AND v_rol IN ('mesera','admin'))
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
  IF NEW.estado = 'en_preparacion' AND NOT EXISTS (
    SELECT 1 FROM public.detalles_pedido WHERE pedido_id = NEW.id AND requiere_preparacion
  ) THEN RAISE EXCEPTION 'El pedido no requiere preparación' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ajustar_estado_servicio(p_id uuid, p_reabrir boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_estado text; v_items boolean; v_cocina boolean;
BEGIN
  SELECT estado INTO v_estado FROM public.pedidos WHERE id = p_id FOR UPDATE;
  IF v_estado IS NULL OR v_estado IN ('entregado','cancelado') THEN RETURN; END IF;
  SELECT count(*) > 0, COALESCE(bool_or(requiere_preparacion), false)
  INTO v_items, v_cocina FROM public.detalles_pedido WHERE pedido_id = p_id;
  IF v_items AND NOT v_cocina THEN
    IF v_estado IN ('pendiente','en_preparacion') THEN
      UPDATE public.pedidos SET estado = 'listo' WHERE id = p_id;
    END IF;
  ELSIF v_estado = 'listo' AND (p_reabrir OR NOT v_items) THEN
    UPDATE public.pedidos SET estado = 'pendiente' WHERE id = p_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ajustar_estado_servicio(uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.crear_pedido_cliente(
  solicitud_id uuid, tipo_entrega text, articulos jsonb, datos_entrega jsonb, metodo text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  usuario uuid:=auth.uid(); existente public.pedidos%ROWTYPE;
  linea jsonb; producto public.productos%ROWTYPE; cantidad integer;
  entrega jsonb; items_ordenados jsonb; huella text;
BEGIN
  IF usuario IS NULL OR public.rol_actual() IS DISTINCT FROM 'cliente' THEN
    RAISE EXCEPTION 'Solo clientes autenticados pueden crear pedidos' USING ERRCODE='42501';
  END IF;
  IF solicitud_id IS NULL OR tipo_entrega IS NULL OR tipo_entrega NOT IN ('delivery','recojo')
    OR metodo IS NULL OR metodo NOT IN ('efectivo','tarjeta','yape','plin')
    OR jsonb_typeof(datos_entrega) IS DISTINCT FROM 'object'
    OR jsonb_typeof(articulos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Datos del pedido inválidos' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(articulos) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'El pedido debe contener entre 1 y 100 productos' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(datos_entrega->'name') IS DISTINCT FROM 'string'
    OR char_length(btrim(datos_entrega->>'name')) NOT BETWEEN 2 AND 120
    OR jsonb_typeof(datos_entrega->'phone') IS DISTINCT FROM 'string'
    OR (datos_entrega->>'phone') !~ '^9[0-9]{8}$'
    OR (tipo_entrega='delivery' AND (jsonb_typeof(datos_entrega->'address') IS DISTINCT FROM 'string'
      OR char_length(btrim(datos_entrega->>'address')) NOT BETWEEN 5 AND 250))
    OR (datos_entrega ? 'reference' AND jsonb_typeof(datos_entrega->'reference') IS DISTINCT FROM 'string')
    OR char_length(COALESCE(datos_entrega->>'reference',''))>500 THEN
    RAISE EXCEPTION 'Revisa nombre, teléfono y dirección' USING ERRCODE='22023';
  END IF;
  entrega:=jsonb_build_object('name',btrim(datos_entrega->>'name'),'phone',datos_entrega->>'phone',
    'address',CASE WHEN tipo_entrega='delivery' THEN btrim(datos_entrega->>'address') ELSE '' END,
    'reference',btrim(COALESCE(datos_entrega->>'reference','')));
  FOR linea IN SELECT value FROM jsonb_array_elements(articulos) LOOP
    IF jsonb_typeof(linea) IS DISTINCT FROM 'object'
      OR COALESCE(linea->>'id','') !~ '^[1-9][0-9]{0,17}$'
      OR COALESCE(linea->>'qty','') !~ '^[1-9][0-9]{0,2}$' THEN
      RAISE EXCEPTION 'Producto o cantidad inválidos' USING ERRCODE='22023';
    END IF;
    IF (linea->>'qty')::integer>100 THEN
      RAISE EXCEPTION 'Cantidad inválida' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT (value->>'id')::bigint) FROM jsonb_array_elements(articulos))<>jsonb_array_length(articulos) THEN
    RAISE EXCEPTION 'No repitas un producto en el pedido' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id',(value->>'id')::bigint,'qty',(value->>'qty')::integer)
    ORDER BY (value->>'id')::bigint) INTO items_ordenados FROM jsonb_array_elements(articulos);
  huella:=md5(jsonb_build_object('tipo',tipo_entrega,'entrega',entrega,'items',items_ordenados,'metodo',metodo)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(solicitud_id::text,0));
  SELECT * INTO existente FROM public.pedidos WHERE id=solicitud_id;
  IF FOUND THEN
    IF existente.cliente_id IS DISTINCT FROM usuario OR existente.huella_solicitud IS DISTINCT FROM huella THEN
      RAISE EXCEPTION 'La solicitud ya fue utilizada; revisa tus pedidos' USING ERRCODE='22023';
    END IF;
    RETURN existente.id;
  END IF;
  INSERT INTO public.pedidos(id,cliente_id,creado_por,tipo,direccion,notas,total,destinatario,metodo_solicitado,huella_solicitud)
  VALUES(solicitud_id,usuario,usuario,tipo_entrega,entrega->>'address',entrega->>'reference',0,entrega,metodo,huella);
  FOR linea IN SELECT value FROM jsonb_array_elements(items_ordenados) LOOP
    SELECT * INTO producto FROM public.productos WHERE id=(linea->>'id')::bigint AND disponible FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uno de los productos ya no está disponible' USING ERRCODE='22023';
    END IF;
    cantidad:=(linea->>'qty')::integer;
    INSERT INTO public.detalles_pedido(pedido_id,producto_id,cantidad,precio_unitario)
    VALUES(solicitud_id,producto.id,cantidad,producto.precio);
  END LOOP;
  PERFORM public.ajustar_estado_servicio(solicitud_id);
  RETURN solicitud_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.abrir_pedido_salon(
  solicitud_id uuid,
  p_mesa_id bigint,
  p_comensales integer,
  p_notas text,
  p_articulos jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_mesa public.mesas%ROWTYPE;
  v_pedido_activo public.pedidos%ROWTYPE;
  v_existente public.pedidos%ROWTYPE;
  v_pedido_id uuid;
  v_linea jsonb;
  v_producto public.productos%ROWTYPE;
  v_comensales integer;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden abrir pedidos de salón' USING ERRCODE = '42501';
  END IF;

  IF p_mesa_id IS NULL THEN
    RAISE EXCEPTION 'Mesa requerida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_mesa FROM public.mesas WHERE id = p_mesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa no existe' USING ERRCODE = '22023';
  END IF;

  v_pedido_id := COALESCE(solicitud_id, gen_random_uuid());

  -- Idempotencia: si la solicitud ya existe para esta mesa
  SELECT * INTO v_existente FROM public.pedidos WHERE id = v_pedido_id;
  IF FOUND THEN
    IF v_existente.mesa_id = p_mesa_id AND v_existente.tipo = 'salon' THEN
      RETURN v_existente.id;
    ELSE
      RAISE EXCEPTION 'La solicitud ya fue utilizada' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Comprobar si ya existe un pedido activo en la mesa
  SELECT * INTO v_pedido_activo FROM public.pedidos
  WHERE mesa_id = p_mesa_id AND tipo = 'salon' AND estado NOT IN ('entregado', 'cancelado');
  IF FOUND THEN
    RAISE EXCEPTION 'La mesa ya tiene un pedido activo' USING ERRCODE = '22023';
  END IF;

  v_comensales := COALESCE(p_comensales, v_mesa.capacidad);
  IF v_comensales <= 0 THEN
    v_comensales := v_mesa.capacidad;
  END IF;

  INSERT INTO public.pedidos (
    id, cliente_id, creado_por, mesa_id, tipo, estado,
    notas, comensales, total, subtotal, cuenta_solicitada, huella_solicitud
  ) VALUES (
    v_pedido_id, NULL, v_usuario, p_mesa_id, 'salon', 'pendiente',
    COALESCE(btrim(p_notas), ''), v_comensales, 0, 0, false, md5(v_pedido_id::text)
  );

  UPDATE public.mesas SET estado = 'ocupada' WHERE id = p_mesa_id;

  -- Agregar artículos iniciales si se proporcionan
  IF p_articulos IS NOT NULL AND jsonb_typeof(p_articulos) = 'array' AND jsonb_array_length(p_articulos) > 0 THEN
    FOR v_linea IN SELECT value FROM jsonb_array_elements(p_articulos) LOOP
      IF jsonb_typeof(v_linea) IS DISTINCT FROM 'object'
        OR COALESCE(v_linea->>'id','') !~ '^[1-9][0-9]{0,17}$'
        OR COALESCE(v_linea->>'qty','') !~ '^[1-9][0-9]{0,2}$' THEN
        RAISE EXCEPTION 'Producto o cantidad inválidos' USING ERRCODE = '22023';
      END IF;

      SELECT * INTO v_producto FROM public.productos
      WHERE id = (v_linea->>'id')::bigint AND disponible FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario)
      VALUES (v_pedido_id, v_producto.id, (v_linea->>'qty')::integer, v_producto.precio);
    END LOOP;
  END IF;

  PERFORM public.ajustar_estado_servicio(v_pedido_id);
  RETURN v_pedido_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.agregar_o_modificar_detalles_salon(
  p_pedido_id uuid,
  p_articulos jsonb,
  p_notas text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_pedido public.pedidos%ROWTYPE;
  v_linea jsonb;
  v_producto public.productos%ROWTYPE;
  v_antes jsonb;
  v_despues jsonb;
BEGIN
  IF v_usuario IS NULL OR public.rol_actual() NOT IN ('mesera', 'admin') THEN
    RAISE EXCEPTION 'Solo meseras o administradores pueden modificar pedidos de salón' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id AND tipo = 'salon' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe o no es de salón' USING ERRCODE = '22023';
  END IF;

  IF v_pedido.estado IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'No se puede modificar un pedido finalizado o cancelado' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_array(producto_id,cantidad) ORDER BY producto_id), '[]'::jsonb)
  INTO v_antes FROM public.detalles_pedido WHERE pedido_id = p_pedido_id AND requiere_preparacion;

  IF p_notas IS NOT NULL THEN
    UPDATE public.pedidos SET notas = btrim(p_notas) WHERE id = p_pedido_id;
  END IF;

  IF p_articulos IS NOT NULL AND jsonb_typeof(p_articulos) = 'array' THEN
    DELETE FROM public.detalles_pedido WHERE pedido_id = p_pedido_id;

    FOR v_linea IN SELECT value FROM jsonb_array_elements(p_articulos) LOOP
      IF jsonb_typeof(v_linea) IS DISTINCT FROM 'object'
        OR COALESCE(v_linea->>'id','') !~ '^[1-9][0-9]{0,17}$'
        OR COALESCE(v_linea->>'qty','') !~ '^[1-9][0-9]{0,2}$' THEN
        RAISE EXCEPTION 'Producto o cantidad inválidos' USING ERRCODE = '22023';
      END IF;

      SELECT * INTO v_producto FROM public.productos
      WHERE id = (v_linea->>'id')::bigint AND disponible FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario)
      VALUES (p_pedido_id, v_producto.id, (v_linea->>'qty')::integer, v_producto.precio);
    END LOOP;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_array(producto_id,cantidad) ORDER BY producto_id), '[]'::jsonb)
  INTO v_despues FROM public.detalles_pedido WHERE pedido_id = p_pedido_id AND requiere_preparacion;
  PERFORM public.ajustar_estado_servicio(p_pedido_id, v_antes IS DISTINCT FROM v_despues);
  RETURN true;
END;
$$;

-- Reconcilia únicamente comandas activas que no contienen ningún plato de cocina.
UPDATE public.pedidos p SET estado = 'listo'
WHERE estado IN ('pendiente','en_preparacion')
  AND EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.detalles_pedido WHERE pedido_id = p.id AND requiere_preparacion);

END;
$servicio_directo$;
