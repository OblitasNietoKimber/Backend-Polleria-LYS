import { useSyncExternalStore } from 'react';
import { subscribeAuth, getAuthSnapshot } from '../services/authService';
export function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
}
