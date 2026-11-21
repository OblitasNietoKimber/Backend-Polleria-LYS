BEGIN;
-- Precios: página 10 de la carta entregada por el usuario.
DO $$
DECLARE menu record; product_id bigint; matches integer;
BEGIN
  FOR menu IN SELECT * FROM (VALUES
    ('Lomo saltado', ARRAY['lomo saltado','lomo saltado con papas y arroz blanco']::text[], 'Lomo de res saltado con cebolla y tomate, acompañado de papas fritas y arroz blanco.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Lomo_saltado_con_papas_y_arroz_blanco.png', 22.00),
    ('Pollo saltado', ARRAY['pollo saltado','pollo saltado']::text[], 'Pollo saltado con cebolla y tomate, acompañado de papas fritas y arroz blanco.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Pollo_saltado.png', 20.00),
    ('Tallarín saltado de pollo', ARRAY['tallarín saltado de pollo','tallarin saltado de pollo']::text[], 'Tallarines saltados con trozos de pollo y verduras.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Tallarin_saltado_de_pollo.png', 20.00),
    ('Tallarín saltado de carne', ARRAY['tallarín saltado de carne','tallarin saltado de carne']::text[], 'Tallarines saltados con carne de res y verduras.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Tallarin_saltado_de_carne.png', 22.00),
    ('Bistec', ARRAY['bistec','bistec']::text[], 'Bistec de res con cebolla y tomate, acompañado de papas fritas y arroz blanco.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Bistec.png', 22.00),
    ('Bistec a lo pobre', ARRAY['bistec a lo pobre','bistec a lo pobre']::text[], 'Bistec de res con plátano frito, huevo frito, papas y arroz.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Bistec_a_lo_pobre.png', 27.00),
    ('Chuleta a lo pobre', ARRAY['chuleta a lo pobre','chuleta a lo pobre']::text[], 'Chuleta acompañada de plátano frito, huevo frito, papas y arroz.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Chuleta_a_lo_pobre.png', 25.00),
    ('Churrasco a lo pobre', ARRAY['churrasco a lo pobre','churrasco a lo pobre']::text[], 'Churrasco de res con plátano frito, huevo frito, papas y arroz.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Churrasco_a_lo_pobre.png', 27.00),
    ('Pechuga a lo pobre', ARRAY['pechuga a lo pobre','pechuga a lo pobre']::text[], 'Pechuga de pollo con plátano frito, huevo frito, papas y arroz.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Pechuga_a_lo_pobre.png', 25.00),
    ('1/4 Pollo a lo pobre', ARRAY['1/4 pollo a lo pobre','cuarto de pollo a lo pobre']::text[], 'Un cuarto de pollo acompañado de plátano frito, huevo frito, papas y arroz.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Cuarto_de_pollo_a_lo_pobre.png', 22.00),
    ('Tallarines verdes con churrasco', ARRAY['tallarines verdes con churrasco','tallarines verdes con churrasco']::text[], 'Tallarines verdes acompañados de churrasco de res.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Tallarines_verdes_con_churrasco.png', 25.00),
    ('Milanesa a lo pobre', ARRAY['milanesa a lo pobre','milanesa a lo pobre']::text[], 'Milanesa crocante con plátano frito, huevo frito, papas y arroz.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Milanesa_a_lo_pobre.png', 25.00),
    ('Pierna deshuesada a lo pobre', ARRAY['pierna deshuesada a lo pobre','pierna deshuesada a lo pobre']::text[], 'Pierna deshuesada con plátano frito, huevo frito, papas y arroz.', 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377276/Pierna_deshuesada_a_lo_pobre.png', 25.00)
  ) AS data(nombre,aliases,descripcion,imagen,precio)
  LOOP
    SELECT count(*),min(id) INTO matches,product_id FROM public.productos
    WHERE lower(btrim(nombre)) = ANY(menu.aliases) OR imagen = menu.imagen;
    IF matches > 1 THEN
      RAISE EXCEPTION 'Coincidencias ambiguas para %; revisar sin borrar productos vinculados a pedidos.',menu.nombre;
    ELSIF matches = 1 THEN
      UPDATE public.productos SET categoria_id='especialidades',nombre=menu.nombre,
        descripcion=menu.descripcion,imagen=menu.imagen,precio=menu.precio WHERE id=product_id;
    ELSE
      INSERT INTO public.productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
      VALUES ('especialidades',menu.nombre,menu.descripcion,menu.imagen,menu.precio,true);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
