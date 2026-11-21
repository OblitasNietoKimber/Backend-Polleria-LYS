BEGIN;

CREATE OR REPLACE FUNCTION public.hora_lima_reservas()
RETURNS time LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT (statement_timestamp() AT TIME ZONE 'America/Lima')::time $$;

REVOKE EXECUTE ON FUNCTION public.hora_lima_reservas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hora_lima_reservas() TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_reserva_mesa()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_nombre text := regexp_replace(btrim(normalize(NEW.cliente_reserva, NFC)), ' +', ' ', 'g');
  v_hora time;
BEGIN
  IF v_nombre IS NULL OR char_length(v_nombre) NOT BETWEEN 2 AND 120
     OR NEW.cliente_reserva ~ '[[:cntrl:]]'
     OR v_nombre !~ '^[[:alpha:]]+([ ''’-][[:alpha:]]+)*$' THEN
    RAISE EXCEPTION 'Nombre inválido: usa de 2 a 120 caracteres entre letras, espacios, guiones y apóstrofes'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.hora_reserva IS NULL OR NEW.hora_reserva !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Ingresa una hora válida para la reserva' USING ERRCODE = '22023';
  END IF;

  v_hora := NEW.hora_reserva::time;
  IF v_hora < TIME '12:00' OR v_hora >= TIME '23:00' THEN
    RAISE EXCEPTION 'Elige una hora dentro del horario de atención, de 12:00 p. m. hasta antes de las 11:00 p. m.'
      USING ERRCODE = '22023';
  END IF;

  IF v_hora <= public.hora_lima_reservas() THEN
    RAISE EXCEPTION 'Elige una hora posterior a la actual en Lima. Las reservas son para hoy'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.comensales_reserva IS NULL OR NEW.comensales_reserva NOT BETWEEN 1 AND NEW.capacidad THEN
    RAISE EXCEPTION 'Ingresa entre 1 y % comensales para esta mesa', NEW.capacidad USING ERRCODE = '22023';
  END IF;

  NEW.telefono_reserva := nullif(replace(NEW.telefono_reserva, ' ', ''), '');
  IF NEW.telefono_reserva IS NOT NULL AND NEW.telefono_reserva !~ '^9[0-9]{8}$' THEN
    RAISE EXCEPTION 'El celular debe comenzar con 9 y tener 9 dígitos' USING ERRCODE = '22023';
  END IF;

  NEW.cliente_reserva := v_nombre;
  RETURN NEW;
END;
$$;

-- Protege las reservas desde ambas RPC y en escrituras directas a la tabla.
CREATE OR REPLACE TRIGGER mesa_reserva_valida
BEFORE INSERT OR UPDATE OF estado, cliente_reserva, hora_reserva, comensales_reserva, telefono_reserva ON public.mesas
FOR EACH ROW WHEN (NEW.estado = 'reservada')
EXECUTE FUNCTION public.validar_reserva_mesa();

REVOKE EXECUTE ON FUNCTION public.validar_reserva_mesa() FROM PUBLIC, anon, authenticated;

COMMIT;
