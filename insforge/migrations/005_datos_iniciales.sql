BEGIN;
INSERT INTO public.categorias(id,nombre) VALUES
('pollos','Pollos a la Leña'),
('parrillas','Parrillas'),
('entradas','Entradas'),
('bebidas','Bebidas')
ON CONFLICT DO NOTHING;
INSERT INTO public.productos(id,categoria_id,nombre,descripcion,imagen,precio,disponible) VALUES
(1,'pollos','Pollo a la brasa entero','Pollo entero marinado 24h a fuego de leña. Incluye papas fritas y ensalada clásica.','https://res.cloudinary.com/msprqskb/image/upload/v1789258510/pollo-entero.png',42.9,true),
(2,'pollos','1/2 Pollo a la brasa','Medio pollo dorado a la leña, servido con papas crujientes y cremas de la casa.','https://res.cloudinary.com/msprqskb/image/upload/v1789258510/medio-pollo.png',24.9,true),
(3,'pollos','1/4 Pollo a la brasa','Porción individual clásica con papas fritas doradas y salsas caseras.','https://res.cloudinary.com/msprqskb/image/upload/v1789258508/cuarto-pollo.png',14.9,true),
(4,'pollos','Pechuga a la brasa','Jugosa pechuga a la leña servida con ensalada fresca y guarnición de papas.','https://res.cloudinary.com/msprqskb/image/upload/v1789258510/pechuga-brasa.png',26.9,true),
(5,'pollos','Alitas BBQ (6 und)','Alitas glaseadas en salsa barbacoa artesanal con toque ahumado.','https://res.cloudinary.com/msprqskb/image/upload/v1789258510/alitas-bbq.png',18.9,true),
(6,'pollos','Alitas picantes (6 und)','Alitas crocantes bañadas en salsa picante especial de rocoto y miel.','https://res.cloudinary.com/msprqskb/image/upload/v1789258511/alitas-picantes.png',18.9,true),
(7,'parrillas','Anticucho de corazón','Dos palitos de corazón tierno macerado en ají panca con choclo y papas.','https://res.cloudinary.com/msprqskb/image/upload/v1789258511/anticuchos.png',16.9,true),
(8,'entradas','Papa frita familiar','Papas nativas amarillas doraditas y crocantes en porción para compartir.','https://res.cloudinary.com/msprqskb/image/upload/v1789258510/papa-frita-familiar.png',12.9,true),
(9,'entradas','Ensalada familiar','Mix de lechugas, tomate, palta y vinagreta clásica de pollería.','https://res.cloudinary.com/msprqskb/image/upload/v1789258509/ensalada-familiar.png',12.9,true),
(10,'entradas','Arroz chaufa familiar','Chaufa ahumado al wok con cebollita china, huevo y toques de pollo.','https://res.cloudinary.com/msprqskb/image/upload/v1789258511/arroz-chaufa-familiar.png',15.9,true),
(11,'entradas','Maduro frito','Plátano maduro frito en láminas caramelizadas.','https://res.cloudinary.com/msprqskb/image/upload/v1789258509/maduro-frito.png',9.9,true),
(12,'entradas','Yuca frita con cremas','Bastones de yuca crocantes con crema huancaína y ocopa.','https://res.cloudinary.com/msprqskb/image/upload/v1789258510/yuca-frita-cremas.png',9.9,true),
(13,'bebidas','Inca Kola 1.5 L','Gaseosa Inca Kola bien helada en botella de 1.5 litros.','https://res.cloudinary.com/msprqskb/image/upload/v1789258508/inca-kola-1-5l-v2.png',11.9,true),
(14,'bebidas','Inca Kola 500 ml','Gaseosa personal bien fría para acompañar tu plato.','https://res.cloudinary.com/msprqskb/image/upload/v1789258509/inca-kola-500ml-v2.png',5.5,true),
(15,'bebidas','Coca-Cola 1.5 L','Gaseosa Coca-Cola clásica de 1.5 litros.','https://res.cloudinary.com/msprqskb/image/upload/v1789258508/coca-cola-1-5l-v2.png',11.9,true),
(16,'bebidas','Coca-Cola 500 ml','Gaseosa personal clásica helada.','https://res.cloudinary.com/msprqskb/image/upload/v1789258509/coca-cola-500ml-v2.png',5.5,true),
(17,'bebidas','Chicha Morada 1 L','Jarra de chicha morada natural con canela, clavo y limón.','https://res.cloudinary.com/msprqskb/image/upload/v1789258509/chicha-morada.png',10,true)
ON CONFLICT DO NOTHING;
INSERT INTO public.mesas(id,numero,capacidad,forma,zona) VALUES
(1,'01',2,'redonda','salon_principal'),
(2,'02',4,'cuadrada','salon_principal'),
(3,'03',4,'redonda','salon_principal'),
(4,'04',4,'cuadrada','salon_principal'),
(5,'05',4,'redonda','salon_principal'),
(6,'06',4,'cuadrada','salon_principal'),
(7,'07',6,'redonda_grande','salon_principal'),
(8,'08',4,'cuadrada','salon_principal'),
(9,'09',2,'redonda','salon_principal'),
(10,'10',4,'cuadrada','salon_principal'),
(11,'11',6,'redonda_grande','terraza'),
(12,'12',4,'cuadrada','terraza'),
(13,'13',6,'rectangular','terraza'),
(14,'14',4,'cuadrada','terraza'),
(15,'15',4,'redonda','segundo_piso'),
(16,'16',8,'banquete','segundo_piso')
ON CONFLICT DO NOTHING;
COMMIT;
