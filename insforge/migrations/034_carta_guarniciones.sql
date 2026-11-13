BEGIN;
-- Precios: página 12 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Porción de papas fritas', ARRAY['porción de papas fritas','porcion de papas fritas','papa frita familiar']::text[], 'Porción de papas fritas doradas.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377264/Porcion_de_papas_fritas.png', 18.00),
    ('Porción de ensalada', ARRAY['porción de ensalada','porcion de ensalada','ensalada familiar']::text[], 'Porción de ensalada fresca para acompañar tus platos.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377264/Porcion_de_ensalada.png', 5.00),
    ('Porción de arroz blanco', ARRAY['porción de arroz blanco','porcion de arroz blanco']::text[], 'Porción de arroz blanco para acompañar tus platos.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377264/Porcion_de_arroz_blanco.png', 4.00),
    ('Porción de arroz chaufa', ARRAY['porción de arroz chaufa','porcion de arroz chaufa','arroz chaufa familiar']::text[], 'Porción de arroz chaufa para acompañar tus platos.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377264/Porcion_de_arroz_chaufa.png', 5.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='guarniciones',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('guarniciones',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
