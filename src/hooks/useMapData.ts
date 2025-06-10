import { useState, useEffect, useCallback } from 'react';
import { MapDataResponse, MapFilters } from '@/components/LeadsMap/types';
import { fetchMapDataWithCache } from '@/lib/api';

interface UseMapDataReturn {
  data: MapDataResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMapData(filters: MapFilters): UseMapDataReturn {
  const [data, setData] = useState<MapDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchMapDataWithCache(filters);
      setData(result);
    } catch (err) {
      console.error('Error fetching map data:', err);
      setError(err instanceof Error ? err : new Error('Unknown error occurred'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}
