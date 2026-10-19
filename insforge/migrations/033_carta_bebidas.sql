BEGIN;
-- Precios: página 12 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Café', ARRAY['café','cafe']::text[], 'Taza de café caliente.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Cafe.png', 3.00),
    ('Té', ARRAY['té','te']::text[], 'Taza de té caliente.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Te.png', 2.00),
    ('Infusión de anís', ARRAY['infusión de anís','infusion de anis']::text[], 'Infusión caliente de anís.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Infusion_de_anis.png', 2.00),
    ('Manzanilla', ARRAY['manzanilla','manzanilla']::text[], 'Infusión caliente de manzanilla.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Manzanilla.png', 2.00),
    ('Gaseosa gordita', ARRAY['gaseosa gordita','gaseosa gordita botella']::text[], 'Gaseosa en presentación gordita.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Gaseosa_gordita_botella.png', 5.00),
    ('Gaseosa de 1 L', ARRAY['gaseosa de 1 l','gaseosa de un litro botella']::text[], 'Gaseosa en botella de un litro.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Gaseosa_de_un_litro_botella.png', 7.00),
    ('Jarra de chicha morada', ARRAY['jarra de chicha morada','jarra de chicha morada','chicha morada 1 l']::text[], 'Jarra de chicha morada refrescante.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Jarra_de_chicha_morada.png', 15.00),
    ('Jarra de limonada', ARRAY['jarra de limonada','jarra de limonada']::text[], 'Jarra de limonada refrescante.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Jarra_de_limonada.png', 12.00),
    ('Limonada frozen', ARRAY['limonada frozen','limonada frozen']::text[], 'Limonada frozen de textura helada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Limonada_frozen.png', 15.00),
    ('Cerveza rubia', ARRAY['cerveza rubia','cerveza rubia']::text[], 'Cerveza rubia en botella.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Cerveza_rubia.png', 9.00),
    ('Cerveza negra', ARRAY['cerveza negra','cerveza negra']::text[], 'Cerveza negra en botella.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377263/Cerveza_negra.png', 11.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='bebidas',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('bebidas',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
-- El usuario pidió conservar nombres e imágenes de ambas marcas.
UPDATE public.productos SET precio=3.00 WHERE id IN (14,16) AND categoria_id='bebidas';
-- El usuario pidió conservar nombres e imágenes de ambas marcas.
UPDATE public.productos SET precio=10.00 WHERE id IN (13,15) AND categoria_id='bebidas';
COMMIT;
