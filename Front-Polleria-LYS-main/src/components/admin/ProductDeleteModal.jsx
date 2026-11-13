import { AlertTriangle, X } from 'lucide-react';

export default function ProductDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  onDisableInstead,
  product,
  loading = false,
  error = '',
}) {
  if (!isOpen || !product) return null;

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal-panel admin-delete-modal-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-eliminar-titulo"
      >
        <div className="admin-modal-header">
          <h2 id="modal-eliminar-titulo" className="admin-modal-title">
            Eliminar Producto
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

        <div className="admin-delete-body">
          <div className="admin-delete-warning-icon">
            <AlertTriangle size={26} />
          </div>

          <h3 className="admin-delete-title">¿Confirmas la eliminación?</h3>
          <p className="admin-delete-text">
            Vas a eliminar definitivamente{' '}
            <span className="admin-delete-target">"{product.name}"</span> (ID #{product.id}).
          </p>

          {error && (
            <div className="admin-form-error" style={{ textAlign: 'left', marginBottom: '16px' }} role="alert">
              <p style={{ margin: '0 0 8px 0' }}>{error}</p>
              {onDisableInstead && error.includes('pedidos registrados') && (
                <button
                  type="button"
                  className="btn-outline"
                  style={{ width: '100%', fontSize: '0.82rem', padding: '8px' }}
                  onClick={() => onDisableInstead(product)}
                >
                  Marcar como "Agotado" en su lugar
                </button>
              )}
            </div>
          )}
        </div>

        <div className="admin-modal-footer">
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="admin-btn-danger"
            onClick={() => onConfirm(product)}
            disabled={loading}
          >
            {loading ? 'Eliminando...' : 'Sí, eliminar producto'}
          </button>
        </div>
      </div>
    </div>
  );
}
