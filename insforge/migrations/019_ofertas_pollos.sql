BEGIN;
-- Combos de la página 1 de la carta. No sustituirlos por el pollo entero sin bebida.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Oferta', ARRAY['oferta']::text[], 'Un pollo entero a la brasa con papas fritas, ensalada fresca de lechuga, tomate y cebolla, y gaseosa de 1.5 L.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/Oferta.png', 61.00),
    ('Ofertón', ARRAY['ofertón','oferton']::text[], 'Un pollo entero más un cuarto de pollo a la brasa, acompañados de papas fritas, ensalada fresca y gaseosa de 1.5 L.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/Oferton.png', 66.00),
    ('Súper Ofertón', ARRAY['súper ofertón','super ofertón','súper oferton','super oferton','super_oferton']::text[], 'Un pollo entero más medio pollo a la brasa, con papas fritas, ensalada fresca de lechuga, tomate y cebolla, y gaseosa de 1.5 L.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/Super_oferton.png', 76.00)
  ) AS data(nombre, aliases, descripcion, imagen, precio)
  LOOP
    SELECT count(*), min(id) INTO matches, product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Hay más de un producto equivalente a %; revisar duplicados sin borrar referencias de pedidos.', menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id = 'pollos', nombre = menu.nombre,
        descripcion = menu.descripcion, imagen = menu.imagen, precio = menu.precio
      WHERE id = product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('pollos',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
