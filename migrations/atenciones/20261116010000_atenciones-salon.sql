-- Flujo integrado en las pantallas originales. Instalar con respaldo y preflight.
-- Conserva pedidos/pagos/historial del cliente. Las operaciones nuevas son RPC.
BEGIN;
CREATE TABLE public.atenciones_salon (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mesa_id bigint NOT NULL REFERENCES public.mesas(id),
 abierta_por uuid NOT NULL REFERENCES public.perfiles(id), abierta_en timestamptz NOT NULL DEFAULT now(),
 cerrada_por uuid REFERENCES public.perfiles(id), cerrada_en timestamptz,
 CHECK ((cerrada_en IS NULL) = (cerrada_por IS NULL))
);
CREATE UNIQUE INDEX atencion_abierta_por_mesa ON public.atenciones_salon(mesa_id) WHERE cerrada_en IS NULL;
ALTER TABLE public.pedidos ADD COLUMN atencion_id uuid REFERENCES public.atenciones_salon(id),
 ADD COLUMN version_cuenta bigint NOT NULL DEFAULT 0, ADD COLUMN cocina_cancelada_en timestamptz;
CREATE INDEX pedidos_atencion_idx ON public.pedidos(atencion_id);
-- Una cuenta sin pagar por atención; varias cuentas pagadas pueden seguir en cocina.
DROP INDEX public.pedidos_salon_mesa_activa_idx;
CREATE UNIQUE INDEX pedidos_salon_cuenta_abierta_idx ON public.pedidos(mesa_id)
 WHERE tipo='salon' AND estado_pago='pendiente' AND estado NOT IN ('entregado','cancelado');
INSERT INTO public.atenciones_salon(mesa_id,abierta_por)
 SELECT DISTINCT ON (mesa_id) mesa_id,creado_por FROM public.pedidos
 WHERE tipo='salon' AND estado NOT IN ('entregado','cancelado') ORDER BY mesa_id,creado_en;
UPDATE public.pedidos p SET atencion_id=a.id FROM public.atenciones_salon a
 WHERE p.mesa_id=a.mesa_id AND p.tipo='salon' AND p.estado NOT IN ('entregado','cancelado');

CREATE TABLE public.incidencias_atencion (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pedido_id uuid NOT NULL REFERENCES public.pedidos(id),
 motivo text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 5 AND 500),
 tipo text NOT NULL CHECK (tipo IN ('anulacion','consumo_no_cobrado','devolucion')),
 estado text NOT NULL DEFAULT 'solicitada' CHECK (estado IN ('solicitada','autorizada','resuelta','rechazada')),
 solicitada_por uuid NOT NULL REFERENCES public.perfiles(id), creada_en timestamptz NOT NULL DEFAULT now(),
 autorizada_por uuid REFERENCES public.perfiles(id), resuelta_por uuid REFERENCES public.perfiles(id),
 resuelta_en timestamptz, importe numeric(12,2), referencia text,
 CHECK (importe IS NULL OR (importe>0 AND importe::text NOT IN ('NaN','Infinity','-Infinity')))
);
CREATE UNIQUE INDEX incidencia_pendiente_pedido ON public.incidencias_atencion(pedido_id)
 WHERE estado IN ('solicitada','autorizada');
CREATE UNIQUE INDEX devolucion_unica_pedido ON public.incidencias_atencion(pedido_id)
 WHERE tipo='devolucion' AND estado='resuelta';
