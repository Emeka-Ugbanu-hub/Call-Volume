import { useState, useEffect } from 'react';
import { IndustriesResponse } from '@/components/LeadsMap/types';
import { fetchIndustries } from '@/lib/api';

interface UseIndustriesReturn {
  industries: IndustriesResponse;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useIndustries(): UseIndustriesReturn {
  const [industries, setIndustries] = useState<IndustriesResponse>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchIndustries();
      setIndustries(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch industries'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    industries,
    loading,
    error,
    refetch: fetchData,
  };
}
