import { useCallback } from 'react';
import { requireInsforge } from '../../lib/insforge';
import useOrderResource from '../../hooks/useOrderResource';
import { RETURN_EVENT } from '../../services/orderUpdates';
import { money } from '../../utils/flowFormat';
import '../../styles/attentionFlow.css';

const eventosDevoluciones = [RETURN_EVENT];

export default function FlowReturnsSummary({ filters }) {
  const cargar = useCallback(async () => {
    const { data, error } = await requireInsforge().database.rpc('flujo_devoluciones', {
      p_desde: filters.fechaInicio || null,
      p_hasta: filters.fechaFin || null,
    });
    if (error) throw error;
    return data;
  }, [filters]);
  const { data: summary, error } = useOrderResource(cargar, { events: eventosDevoluciones });

  return (
    <aside className="flow-notice" role="status">
      Los indicadores de ventas conservan los cobros brutos y sus comprobantes.{' '}
      {error ? `No se pudo consultar devoluciones: ${error}` : summary
        ? `Devoluciones realizadas en el periodo: ${summary.cantidad} · ${money(summary.total)}.`
        : 'Consultando devoluciones…'}{' '}
      Las devoluciones se cuentan por fecha real de devolución.
    </aside>
  );
}
