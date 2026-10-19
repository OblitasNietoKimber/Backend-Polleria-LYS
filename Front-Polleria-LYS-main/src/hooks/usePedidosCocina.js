import cocinaService from '../services/cocinaService';
import useOrderResource from './useOrderResource';
export default function usePedidosCocina() {
  const { data, retry, ...state } = useOrderResource(cocinaService.getPedidosActivos, 5000);
  return { pedidos: data || [], recargar: retry, ...state };
}
