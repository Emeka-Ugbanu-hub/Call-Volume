import { useState, useEffect, useCallback } from 'react';
import { fetchMapDataWithCache } from '../lib/api';

export function useMapData(filters){
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchMapDataWithCache(filters);
      setData(result);
    } catch (err) {
      console.error('Error fetching map data:', err);
      setError(err  ? err : new Error('Unknown error occurred'));
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
