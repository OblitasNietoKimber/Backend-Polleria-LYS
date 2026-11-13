BEGIN;
-- Precios: página 6 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Mixto 1', ARRAY['mixto 1','mixto 1']::text[], 'Anticucho, chorizo y mollejita a la parrilla, acompañados de papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377284/Mixto_1.png', 25.00),
    ('Mixto 2', ARRAY['mixto 2','mixto 2']::text[], 'Anticucho, chorizo y pechuga a la parrilla, con papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377284/Mixto_2.png', 27.00),
    ('Mixto 3', ARRAY['mixto 3','mixto 3']::text[], 'Pechuga y bistec a la parrilla, acompañados de papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377284/Mixto_3.png', 27.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='parrillas',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('parrillas',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
