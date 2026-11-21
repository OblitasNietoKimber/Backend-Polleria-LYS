-- Conserva el total registrado de pedidos anteriores; los nuevos importes se mantienen en el servidor.
ALTER TABLE public.pedidos
  ADD COLUMN subtotal numeric(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  ADD COLUMN huella_solicitud text;
ALTER TABLE public.detalles_pedido ADD COLUMN nombre_producto text NOT NULL DEFAULT '';
UPDATE public.detalles_pedido d SET nombre_producto=p.nombre FROM public.productos p WHERE p.id=d.producto_id;
UPDATE public.pedidos SET subtotal=total-envio;
CREATE INDEX pedidos_cliente_fecha_idx ON public.pedidos(cliente_id,creado_en DESC,id DESC);

CREATE FUNCTION public.preparar_importes_pedido() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  NEW.envio := CASE WHEN NEW.tipo='delivery' THEN 6 ELSE 0 END;
  NEW.total := NEW.subtotal + NEW.envio;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pedido_importes BEFORE INSERT OR UPDATE OF subtotal,envio,total,tipo ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.preparar_importes_pedido();

CREATE FUNCTION public.preparar_nombre_detalle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.producto_id IS DISTINCT FROM OLD.producto_id THEN
    SELECT nombre INTO NEW.nombre_producto FROM public.productos WHERE id=NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER detalle_nombre BEFORE INSERT OR UPDATE OF producto_id ON public.detalles_pedido
FOR EACH ROW EXECUTE FUNCTION public.preparar_nombre_detalle();

-- Las futuras RPCs de salón pueden agregar, modificar o retirar detalles sin recalcular en React.
CREATE FUNCTION public.recalcular_subtotal_pedido() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE nuevo uuid; anterior uuid; pedido uuid;
BEGIN
  IF TG_OP<>'DELETE' THEN nuevo:=NEW.pedido_id; END IF;
  IF TG_OP<>'INSERT' THEN anterior:=OLD.pedido_id; END IF;
  FOR pedido IN SELECT id FROM public.pedidos WHERE id IN (nuevo,anterior) ORDER BY id FOR UPDATE LOOP
    UPDATE public.pedidos SET subtotal=COALESCE((
      SELECT sum(cantidad*precio_unitario) FROM public.detalles_pedido WHERE pedido_id=pedido
    ),0) WHERE id=pedido;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER detalle_importes AFTER INSERT OR UPDATE OR DELETE ON public.detalles_pedido
FOR EACH ROW EXECUTE FUNCTION public.recalcular_subtotal_pedido();
REVOKE ALL ON FUNCTION public.preparar_importes_pedido(),public.preparar_nombre_detalle(),public.recalcular_subtotal_pedido() FROM PUBLIC,anon,authenticated;
-- Las escrituras se reservan a RPCs que validen el rol y las reglas del negocio.
REVOKE INSERT,UPDATE,DELETE ON public.pedidos,public.detalles_pedido FROM PUBLIC,anon,authenticated;
