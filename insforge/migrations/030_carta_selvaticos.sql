BEGIN;
-- Precios: página 9 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Tacacho y cecina', ARRAY['tacacho y cecina','tacacho y cecina']::text[], 'Tacacho acompañado de cecina dorada.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377271/Tacacho_y_cecina.png', 10.00),
    ('Tacacho, cecina y chorizo', ARRAY['tacacho, cecina y chorizo','tacacho cecina y chorizo']::text[], 'Tacacho servido con cecina y chorizo.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377271/Tacacho_cecina_y_chorizo.png', 15.00),
    ('Dos tacachos y doble cecina', ARRAY['dos tacachos y doble cecina','dos tacachos y doble cecina']::text[], 'Dos tacachos acompañados de doble porción de cecina.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377271/Dos_tacachos_y_doble_cecina.png', 22.00),
    ('Doble tacacho, doble cecina y dos chorizos', ARRAY['doble tacacho, doble cecina y dos chorizos','doble tacacho doble cecina y dos chorizos']::text[], 'Dos tacachos con doble cecina y dos chorizos.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377271/Doble_tacacho_doble_cecina_y_dos_chorizos.png', 25.00),
    ('Festival selvático familiar', ARRAY['festival selvático familiar','festival selvatico familiar']::text[], 'Festival familiar de tacacho, cecina, chorizo, arroz chaufa, plátano y huevo frito.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377271/Festival_selvatico_familiar.png', 45.00),
    ('Festival selvático personal', ARRAY['festival selvático personal','festival selvatico personal']::text[], 'Festival personal de tacacho, cecina, chorizo, arroz chaufa, plátano y huevo frito.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377271/Festival_selvatico_personal.png', 25.00),
    ('Chaufa amazónico', ARRAY['chaufa amazónico','chaufa amazonico con cecina chorizo y platano frito']::text[], 'Arroz chaufa amazónico con cecina, chorizo y plátano frito.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377271/Chaufa_amazonico_con_cecina_chorizo_y_platano_frito.png', 25.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='selvaticos',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('selvaticos',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
