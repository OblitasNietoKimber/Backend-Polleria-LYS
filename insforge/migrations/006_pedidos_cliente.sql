BEGIN;
ALTER TABLE public.pedidos ADD COLUMN envio numeric(10,2) NOT NULL DEFAULT 0 CHECK(envio >= 0);
ALTER TABLE public.pedidos ADD COLUMN destinatario jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.pedidos ADD COLUMN metodo_solicitado text;
-- Price/owner/status always come from the server. This does not charge or record payments.
CREATE FUNCTION public.crear_pedido_cliente(solicitud_id uuid, tipo_entrega text, articulos jsonb, datos_entrega jsonb, metodo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  usuario uuid := auth.uid(); linea jsonb; producto public.productos%ROWTYPE;
  cantidad integer; subtotal numeric(10,2) := 0; costo_envio numeric(10,2); propietario uuid;
BEGIN
  IF usuario IS NULL OR public.rol_actual() <> 'cliente' THEN RAISE EXCEPTION 'Solo clientes autenticados pueden crear pedidos'; END IF;
  IF solicitud_id IS NULL OR tipo_entrega IS NULL OR metodo IS NULL OR tipo_entrega NOT IN ('delivery','recojo') OR metodo NOT IN ('efectivo','tarjeta','yape','plin') THEN RAISE EXCEPTION 'Entrega o método inválido'; END IF;
  IF articulos IS NULL OR jsonb_typeof(articulos) <> 'array' OR jsonb_array_length(articulos) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Carrito vacío o inválido'; END IF;
  IF COALESCE(datos_entrega->>'name','') = '' OR COALESCE(datos_entrega->>'phone','') !~ '^9[0-9]{8}$' OR (tipo_entrega = 'delivery' AND COALESCE(datos_entrega->>'address','') = '') THEN RAISE EXCEPTION 'Datos de entrega inválidos'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(solicitud_id::text));
  SELECT cliente_id INTO propietario FROM public.pedidos WHERE id=solicitud_id;
  IF FOUND THEN
    IF propietario=usuario THEN RETURN solicitud_id; ELSE RAISE EXCEPTION 'Solicitud inválida'; END IF;
  END IF;
  costo_envio := CASE WHEN tipo_entrega='delivery' THEN 6 ELSE 0 END;
  FOR linea IN SELECT value FROM jsonb_array_elements(articulos) LOOP
    cantidad := (linea->>'qty')::integer;
    IF cantidad IS NULL OR cantidad NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
    SELECT * INTO producto FROM public.productos WHERE id=(linea->>'id')::bigint AND disponible FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
    subtotal := subtotal + producto.precio*cantidad;
  END LOOP;
  INSERT INTO public.pedidos(id,cliente_id,creado_por,tipo,direccion,notas,total,envio,destinatario,metodo_solicitado)
  VALUES(solicitud_id,usuario,usuario,tipo_entrega,datos_entrega->>'address',datos_entrega->>'reference',subtotal+costo_envio,costo_envio,
    jsonb_build_object('name',datos_entrega->>'name','phone',datos_entrega->>'phone','address',datos_entrega->>'address','reference',datos_entrega->>'reference'),metodo);
  FOR linea IN SELECT value FROM jsonb_array_elements(articulos) LOOP
    SELECT * INTO producto FROM public.productos WHERE id=(linea->>'id')::bigint;
    INSERT INTO public.detalles_pedido(pedido_id,producto_id,cantidad,precio_unitario) VALUES(solicitud_id,producto.id,(linea->>'qty')::integer,producto.precio);
  END LOOP;
  RETURN solicitud_id;
END;
$$;
REVOKE ALL ON FUNCTION public.crear_pedido_cliente(uuid,text,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crear_pedido_cliente(uuid,text,jsonb,jsonb,text) TO authenticated;
COMMIT;
