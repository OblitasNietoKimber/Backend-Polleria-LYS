-- Existencias en octavos de pollo para brasas y unidades para otros productos.
BEGIN;
CREATE TABLE public.inventario_recursos (
 id text PRIMARY KEY, nombre text NOT NULL, unidades bigint NOT NULL CHECK(unidades>=0),
 escala integer NOT NULL CHECK(escala IN (1,8)), actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.inventario_recetas (
 producto_id bigint PRIMARY KEY REFERENCES public.productos(id) ON DELETE CASCADE,
 recurso_id text NOT NULL REFERENCES public.inventario_recursos(id), consumo integer NOT NULL CHECK(consumo>0)
);
CREATE TABLE public.inventario_asignaciones (
 pedido_id uuid NOT NULL REFERENCES public.pedidos(id), recurso_id text NOT NULL REFERENCES public.inventario_recursos(id),
 unidades bigint NOT NULL CHECK(unidades>=0), PRIMARY KEY(pedido_id,recurso_id)
);
CREATE TABLE public.inventario_movimientos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, recurso_id text NOT NULL REFERENCES public.inventario_recursos(id),
 pedido_id uuid REFERENCES public.pedidos(id), cantidad bigint NOT NULL, motivo text NOT NULL,
 usuario_id uuid, operacion uuid UNIQUE, solicitud jsonb, creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventario_recursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_recursos,public.inventario_recetas,public.inventario_asignaciones,public.inventario_movimientos FROM PUBLIC,anon,authenticated;

INSERT INTO public.inventario_recursos VALUES('pollo-brasa','Pollo a la brasa compartido',560,8,now());
-- Existencias iniciales estimadas del catálogo anterior; administración debe contarlas.
INSERT INTO public.inventario_recursos(id,nombre,unidades,escala)
 SELECT 'producto-'||id,nombre,CASE id WHEN 5 THEN 40 WHEN 6 THEN 40 WHEN 7 THEN 35
 WHEN 8 THEN 120 WHEN 9 THEN 100 WHEN 10 THEN 70 WHEN 11 THEN 40 WHEN 12 THEN 45
 WHEN 14 THEN 75 WHEN 15 THEN 45 WHEN 16 THEN 60 WHEN 17 THEN 30 ELSE 50 END,1 FROM public.productos;
INSERT INTO public.inventario_recetas SELECT id,'producto-'||id,1 FROM public.productos;
-- Incluye combos cuya descripción especifica la fracción de pollo.
UPDATE public.inventario_recetas SET recurso_id='pollo-brasa',consumo=CASE producto_id
 WHEN 1 THEN 8 WHEN 2 THEN 4 WHEN 19 THEN 8 WHEN 20 THEN 10 WHEN 21 THEN 12
 WHEN 33 THEN 1 WHEN 35 THEN 1 ELSE 2 END
 WHERE producto_id IN (1,2,3,4,18,19,20,21,32,33,34,35,36,97);
INSERT INTO public.inventario_movimientos(recurso_id,cantidad,motivo)
 SELECT id,unidades,'Saldo inicial estimado al activar inventario' FROM public.inventario_recursos;

CREATE FUNCTION public.sincronizar_stock_pedido(p_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.pedidos%ROWTYPE; r record; anterior bigint; objetivo bigint; diferencia bigint; preparado boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(726519);
 SELECT * INTO p FROM public.pedidos WHERE id=p_id;
 IF NOT FOUND THEN RETURN; END IF;
 preparado:=p.cocina_cancelada_en IS NOT NULL OR EXISTS(SELECT 1 FROM public.historial_estados_pedido
  WHERE pedido_id=p_id AND estado IN ('en_preparacion','listo','en_camino','entregado'))
  OR EXISTS(SELECT 1 FROM public.entregas_cocina WHERE pedido_id=p_id);
 FOR r IN SELECT x.recurso_id,sum(x.unidades)::bigint AS necesarias FROM (
   SELECT receta.recurso_id,d.cantidad::bigint*receta.consumo AS unidades FROM public.detalles_pedido d
   JOIN public.inventario_recetas receta ON receta.producto_id=d.producto_id WHERE d.pedido_id=p_id
   UNION ALL SELECT recurso_id,0 FROM public.inventario_asignaciones WHERE pedido_id=p_id
  ) x GROUP BY x.recurso_id ORDER BY x.recurso_id LOOP
  SELECT unidades INTO anterior FROM public.inventario_asignaciones WHERE pedido_id=p_id AND recurso_id=r.recurso_id;
  anterior:=COALESCE(anterior,0);
  objetivo:=CASE WHEN p.estado='cancelado' THEN CASE WHEN preparado THEN anterior ELSE 0 END
   WHEN preparado THEN GREATEST(anterior,r.necesarias) ELSE r.necesarias END;
  diferencia:=objetivo-anterior;
  IF diferencia<>0 THEN
   UPDATE public.inventario_recursos SET unidades=unidades-diferencia,actualizado_en=clock_timestamp()
    WHERE id=r.recurso_id AND unidades>=diferencia;
   IF NOT FOUND THEN RAISE EXCEPTION 'Stock insuficiente para %. Actualiza el catálogo y revisa las cantidades.',
    (SELECT nombre FROM public.inventario_recursos WHERE id=r.recurso_id) USING ERRCODE='22023'; END IF;
   INSERT INTO public.inventario_asignaciones VALUES(p_id,r.recurso_id,objetivo)
    ON CONFLICT(pedido_id,recurso_id) DO UPDATE SET unidades=EXCLUDED.unidades;
   INSERT INTO public.inventario_movimientos(recurso_id,pedido_id,cantidad,motivo,usuario_id)
    VALUES(r.recurso_id,p_id,-diferencia,CASE WHEN diferencia>0 THEN 'Comanda confirmada o ampliada' ELSE 'Edición o anulación antes de preparar' END,auth.uid());
  END IF;
 END LOOP;
END; $$;
CREATE FUNCTION public.actualizar_stock_detalle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM public.sincronizar_stock_pedido(OLD.pedido_id);
 ELSE PERFORM public.sincronizar_stock_pedido(NEW.pedido_id);
  IF TG_OP='UPDATE' AND OLD.pedido_id<>NEW.pedido_id THEN PERFORM public.sincronizar_stock_pedido(OLD.pedido_id); END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE TRIGGER zz_stock_detalle AFTER INSERT OR UPDATE OR DELETE ON public.detalles_pedido
 FOR EACH ROW EXECUTE FUNCTION public.actualizar_stock_detalle();
CREATE FUNCTION public.actualizar_stock_cancelado() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.estado='cancelado' AND OLD.estado IS DISTINCT FROM NEW.estado THEN PERFORM public.sincronizar_stock_pedido(NEW.id); END IF;
 RETURN NULL;
END; $$;
CREATE TRIGGER zz_stock_cancelado AFTER UPDATE OF estado ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.actualizar_stock_cancelado();
CREATE FUNCTION public.iniciar_stock_producto() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.inventario_recursos(id,nombre,unidades,escala) VALUES('producto-'||NEW.id,NEW.nombre,0,1);
 INSERT INTO public.inventario_recetas VALUES(NEW.id,'producto-'||NEW.id,1);
 RETURN NEW;
END; $$;
CREATE TRIGGER producto_inventario AFTER INSERT ON public.productos FOR EACH ROW EXECUTE FUNCTION public.iniciar_stock_producto();

CREATE VIEW public.productos_catalogo AS
 SELECT p.*,floor(i.unidades::numeric/r.consumo)::bigint AS stock,
 r.recurso_id AS inventario_id,i.nombre AS inventario_nombre,i.unidades::numeric/i.escala AS inventario_disponible,
 i.escala AS inventario_escala,r.consumo AS inventario_consumo
 FROM public.productos p JOIN public.inventario_recetas r ON r.producto_id=p.id JOIN public.inventario_recursos i ON i.id=r.recurso_id;
REVOKE ALL ON public.productos_catalogo FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.productos_catalogo TO anon,authenticated;

CREATE FUNCTION public.ajustar_inventario(p_producto_id bigint,p_cantidad numeric,p_motivo text,p_operacion uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.inventario_recursos%ROWTYPE; delta bigint; previo public.inventario_movimientos%ROWTYPE; datos jsonb;
BEGIN
 IF auth.uid() IS NULL OR COALESCE(public.rol_actual(),'')<>'admin' THEN RAISE EXCEPTION 'Solo administración puede ajustar existencias' USING ERRCODE='42501'; END IF;
 IF p_operacion IS NULL OR p_cantidad IS NULL OR p_cantidad::text IN ('NaN','Infinity','-Infinity') OR p_cantidad=0 OR abs(p_cantidad)>1000000
 OR length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 5 AND 250 THEN RAISE EXCEPTION 'Indica una cantidad válida y un motivo de 5 a 250 caracteres' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(726519);
 datos:=jsonb_build_object('producto',p_producto_id,'cantidad',p_cantidad,'motivo',btrim(p_motivo),'usuario',auth.uid());
 SELECT * INTO previo FROM public.inventario_movimientos WHERE operacion=p_operacion;
 IF FOUND THEN
  IF previo.solicitud IS DISTINCT FROM datos THEN RAISE EXCEPTION 'La operación ya se utilizó para otro ajuste' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('ok',true,'reintento',true);
 END IF;
 SELECT i.* INTO r FROM public.inventario_recursos i JOIN public.inventario_recetas receta ON receta.recurso_id=i.id WHERE receta.producto_id=p_producto_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto inexistente' USING ERRCODE='22023'; END IF;
 IF p_cantidad*r.escala<>trunc(p_cantidad*r.escala) THEN RAISE EXCEPTION 'La cantidad no coincide con las unidades del inventario' USING ERRCODE='22023'; END IF;
 delta:=(p_cantidad*r.escala)::bigint;
 IF r.unidades+delta<0 THEN RAISE EXCEPTION 'El ajuste dejaría stock negativo' USING ERRCODE='22023'; END IF;
 UPDATE public.inventario_recursos SET unidades=unidades+delta,actualizado_en=clock_timestamp() WHERE id=r.id;
 INSERT INTO public.inventario_movimientos(recurso_id,cantidad,motivo,usuario_id,operacion,solicitud)
 VALUES(r.id,delta,btrim(p_motivo),auth.uid(),p_operacion,datos);
 RETURN jsonb_build_object('ok',true);
END; $$;
REVOKE ALL ON FUNCTION public.sincronizar_stock_pedido(uuid),public.actualizar_stock_detalle(),public.actualizar_stock_cancelado(),public.iniciar_stock_producto(),public.ajustar_inventario(bigint,numeric,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_inventario(bigint,numeric,text,uuid) TO authenticated;

-- Las comandas activas existentes también reservan cantidades. No modifica pedidos ni cobros.
-- Lo que salió de cocina antes de activar inventario ya fue consumido: se
-- reconoce en la asignación previa sin volver a restarlo del saldo inicial.
INSERT INTO public.inventario_asignaciones(pedido_id,recurso_id,unidades)
 SELECT p.id,r.recurso_id,sum(CASE WHEN p.cocina_cancelada_en IS NOT NULL THEN d.cantidad
 ELSE LEAST(d.cantidad,COALESCE(e.cantidad,0)) END*r.consumo)::bigint
 FROM public.pedidos p JOIN public.detalles_pedido d ON d.pedido_id=p.id
 JOIN public.inventario_recetas r ON r.producto_id=d.producto_id
 LEFT JOIN LATERAL (SELECT sum((item->>'cantidad')::numeric) AS cantidad
  FROM public.entregas_cocina entrega CROSS JOIN LATERAL jsonb_array_elements(entrega.items) item
  WHERE entrega.pedido_id=p.id AND (item->>'producto_id')::bigint=d.producto_id) e ON true
 WHERE p.estado NOT IN ('cancelado','entregado') GROUP BY p.id,r.recurso_id;
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT id FROM public.pedidos WHERE estado NOT IN ('cancelado','entregado') ORDER BY id LOOP
  PERFORM public.sincronizar_stock_pedido(p.id);
 END LOOP;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
