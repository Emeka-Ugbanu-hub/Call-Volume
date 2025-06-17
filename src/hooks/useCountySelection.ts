import { useState, useCallback, useMemo, useRef } from 'react';
import { CountyData, CountySelectionState, CountyBoundaryData } from '@/components/LeadsMap/types';
import { fetchCountyBoundary } from '@/lib/nominatim';

interface LazyLoadingState {
  isLoading: boolean;
  loadedCount: number;
  totalCount: number;
  currentPriority: 'viewport' | 'background';
}

interface CountyLoadingJob {
  countyKey: string;
  countyName: string;
  stateName: string;
  coordinates: [number, number];
  priority: 'high' | 'medium' | 'low';
  distance?: number;
}

export function useCountySelection() {
  const [selectionState, setSelectionState] = useState<CountySelectionState>({
    selectedCounties: [],
    hoveredCounty: null,
    showCountyStats: false,
  });

  // State for county boundaries
  const [countyBoundaries, setCountyBoundaries] = useState<Map<string, CountyBoundaryData>>(new Map());
  const [loadingBoundaries, setLoadingBoundaries] = useState<Set<string>>(new Set());
  
  // Lazy loading state
  const [lazyLoadingState, setLazyLoadingState] = useState<LazyLoadingState>({
    isLoading: false,
    loadedCount: 0,
    totalCount: 0,
    currentPriority: 'viewport'
  });
  
  // Queue management for lazy loading
  const loadingQueueRef = useRef<CountyLoadingJob[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Utility functions for viewport-aware loading
  const calculateDistance = useCallback((
    point: [number, number], 
    viewCenter: [number, number]
  ): number => {
    const dx = point[0] - viewCenter[0];
    const dy = point[1] - viewCenter[1];
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const isInViewportBounds = useCallback((
    point: [number, number],
    viewport: { center: [number, number]; bounds: { sw: [number, number]; ne: [number, number] } }
  ): boolean => {
    const [lon, lat] = point;
    const { sw, ne } = viewport.bounds;
    
    // Add some padding to include counties just outside viewport
    const padding = 0.5; // degrees
    return (
      lon >= sw[0] - padding && 
      lon <= ne[0] + padding && 
      lat >= sw[1] - padding && 
      lat <= ne[1] + padding
    );
  }, []);

  const prioritizeCounties = useCallback((
    counties: Array<{ countyName: string; stateName: string; coordinates: [number, number] }>,
    viewport?: { center: [number, number]; bounds: { sw: [number, number]; ne: [number, number] } }
  ): CountyLoadingJob[] => {
    return counties.map(county => {
      const countyKey = `${county.countyName}, ${county.stateName}`;
      
      if (!viewport) {
        return {
          countyKey,
          countyName: county.countyName,
          stateName: county.stateName,
          coordinates: county.coordinates,
          priority: 'medium' as const
        };
      }

      const inViewport = isInViewportBounds(county.coordinates, viewport);
      const distance = calculateDistance(county.coordinates, viewport.center);

      let priority: 'high' | 'medium' | 'low';
      if (inViewport) {
        priority = distance < 1 ? 'high' : 'medium';
      } else {
        priority = 'low';
      }

      return {
        countyKey,
        countyName: county.countyName,
        stateName: county.stateName,
        coordinates: county.coordinates,
        priority,
        distance
      };
    });
  }, [calculateDistance, isInViewportBounds]);

  // Process job batch with proper error handling
  const processJobBatch = useCallback(async (
    jobs: CountyLoadingJob[], 
    batchSize: number, 
    delayBetweenBatches: number
  ) => {
    for (let i = 0; i < jobs.length; i += batchSize) {
      if (abortControllerRef.current?.signal.aborted) {
        console.log('🚫 County loading aborted');
        break;
      }

      const batch = jobs.slice(i, i + batchSize);
      const promises = batch.map(async (job) => {
        try {
          // Check if already loaded or loading
          if (countyBoundaries.has(job.countyKey) || loadingBoundaries.has(job.countyKey)) {
            return null;
          }

          setLoadingBoundaries(prev => new Set(prev).add(job.countyKey));

          const boundary = await fetchCountyBoundary(job.countyName, job.stateName);
          if (boundary && !abortControllerRef.current?.signal.aborted) {
            setCountyBoundaries(prev => new Map(prev).set(job.countyKey, boundary));
            setLazyLoadingState(prev => ({
              ...prev,
              loadedCount: prev.loadedCount + 1
            }));
          }

          return boundary;
        } catch (error) {
          console.error(`❌ Error loading boundary for ${job.countyKey}:`, error);
          return null;
        } finally {
          setLoadingBoundaries(prev => {
            const newSet = new Set(prev);
            newSet.delete(job.countyKey);
            return newSet;
          });
        }
      });

      await Promise.all(promises);

      // Remove processed jobs from queue
      loadingQueueRef.current = loadingQueueRef.current.filter(
        queueJob => !batch.some(batchJob => batchJob.countyKey === queueJob.countyKey)
      );

      // Add delay between batches to prevent overwhelming the API
      if (i + batchSize < jobs.length && delayBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
  }, [countyBoundaries, loadingBoundaries]);

  // Process loading queue with priorities
  const processLoadingQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || loadingQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;
    
    // Sort queue by priority and distance
    const sortedQueue = [...loadingQueueRef.current].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      
      if (priorityDiff !== 0) return priorityDiff;
      
      // If same priority, sort by distance (closer first)
      return (a.distance || 0) - (b.distance || 0);
    });

    // Process high priority counties first (batch them)
    const highPriorityJobs = sortedQueue.filter(job => job.priority === 'high');
    const mediumPriorityJobs = sortedQueue.filter(job => job.priority === 'medium');
    const lowPriorityJobs = sortedQueue.filter(job => job.priority === 'low');

    console.log(`🔄 Processing county loading queue: ${highPriorityJobs.length} high, ${mediumPriorityJobs.length} medium, ${lowPriorityJobs.length} low priority`);

    setLazyLoadingState(prev => ({
      ...prev,
      isLoading: true,
      currentPriority: highPriorityJobs.length > 0 ? 'viewport' : 'background'
    }));

    try {
      // Process high priority counties immediately (parallel, up to 3 at once)
      if (highPriorityJobs.length > 0) {
        await processJobBatch(highPriorityJobs, 3, 100); // 100ms delay between batches
      }

      // Process medium priority counties with slight delay
      if (mediumPriorityJobs.length > 0) {
        await processJobBatch(mediumPriorityJobs, 2, 200); // 200ms delay between batches
      }

      // Process low priority counties with longer delay (background loading)
      if (lowPriorityJobs.length > 0) {
        setLazyLoadingState(prev => ({ ...prev, currentPriority: 'background' }));
        await processJobBatch(lowPriorityJobs, 1, 500); // 500ms delay between batches
      }

    } catch (error) {
      console.error('❌ Error processing county loading queue:', error);
    } finally {
      isProcessingQueueRef.current = false;
      setLazyLoadingState(prev => ({
        ...prev,
        isLoading: false,
        currentPriority: 'viewport'
      }));
    }
  }, [processJobBatch]);

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

  // Main lazy loading function
  const lazyLoadCountyBoundaries = useCallback((
    counties: Array<{ countyName: string; stateName: string; coordinates: [number, number] }>,
    viewport?: { center: [number, number]; bounds: { sw: [number, number]; ne: [number, number] } }
  ) => {
    // Cancel any existing loading
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Filter out counties that are already loaded or loading
    const countiesNeedingLoad = counties.filter(county => {
      const countyKey = `${county.countyName}, ${county.stateName}`;
      return !countyBoundaries.has(countyKey) && !loadingBoundaries.has(countyKey);
    });

    if (countiesNeedingLoad.length === 0) {
      console.log('✅ All county boundaries already loaded or loading');
      return;
    }

    // Prioritize counties based on viewport
    const prioritizedJobs = prioritizeCounties(countiesNeedingLoad, viewport);
    
    // Add to loading queue
    loadingQueueRef.current = [...loadingQueueRef.current, ...prioritizedJobs];
    
    // Remove duplicates from queue
    const uniqueQueue = Array.from(
      new Map(loadingQueueRef.current.map(job => [job.countyKey, job])).values()
    );
    loadingQueueRef.current = uniqueQueue;

    // Update total count for progress tracking
    setLazyLoadingState(prev => ({
      ...prev,
      totalCount: Math.max(prev.totalCount, uniqueQueue.length)
    }));

    console.log(`🔄 Added ${prioritizedJobs.length} counties to lazy loading queue (${uniqueQueue.length} total)`);

    // Start processing queue
    processLoadingQueue();
  }, [countyBoundaries, loadingBoundaries, prioritizeCounties, processLoadingQueue]);

  // Update viewport priority for existing queue
  const updateViewportPriority = useCallback((
    viewport: { center: [number, number]; bounds: { sw: [number, number]; ne: [number, number] } }
  ) => {
    if (loadingQueueRef.current.length === 0) return;

    // Re-prioritize existing queue based on new viewport
    loadingQueueRef.current = loadingQueueRef.current.map(job => {
      const inViewport = isInViewportBounds(job.coordinates, viewport);
      const distance = calculateDistance(job.coordinates, viewport.center);

      let priority: 'high' | 'medium' | 'low';
      if (inViewport) {
        priority = distance < 1 ? 'high' : 'medium';
      } else {
        priority = 'low';
      }

      return {
        ...job,
        priority,
        distance
      };
    });

    console.log(`📍 Updated viewport priorities for ${loadingQueueRef.current.length} queued counties`);
  }, [isInViewportBounds, calculateDistance]);

  // Cancel lazy loading
  const cancelLazyLoading = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    loadingQueueRef.current = [];
    isProcessingQueueRef.current = false;
    
    setLazyLoadingState({
      isLoading: false,
      loadedCount: 0,
      totalCount: 0,
      currentPriority: 'viewport'
    });

    console.log('🚫 Cancelled lazy loading');
  }, []);

  // Preload county boundary without affecting selection state (backward compatibility)
  const preloadCountyBoundary = useCallback(async (countyName: string, stateName: string): Promise<void> => {
    const countyKey = `${countyName}, ${stateName}`;
    
    // Only load if not already loaded and not currently loading
    if (!countyBoundaries.has(countyKey) && !loadingBoundaries.has(countyKey)) {
      setLoadingBoundaries(prev => {
        const newSet = new Set(prev);
        newSet.add(countyKey);
        return newSet;
      });
      
      try {
        const boundary = await fetchCountyBoundary(countyName, stateName);
        if (boundary) {
          setCountyBoundaries(prev => new Map(prev).set(countyKey, boundary));
          setLazyLoadingState(prev => ({
            ...prev,
            loadedCount: prev.loadedCount + 1
          }));
        }
      } catch (error) {
        console.error(`Error preloading boundary for ${countyKey}:`, error);
      } finally {
        setLoadingBoundaries(prev => {
          const newSet = new Set(prev);
          newSet.delete(countyKey);
          return newSet;
        });
      }
    }
  }, [countyBoundaries, loadingBoundaries]);

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
    preloadCountyBoundary, // Backward compatibility
    // Lazy loading functions
    lazyLoadCountyBoundaries,
    updateViewportPriority,
    cancelLazyLoading,
    lazyLoadingState,
  };
}