CREATE TABLE public.operaciones_atencion (
 id uuid PRIMARY KEY, usuario_id uuid NOT NULL REFERENCES public.perfiles(id), accion text NOT NULL,
 huella text NOT NULL, resultado jsonb NOT NULL, creada_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.atenciones_salon ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidencias_atencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operaciones_atencion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atenciones_salon,public.incidencias_atencion,public.operaciones_atencion FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.atenciones_salon,public.incidencias_atencion TO authenticated;
CREATE POLICY atenciones_personal ON public.atenciones_salon FOR SELECT TO authenticated
 USING (public.rol_actual() IN ('mesera','cocina','caja','admin'));
CREATE POLICY incidencias_personal ON public.incidencias_atencion FOR SELECT TO authenticated
 USING (public.rol_actual() IN ('mesera','cocina','caja','admin'));
REVOKE UPDATE(estado) ON public.mesas FROM authenticated;

CREATE FUNCTION public.versionar_cuenta_atencion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.version_cuenta:=OLD.version_cuenta+1; RETURN NEW; END;
$$;
CREATE TRIGGER zz_version_cuenta BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.versionar_cuenta_atencion();
-- Un cambio de incidencia también modifica el sello que ya consultan las pantallas.
CREATE FUNCTION public.notificar_incidencia_atencion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN UPDATE public.pedidos SET actualizado_en=clock_timestamp() WHERE id=NEW.pedido_id; RETURN NEW; END;
$$;
CREATE TRIGGER incidencia_cambio AFTER INSERT OR UPDATE ON public.incidencias_atencion
 FOR EACH ROW EXECUTE FUNCTION public.notificar_incidencia_atencion();
CREATE OR REPLACE FUNCTION public.tiene_pendientes_cocina(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.detalles_pedido d
 LEFT JOIN public.cantidades_entregadas_cocina(p_id) e ON e.producto_id=d.producto_id
 WHERE d.pedido_id=p_id AND d.requiere_preparacion
 AND NOT EXISTS(SELECT 1 FROM public.pedidos WHERE id=p_id AND cocina_cancelada_en IS NOT NULL)
 GROUP BY d.producto_id,e.cantidad HAVING sum(d.cantidad)>COALESCE(e.cantidad,0));
$$;

-- Conserva las funciones auditadas como implementación interna, sin acceso público.
ALTER FUNCTION public.registrar_cobro(uuid,text,numeric,uuid,numeric,text) RENAME TO registrar_cobro_base_atenciones;
ALTER FUNCTION public.agregar_o_modificar_detalles_salon(uuid,jsonb,text) RENAME TO modificar_salon_base_atenciones;
ALTER FUNCTION public.entregar_pedido_cocina(uuid,timestamptz) RENAME TO entregar_cocina_base_atenciones;
ALTER FUNCTION public.cambiar_estado_cocina(uuid,text,text) RENAME TO cambiar_cocina_base_atenciones;
ALTER FUNCTION public.abrir_pedido_salon(uuid,bigint,integer,text,jsonb) RENAME TO abrir_salon_base_atenciones;
REVOKE ALL ON FUNCTION public.registrar_cobro_base_atenciones(uuid,text,numeric,uuid,numeric,text),
 public.modificar_salon_base_atenciones(uuid,jsonb,text),public.entregar_cocina_base_atenciones(uuid,timestamptz),
 public.cambiar_cocina_base_atenciones(uuid,text,text),public.abrir_salon_base_atenciones(uuid,bigint,integer,text,jsonb)
 FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.modificar_cuenta_atencion(p_id uuid,p_items jsonb,p_notas text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE anteriores jsonb;
BEGIN
 SELECT COALESCE(jsonb_agg(jsonb_build_object('producto_id',producto_id,'precio_unitario',precio_unitario,'nombre_producto',nombre_producto,'requiere_preparacion',requiere_preparacion)),'[]'::jsonb)
 INTO anteriores FROM public.detalles_pedido WHERE pedido_id=p_id;
 PERFORM public.modificar_salon_base_atenciones(p_id,p_items,p_notas);
 UPDATE public.detalles_pedido d SET precio_unitario=x.precio_unitario,nombre_producto=x.nombre_producto,requiere_preparacion=x.requiere_preparacion
 FROM jsonb_to_recordset(anteriores) x(producto_id bigint,precio_unitario numeric,nombre_producto text,requiere_preparacion boolean)
 WHERE d.pedido_id=p_id AND d.producto_id=x.producto_id;
END; $$;
REVOKE ALL ON FUNCTION public.modificar_cuenta_atencion(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;

-- Un pedido puede completarse; la disponibilidad física depende de la atención.
CREATE OR REPLACE FUNCTION public.cerrar_salon_si_completo(p_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.pedidos SET estado='entregado' WHERE id=p_id AND tipo='salon' AND estado='listo'
 AND estado_pago='pagado' AND NOT public.tiene_pendientes_cocina(p_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.proteger_mesa_sin_pago() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.estado='libre' AND EXISTS (SELECT 1 FROM public.atenciones_salon WHERE mesa_id=NEW.id AND cerrada_en IS NULL)
 THEN RAISE EXCEPTION 'Cierra la atención antes de liberar la mesa' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END;
$$;

CREATE FUNCTION public.flujo_operar(p_accion text,p_datos jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 u uuid:=auth.uid(); rol text:=COALESCE(public.rol_actual(),''); op uuid:=(p_datos->>'operacion')::uuid;
 p public.pedidos%ROWTYPE; a public.atenciones_salon%ROWTYPE; i public.incidencias_atencion%ROWTYPE;
 previo public.operaciones_atencion%ROWTYPE; nuevo_id uuid; mesa bigint; resultado jsonb; tiene boolean;
 motivo text:=btrim(p_datos->>'motivo'); huella text:=md5(p_datos::text);
BEGIN
 IF u IS NULL OR rol NOT IN ('mesera','cocina','caja','admin') THEN RAISE EXCEPTION 'Acceso restringido al personal' USING ERRCODE='42501'; END IF;
 IF op IS NULL THEN RAISE EXCEPTION 'Operación requerida' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(op::text,0));
 SELECT * INTO previo FROM public.operaciones_atencion WHERE id=op;
 IF FOUND THEN
  IF previo.usuario_id<>u OR previo.accion<>p_accion OR previo.huella<>huella THEN RAISE EXCEPTION 'Operación ya utilizada' USING ERRCODE='22023'; END IF;
  RETURN previo.resultado;
 END IF;
 IF p_accion IN ('abrir','adicional','editar','solicitar','reabrir','cerrar','reservar','cancelar_reserva') AND rol NOT IN ('mesera','admin')
 OR p_accion IN ('cobrar','confirmar_delivery') AND rol NOT IN ('caja','admin')
 OR p_accion IN ('comenzar','listo','entregar','detener') AND rol NOT IN ('cocina','admin')
 OR p_accion IN ('autorizar','rechazar') AND rol<>'admin'
 OR p_accion='devolver' AND rol NOT IN ('caja','admin')
 OR p_accion='incidencia' AND rol NOT IN ('mesera','caja','admin')
 THEN RAISE EXCEPTION 'Tu rol no permite esta operación' USING ERRCODE='42501'; END IF;
 -- Todos los escritores comparten mesa → atención → pedido → incidencia.
 IF p_datos ? 'pedido' THEN
  SELECT mesa_id INTO mesa FROM public.pedidos WHERE pedidos.id=(p_datos->>'pedido')::uuid;
 ELSE mesa:=(p_datos->>'mesa')::bigint; END IF;
 IF mesa IS NOT NULL THEN
  PERFORM 1 FROM public.mesas WHERE mesas.id=mesa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La mesa no existe'; END IF;
  SELECT * INTO a FROM public.atenciones_salon WHERE mesa_id=mesa AND cerrada_en IS NULL FOR UPDATE;
 END IF;
 IF p_datos ? 'pedido' THEN
  SELECT * INTO p FROM public.pedidos WHERE pedidos.id=(p_datos->>'pedido')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe'; END IF;
  IF p.version_cuenta IS DISTINCT FROM (p_datos->>'version')::bigint THEN RAISE EXCEPTION 'La cuenta cambió. Actualiza y revisa sus productos.' USING ERRCODE='40001'; END IF;
  SELECT * INTO i FROM public.incidencias_atencion WHERE pedido_id=p.id AND estado IN ('solicitada','autorizada') FOR UPDATE;
  IF i.id IS NOT NULL AND p_accion NOT IN ('autorizar','rechazar','detener','devolver') THEN RAISE EXCEPTION 'Resuelve primero la incidencia pendiente'; END IF;
 END IF;
 CASE p_accion
 WHEN 'abrir','adicional' THEN
  IF a.id IS NULL THEN
   IF p_accion='adicional' THEN RAISE EXCEPTION 'La atención ya no está abierta'; END IF;
   INSERT INTO public.atenciones_salon(mesa_id,abierta_por) VALUES(mesa,u) RETURNING * INTO a;
  ELSIF p_accion='abrir' THEN RAISE EXCEPTION 'La mesa ya tiene una atención abierta'; END IF;
  IF EXISTS(SELECT 1 FROM public.pedidos WHERE atencion_id=a.id AND estado_pago='pendiente' AND estado<>'cancelado') THEN RAISE EXCEPTION 'Ya existe una cuenta abierta'; END IF;
  -- La implementación anterior comprueba un único pedido activo; las cuentas
  -- pagadas se preservan y la nueva cuenta se crea con los mismos validadores.
  nuevo_id:=gen_random_uuid();
  INSERT INTO public.pedidos(id,cliente_id,creado_por,mesa_id,tipo,estado,notas,comensales,total,subtotal,atencion_id,huella_solicitud)
   VALUES(nuevo_id,NULL,u,mesa,'salon','pendiente','',COALESCE((p_datos->>'comensales')::integer,2),0,0,a.id,md5(op::text));
  UPDATE public.mesas SET estado='ocupada' WHERE mesas.id=mesa;
  IF p_datos->'items' IS NULL OR jsonb_typeof(p_datos->'items')<>'array' OR jsonb_array_length(p_datos->'items')=0 THEN RAISE EXCEPTION 'La comanda debe contener productos'; END IF;
  PERFORM public.modificar_cuenta_atencion(nuevo_id,p_datos->'items',COALESCE(p_datos->>'notas',''));
  resultado:=jsonb_build_object('pedido',nuevo_id,'atencion',a.id);
 WHEN 'editar' THEN
  IF p.tipo<>'salon' OR a.id IS NULL OR p.atencion_id IS DISTINCT FROM a.id THEN RAISE EXCEPTION 'La atención no está abierta'; END IF;
  IF p.cuenta_solicitada THEN RAISE EXCEPTION 'Reabre la cuenta antes de modificarla'; END IF;
  IF p_datos->'items' IS NULL OR jsonb_typeof(p_datos->'items')<>'array' OR jsonb_array_length(p_datos->'items')=0 THEN RAISE EXCEPTION 'Utiliza anular para retirar la comanda completa'; END IF;
  IF p.estado IN ('en_preparacion','listo') AND EXISTS (
   SELECT 1 FROM public.detalles_pedido d LEFT JOIN (SELECT (x->>'id')::bigint producto_id,sum((x->>'qty')::integer) qty FROM jsonb_array_elements(p_datos->'items') x GROUP BY 1) n USING(producto_id)
   WHERE d.pedido_id=p.id AND d.requiere_preparacion AND COALESCE(n.qty,0)<d.cantidad
  ) THEN RAISE EXCEPTION 'Solicita autorización para retirar platos en preparación'; END IF;
  PERFORM public.modificar_cuenta_atencion(p.id,p_datos->'items',p_datos->>'notas');
 WHEN 'solicitar','reabrir' THEN
  IF p.tipo<>'salon' OR a.id IS NULL OR p.estado_pago='pagado' OR p.estado='cancelado' THEN RAISE EXCEPTION 'La cuenta no admite esta acción'; END IF;
  IF p.total<=0 THEN RAISE EXCEPTION 'La cuenta está vacía'; END IF;
  UPDATE public.pedidos SET cuenta_solicitada=(p_accion='solicitar') WHERE pedidos.id=p.id;
 WHEN 'comenzar','listo' THEN
  PERFORM public.cambiar_cocina_base_atenciones(p.id,p.estado,CASE p_accion WHEN 'comenzar' THEN 'en_preparacion' ELSE 'listo' END);
 WHEN 'entregar' THEN
  PERFORM public.entregar_cocina_base_atenciones(p.id,p.actualizado_en);
 WHEN 'cobrar' THEN
  IF p.estado='cancelado' THEN RAISE EXCEPTION 'La cuenta está anulada'; END IF;
  IF p.tipo='salon' AND NOT p.cuenta_solicitada AND COALESCE((p_datos->>'anticipado')::boolean,false)=false THEN RAISE EXCEPTION 'Solicita la cuenta o confirma el cobro anticipado'; END IF;
  -- La función de cobro anterior no admite dos pedidos activos de salón.
  -- Solo se excluyen del conflicto cuentas previamente pagadas de esta atención.
  IF p.tipo='salon' AND EXISTS(SELECT 1 FROM public.pedidos WHERE mesa_id=mesa AND id<>p.id AND estado_pago='pendiente' AND estado NOT IN ('cancelado','entregado')) THEN RAISE EXCEPTION 'Hay otra cuenta pendiente'; END IF;
  resultado:=public.registrar_cobro_atencion(p.id,p_datos->>'metodo',(p_datos->>'recibido')::numeric,op,p.total,p_datos->>'referencia');
 WHEN 'cerrar' THEN
  IF COALESCE((p_datos->>'confirmar_salida')::boolean,false)=false THEN RAISE EXCEPTION 'Confirma que los clientes se retiraron'; END IF;
  IF a.id IS NULL THEN RAISE EXCEPTION 'La atención ya está cerrada'; END IF;
  PERFORM 1 FROM public.pedidos WHERE atencion_id=a.id ORDER BY pedidos.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.pedidos q WHERE q.atencion_id=a.id AND q.estado<>'cancelado'
   AND (q.estado_pago<>'pagado' OR public.tiene_pendientes_cocina(q.id)))
   OR EXISTS(SELECT 1 FROM public.incidencias_atencion x JOIN public.pedidos q ON q.id=x.pedido_id WHERE q.atencion_id=a.id AND x.estado IN ('solicitada','autorizada'))
  THEN RAISE EXCEPTION 'Faltan cobros, entregas o incidencias por resolver'; END IF;
  UPDATE public.atenciones_salon SET cerrada_en=clock_timestamp(),cerrada_por=u WHERE atenciones_salon.id=a.id;
  UPDATE public.mesas SET estado='libre',hora_reserva=NULL,cliente_reserva=NULL,telefono_reserva=NULL,comensales_reserva=NULL WHERE mesas.id=mesa;
  UPDATE public.pedidos SET actualizado_en=clock_timestamp() WHERE atencion_id=a.id;
 WHEN 'confirmar_delivery' THEN
  PERFORM public.confirmar_entrega_delivery(p.id);
 WHEN 'incidencia' THEN
  IF length(COALESCE(motivo,'')) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Escribe un motivo de 5 a 500 caracteres'; END IF;
  IF p.estado='cancelado' THEN RAISE EXCEPTION 'La cuenta ya está anulada'; END IF;
  IF EXISTS(SELECT 1 FROM public.incidencias_atencion WHERE pedido_id=p.id AND tipo='devolucion' AND estado='resuelta') THEN RAISE EXCEPTION 'La devolución ya fue registrada'; END IF;
  tiene:=EXISTS(SELECT 1 FROM public.entregas_cocina WHERE pedido_id=p.id);
  INSERT INTO public.incidencias_atencion(pedido_id,motivo,tipo,solicitada_por)
  VALUES(p.id,motivo,CASE WHEN p.estado_pago='pagado' THEN 'devolucion' WHEN tiene THEN 'consumo_no_cobrado' ELSE 'anulacion' END,u) RETURNING * INTO i;
  IF p.estado='pendiente' AND NOT tiene AND p.estado_pago<>'pagado' THEN
   -- La cancelación temprana se permite a mesera y caja mediante esta función;
   -- la regla de transición de tablas continúa bloqueando accesos directos.
   PERFORM public.cancelar_cuenta_atencion(p.id);
   UPDATE public.incidencias_atencion SET estado='resuelta',resuelta_por=u,resuelta_en=clock_timestamp() WHERE incidencias_atencion.id=i.id;
  END IF;
 WHEN 'autorizar','rechazar' THEN
  IF i.id IS NULL OR i.estado<>'solicitada' THEN RAISE EXCEPTION 'La solicitud ya cambió'; END IF;
  IF p_accion='rechazar' THEN UPDATE public.incidencias_atencion SET estado='rechazada',autorizada_por=u,resuelta_en=clock_timestamp() WHERE incidencias_atencion.id=i.id;
  ELSE
   UPDATE public.incidencias_atencion SET estado='autorizada',autorizada_por=u WHERE incidencias_atencion.id=i.id;
   IF i.tipo='consumo_no_cobrado' THEN
    PERFORM public.cancelar_cuenta_atencion(p.id);
    UPDATE public.incidencias_atencion SET estado='resuelta',resuelta_por=u,resuelta_en=clock_timestamp() WHERE incidencias_atencion.id=i.id;
   END IF;
  END IF;
 WHEN 'detener' THEN
  IF i.id IS NULL OR i.estado<>'autorizada' OR i.tipo NOT IN ('anulacion','devolucion') THEN RAISE EXCEPTION 'Falta autorización de administración'; END IF;
  UPDATE public.pedidos SET cocina_cancelada_en=clock_timestamp() WHERE pedidos.id=p.id;
  IF i.tipo='anulacion' THEN
   PERFORM public.cancelar_cuenta_atencion(p.id);
   UPDATE public.incidencias_atencion SET estado='resuelta',resuelta_por=u,resuelta_en=clock_timestamp() WHERE incidencias_atencion.id=i.id;
  END IF;
 WHEN 'devolver' THEN
  IF i.id IS NULL OR i.estado<>'autorizada' OR i.tipo<>'devolucion' THEN RAISE EXCEPTION 'La devolución no está autorizada'; END IF;
  IF (p_datos->>'importe')::numeric IS DISTINCT FROM p.total OR length(btrim(COALESCE(p_datos->>'referencia','')))<3 THEN RAISE EXCEPTION 'Confirma el importe total devuelto y una referencia'; END IF;
  IF public.tiene_pendientes_cocina(p.id) THEN RAISE EXCEPTION 'Resuelve primero la entrega de cocina'; END IF;
  UPDATE public.incidencias_atencion SET estado='resuelta',importe=p.total,referencia=p_datos->>'referencia',resuelta_por=u,resuelta_en=clock_timestamp() WHERE incidencias_atencion.id=i.id;
  PERFORM public.cancelar_cuenta_atencion(p.id);
 WHEN 'reservar' THEN
  IF a.id IS NOT NULL THEN RAISE EXCEPTION 'La mesa tiene una atención abierta'; END IF;
  PERFORM public.reservar_mesa_salon(mesa,p_datos->>'cliente',p_datos->>'hora',p_datos->>'telefono',(p_datos->>'comensales')::integer);
 WHEN 'cancelar_reserva' THEN
  IF a.id IS NOT NULL THEN RAISE EXCEPTION 'La mesa tiene una atención abierta'; END IF;
  UPDATE public.mesas SET estado='libre',hora_reserva=NULL,cliente_reserva=NULL,telefono_reserva=NULL,comensales_reserva=NULL WHERE mesas.id=mesa AND estado='reservada';
 ELSE RAISE EXCEPTION 'Acción desconocida' USING ERRCODE='22023';
 END CASE;
 resultado:=COALESCE(resultado,jsonb_build_object('ok',true));
 IF mesa IS NOT NULL AND p_accion<>'reservar' THEN
  INSERT INTO public.actividades_salon(mesa_id,mesa_numero,tipo,tipo_color,titulo,descripcion,orden_codigo,creado_por)
  SELECT mesa,numero,'atencion_'||p_accion,CASE WHEN p_accion IN ('incidencia','autorizar','detener','devolver') THEN 'amarillo' ELSE 'verde' END,
   'Mesa '||numero,CASE p_accion WHEN 'abrir' THEN 'Atención abierta' WHEN 'adicional' THEN 'Cuenta adicional abierta' WHEN 'editar' THEN 'Comanda actualizada' WHEN 'solicitar' THEN 'Cuenta solicitada a caja' WHEN 'reabrir' THEN 'Cuenta reabierta; solicitud anterior invalidada' WHEN 'cobrar' THEN 'Cobro confirmado' WHEN 'cerrar' THEN 'Atención cerrada y mesa liberada' WHEN 'entregar' THEN 'Entrega de cocina confirmada' ELSE 'Operación de atención: '||p_accion END,
   COALESCE(p.id::text,nuevo_id::text,''),u FROM public.mesas WHERE mesas.id=mesa;
 END IF;
 INSERT INTO public.operaciones_atencion(id,usuario_id,accion,huella,resultado) VALUES(op,u,p_accion,huella,resultado);
 RETURN resultado;
END;
$$;

-- Las cancelaciones tempranas autorizadas no deben depender del rol del trigger
-- histórico. Una marca privada por transacción solo la escribe esta función.
CREATE TABLE public.cancelaciones_autorizadas_atencion(pedido_id uuid PRIMARY KEY REFERENCES public.pedidos(id),usuario_id uuid NOT NULL,transaccion bigint NOT NULL);
REVOKE ALL ON public.cancelaciones_autorizadas_atencion FROM PUBLIC,anon,authenticated;
ALTER TABLE public.cancelaciones_autorizadas_atencion ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.cancelar_cuenta_atencion(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.cancelaciones_autorizadas_atencion VALUES(p_id,auth.uid(),txid_current()) ON CONFLICT(pedido_id) DO UPDATE SET usuario_id=EXCLUDED.usuario_id,transaccion=EXCLUDED.transaccion;
 UPDATE public.pedidos SET estado='cancelado',cuenta_solicitada=CASE WHEN estado_pago='pagado' THEN cuenta_solicitada ELSE false END WHERE id=p_id;
 DELETE FROM public.cancelaciones_autorizadas_atencion WHERE pedido_id=p_id;
END;
$$;
ALTER FUNCTION public.validar_transicion_cocina() RENAME TO validar_transicion_base_atenciones;
CREATE OR REPLACE FUNCTION public.validar_transicion_cocina() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.estado='cancelado' AND EXISTS(SELECT 1 FROM public.cancelaciones_autorizadas_atencion WHERE pedido_id=NEW.id AND usuario_id=auth.uid() AND transaccion=txid_current()) THEN RETURN NEW; END IF;
 RETURN NEW;
END;
$$;
-- La validación histórica sigue en su trigger. Se agrega la excepción en su
-- cuerpo, conservando todas sus demás transiciones.
DO $patch$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE oid='public.validar_transicion_base_atenciones()'::regprocedure;
 def:=replace(def,'IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;',
 'IF NEW.estado = ''cancelado'' AND EXISTS (SELECT 1 FROM public.cancelaciones_autorizadas_atencion WHERE pedido_id=NEW.id AND usuario_id=auth.uid() AND transaccion=txid_current()) THEN RETURN NEW; END IF; IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;');
 EXECUTE def;
END; $patch$;
DROP FUNCTION public.validar_transicion_cocina();
-- Una devolución total ya ejecutada permite cancelar el estado operativo,
-- conservando importes, pago y comprobante. La marca interna no es accesible al navegador.
DO $patch$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.proteger_pedido_cobrado()'::regprocedure) INTO def;
 def:=replace(def,'BEGIN', 'BEGIN
 IF OLD.estado_pago=''pagado'' AND NEW.estado=''cancelado''
 AND (to_jsonb(NEW)-''estado''-''actualizado_en''-''version_cuenta'')=(to_jsonb(OLD)-''estado''-''actualizado_en''-''version_cuenta'')
 AND (OLD.estado=''cancelado'' OR EXISTS(SELECT 1 FROM public.cancelaciones_autorizadas_atencion WHERE pedido_id=NEW.id AND usuario_id=auth.uid() AND transaccion=txid_current()))
 AND EXISTS(SELECT 1 FROM public.incidencias_atencion WHERE pedido_id=NEW.id AND tipo=''devolucion'' AND estado=''resuelta'' AND importe=OLD.total)
 THEN RETURN NEW; END IF;');
 EXECUTE def;
END; $patch$;
-- El trigger ya referencia la función renombrada por OID.

-- Mismo cobro comprobado; elimina únicamente la incompatibilidad con otras
-- cuentas pagadas de la misma mesa. No cambia contratos de delivery/recojo.
DO $patch$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.registrar_cobro_base_atenciones(uuid,text,numeric,uuid,numeric,text)'::regprocedure) INTO def;
 def:=replace(def,'registrar_cobro_base_atenciones','registrar_cobro_atencion');
 def:=replace(def,'AND estado NOT IN (''entregado'',''cancelado'')','AND estado_pago = ''pendiente'' AND estado NOT IN (''entregado'',''cancelado'')');
 EXECUTE def;
END; $patch$;

CREATE FUNCTION public.flujo_listar(p_pagina integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rol text:=COALESCE(public.rol_actual(),''); resultado jsonb;
BEGIN
 IF auth.uid() IS NULL OR rol NOT IN ('mesera','cocina','caja','admin') THEN RAISE EXCEPTION 'Acceso restringido al personal' USING ERRCODE='42501'; END IF;
 IF p_pagina<0 OR p_pagina IS NULL THEN RAISE EXCEPTION 'Página inválida'; END IF;
 SELECT jsonb_build_object(
 'mesas',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.mesas m),
 'atenciones',(SELECT COALESCE(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM public.atenciones_salon a WHERE cerrada_en IS NULL),
 'actividades',CASE WHEN rol IN ('mesera','caja','admin') THEN (SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT * FROM public.actividades_salon ORDER BY creado_en DESC,id DESC LIMIT 20) x) ELSE '[]'::jsonb END,
 'cuentas',(SELECT COALESCE(jsonb_agg(to_jsonb(p)||jsonb_build_object(
  'items',(SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb) FROM public.detalles_pedido d WHERE pedido_id=p.id),
  'entregas',(SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM public.entregas_cocina e WHERE pedido_id=p.id),
  'historial',(SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.id),'[]'::jsonb) FROM public.historial_estados_pedido h WHERE pedido_id=p.id),
  'pago',CASE WHEN rol IN ('caja','admin') THEN (SELECT to_jsonb(g) FROM public.pagos g WHERE pedido_id=p.id) END,
  'incidencias',(SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.creada_en),'[]'::jsonb) FROM public.incidencias_atencion x WHERE pedido_id=p.id)
 ) ORDER BY p.creado_en DESC),'[]'::jsonb) FROM public.pedidos p
 WHERE p.estado NOT IN ('entregado','cancelado') OR p.atencion_id IN (SELECT id FROM public.atenciones_salon WHERE cerrada_en IS NULL)
 OR p.id IN (SELECT id FROM public.pedidos WHERE estado IN ('entregado','cancelado') ORDER BY creado_en DESC,id DESC LIMIT 50 OFFSET p_pagina*50))
 ) INTO resultado;
 RETURN resultado;
END;
$$;
CREATE FUNCTION public.flujo_sello() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR COALESCE(public.rol_actual(),'') NOT IN ('mesera','cocina','caja','admin') THEN RAISE EXCEPTION 'Acceso restringido' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_array((SELECT count(*) FROM public.pedidos),(SELECT max(actualizado_en) FROM public.pedidos),
  (SELECT count(*) FROM public.atenciones_salon WHERE cerrada_en IS NULL),
  (SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'')) FROM public.mesas m));
