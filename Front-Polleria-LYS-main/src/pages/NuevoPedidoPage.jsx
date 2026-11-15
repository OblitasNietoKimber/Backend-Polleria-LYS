import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users,
  ArrowLeft,
  Trash2,
  ClipboardList,
  BookmarkCheck,
  ChefHat,
  Search,
  CheckCircle2,
  AlertCircle,
  Flame,
  Layers,
  CupSoda,
  CakeSlice,
  Grid2X2,
  UtensilsCrossed,
} from 'lucide-react';
import { PRODUCTS } from '../data/products';
import { getCategories, getProducts } from '../services/productService';
import mesaService from '../services/mesaService';
import * as authService from '../services/authService';
import '../styles/nuevoPedido.css';

function getCategoryIcon(catId) {
  switch (catId) {
    case 'pollos':
      return Flame;
    case 'parrillas':
      return UtensilsCrossed;
    case 'entradas':
    case 'combos':
      return Layers;
    case 'bebidas':
      return CupSoda;
    case 'postres':
      return CakeSlice;
    case 'todos':
    default:
      return Grid2X2;
  }
}

const CATEGORIAS_FALLBACK = [
  { id: 'pollos', label: 'Pollos y Brasas', icono: Flame },
  { id: 'parrillas', label: 'Parrillas', icono: UtensilsCrossed },
  { id: 'entradas', label: 'Entradas y Guarniciones', icono: Layers },
  { id: 'bebidas', label: 'Bebidas', icono: CupSoda },
  { id: 'todos', label: 'Toda la carta', icono: Grid2X2 },
];

