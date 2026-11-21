import { useEffect, useMemo } from 'react';
import mesaService from '../services/mesaService';
import useOrderResource from './useOrderResource';
import { FLOW_PREVIEW } from '../services/atencionService';
import { MESA_EVENT, ORDER_EVENT } from '../services/orderUpdates';

const eventosMesas = [ORDER_EVENT, MESA_EVENT];
const afectaSalon = cambio => cambio.event === MESA_EVENT || !cambio.tipo || cambio.tipo === 'salon';
const loadMesas = async () => {
  const [mesas, actividades] = await Promise.all([
    mesaService.fetchMesas({ strict: true }),
    mesaService.fetchActividades(),
  ]);
  return { mesas, actividades };
};

export default function useMesas(zona = 'salon_principal') {
  const { data, loading, error, retry: recargar } = useOrderResource(loadMesas, {
    events: eventosMesas,
    filter: afectaSalon,
  });
  const listaCompleta = useMemo(() => data?.mesas || [], [data]);
  const actividades = useMemo(() => data?.actividades || mesaService.getActividades(), [data]);

  useEffect(() => {
    if (FLOW_PREVIEW) return;
    const actualizar = () => { void recargar(); };
    window.addEventListener('lys_actividades_updated', actualizar);
    return () => window.removeEventListener('lys_actividades_updated', actualizar);
  }, [recargar]);

  const mesas = useMemo(
    () => (!zona || zona === 'todas' ? listaCompleta : listaCompleta.filter((m) => m.zona === zona)),
    [listaCompleta, zona]
  );

  const estadisticas = useMemo(() => {
    const total = mesas.length || 1;
    const libres = mesas.filter((m) => m.estado === 'libre').length;
    const ocupadas = mesas.filter((m) => m.estado === 'ocupada').length;
    const reservadas = mesas.filter((m) => m.estado === 'reservada').length;
    return {
      total,
      libres,
      ocupadas,
      reservadas,
      pctLibres: ((libres / total) * 100).toFixed(1),
      pctOcupadas: ((ocupadas / total) * 100).toFixed(1),
      pctReservadas: ((reservadas / total) * 100).toFixed(1),
    };
  }, [mesas]);

  return {
    mesas,
    estadisticas,
    actividades,
    loading,
    error,
    recargar,
    liberarMesa: async (numero) => {
      await mesaService.liberarMesa(numero);
      await recargar();
    },
    reservarMesa: async (numero, datos) => {
      await mesaService.reservarMesa(numero, datos);
      await recargar();
    },
    ocuparMesa: (numero, pedidoId, total) => {
      mesaService.ocuparMesa(numero, pedidoId, total);
      return recargar();
    },
  };

}
