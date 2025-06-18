import { useState, useEffect } from 'react';
import { fetchIndustries } from '../lib/api';


export function useIndustries() {
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchIndustries();
      setIndustries(data);
    } catch (err) {
      setError(err ? err : new Error('Failed to fetch industries'));
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
