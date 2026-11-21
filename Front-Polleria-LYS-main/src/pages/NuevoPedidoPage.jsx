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
import { stockLimit } from '../utils/stock';
import { useCatalogResource } from '../hooks/useCatalogResource';
import { getCategories, getProducts, updateCatalogProducts } from '../services/productService';
import mesaService from '../services/mesaService';
import * as authService from '../services/authService';
import {FLOW_PREVIEW} from '../services/atencionService';
import '../styles/nuevoPedido.css';

const UMBRAL_CONFIRMACION_POLLOS = 10;

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

  const [itemsComanda, setItemsComanda] = useState(() => FLOW_PREVIEW&&mesaActual?.atencionId&&!mesaActual?.cuentaEditableId?[]:mesaActual?.items||[]);
  const [stockCredit] = useState(() => Object.fromEntries(itemsComanda.map(i=>[i.id,i.cantidad])));
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

  const carta = useCatalogResource(getProducts, 'carta-salon', 0, { update: updateCatalogProducts });
  const { data: listaCategorias } = useCatalogResource(getCategories, 'categorias-salon', 0, { category: true });
  const listaProductos = useMemo(() => carta.data || [], [carta.data]);
  const cargandoCatalogo = carta.loading;
  const categorias = useMemo(() => listaCategorias?.length ? [
    ...listaCategorias.map(categoria => ({
      id: categoria.id,
      label: categoria.label || categoria.id,
      icono: getCategoryIcon(categoria.id),
    })),
    { id: 'todos', label: 'Toda la carta', icono: Grid2X2 },
  ] : CATEGORIAS_FALLBACK, [listaCategorias]);

  // Filtrar productos
  const productosFiltrados = useMemo(() => {
    return listaProductos.filter((prod) => {
      const matchCat = categoriaActiva === 'todos' || prod.category === categoriaActiva;
      const matchSearch = (prod.name || '').toLowerCase().includes(busqueda.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [listaProductos, categoriaActiva, busqueda]);

  // Manipulación de comanda
  function limiteStock(producto, items = itemsComanda) {
    return stockLimit(producto, Object.fromEntries(items.map(i=>[i.id,i.cantidad])), listaProductos, stockCredit);
  }
  function handleAgregarItem(producto) {
    if (!producto.available || (itemsComanda.find(i=>i.id===producto.id)?.cantidad||0)>=limiteStock(producto)) {
      setToastMsg('Stock insuficiente. Revisa las cantidades y el inventario compartido.'); return;
    }
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
      const producto = listaProductos.find(p=>p.id===nueva[index].id);
      if(delta>0 && (!producto || actual>limiteStock(producto,prev))) return prev;
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
    if (enviando) return;
    if (itemsComanda.length === 0) {
      setToastMsg('La comanda está vacía. Selecciona al menos un producto.');
      setTimeout(() => setToastMsg(''), 3000);
      return;
    }

    if (!carta.data) {
      setToastMsg(cargandoCatalogo ? 'Espera a que cargue la carta.' : 'No se pudo cargar la carta. Intenta confirmar de nuevo.');
      if (!cargandoCatalogo) carta.retry();
      return;
    }

    const productosPorId = new Map(listaProductos.map(producto => [String(producto.id), producto]));
    let pollos = 0;
    for (const item of itemsComanda) {
      const producto = productosPorId.get(String(item.id));
      if (!producto) {
        setToastMsg(`Retira ${item.nombre} de la comanda porque ya no está en la carta.`);
        return;
      }
      if (producto.inventoryId === 'pollo-brasa') {
        pollos += item.cantidad * producto.inventoryConsumption / producto.inventoryScale;
      }
    }

    if (pollos > UMBRAL_CONFIRMACION_POLLOS) {
      const cantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(pollos);
      if (!window.confirm(`¿Confirmas enviar una comanda con ${cantidad} pollos? Revisa la cantidad antes de continuar.`)) {
        return;
      }
    }

    setEnviando(true);
    try {
      const pedidoExistenteId = FLOW_PREVIEW?mesaActual?.cuentaEditableId:mesaActual?.pedidoId;
      let pedidoIdFinal = pedidoExistenteId;

      if (pedidoExistenteId) {
        // Modificar productos y observaciones de un pedido de salón abierto (SCRUM-279)
        await mesaService.modificarPedidoSalon({
          pedidoId: pedidoExistenteId,
          items: itemsComanda,
          notas: observaciones.trim(),
          version: mesaActual?.versionCuenta,
        });
      } else {
        // Abrir pedido de salón y ocupar mesa en PostgreSQL con idempotencia (SCRUM-278, SCRUM-282)
        // El servidor distingue platos de cocina y productos de servicio directo.
        pedidoIdFinal = await mesaService.abrirPedidoSalon({
          solicitudId,
          atencionId:mesaActual?.atencionId,
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
        descripcion: pedidoExistenteId ? 'Comanda actualizada' : 'Nuevo pedido registrado',
        ordenCodigo: `Orden #${pedidoIdFinal}`,
        tipoColor: 'rojo',
      });

      navigate('/mesas', {
        state: {
          toastExito: `¡Pedido de Mesa ${numeroNormalizado} registrado con éxito!`
        }
      });
    } catch (err) {
      carta.retry();
      console.error('Error al confirmar la comanda:', err);
      setToastMsg('Ocurrió un error al confirmar la comanda: ' + (err.message || err));
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
              <div key={prod.id} className={`plato-card ${prod.available === false || prod.stock<=0 ? 'plato-agotado' : ''}`}>
                <div className="plato-img-wrapper">
                  <img src={prod.image} alt={prod.name} className="plato-img" loading="lazy" />
                  {(prod.available === false || prod.stock<=0) && <span className="plato-badge-agotado">Agotado</span>}
                </div>
                <div className="plato-info">
                  <span className="plato-nombre">{prod.name}</span>
                  <small>Stock disponible: {prod.stock}</small>
                  <div className="plato-precio-row">
                    <span className="plato-precio">S/ {Number(prod.price || 0).toFixed(2)}</span>
                    <button
                      type="button"
                      className="btn-add-item"
                      title={prod.available === false ? 'Producto agotado en cocina' : 'Agregar a la comanda'}
                      onClick={() => handleAgregarItem(prod)}
                      disabled={prod.available === false || (itemsComanda.find(i=>i.id===prod.id)?.cantidad||0)>=limiteStock(prod)}
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
              title="Confirmar comanda: los platos pasan a cocina y las bebidas y postres quedan listos para servir"
            >
              <ChefHat size={18} className="np-btn-icon-inline" />
              {enviando ? 'Confirmando...' : 'Confirmar comanda'}
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
  const [ready,setReady]=useState(!FLOW_PREVIEW),[error,setError]=useState('');
  useEffect(()=>{if(!FLOW_PREVIEW)return;let active=true;mesaService.fetchMesas({strict:true}).then(()=>{if(active)setReady(true);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[numeroNormalizado]);
  if(error)return <p role="alert">{error}</p>;
  if(!ready)return <p role="status">Consultando la cuenta vigente…</p>;

  // El key={numeroNormalizado} asegura que al cambiar de mesa se resetee y cargue la comanda correcta
  return <NuevoPedidoForm key={numeroNormalizado} numeroNormalizado={numeroNormalizado} />;
}
