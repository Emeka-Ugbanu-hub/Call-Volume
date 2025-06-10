import { useState, useCallback } from 'react';
import { MapFilters } from '@/components/LeadsMap/types';

interface UseFiltersProps {
  industryId: number;
  timeframe?: '7_days' | '30_days';
  zipCodes?: string[];
}

interface UseFiltersReturn {
  filters: MapFilters;
  updateFilters: (updates: Partial<MapFilters>) => void;
  resetFilters: () => void;
}

export function useFilters({
  industryId,
  timeframe = '7_days',
  zipCodes,
}: UseFiltersProps): UseFiltersReturn {
  const initialFilters: MapFilters = {
    industryId,
    timeframe,
    zipCodes,
  };

  const [filters, setFilters] = useState<MapFilters>(initialFilters);

  const updateFilters = useCallback((updates: Partial<MapFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  return {
    filters,
    updateFilters,
    resetFilters,
  };
}
