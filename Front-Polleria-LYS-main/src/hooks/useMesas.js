import { useCallback, useEffect, useMemo, useState } from 'react';
import mesaService from '../services/mesaService';
import useOrderResource from './useOrderResource';
const loadMesas = () => mesaService.fetchMesas({ strict: true });
export default function useMesas(zona = 'salon_principal') {
  const { data, loading, error, retry } = useOrderResource(loadMesas, 5000);
  const listaCompleta = useMemo(() => data || [], [data]);
  const [actividades, setActividades] = useState(() => mesaService.getActividades());

  useEffect(() => {
    let cancelado = false;
    async function cargarActividades() {
      try {
        const acts = await mesaService.fetchActividades();
        if (!cancelado && Array.isArray(acts)) {
          setActividades(acts);
        }
      } catch {
        if (!cancelado) setActividades(mesaService.getActividades());
      }
    }
    cargarActividades();

    const refresh = async () => {
      try {
        const acts = await mesaService.fetchActividades();
        setActividades(acts);
      } catch {
        setActividades(mesaService.getActividades());
      }
    };

    window.addEventListener('lys_actividades_updated', refresh);
    return () => {
      cancelado = true;
      window.removeEventListener('lys_actividades_updated', refresh);
    };
  }, []);

  const recargar = useCallback(async () => {
    await retry();
    try {
      const acts = await mesaService.fetchActividades();
      setActividades(acts);
    } catch {
      setActividades(mesaService.getActividades());
    }
  }, [retry]);

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
