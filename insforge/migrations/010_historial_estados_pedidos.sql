CREATE TABLE public.historial_estados_pedido (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  estado_anterior text REFERENCES public.estados_pedido(codigo),
  estado text NOT NULL REFERENCES public.estados_pedido(codigo),
  cambiado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cambiado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  es_reconstruido boolean NOT NULL DEFAULT false
);
CREATE INDEX historial_pedido_fecha_idx ON public.historial_estados_pedido(pedido_id,cambiado_en,id);
ALTER TABLE public.historial_estados_pedido ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.historial_estados_pedido FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.historial_estados_pedido TO authenticated;
CREATE POLICY historial_lectura ON public.historial_estados_pedido FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id));

CREATE FUNCTION public.registrar_estado_pedido() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.historial_estados_pedido(pedido_id,estado,cambiado_por,cambiado_en)
    VALUES (NEW.id,NEW.estado,COALESCE(auth.uid(),NEW.creado_por),NEW.creado_en);
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO public.historial_estados_pedido(pedido_id,estado_anterior,estado,cambiado_por)
    VALUES (NEW.id,OLD.estado,NEW.estado,auth.uid());
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER pedido_historial AFTER INSERT OR UPDATE OF estado ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.registrar_estado_pedido();
REVOKE ALL ON FUNCTION public.registrar_estado_pedido() FROM PUBLIC,anon,authenticated;
-- No se inventan fechas ni responsables de cambios anteriores a esta migración.
INSERT INTO public.historial_estados_pedido(pedido_id,estado,es_reconstruido)
SELECT id,estado,true FROM public.pedidos;
