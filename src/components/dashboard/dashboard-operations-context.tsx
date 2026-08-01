'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type DashboardRealtimeState = 'unavailable' | 'connecting' | 'connected' | 'degraded';

interface DashboardOperationsRegistration {
  realtimeState: DashboardRealtimeState;
  recentOrderCount: number;
  isRefreshing: boolean;
  soundEnabled: boolean;
  soundActivating: boolean;
  onRefresh: (() => void) | null;
  onToggleSound: (() => void) | null;
  onOpenLatestOrder: (() => void) | null;
}

interface DashboardOperationsContextValue extends DashboardOperationsRegistration {
  search: string;
  setSearch: (value: string) => void;
  register: (registration: DashboardOperationsRegistration) => void;
  reset: () => void;
}

const EMPTY_REGISTRATION: DashboardOperationsRegistration = {
  realtimeState: 'connecting',
  recentOrderCount: 0,
  isRefreshing: false,
  soundEnabled: false,
  soundActivating: false,
  onRefresh: null,
  onToggleSound: null,
  onOpenLatestOrder: null,
};

const DEFAULT_CONTEXT: DashboardOperationsContextValue = {
  ...EMPTY_REGISTRATION,
  search: '',
  setSearch: () => undefined,
  register: () => undefined,
  reset: () => undefined,
};

const DashboardOperationsContext = createContext<DashboardOperationsContextValue>(DEFAULT_CONTEXT);

export function DashboardOperationsProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState('');
  const [registration, setRegistration] = useState(EMPTY_REGISTRATION);

  const register = useCallback((next: DashboardOperationsRegistration) => {
    setRegistration(next);
  }, []);

  const reset = useCallback(() => {
    setSearch('');
    setRegistration(EMPTY_REGISTRATION);
  }, []);

  const value = useMemo(
    () => ({ search, setSearch, register, reset, ...registration }),
    [register, registration, reset, search],
  );

  return (
    <DashboardOperationsContext.Provider value={value}>
      {children}
    </DashboardOperationsContext.Provider>
  );
}

export function useDashboardOperations() {
  return useContext(DashboardOperationsContext);
}
