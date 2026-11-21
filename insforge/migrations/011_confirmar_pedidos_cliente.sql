-- Conserva firma, UUID y nombres de argumentos de EPIC 1.
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
  RETURN solicitud_id;
END;
$$;
REVOKE ALL ON FUNCTION public.crear_pedido_cliente(uuid,text,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crear_pedido_cliente(uuid,text,jsonb,jsonb,text) TO authenticated;

-- Permite reintentar pedidos previos con el mismo contenido conocido, sin usar precios actuales.
UPDATE public.pedidos p SET huella_solicitud=md5(jsonb_build_object(
  'tipo',p.tipo,'metodo',p.metodo_solicitado,
  'entrega',jsonb_build_object('name',btrim(p.destinatario->>'name'),'phone',p.destinatario->>'phone',
    'address',CASE WHEN p.tipo='delivery' THEN btrim(p.destinatario->>'address') ELSE '' END,
    'reference',btrim(COALESCE(p.destinatario->>'reference',''))),
  'items',(SELECT jsonb_agg(jsonb_build_object('id',d.producto_id,'qty',d.cantidad) ORDER BY d.producto_id)
    FROM public.detalles_pedido d WHERE d.pedido_id=p.id)
)::text) WHERE p.tipo IN ('delivery','recojo') AND p.huella_solicitud IS NULL;