function NuevoPedidoForm({ numeroNormalizado }) {
  const navigate = useNavigate();
  const todasLasMesas = useMemo(() => mesaService.getMesas(), []);
  const mesaActual = useMemo(() => {
    return todasLasMesas.find((m) => String(m.numero).padStart(2, '0') === numeroNormalizado) || null;
  }, [todasLasMesas, numeroNormalizado]);

  const [comensales, setComensales] = useState(() => mesaActual?.comensalesReserva || mesaActual?.capacidad || 4);
  const [categoriaActiva, setCategoriaActiva] = useState('pollos');
  const [busqueda, setBusqueda] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const [itemsComanda, setItemsComanda] = useState(() => mesaActual?.items || []);
  const [observaciones, setObservaciones] = useState(() => mesaActual?.notas || '');

  // Verificar si hay un borrador previo guardado para esta mesa
  const [borradorPendiente, setBorradorPendiente] = useState(() => {
    if (mesaActual?.pedidoId) return null; // Si ya tiene pedido activo en cocina no mostrar borrador viejo
    try {
      const raw = localStorage.getItem(`lys_borrador_mesa_${numeroNormalizado}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [solicitudId, setSolicitudId] = useState(() => {
    try {
      const raw = localStorage.getItem(`lys_borrador_mesa_${numeroNormalizado}`);
      const borrador = raw ? JSON.parse(raw) : null;
      if (borrador?.solicitudId) return borrador.solicitudId;
    } catch {
      // ignore
    }
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null;
  });

  const [meseraNombre] = useState(() => {
    const usuario = authService.getCurrentUser();
    return usuario?.nombre ? `${usuario.nombre} ${usuario.apellido || ''}`.trim() : 'Ana Rodríguez';
  });

  const [listaProductos, setListaProductos] = useState(() => PRODUCTS);
  const [categorias, setCategorias] = useState(() => CATEGORIAS_FALLBACK);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function sincronizarCarta() {
      try {
        setCargandoCatalogo(true);
        const [catsRes, prodsRes] = await Promise.allSettled([
          getCategories(),
          getProducts(),
        ]);

        if (cancelado) return;

        if (catsRes.status === 'fulfilled' && Array.isArray(catsRes.value) && catsRes.value.length > 0) {
          const catsMapeadas = [
            ...catsRes.value.map((c) => ({
              id: c.id,
              label: c.label || c.nombre || c.id,
              icono: getCategoryIcon(c.id),
            })),
            { id: 'todos', label: 'Toda la carta', icono: Grid2X2 },
          ];
          setCategorias(catsMapeadas);
        }

        if (prodsRes.status === 'fulfilled' && Array.isArray(prodsRes.value) && prodsRes.value.length > 0) {
          setListaProductos(prodsRes.value);
        }
      } catch (err) {
        console.warn('Usando catálogo local de reserva para salón:', err);
      } finally {
        if (!cancelado) setCargandoCatalogo(false);
      }
    }

    sincronizarCarta();
    return () => {
      cancelado = true;
    };
  }, []);

  // Filtrar productos
  const productosFiltrados = useMemo(() => {
    return listaProductos.filter((prod) => {
      const matchCat = categoriaActiva === 'todos' || prod.category === categoriaActiva;
      const matchSearch = (prod.name || '').toLowerCase().includes(busqueda.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [listaProductos, categoriaActiva, busqueda]);

  // Manipulación de comanda
  function handleAgregarItem(producto) {
    setItemsComanda((prev) => {
      const index = prev.findIndex((it) => it.id === producto.id || it.nombre === producto.name);
      if (index > -1) {
        const copia = [...prev];
        copia[index] = { ...copia[index], cantidad: copia[index].cantidad + 1 };
        return copia;
      }
      return [
        ...prev,
        {
          id: producto.id,
          nombre: producto.name,
          precio: producto.price,
          cantidad: 1,
          imagen: producto.image,
        },
      ];
    });
  }

  function handleModificarCantidad(index, delta) {
    setItemsComanda((prev) => {
      const nueva = [...prev];
      const actual = nueva[index].cantidad + delta;
      if (actual <= 0) {
        return nueva.filter((_, i) => i !== index);
      }
      nueva[index] = { ...nueva[index], cantidad: actual };
      return nueva;
    });
  }

  function handleEliminarItem(index) {
    setItemsComanda((prev) => prev.filter((_, i) => i !== index));
  }

  function handleLimpiarComanda() {
    if (itemsComanda.length === 0) return;
    if (window.confirm('¿Deseas vaciar todos los productos de esta comanda?')) {
      setItemsComanda([]);
    }
  }

  // Cálculos financieros
  const total = itemsComanda.reduce((acc, it) => acc + it.cantidad * it.precio, 0);
  const subtotal = total / 1.18;
  const igv = total - subtotal;

  function handleCambiarMesa(nuevoNumero) {
    navigate(`/mesas/${nuevoNumero}/pedido`);
  }

  function handleGuardarBorrador() {
    if (itemsComanda.length === 0) {
      setToastMsg('Agrega al menos un producto a la comanda antes de guardar un borrador.');
      setTimeout(() => setToastMsg(''), 3000);
      return;
    }
    // Guardar borrador local con solicitudId para idempotencia
    localStorage.setItem(`lys_borrador_mesa_${numeroNormalizado}`, JSON.stringify({
      solicitudId,
      items: itemsComanda,
      observaciones,
      comensales,
      guardadoAt: new Date().toISOString(),
    }));
    setToastMsg(`Borrador de Mesa ${numeroNormalizado} guardado con éxito`);
    setTimeout(() => setToastMsg(''), 3000);
  }

  function handleRestaurarBorrador() {
    if (!borradorPendiente) return;
    if (borradorPendiente.solicitudId) {
      setSolicitudId(borradorPendiente.solicitudId);
    }
    setItemsComanda(borradorPendiente.items || []);
    setObservaciones(borradorPendiente.observaciones || '');
    if (borradorPendiente.comensales) {
      setComensales(borradorPendiente.comensales);
    }
    setBorradorPendiente(null);
    setToastMsg('Borrador restaurado en la comanda');
    setTimeout(() => setToastMsg(''), 3000);
  }

  function handleDescartarBorrador() {
    localStorage.removeItem(`lys_borrador_mesa_${numeroNormalizado}`);
    setBorradorPendiente(null);
  }

  const [enviando, setEnviando] = useState(false);

  async function handleEnviarCocina() {
    if (itemsComanda.length === 0) {
      setToastMsg('La comanda está vacía. Selecciona al menos un producto.');
      setTimeout(() => setToastMsg(''), 3000);
      return;
    }

    setEnviando(true);
    try {
      const pedidoExistenteId = mesaActual?.pedidoId;
      let pedidoIdFinal = pedidoExistenteId;

      if (pedidoExistenteId) {
        // Modificar productos y observaciones de un pedido de salón abierto (SCRUM-279)
        await mesaService.modificarPedidoSalon({
          pedidoId: pedidoExistenteId,
          items: itemsComanda,
          notas: observaciones.trim(),
        });
      } else {
        // Abrir pedido de salón y ocupar mesa en PostgreSQL con idempotencia (SCRUM-278, SCRUM-282)
        // El pedido se crea en estado 'pendiente' para ingresar a la columna 'Nuevos pedidos' en Cocina
        pedidoIdFinal = await mesaService.abrirPedidoSalon({
          solicitudId,
          mesaId: mesaActual?.id,
          mesaNumero: numeroNormalizado,
          comensales: Number(comensales),
          notas: observaciones.trim(),
          items: itemsComanda,
        });
      }

      try { localStorage.removeItem(`lys_borrador_mesa_${numeroNormalizado}`); } catch { /* Conserva el pedido confirmado si Web Storage está bloqueado. */ }

      mesaService.registrarActividad({
        mesaNumero: numeroNormalizado,
        tipo: 'pedido_creado',
        titulo: `Mesa ${numeroNormalizado}`,
        descripcion: pedidoExistenteId ? 'Comanda actualizada y enviada a cocina' : 'Nuevo pedido enviado a cocina',
        ordenCodigo: `Orden #${pedidoIdFinal}`,
        tipoColor: 'rojo',
      });

      navigate('/mesas', {
        state: {
          toastExito: `¡Pedido de Mesa ${numeroNormalizado} enviado a Cocina con éxito!`
        }
      });
    } catch (err) {
      console.error('Error al enviar a cocina:', err);
      setToastMsg('Ocurrió un error al enviar el pedido a cocina: ' + (err.message || err));
      setTimeout(() => setToastMsg(''), 4000);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pedido-screen">
      {/* Toast flotante de confirmación */}
      {toastMsg && (
        <div className="np-toast">
          <CheckCircle2 size={20} color="#34D399" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Banner de borrador guardado pendiente de restaurar */}
      {borradorPendiente && (
        <div className="borrador-banner">
          <div className="np-borrador-row">
            <AlertCircle size={20} color="#D97706" />
            <span>
              Tienes un borrador pendiente de <strong>{borradorPendiente.items.length} productos</strong> para la Mesa {numeroNormalizado}.
            </span>
          </div>
          <div className="np-borrador-actions">
            <button
              type="button"
              onClick={handleRestaurarBorrador}
              className="np-borrador-restaurar-btn"
            >
              Restaurar borrador
            </button>
            <button
              type="button"
              onClick={handleDescartarBorrador}
              className="np-borrador-descartar-btn"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Cuerpo Tablet POS de 3 Columnas: Categorías (izq), Platos (centro), Comanda (der) */}
      <div className="pedido-pos-layout">
        {/* Columna 1: Riel Vertical Izquierdo de Categorías */}
        <aside className="pedido-categories-rail">
          {/* Botón de retorno al salón a ancho completo (sin desbordes) */}
          <div className="rail-top-nav">
            <button
              type="button"
              className="btn-volver-salon"
              onClick={() => navigate('/mesas')}
              title="Volver al plano del salón"
            >
              <ArrowLeft size={16} />
              <span>Volver al Salón</span>
            </button>
          </div>

          <div className="rail-separator" />

          <span className="rail-title">Categorías</span>
          <nav className="rail-nav">
            {categorias.map((cat) => {
              const Icono = cat.icono || Grid2X2;
              const esActiva = categoriaActiva === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`rail-category-btn ${esActiva ? 'activo' : ''}`}
                  onClick={() => setCategoriaActiva(cat.id)}
                >
                  <Icono size={18} className="rail-btn-icon" />
                  <span className="rail-btn-label">{cat.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Columna 2: Catálogo de Platos */}
        <section className="pedido-catalog-area">
          {/* Buscador integrado en la cabecera de la carta */}
          <div className="catalog-top-toolbar">
            <div className="catalog-search-box">
              <Search size={16} className="catalog-search-icon" />
              <input
                type="text"
                className="catalog-search-input"
                placeholder="Buscar platos, bebidas, combos..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              {busqueda && (
                <button
                  type="button"
                  className="catalog-search-clear"
                  onClick={() => setBusqueda('')}
                  title="Limpiar búsqueda"
                >
                  ×
                </button>
              )}
            </div>
            <span className="catalog-counter">
              {cargandoCatalogo ? 'Actualizando carta...' : `${productosFiltrados.length} ${productosFiltrados.length === 1 ? 'producto' : 'productos'}`}
            </span>
          </div>

          <div className="platos-grid">
            {productosFiltrados.map((prod) => (
              <div key={prod.id} className={`plato-card ${prod.available === false ? 'plato-agotado' : ''}`}>
                <div className="plato-img-wrapper">
                  <img src={prod.image} alt={prod.name} className="plato-img" loading="lazy" />
                  {prod.available === false && <span className="plato-badge-agotado">Agotado</span>}
                </div>
                <div className="plato-info">
                  <span className="plato-nombre">{prod.name}</span>
                  <div className="plato-precio-row">
                    <span className="plato-precio">S/ {Number(prod.price || 0).toFixed(2)}</span>
                    <button
                      type="button"
                      className="btn-add-item"
                      title={prod.available === false ? 'Producto agotado en cocina' : 'Agregar a la comanda'}
                      onClick={() => handleAgregarItem(prod)}
                      disabled={prod.available === false}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {productosFiltrados.length === 0 && (
            <div className="np-empty-state">
              <p className="np-empty-state-text">
                {busqueda
                  ? `No se encontraron productos con "${busqueda}".`
                  : 'No hay productos disponibles en esta categoría.'}
              </p>
            </div>
          )}
        </section>

        {/* Columna Derecha: Panel de la Comanda */}
        <aside className="comanda-panel">
          <div className="comanda-header">
            <div className="comanda-header-info">
              <div className="comanda-title-row">
                <div className="comanda-mesa-select-box">
                  <h3 className="comanda-title">Mesa {numeroNormalizado}</h3>
                  <select
                    className="comanda-select-mesa"
                    value={numeroNormalizado}
                    onChange={(e) => handleCambiarMesa(e.target.value)}
                    title="Cambiar a otra mesa"
                  >
                    {todasLasMesas.map((m) => (
                      <option key={m.id} value={m.numero}>
                        Mesa {m.numero} ({m.estado})
                      </option>
                    ))}
                  </select>
                </div>
                <span className={`comanda-tag-estado ${mesaActual?.estado === 'ocupada' ? 'ocupada' : 'nueva'}`}>
                  {mesaActual?.estado === 'ocupada' ? 'Ocupada' : 'Nueva orden'}
                </span>
              </div>
              <div className="comanda-sub-row">
                <div className="comensales-control" title="Ajusta el número de comensales">
                  <Users size={13} className="np-comensales-icon" />
                  <button
                    type="button"
                    className="comensales-btn"
                    onClick={() => setComensales((prev) => Math.max(1, prev - 1))}
                    title="Menos comensales"
                  >
                    -
                  </button>
                  <span className="comensales-val">{comensales}</span>
                  <button
                    type="button"
                    className="comensales-btn"
                    onClick={() => setComensales((prev) => Math.min(16, prev + 1))}
                    title="Más comensales"
                  >
                    +
                  </button>
                  <span className="comensales-txt">personas</span>
                </div>
                <span className="comanda-mesera-tag">
                  Mesera: <strong>{meseraNombre}</strong>
                </span>
              </div>
            </div>
            {itemsComanda.length > 0 && (
              <button
                type="button"
                className="btn-clear-comanda"
                onClick={handleLimpiarComanda}
                title="Vaciar comanda"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {/* Lista de productos en la comanda */}
          <div className="comanda-items-list">
            {itemsComanda.map((it, idx) => (
              <div key={idx} className="comanda-item">
                <div className="comanda-item-info">
                  <span className="comanda-item-nombre">{it.nombre}</span>
                  <span className="comanda-item-unitario">
                    S/ {it.precio.toFixed(2)} c/u
                  </span>
                </div>

                {/* Control de cantidad */}
                <div className="comanda-stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => handleModificarCantidad(idx, -1)}
                    title="Disminuir"
                  >
                    -
                  </button>
                  <span className="stepper-qty">{it.cantidad}</span>
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => handleModificarCantidad(idx, 1)}
                    title="Aumentar"
                  >
                    +
                  </button>
                </div>

                <span className="comanda-item-total">
                  S/ {(it.cantidad * it.precio).toFixed(2)}
                </span>

                <button
                  type="button"
                  className="btn-remove-item"
                  onClick={() => handleEliminarItem(idx)}
                  title="Eliminar plato"
                >
                  ✕
                </button>
              </div>
            ))}

            {itemsComanda.length === 0 && (
              <div className="np-comanda-empty">
                <ClipboardList size={38} strokeWidth={1.5} className="np-comanda-empty-icon" />
                <p className="np-comanda-empty-text">
                  Aún no hay productos en la comanda.
                </p>
                <span className="np-comanda-empty-hint">
                  Selecciona platos de la carta a la izquierda.
                </span>
              </div>
            )}
          </div>

          {/* Observaciones a Cocina */}
          <div className="comanda-obs-area">
            <div className="comanda-obs-label">
              <span>Observaciones a cocina</span>
              <span className="np-obs-counter">
                {observaciones.length}/120
              </span>
            </div>
            <textarea
              className="comanda-obs-input"
              rows="2"
              maxLength="120"
              placeholder="Ej: Sin ají, pollo bien dorado, papas crocantes..."
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>

          {/* Desglose de totales */}
          <div className="comanda-totales">
            <div className="total-row">
              <span>Subtotal:</span>
              <span>S/ {subtotal.toFixed(2)}</span>
            </div>
            <div className="total-row">
              <span>IGV (18%):</span>
              <span>S/ {igv.toFixed(2)}</span>
            </div>
            <div className="total-row destacado">
              <span>Total:</span>
              <span>S/ {total.toFixed(2)}</span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="comanda-acciones">
            <button
              type="button"
              className="btn-borrador"
              onClick={handleGuardarBorrador}
              title="Guardar comanda como borrador para continuar luego"
            >
              <BookmarkCheck size={18} className="np-btn-icon-inline" />
              Guardar borrador
            </button>
            <button
              type="button"
              className="btn-enviar-cocina"
              onClick={handleEnviarCocina}
              disabled={enviando}
              title="Enviar comanda a la pantalla de cocina"
            >
              <ChefHat size={18} className="np-btn-icon-inline" />
              {enviando ? 'Enviando...' : 'Enviar a cocina'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function NuevoPedidoPage() {
  const { id: mesaParam } = useParams();
  const numeroNormalizado = String(mesaParam || '01').padStart(2, '0');

  // El key={numeroNormalizado} asegura que al cambiar de mesa se resetee y cargue la comanda correcta
  return <NuevoPedidoForm key={numeroNormalizado} numeroNormalizado={numeroNormalizado} />;
}
