BEGIN;
-- Precios: página 5 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Parrilla personal', ARRAY['parrilla personal','parrilla personal']::text[], 'Un palito de anticucho, churrasco, chuleta, chorizo y un octavo de pollo, con papas fritas y ensalada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377283/Parrilla_personal.png', 40.00),
    ('Parrilla para 2', ARRAY['parrilla para 2','parrilla para 2']::text[], 'Anticucho, churrasco, chuleta, chorizo, hot dog, un cuarto de pollo y molleja, con papas fritas, ensalada y jarra de chicha morada o gaseosa de 1 L.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377283/Parrilla_para_2.png', 60.00),
    ('Parrilla familiar', ARRAY['parrilla familiar','parrilla familiar']::text[], 'Dos palitos de anticucho, churrasco, chuleta, dos chorizos, dos hot dogs, medio pollo y molleja, con papas fritas, ensalada y jarra de chicha morada o gaseosa de 1.5 L.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377283/Parrilla_familiar.png', 90.00)
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
