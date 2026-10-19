BEGIN;
-- Precios: página 11 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Sopa a la minuta de pollo', ARRAY['sopa a la minuta de pollo','sopa a la minuta de pollo']::text[], 'Sopa a la minuta con pollo deshilachado y fideos.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Sopa_a_la_minuta_de_pollo.png', 12.00),
    ('Sopa a la minuta de carne', ARRAY['sopa a la minuta de carne','sopa a la minuta de carne']::text[], 'Sopa a la minuta con carne, fideos y huevo.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Sopa_a_la_minuta_de_carne.png', 12.00),
    ('Sopa criolla de pollo', ARRAY['sopa criolla de pollo','sopa criolla de pollo']::text[], 'Sopa criolla de pollo con fideos y acompañamientos.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Sopa_criolla_de_pollo.png', 12.00),
    ('Sopa criolla de carne', ARRAY['sopa criolla de carne','sopa criolla de carne']::text[], 'Sopa criolla de carne con fideos y acompañamientos.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Sopa_criolla_de_carne.png', 12.00),
    ('Sustancia de pollo', ARRAY['sustancia de pollo','sustancia de pollo']::text[], 'Caldo con pollo, fideos y verduras.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Sustancia_de_pollo.png', 12.00),
    ('Sustancia de carne', ARRAY['sustancia de carne','sustancia de carne']::text[], 'Caldo con trozos de carne, fideos y verduras.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Sustancia_de_carne.png', 12.00),
    ('Dieta de pollo', ARRAY['dieta de pollo','dieta de pollo']::text[], 'Caldo de pollo con zanahoria, papa y verduras.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Dieta_de_pollo.png', 12.00),
    ('Sopa wantán', ARRAY['sopa wantán','sopa wantan']::text[], 'Sopa con wantanes, fideos y verduras al estilo chifa.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Sopa_wantan.png', 12.00),
    ('Caldo completo', ARRAY['caldo completo','caldo completo']::text[], 'Caldo con presa de pollo, papa, huevo y fideos.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Caldo_completo.png', 12.00),
    ('Caldo solo', ARRAY['caldo solo','caldo solo']::text[], 'Caldo caliente con hierbas, sin los acompañamientos del caldo completo.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377259/Caldo_solo.png', 8.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='sopas',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('sopas',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
