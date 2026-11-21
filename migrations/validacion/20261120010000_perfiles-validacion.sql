-- Borrador local: no aplicar al backend compartido sin revisar compatibilidad.
CREATE FUNCTION public.normalizar_nombre_persona(p_valor text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog
AS $$ SELECT regexp_replace(btrim(normalize(p_valor, NFC)), ' +', ' ', 'g') $$;

CREATE FUNCTION public.nombre_persona_valido(p_valor text, p_minimo integer DEFAULT 2)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT p_valor IS NOT NULL
    AND char_length(public.normalizar_nombre_persona(p_valor)) BETWEEN p_minimo AND 120
    AND p_valor !~ '[[:cntrl:]]'
    AND public.normalizar_nombre_persona(p_valor) ~ '^[[:alpha:]]+([ ''’-][[:alpha:]]+)*$'
$$;

REVOKE ALL ON FUNCTION public.normalizar_nombre_persona(text), public.nombre_persona_valido(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalizar_nombre_persona(text), public.nombre_persona_valido(text,integer) TO authenticated;

CREATE FUNCTION public.validar_perfil_personal()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_user IN ('anon','authenticated') AND
     (NEW.id IS DISTINCT FROM OLD.id OR NEW.rol IS DISTINCT FROM OLD.rol OR NEW.creado_en IS DISTINCT FROM OLD.creado_en) THEN
    RAISE EXCEPTION 'No puedes modificar los permisos ni la identidad del perfil' USING ERRCODE = '42501';
  END IF;

  -- El alta nativa puede crear un perfil provisional sin apellido/teléfono.
  -- Los datos no vacíos del alta y los campos personales que se editen deben ser válidos.
  IF (TG_OP = 'INSERT' AND NEW.nombre <> '') OR (TG_OP = 'UPDATE' AND NEW.nombre IS DISTINCT FROM OLD.nombre) THEN
    IF public.nombre_persona_valido(NEW.nombre) IS NOT TRUE THEN
      RAISE EXCEPTION 'Nombre inválido: usa letras, espacios, guiones o apóstrofes (2 a 120 caracteres)' USING ERRCODE = '22023';
    END IF;
    NEW.nombre := public.normalizar_nombre_persona(NEW.nombre);
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.apellido <> '') OR (TG_OP = 'UPDATE' AND NEW.apellido IS DISTINCT FROM OLD.apellido) THEN
    IF public.nombre_persona_valido(NEW.apellido) IS NOT TRUE THEN
      RAISE EXCEPTION 'Apellido inválido: usa letras, espacios, guiones o apóstrofes (2 a 120 caracteres)' USING ERRCODE = '22023';
    END IF;
    NEW.apellido := public.normalizar_nombre_persona(NEW.apellido);
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.telefono <> '') OR (TG_OP = 'UPDATE' AND NEW.telefono IS DISTINCT FROM OLD.telefono) THEN
    IF NEW.telefono IS NULL OR NEW.telefono !~ '^9[0-9]{8}$' THEN
      RAISE EXCEPTION 'El celular debe comenzar con 9 y tener 9 dígitos' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.preferencias IS DISTINCT FROM OLD.preferencias THEN
    IF jsonb_typeof(NEW.preferencias) IS DISTINCT FROM 'object' OR
       (NEW.preferencias - 'notificacionesEmail' - 'notificacionesPromos') <> '{}'::jsonb OR
       (NEW.preferencias ? 'notificacionesEmail' AND jsonb_typeof(NEW.preferencias->'notificacionesEmail') <> 'boolean') OR
       (NEW.preferencias ? 'notificacionesPromos' AND jsonb_typeof(NEW.preferencias->'notificacionesPromos') <> 'boolean') THEN
      RAISE EXCEPTION 'Preferencias inválidas' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER perfil_datos_validos BEFORE INSERT OR UPDATE ON public.perfiles
FOR EACH ROW EXECUTE FUNCTION public.validar_perfil_personal();
REVOKE ALL ON FUNCTION public.validar_perfil_personal() FROM PUBLIC, anon, authenticated;

-- Revocar el permiso de tabla es necesario aunque existan permisos por columna.
REVOKE INSERT, UPDATE, DELETE ON public.perfiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE(id,nombre,apellido,telefono,rol,preferencias,creado_en) ON public.perfiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE(nombre,apellido,telefono,preferencias) ON public.perfiles TO authenticated;
NOTIFY pgrst, 'reload schema';
