import { useState, useCallback } from 'react';



export function useFilters({
  industryId,
  timeframe = '7_days',
  zipCodes,
}) {
  const initialFilters = {
    industryId,
    timeframe,
    zipCodes,
  };

  const [filters, setFilters] = useState(initialFilters);

  const updateFilters = useCallback((updates) => {
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
