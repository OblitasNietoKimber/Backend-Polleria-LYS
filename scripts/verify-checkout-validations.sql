-- Inspección sin escrituras, usuarios nuevos ni pedidos de prueba.
SELECT jsonb_build_object(
  'direccion_maximo_150', strpos(pg_get_functiondef('public.crear_pedido_cliente(uuid,text,jsonb,jsonb,text)'::regprocedure), 'char_length(datos_entrega->>''address'') > 150') > 0,
  'referencia_maximo_150', strpos(pg_get_functiondef('public.crear_pedido_cliente(uuid,text,jsonb,jsonb,text)'::regprocedure), 'char_length(datos_entrega->>''reference'') > 150') > 0,
  'nombre_valido', public.nombre_persona_valido('María Torres López',7),
  'nombre_con_numeros_rechazado', NOT public.nombre_persona_valido('Cliente123',7),
  'nombre_largo_rechazado', NOT public.nombre_persona_valido(repeat('a',121),7),
  'ubicacion_valida', public.punto_en_carabayllo(-11.88,-77.03),
  'ubicacion_fuera_rechazada', NOT public.punto_en_carabayllo(-11.94,-77.08),
  'perfil_trigger_activo', EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.perfiles'::regclass AND tgname='perfil_datos_validos' AND tgenabled='O'),
  'rpc_cliente_permitida', has_function_privilege('authenticated','public.crear_pedido_cliente(uuid,text,jsonb,jsonb,text)','EXECUTE'),
  'rpc_anon_bloqueada', NOT has_function_privilege('anon','public.crear_pedido_cliente(uuid,text,jsonb,jsonb,text)','EXECUTE'),
  'funcion_interna_bloqueada', NOT has_function_privilege('authenticated','public.crear_pedido_cliente_validacion_base(uuid,text,jsonb,jsonb,text)','EXECUTE'),
  'cambio_rol_bloqueado', NOT has_column_privilege('authenticated','public.perfiles','rol','UPDATE')
) AS verificacion;
