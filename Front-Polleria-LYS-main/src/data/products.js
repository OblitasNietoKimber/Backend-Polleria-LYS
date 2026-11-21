// Base de pollos enteros preparados/estimados (~70)
export const STOCK_POLLO_ENTERO = 70;

export const PRODUCT_STOCKS = {
  // Pollos a la brasa calculados a partir de los 70 pollos enteros base:
  1: STOCK_POLLO_ENTERO,                    // Pollo a la brasa entero: 70
  2: Math.round(STOCK_POLLO_ENTERO * 0.5),  // 1/2 Pollo a la brasa: 35 (la mitad de 70)
  3: Math.round(STOCK_POLLO_ENTERO * 0.25), // 1/4 Pollo a la brasa: 18 (cuarta parte de 70)
  4: Math.round(STOCK_POLLO_ENTERO * 0.25), // Pechuga a la brasa: 18 (cuarta parte de 70)

  // Parrillas y piqueos
  5: 40, // Alitas BBQ (6 und)
  6: 40, // Alitas picantes (6 und)
  7: 35, // Anticucho de corazón

  // Guarniciones familiares
  8: 120, // Papa frita familiar
  9: 100, // Ensalada familiar
  10: 70, // Arroz chaufa familiar
  11: 40, // Maduro frito
  12: 45, // Yuca frita con cremas

  // Bebidas
  13: 50, // Inca Kola 1.5 L
  14: 75, // Inca Kola 500 ml
  15: 45, // Coca-Cola 1.5 L
  16: 60, // Coca-Cola 500 ml
  17: 30, // Chicha Morada 1 L
};

export function getProductStock(productOrId) {
  if (!productOrId) return 0;
  if (typeof productOrId === 'object' && productOrId.stock !== undefined && productOrId.stock !== null) {
    return Number(productOrId.stock);
  }
  return 0; // Sin existencias del servidor, no inventar un saldo disponible.
}

export const PRODUCTS = [
  // --- Pollos a la Brasa ---
  {
    id: 1,
    category: 'pollos',
    name: 'Pollo a la brasa entero',
    price: 42.90,
    available: true,
    stock: PRODUCT_STOCKS[1],
    desc: 'Pollo entero marinado 24h a fuego de leña. Incluye papas fritas y ensalada clásica.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258510/pollo-entero.png',
  },
  {
    id: 2,
    category: 'pollos',
    name: '1/2 Pollo a la brasa',
    price: 24.90,
    available: true,
    stock: PRODUCT_STOCKS[2],
    desc: 'Medio pollo dorado a la leña, servido con papas crujientes y cremas de la casa.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258510/medio-pollo.png',
  },
  {
    id: 3,
    category: 'pollos',
    name: '1/4 Pollo a la brasa',
    price: 14.90,
    available: true,
    stock: PRODUCT_STOCKS[3],
    desc: 'Porción individual clásica con papas fritas doradas y salsas caseras.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258508/cuarto-pollo.png',
  },
  {
    id: 4,
    category: 'pollos',
    name: 'Pechuga a la brasa',
    price: 26.90,
    available: true,
    stock: PRODUCT_STOCKS[4],
    desc: 'Jugosa pechuga a la leña servida con ensalada fresca y guarnición de papas.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258510/pechuga-brasa.png',
  },
  {
    id: 5,
    category: 'pollos',
    name: 'Alitas BBQ (6 und)',
    price: 18.90,
    available: true,
    stock: PRODUCT_STOCKS[5],
    desc: 'Alitas glaseadas en salsa barbacoa artesanal con toque ahumado.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258510/alitas-bbq.png',
  },
  {
    id: 6,
    category: 'pollos',
    name: 'Alitas picantes (6 und)',
    price: 18.90,
    available: true,
    stock: PRODUCT_STOCKS[6],
    desc: 'Alitas crocantes bañadas en salsa picante especial de rocoto y miel.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258511/alitas-picantes.png',
  },

  // --- Parrillas ---
  {
    id: 7,
    category: 'parrillas',
    name: 'Anticucho de corazón',
    price: 16.90,
    available: true,
    stock: PRODUCT_STOCKS[7],
    desc: 'Dos palitos de corazón tierno macerado en ají panca con choclo y papas.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258511/anticuchos.png',
  },

  // --- Entradas ---
  {
    id: 8,
    category: 'entradas',
    name: 'Papa frita familiar',
    price: 12.90,
    available: true,
    stock: PRODUCT_STOCKS[8],
    desc: 'Papas nativas amarillas doraditas y crocantes en porción para compartir.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258510/papa-frita-familiar.png',
  },
  {
    id: 9,
    category: 'entradas',
    name: 'Ensalada familiar',
    price: 12.90,
    available: true,
    stock: PRODUCT_STOCKS[9],
    desc: 'Mix de lechugas, tomate, palta y vinagreta clásica de pollería.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258509/ensalada-familiar.png',
  },
  {
    id: 10,
    category: 'entradas',
    name: 'Arroz chaufa familiar',
    price: 15.90,
    available: true,
    stock: PRODUCT_STOCKS[10],
    desc: 'Chaufa ahumado al wok con cebollita china, huevo y toques de pollo.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258511/arroz-chaufa-familiar.png',
  },
  {
    id: 11,
    category: 'entradas',
    name: 'Maduro frito',
    price: 9.90,
    available: true,
    stock: PRODUCT_STOCKS[11],
    desc: 'Plátano maduro frito en láminas caramelizadas.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258509/maduro-frito.png',
  },
  {
    id: 12,
    category: 'entradas',
    name: 'Yuca frita con cremas',
    price: 9.90,
    available: true,
    stock: PRODUCT_STOCKS[12],
    desc: 'Bastones de yuca crocantes con crema huancaína y ocopa.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258510/yuca-frita-cremas.png',
  },

  // --- Bebidas ---
  {
    id: 13,
    category: 'bebidas',
    name: 'Inca Kola 1.5 L',
    price: 11.90,
    available: true,
    stock: PRODUCT_STOCKS[13],
    desc: 'Gaseosa Inca Kola bien helada en botella de 1.5 litros.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258508/inca-kola-1-5l-v2.png',
  },
  {
    id: 14,
    category: 'bebidas',
    name: 'Inca Kola 500 ml',
    price: 5.50,
    available: true,
    stock: PRODUCT_STOCKS[14],
    desc: 'Gaseosa personal bien fría para acompañar tu plato.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258509/inca-kola-500ml-v2.png',
  },
  {
    id: 15,
    category: 'bebidas',
    name: 'Coca-Cola 1.5 L',
    price: 11.90,
    available: true,
    stock: PRODUCT_STOCKS[15],
    desc: 'Gaseosa Coca-Cola clásica de 1.5 litros.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258508/coca-cola-1-5l-v2.png',
  },
  {
    id: 16,
    category: 'bebidas',
    name: 'Coca-Cola 500 ml',
    price: 5.50,
    available: true,
    stock: PRODUCT_STOCKS[16],
    desc: 'Gaseosa personal clásica helada.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258509/coca-cola-500ml-v2.png',
  },
  {
    id: 17,
    category: 'bebidas',
    name: 'Chicha Morada 1 L',
    price: 10.00,
    available: true,
    stock: PRODUCT_STOCKS[17],
    desc: 'Jarra de chicha morada natural con canela, clavo y limón.',
    image: 'https://res.cloudinary.com/msprqskb/image/upload/v1789258509/chicha-morada.png',
  },
];

export const DELIVERY_COST = 6.0;
