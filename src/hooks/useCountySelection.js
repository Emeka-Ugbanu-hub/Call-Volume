import { useState, useCallback, useMemo, useRef } from 'react';
import { fetchCountyBoundary } from '../lib/nominatim';

export function useCountySelection() {
  const [selectionState, setSelectionState] = useState({
    selectedCounties: [],
    hoveredCounty: null,
    showCountyStats: false,
  });

  const [countyBoundaries, setCountyBoundaries] = useState(new Map());
  const [loadingBoundaries, setLoadingBoundaries] = useState(new Set());
  
  const [lazyLoadingState, setLazyLoadingState] = useState({
    isLoading: false,
    loadedCount: 0,
    totalCount: 0,
    currentPriority: 'viewport'
  });
  
  const loadingQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  const abortControllerRef = useRef(null);

  const calculateDistance = useCallback((
    point, 
    viewCenter
  ) => {
    const dx = point[0] - viewCenter[0];
    const dy = point[1] - viewCenter[1];
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const isInViewportBounds = useCallback((
    point,
    viewport
  ) => {
    const [lon, lat] = point;
    const { sw, ne } = viewport.bounds;
    
    const padding = 0.5;
    return (
      lon >= sw[0] - padding && 
      lon <= ne[0] + padding && 
      lat >= sw[1] - padding && 
      lat <= ne[1] + padding
    );
  }, []);

  const prioritizeCounties = useCallback((
    counties,
    viewport
  ) => {
    return counties.map(county => {
      const countyKey = `${county.countyName}, ${county.stateName}`;
      
      if (!viewport) {
        return {
          countyKey,
          countyName: county.countyName,
          stateName: county.stateName,
          coordinates: county.coordinates,
          priority: 'medium'
        };
      }

      const inViewport = isInViewportBounds(county.coordinates, viewport);
      const distance = calculateDistance(county.coordinates, viewport.center);

      let priority ;
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

  const processJobBatch = useCallback(async (
    jobs, 
    batchSize, 
    delayBetweenBatches
  ) => {
    for (let i = 0; i < jobs.length; i += batchSize) {
      if (abortControllerRef.current?.signal.aborted) {
        break;
      }

      const batch = jobs.slice(i, i + batchSize);
      const promises = batch.map(async (job) => {
        try {
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

      loadingQueueRef.current = loadingQueueRef.current.filter(
        queueJob => !batch.some(batchJob => batchJob.countyKey === queueJob.countyKey)
      );

      if (i + batchSize < jobs.length && delayBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
  }, [countyBoundaries, loadingBoundaries]);

  const processLoadingQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || loadingQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;
    
    const sortedQueue = [...loadingQueueRef.current].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      
      if (priorityDiff !== 0) return priorityDiff;
      
      return (a.distance || 0) - (b.distance || 0);
    });

    const highPriorityJobs = sortedQueue.filter(job => job.priority === 'high');
    const mediumPriorityJobs = sortedQueue.filter(job => job.priority === 'medium');
    const lowPriorityJobs = sortedQueue.filter(job => job.priority === 'low');

    setLazyLoadingState(prev => ({
      ...prev,
      isLoading: true,
      currentPriority: highPriorityJobs.length > 0 ? 'viewport' : 'background'
    }));

    try {
      if (highPriorityJobs.length > 0) {
        await processJobBatch(highPriorityJobs, 3, 100);
      }

      if (mediumPriorityJobs.length > 0) {
        await processJobBatch(mediumPriorityJobs, 2, 200);
      }

      if (lowPriorityJobs.length > 0) {
        setLazyLoadingState(prev => ({ ...prev, currentPriority: 'background' }));
        await processJobBatch(lowPriorityJobs, 1, 500);
      }

    } catch (error) {
    } finally {
      isProcessingQueueRef.current = false;
      setLazyLoadingState(prev => ({
        ...prev,
        isLoading: false,
        currentPriority: 'viewport'
      }));
    }
  }, [processJobBatch]);

  const selectCounty = useCallback(async (countyName, stateName) => {
    const countyKey = `${countyName}, ${stateName || ''}`;
    
    setSelectionState(prev => ({
      ...prev,
      selectedCounties: prev.selectedCounties.includes(countyName)
        ? prev.selectedCounties.filter(name => name !== countyName)
        : [...prev.selectedCounties, countyName],
    }));

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
      } finally {
        setLoadingBoundaries(prev => {
          const newSet = new Set(prev);
          newSet.delete(countyKey);
          return newSet;
        });
      }
    }
  }, [countyBoundaries, loadingBoundaries]);

  const selectMultipleCounties = useCallback((countyNames) => {
    setSelectionState(prev => {
      const uniqueCounties = Array.from(new Set([...prev.selectedCounties, ...countyNames]));
      return {
        ...prev,
        selectedCounties: uniqueCounties,
      };
    });
  }, []);

  const deselectCounty = useCallback((countyName) => {
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

  const setHoveredCounty = useCallback((countyName) => {
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

  const setShowCountyStats = useCallback((show) => {
    setSelectionState(prev => ({
      ...prev,
      showCountyStats: show,
    }));
  }, []);

  const getSelectedCountiesStats = useCallback((countyData) => {
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

  const isCountySelected = useCallback((countyName) => {
    return selectionState.selectedCounties.includes(countyName);
  }, [selectionState.selectedCounties]);

  const selectedCountiesCount = selectionState.selectedCounties.length;
  const hasSelection = selectedCountiesCount > 0;

  const getCountyBoundary = useCallback((countyName, stateName) => {
    const countyKey = `${countyName}, ${stateName}`;
    return countyBoundaries.get(countyKey) || null;
  }, [countyBoundaries]);

  const isBoundaryLoading = useCallback((countyName, stateName) => {
    const countyKey = `${countyName}, ${stateName}`;
    return loadingBoundaries.has(countyKey);
  }, [loadingBoundaries]);

  const lazyLoadCountyBoundaries = useCallback((
    counties,
    viewport
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const countiesNeedingLoad = counties.filter(county => {
      const countyKey = `${county.countyName}, ${county.stateName}`;
      return !countyBoundaries.has(countyKey) && !loadingBoundaries.has(countyKey);
    });

    if (countiesNeedingLoad.length === 0) {
      return;
    }

    const prioritizedJobs = prioritizeCounties(countiesNeedingLoad, viewport);
    
    loadingQueueRef.current = [...loadingQueueRef.current, ...prioritizedJobs];
    
    const uniqueQueue = Array.from(
      new Map(loadingQueueRef.current.map(job => [job.countyKey, job])).values()
    );
    loadingQueueRef.current = uniqueQueue;

    setLazyLoadingState(prev => ({
      ...prev,
      totalCount: Math.max(prev.totalCount, uniqueQueue.length)
    }));

    processLoadingQueue();
  }, [countyBoundaries, loadingBoundaries, prioritizeCounties, processLoadingQueue]);

  const updateViewportPriority = useCallback((
    viewport
  ) => {
    if (loadingQueueRef.current.length === 0) return;

    loadingQueueRef.current = loadingQueueRef.current.map(job => {
      const inViewport = isInViewportBounds(job.coordinates, viewport);
      const distance = calculateDistance(job.coordinates, viewport.center);

      let priority ;
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
  }, [isInViewportBounds, calculateDistance]);

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
  }, []);

  const preloadCountyBoundary = useCallback(async (countyName, stateName) => {
    const countyKey = `${countyName}, ${stateName}`;
    
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
    preloadCountyBoundary,
    lazyLoadCountyBoundaries,
    updateViewportPriority,
    cancelLazyLoading,
    lazyLoadingState,
  };
}