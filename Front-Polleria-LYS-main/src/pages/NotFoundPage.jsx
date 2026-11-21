import { Link } from 'react-router-dom';
import { ArrowLeft, UtensilsCrossed } from 'lucide-react';
import '../styles/notFound.css';

export default function NotFoundPage() {
  return (
    <main className="not-found-page" aria-labelledby="not-found-title">
      <title>Página no encontrada | La Leña y Sabores</title>
      <div className="not-found-card">
        <div className="not-found-icon" aria-hidden="true"><UtensilsCrossed size={28} /></div>
        <p className="not-found-code">404</p>
        <h1 id="not-found-title">Página no encontrada</h1>
        <p className="not-found-description">
          La página que buscas no existe o cambió de dirección.
          Puedes volver al inicio o explorar nuestra carta.
        </p>
        <div className="not-found-actions">
          <Link className="not-found-home" to="/"><ArrowLeft size={18} aria-hidden="true" />Volver al inicio</Link>
          <Link className="not-found-catalog" to="/catalogo">Ver la carta</Link>
        </div>
      </div>
    </main>
  );
}
