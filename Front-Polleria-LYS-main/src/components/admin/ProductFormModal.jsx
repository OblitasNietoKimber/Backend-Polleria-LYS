import { useState } from 'react';
import { X } from 'lucide-react';

function getInitialForm(product, categories) {
  if (product) {
    return {
      name: product.name || '',
      category: product.category || (categories[0]?.id || ''),
      price: product.price !== undefined ? String(product.price) : '',
      desc: product.desc || '',
      image: product.image || '',
      available: product.available ?? true,
    };
  }
  return {
    name: '',
    category: categories[0]?.id || '',
    price: '',
    desc: '',
    image: '',
    available: true,
  };
}

function ProductFormModalContent({
  onClose,
  onSave,
  product = null,
  categories = [],
}) {
  const isEditing = Boolean(product);
  const [form, setForm] = useState(() => getInitialForm(product, categories));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (error) setError('');
  }

  function toggleAvailable() {
    setForm(prev => ({ ...prev, available: !prev.available }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const nameTrimmed = form.name.trim();
    if (!nameTrimmed) {
      setError('El nombre del producto es obligatorio.');
      return;
    }

    if (!form.category) {
      setError('Debes seleccionar una categoría.');
      return;
    }

    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError('El precio debe ser un número mayor o igual a 0.');
      return;
    }

    let imageUrl = form.image.trim() || null;
    if (imageUrl) {
      try {
        const parsed = new URL(imageUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          setError('La URL de la imagen debe comenzar con http:// o https://');
          return;
        }
      } catch {
        setError('Ingresa una URL de imagen válida.');
        return;
      }
    }

    const payload = {
      name: nameTrimmed,
      category: form.category,
      price: priceNum,
      desc: form.desc.trim(),
      image: imageUrl,
      available: form.available,
    };

    setGuardando(true);
    try {
      await onSave(payload, product?.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar el producto.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-producto-titulo"
      >
        <div className="admin-modal-header">
          <h2 id="modal-producto-titulo" className="admin-modal-title">
            {isEditing ? `Editar Producto #${product.id}` : 'Añadir Nuevo Producto'}
          </h2>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="admin-modal-body">
            {error && (
              <div className="admin-form-error" role="alert">
                {error}
              </div>
            )}

            <div className="admin-form-group">
              <label htmlFor="prod-name" className="admin-form-label">
                Nombre del plato / producto <span className="required">*</span>
              </label>
              <input
                id="prod-name"
                name="name"
                type="text"
                className="admin-form-input"
                placeholder="Ej. 1/4 Pollo a la Brasa con Papas"
                value={form.name}
                onChange={handleChange}
                autoFocus
                required
              />
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label htmlFor="prod-category" className="admin-form-label">
                  Categoría <span className="required">*</span>
                </label>
                <select
                  id="prod-category"
                  name="category"
                  className="admin-form-select"
                  value={form.category}
                  onChange={handleChange}
                  required
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label || cat.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-form-group">
                <label htmlFor="prod-price" className="admin-form-label">
                  Precio (S/) <span className="required">*</span>
                </label>
                <input
                  id="prod-price"
                  name="price"
                  type="number"
                  step="0.10"
                  min="0"
                  className="admin-form-input font-mono"
                  placeholder="0.00"
                  value={form.price}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="admin-form-group">
              <label htmlFor="prod-image" className="admin-form-label">
                URL de la Imagen
              </label>
              <input
                id="prod-image"
                name="image"
                type="url"
                className="admin-form-input"
                placeholder="https://ejemplo.com/imagenes/pollo.jpg"
                value={form.image}
                onChange={handleChange}
              />
              {form.image && (
                <div className="admin-img-preview">
                  <img
                    src={form.image}
                    alt="Vista previa"
                    className="admin-img-preview-thumb"
                    onError={e => {
                      e.target.style.display = 'none';
                    }}
                    onLoad={e => {
                      e.target.style.display = 'block';
                    }}
                  />
                  <span className="admin-img-preview-hint">Vista previa de la imagen</span>
                </div>
              )}
            </div>

            <div className="admin-form-group">
              <label htmlFor="prod-desc" className="admin-form-label">
                Descripción (opcional)
              </label>
              <textarea
                id="prod-desc"
                name="desc"
                className="admin-form-textarea"
                placeholder="Detalla los acompañamientos, salsas o características del plato..."
                value={form.desc}
                onChange={handleChange}
                rows={3}
              />
            </div>

            <div
              className="admin-switch-container"
              onClick={toggleAvailable}
              role="button"
              tabIndex={0}
              onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && toggleAvailable()}
            >
              <div className="admin-switch-info">
                <span className="admin-switch-title">Disponibilidad en la carta</span>
                <span className="admin-switch-desc">
                  {form.available
                    ? 'El plato está visible y disponible para pedidos'
                    : 'Agotado (se mostrará como no disponible en caja y catálogo)'}
                </span>
              </div>
              <div
                className={`admin-switch-control ${form.available ? 'active' : ''}`}
                aria-checked={form.available}
                role="switch"
              >
                <div className="admin-switch-handle" />
              </div>
            </div>
          </div>

          <div className="admin-modal-footer">
            <button
              type="button"
              className="btn-outline"
              onClick={onClose}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-ember"
              disabled={guardando}
            >
              {guardando
                ? 'Guardando...'
                : isEditing
                ? 'Guardar Cambios'
                : 'Crear Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductFormModal({
  isOpen,
  onClose,
  onSave,
  product = null,
  categories = [],
}) {
  if (!isOpen) return null;
  return (
    <ProductFormModalContent
      key={product?.id || 'nuevo'}
      onClose={onClose}
      onSave={onSave}
      product={product}
      categories={categories}
    />
  );
}