END; $$;
CREATE FUNCTION public.flujo_devoluciones(p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR COALESCE(public.rol_actual(),'')<>'admin' THEN RAISE EXCEPTION 'Solo administración puede consultar el resumen' USING ERRCODE='42501'; END IF;
 IF p_desde>p_hasta THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;
 RETURN (SELECT jsonb_build_object('cantidad',count(*),'total',COALESCE(sum(importe),0)) FROM public.incidencias_atencion
 WHERE tipo='devolucion' AND estado='resuelta'
 AND (p_desde IS NULL OR (resuelta_en AT TIME ZONE 'America/Lima')::date>=p_desde)
 AND (p_hasta IS NULL OR (resuelta_en AT TIME ZONE 'America/Lima')::date<=p_hasta));
END; $$;
REVOKE ALL ON FUNCTION public.flujo_devoluciones(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.flujo_devoluciones(date,date) TO authenticated;
-- Nadie puede usar la implementación interna ni las RPC antiguas para saltarse
-- la versión, la solicitud de cuenta o el cierre físico.
REVOKE ALL ON FUNCTION public.registrar_cobro_atencion(uuid,text,numeric,uuid,numeric,text),
 public.cancelar_cuenta_atencion(uuid),public.cerrar_salon_si_completo(uuid),public.notificar_incidencia_atencion(),public.versionar_cuenta_atencion()
 FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.enviar_pedido_cocina(uuid),public.solicitar_cuenta_salon(uuid),public.anular_comanda_salon(bigint,text),public.liberar_mesa_salon(bigint)
 FROM PUBLIC,anon,authenticated;
-- Recojo/delivery continúan aceptando la RPC usada por sus servicios actuales.
CREATE FUNCTION public.registrar_cobro(p_pedido_id uuid,p_metodo text,p_recibido numeric,p_idempotencia uuid,p_total_esperado numeric,p_referencia text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.incidencias_atencion WHERE pedido_id=p_pedido_id AND estado IN ('solicitada','autorizada')) THEN RAISE EXCEPTION 'Resuelve la incidencia pendiente'; END IF;
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE id=p_pedido_id AND tipo='salon') THEN RAISE EXCEPTION 'Utiliza el flujo de atención y la versión de cuenta'; END IF;
 RETURN public.registrar_cobro_base_atenciones(p_pedido_id,p_metodo,p_recibido,p_idempotencia,p_total_esperado,p_referencia);
END;
$$;
-- Cocina histórica no altera las reglas del cliente; el flujo local usa RPC v2.
CREATE FUNCTION public.cambiar_estado_cocina(p_pedido_id uuid,p_estado_actual text,p_nuevo_estado text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.incidencias_atencion WHERE pedido_id=p_pedido_id AND estado IN ('solicitada','autorizada')) THEN RAISE EXCEPTION 'Resuelve la incidencia pendiente'; END IF;
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE id=p_pedido_id AND tipo='salon') THEN RAISE EXCEPTION 'Utiliza el flujo de atención'; END IF;
 RETURN public.cambiar_cocina_base_atenciones(p_pedido_id,p_estado_actual,p_nuevo_estado);
END; $$;
CREATE FUNCTION public.entregar_pedido_cocina(p_pedido_id uuid,p_actualizado_en timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.incidencias_atencion WHERE pedido_id=p_pedido_id AND estado IN ('solicitada','autorizada')) THEN RAISE EXCEPTION 'Resuelve la incidencia pendiente'; END IF;
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE id=p_pedido_id AND tipo='salon') THEN RAISE EXCEPTION 'Utiliza el flujo de atención'; END IF;
 RETURN public.entregar_cocina_base_atenciones(p_pedido_id,p_actualizado_en);
END; $$;
REVOKE ALL ON FUNCTION public.flujo_operar(text,jsonb),public.flujo_listar(integer),public.flujo_sello(),public.registrar_cobro(uuid,text,numeric,uuid,numeric,text),
 public.cambiar_estado_cocina(uuid,text,text),public.entregar_pedido_cocina(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.flujo_operar(text,jsonb),public.flujo_listar(integer),public.flujo_sello(),public.registrar_cobro(uuid,text,numeric,uuid,numeric,text),
 public.cambiar_estado_cocina(uuid,text,text),public.entregar_pedido_cocina(uuid,timestamptz) TO authenticated;
COMMIT;
