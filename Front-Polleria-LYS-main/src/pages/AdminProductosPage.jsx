import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  UtensilsCrossed,
  RefreshCw,
  Power,
  X,
} from 'lucide-react';
import {
  getCategories,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductAvailability,
} from '../services/productService';
import { money } from '../utils/currency';
import ProductFormModal from '../components/admin/ProductFormModal';
import ProductDeleteModal from '../components/admin/ProductDeleteModal';
import '../styles/adminProductos.css';

export default function AdminProductosPage() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('todos');
  const [filtroDisponibilidad, setFiltroDisponibilidad] = useState('todos'); // 'todos' | 'disponibles' | 'agotados'

  // Modales
  const [modalFormAbierto, setModalFormAbierto] = useState(false);
  const [productoEnEdicion, setProductoEnEdicion] = useState(null);

  const [modalEliminarAbierto, setModalEliminarAbierto] = useState(false);
  const [productoAEliminar, setProductoAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');

  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    let activo = true;
    async function inicializar() {
      try {
        const [cats, prods] = await Promise.all([
          getCategories(),
          getProducts({ search: '', category: 'todos' }),
        ]);
        if (activo) {
          setCategorias(cats);
          setProductos(prods);
          setError('');
        }
      } catch (err) {
        if (activo) {
          setError(err.message || 'No se pudieron cargar los datos de la carta.');
        }
      } finally {
        if (activo) setCargando(false);
      }
    }
    inicializar();
    return () => {
      activo = false;
    };
  }, []);

  const recargar = async () => {
    setCargando(true);
    setError('');
    try {
      const [cats, prods] = await Promise.all([
        getCategories(),
        getProducts({ search: '', category: 'todos' }),
      ]);
      setCategorias(cats);
      setProductos(prods);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos de la carta.');
    } finally {
      setCargando(false);
    }
  };

  const mapCategorias = useMemo(() => {
    const mapa = {};
    for (const cat of categorias) {
      mapa[cat.id] = cat.label || cat.nombre || cat.id;
    }
    return mapa;
  }, [categorias]);

  // Filtrado en memoria
  const productosFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return productos.filter(p => {
      // Filtro por categoría
      if (categoriaActiva !== 'todos' && p.category !== categoriaActiva) {
        return false;
      }
      // Filtro por disponibilidad
      if (filtroDisponibilidad === 'disponibles' && !p.available) {
        return false;
      }
      if (filtroDisponibilidad === 'agotados' && p.available) {
        return false;
      }
      // Filtro por búsqueda
      if (term) {
        const nombreMatch = (p.name || '').toLowerCase().includes(term);
        const descMatch = (p.desc || '').toLowerCase().includes(term);
        const idMatch = String(p.id) === term;
        if (!nombreMatch && !descMatch && !idMatch) return false;
      }
      return true;
    });
  }, [productos, busqueda, categoriaActiva, filtroDisponibilidad]);

  const totales = useMemo(() => {
    const total = productos.length;
    const disponibles = productos.filter(p => p.available).length;
    const agotados = total - disponibles;
    return { total, disponibles, agotados };
  }, [productos]);

  // Mensaje temporal de éxito
  const notificarExito = (mensaje) => {
    setMensajeExito(mensaje);
    setTimeout(() => {
      setMensajeExito('');
    }, 4500);
  };

  // Abrir modal de creación
  const handleNuevo = () => {
    setProductoEnEdicion(null);
    setModalFormAbierto(true);
  };

  // Abrir modal de edición
  const handleEditar = (producto) => {
    setProductoEnEdicion(producto);
    setModalFormAbierto(true);
  };

  // Abrir modal de eliminación
  const handleSolicitarEliminar = (producto) => {
    setProductoAEliminar(producto);
    setErrorEliminar('');
    setModalEliminarAbierto(true);
  };

  // Guardar (crear o actualizar)
  const handleGuardar = async (payload, id) => {
    if (id) {
      const actualizado = await updateProduct(id, payload);
      setProductos(prev => prev.map(p => (p.id === id ? actualizado : p)));
      notificarExito(`Producto "${actualizado.name}" actualizado correctamente.`);
    } else {
      const creado = await createProduct(payload);
      setProductos(prev => [creado, ...prev]);
      notificarExito(`Producto "${creado.name}" creado con éxito.`);
    }
  };

  // Confirmar eliminación
  const handleConfirmarEliminar = async (producto) => {
    setEliminando(true);
    setErrorEliminar('');
    try {
      await deleteProduct(producto.id);
      setProductos(prev => prev.filter(p => p.id !== producto.id));
      setModalEliminarAbierto(false);
      setProductoAEliminar(null);
      notificarExito(`Producto "${producto.name}" eliminado del catálogo.`);
    } catch (err) {
      setErrorEliminar(err.message || 'No se pudo eliminar el producto.');
    } finally {
      setEliminando(false);
    }
  };

  // Alternativa: Marcar como agotado si no se puede borrar
  const handleDesactivarEnLugarDeEliminar = async (producto) => {
    setEliminando(true);
    try {
      const actualizado = await updateProduct(producto.id, {
        ...producto,
        available: false,
      });
      setProductos(prev => prev.map(p => (p.id === producto.id ? actualizado : p)));
      setModalEliminarAbierto(false);
      setProductoAEliminar(null);
      notificarExito(`"${producto.name}" marcado como No disponible.`);
    } catch (err) {
      setErrorEliminar(err.message || 'No se pudo actualizar el estado.');
    } finally {
      setEliminando(false);
    }
  };

  // Toggle rápido de disponibilidad
  const handleToggleDisponibilidad = async (producto) => {
    setTogglingId(producto.id);
    try {
      const actualizado = await toggleProductAvailability(producto);
      setProductos(prev => prev.map(p => (p.id === producto.id ? actualizado : p)));
      notificarExito(
        `"${producto.name}" ahora está ${actualizado.available ? 'Disponible' : 'Agotado'}.`
      );
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la disponibilidad del producto.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="lys-root admin-screen">
      <main className="admin-content admin-productos-page">
        {/* Cabecera de la sección administrativa */}
        <section className="admin-page-head">
          <div>
            <div className="admin-badge-role">ADMINISTRACIÓN</div>
            <h1 className="admin-productos-title">GESTIÓN DE PRODUCTOS</h1>
            <p className="admin-productos-subtitle">
              Añade, edita, elimina o controla la disponibilidad de los productos de la pollería.
            </p>
          </div>

          <div className="admin-productos-head-actions">
            <button
              type="button"
              className="btn-ember admin-btn-nuevo"
              onClick={handleNuevo}
              aria-label="Añadir nuevo producto al catálogo"
            >
              <Plus size={18} />
              <span>Nuevo Producto</span>
            </button>
          </div>
        </section>

        {/* Notificaciones */}
        {mensajeExito && (
          <div className="admin-alert-banner" role="status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} color="var(--rust)" />
              <span>{mensajeExito}</span>
            </div>
            <button
              type="button"
              onClick={() => setMensajeExito('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {error && (
          <div className="admin-form-error" role="alert">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Toolbar de Búsqueda y Filtros */}
        <section className="admin-toolbar">
          <div className="admin-toolbar-row">
            <div className="admin-search-wrapper">
              <Search size={18} className="admin-search-icon" />
              <input
                type="text"
                className="admin-search-input"
                placeholder="Buscar por nombre, descripción o ID (#)..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                aria-label="Buscar productos"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--smoke)',
                  }}
                  aria-label="Limpiar búsqueda"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Selector de estado */}
            <div className="admin-status-filters" role="group" aria-label="Filtro de disponibilidad">
              <button
                type="button"
                className={`admin-status-btn ${filtroDisponibilidad === 'todos' ? 'active' : ''}`}
                onClick={() => setFiltroDisponibilidad('todos')}
              >
                Todos ({totales.total})
              </button>
              <button
                type="button"
                className={`admin-status-btn ${filtroDisponibilidad === 'disponibles' ? 'active' : ''}`}
                onClick={() => setFiltroDisponibilidad('disponibles')}
              >
                Disponibles ({totales.disponibles})
              </button>
              <button
                type="button"
                className={`admin-status-btn ${filtroDisponibilidad === 'agotados' ? 'active' : ''}`}
                onClick={() => setFiltroDisponibilidad('agotados')}
              >
                Agotados ({totales.agotados})
              </button>
            </div>
          </div>

          {/* Chips de categorías */}
          <div className="admin-categories-chips" role="tablist" aria-label="Categorías de la carta">
            <button
              type="button"
              className={`admin-chip ${categoriaActiva === 'todos' ? 'active' : ''}`}
              onClick={() => setCategoriaActiva('todos')}
            >
              Todas las categorías
            </button>
            {categorias.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`admin-chip ${categoriaActiva === cat.id ? 'active' : ''}`}
                onClick={() => setCategoriaActiva(cat.id)}
              >
                {cat.label || cat.nombre}
              </button>
            ))}
          </div>
        </section>

        {/* Resumen de resultados */}
        <div className="admin-results-summary">
          <span>
            Mostrando <strong>{productosFiltrados.length}</strong> de {productos.length} platos
            {categoriaActiva !== 'todos' && ` en "${mapCategorias[categoriaActiva] || categoriaActiva}"`}
            {busqueda && ` para "${busqueda}"`}
          </span>

          <button
            type="button"
            className="btn-outline"
            style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onClick={recargar}
            disabled={cargando}
            title="Recargar catálogo de la base de datos"
          >
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* Estado de carga */}
        {cargando ? (
          <div className="admin-empty-state" role="status">
            <RefreshCw size={28} className="admin-empty-icon animate-spin" />
            <h3 className="admin-empty-title">Cargando productos...</h3>
            <p className="admin-empty-desc">Consultando la carta oficial en la base de datos.</p>
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="admin-empty-state">
            <UtensilsCrossed size={36} className="admin-empty-icon" />
            <h3 className="admin-empty-title">No se encontraron productos</h3>
            <p className="admin-empty-desc">
              {busqueda || categoriaActiva !== 'todos' || filtroDisponibilidad !== 'todos'
                ? 'Prueba ajustando los filtros o el término de búsqueda.'
                : 'Aún no hay productos registrados. Haz clic en "Nuevo Producto" para añadir el primero.'}
            </p>
          </div>
        ) : (
          /* Grid de productos */
          <div className="admin-products-grid">
            {productosFiltrados.map(prod => {
              const categoriaNombre = mapCategorias[prod.category] || prod.category;
              const isToggling = togglingId === prod.id;

              return (
                <article
                  key={prod.id}
                  className={`admin-product-card ${!prod.available ? 'is-off' : ''}`}
                >
                  <div className="admin-card-header">
                    {prod.image ? (
                      <img
                        src={prod.image}
                        alt={prod.name}
                        className="admin-card-img"
                        loading="lazy"
                        onError={e => {
                          e.target.style.display = 'none';
                          e.target.parentElement.classList.add('has-broken-img');
                        }}
                      />
                    ) : (
                      <div className="admin-card-img-placeholder">
                        <UtensilsCrossed size={32} />
                      </div>
                    )}

                    <div className="admin-card-badges">
                      <span className="admin-id-badge">#{prod.id}</span>
                      <span className={`admin-status-pill ${prod.available ? 'on' : 'off'}`}>
                        {prod.available ? 'Disponible' : 'Agotado'}
                      </span>
                    </div>
                  </div>

                  <div className="admin-card-body">
                    <span className="admin-card-cat">{categoriaNombre}</span>
                    <h3 className="admin-card-title">{prod.name}</h3>
                    <p className="admin-card-desc" title={prod.desc || 'Sin descripción'}>
                      {prod.desc || 'Sin descripción detallada.'}
                    </p>

                    <div className="admin-card-price-row">
                      <span className="admin-card-price-label">Precio carta:</span>
                      <span className="admin-card-price">{money(prod.price)}</span>
                    </div>
                  </div>

                  <div className="admin-card-actions">
                    <button
                      type="button"
                      className={`admin-action-btn ${prod.available ? 'toggle-off' : 'toggle-on'}`}
                      onClick={() => handleToggleDisponibilidad(prod)}
                      disabled={isToggling}
                      title={
                        prod.available
                          ? 'Marcar producto como agotado temporalmente'
                          : 'Habilitar producto para venta inmediata'
                      }
                    >
                      <Power size={14} />
                      <span>{prod.available ? 'Agotar' : 'Habilitar'}</span>
                    </button>

                    <button
                      type="button"
                      className="admin-action-btn edit"
                      onClick={() => handleEditar(prod)}
                      title="Editar nombre, categoría, precio, descripción o foto"
                    >
                      <Pencil size={14} />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      className="admin-action-btn delete"
                      onClick={() => handleSolicitarEliminar(prod)}
                      title="Eliminar este producto de la carta"
                      aria-label={`Eliminar producto ${prod.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Modal de Crear / Editar */}
        <ProductFormModal
          isOpen={modalFormAbierto}
          onClose={() => {
            setModalFormAbierto(false);
            setProductoEnEdicion(null);
          }}
          onSave={handleGuardar}
          product={productoEnEdicion}
          categories={categorias}
        />

        {/* Modal de Confirmación de Eliminación */}
        <ProductDeleteModal
          isOpen={modalEliminarAbierto}
          onClose={() => {
            setModalEliminarAbierto(false);
            setProductoAEliminar(null);
            setErrorEliminar('');
          }}
          onConfirm={handleConfirmarEliminar}
          onDisableInstead={handleDesactivarEnLugarDeEliminar}
          product={productoAEliminar}
          loading={eliminando}
          error={errorEliminar}
        />
      </main>
    </div>
  );
}
