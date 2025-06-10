import { useState, useCallback, useMemo } from 'react';
import { CountyData, CountySelectionState, CountyBoundaryData } from '@/components/LeadsMap/types';
import { fetchCountyBoundary } from '@/lib/nominatim';

export function useCountySelection() {
  const [selectionState, setSelectionState] = useState<CountySelectionState>({
    selectedCounties: [],
    hoveredCounty: null,
    showCountyStats: false,
  });

  // State for county boundaries
  const [countyBoundaries, setCountyBoundaries] = useState<Map<string, CountyBoundaryData>>(new Map());
  const [loadingBoundaries, setLoadingBoundaries] = useState<Set<string>>(new Set());

  const selectCounty = useCallback(async (countyName: string, stateName?: string) => {
    const countyKey = `${countyName}, ${stateName || ''}`;
    
    // Toggle selection
    setSelectionState(prev => ({
      ...prev,
      selectedCounties: prev.selectedCounties.includes(countyName)
        ? prev.selectedCounties.filter(name => name !== countyName)
        : [...prev.selectedCounties, countyName],
    }));

    // Fetch boundary if not already loaded and county is being selected
    if (stateName && !countyBoundaries.has(countyKey) && !loadingBoundaries.has(countyKey)) {
      setLoadingBoundaries(prev => {
        const newSet = new Set(prev);
        newSet.add(countyKey);
        return newSet;
      });
      
      try {
        const boundary = await fetchCountyBoundary(countyName, stateName);
        if (boundary) {
          setCountyBoundaries(prev => new Map(prev).set(countyKey, boundary));
        }
      } catch (error) {
        console.error(`Error fetching boundary for ${countyKey}:`, error);
      } finally {
        setLoadingBoundaries(prev => {
          const newSet = new Set(prev);
          newSet.delete(countyKey);
          return newSet;
        });
      }
    }
  }, [countyBoundaries, loadingBoundaries]);

  const selectMultipleCounties = useCallback((countyNames: string[]) => {
    setSelectionState(prev => {
      const uniqueCounties = Array.from(new Set([...prev.selectedCounties, ...countyNames]));
      return {
        ...prev,
        selectedCounties: uniqueCounties,
      };
    });
  }, []);

  const deselectCounty = useCallback((countyName: string) => {
    setSelectionState(prev => ({
      ...prev,
      selectedCounties: prev.selectedCounties.filter(name => name !== countyName),
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionState(prev => ({
      ...prev,
      selectedCounties: [],
    }));
  }, []);

  const setHoveredCounty = useCallback((countyName: string | null) => {
    setSelectionState(prev => ({
      ...prev,
      hoveredCounty: countyName,
    }));
  }, []);

  const toggleCountyStats = useCallback(() => {
    setSelectionState(prev => ({
      ...prev,
      showCountyStats: !prev.showCountyStats,
    }));
  }, []);

  const setShowCountyStats = useCallback((show: boolean) => {
    setSelectionState(prev => ({
      ...prev,
      showCountyStats: show,
    }));
  }, []);

  // Helper function to get aggregated stats for selected counties
  const getSelectedCountiesStats = useCallback((countyData: CountyData[]) => {
    const selectedData = countyData.filter(county => 
      selectionState.selectedCounties.includes(county.countyName)
    );

    if (selectedData.length === 0) return null;

    const aggregated = selectedData.reduce((acc, county) => {
      const stats = county.aggregatedStats;
      return {
        totalRequests: acc.totalRequests + stats.totalRequests,
        totalConversions: acc.totalConversions + stats.totalConversions,
        totalCallsConnected: acc.totalCallsConnected + stats.totalCallsConnected,
        totalZipCodes: acc.totalZipCodes + stats.zipCodeCount,
        countyCount: acc.countyCount + 1,
        avgBidSum: acc.avgBidSum + stats.avgBid,
        minBid: Math.min(acc.minBid, stats.minBid),
        maxBid: Math.max(acc.maxBid, stats.maxBid),
      };
    }, {
      totalRequests: 0,
      totalConversions: 0,
      totalCallsConnected: 0,
      totalZipCodes: 0,
      countyCount: 0,
      avgBidSum: 0,
      minBid: Infinity,
      maxBid: -Infinity,
    });

    return {
      ...aggregated,
      avgBid: aggregated.avgBidSum / aggregated.countyCount,
      conversionRate: aggregated.totalRequests > 0 
        ? (aggregated.totalConversions / aggregated.totalRequests) * 100 
        : 0,
      connectionRate: aggregated.totalRequests > 0 
        ? (aggregated.totalCallsConnected / aggregated.totalRequests) * 100 
        : 0,
    };
  }, [selectionState.selectedCounties]);

  const isCountySelected = useCallback((countyName: string) => {
    return selectionState.selectedCounties.includes(countyName);
  }, [selectionState.selectedCounties]);

  const selectedCountiesCount = selectionState.selectedCounties.length;
  const hasSelection = selectedCountiesCount > 0;

  // Get county boundary for a specific county
  const getCountyBoundary = useCallback((countyName: string, stateName: string): CountyBoundaryData | null => {
    const countyKey = `${countyName}, ${stateName}`;
    return countyBoundaries.get(countyKey) || null;
  }, [countyBoundaries]);

  // Check if a county boundary is loading
  const isBoundaryLoading = useCallback((countyName: string, stateName: string): boolean => {
    const countyKey = `${countyName}, ${stateName}`;
    return loadingBoundaries.has(countyKey);
  }, [loadingBoundaries]);

  return {
    selectionState,
    selectCounty,
    selectMultipleCounties,
    deselectCounty,
    clearSelection,
    setHoveredCounty,
    toggleCountyStats,
    setShowCountyStats,
    getSelectedCountiesStats,
    isCountySelected,
    selectedCountiesCount,
    hasSelection,
    countyBoundaries,
    getCountyBoundary,
    isBoundaryLoading,
  };
}