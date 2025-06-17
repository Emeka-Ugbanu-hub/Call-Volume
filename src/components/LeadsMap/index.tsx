'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Map, Source, Layer, Marker, Popup } from 'react-map-gl';
import { LeadsMapPropsWithCounties, MapDataPoint, MapTooltipData, CountyData } from './types';
import { FilterPanel } from './FilterPanel';
import { Tooltip } from './Tooltip';
import CountyStatsPanel from './CountyStatsPanel';
import { useMapData } from '@/hooks/useMapData';
import { useFilters } from '@/hooks/useFilters';
import { useCountySelection } from '@/hooks/useCountySelection';
import { useIndustries } from '@/hooks/useIndustries';
import { addCoordinatesToData, calculateMapBounds, aggregateDataByCounty } from '@/lib/geocoding';
import { createClusterData } from '@/lib/clustering';
import { countyBoundaryToGeoJSON } from '@/lib/nominatim';
import { getDMAGeoJSON, getProcessedDMAData, getCountiesInDMA, DMAData, pointInFeature } from '@/lib/dma';
import { cn } from '@/lib/utils';

import 'mapbox-gl/dist/mapbox-gl.css';

export const LeadsMap: React.FC<LeadsMapPropsWithCounties> = ({
  industryId,
  timeframe = '7_days',
  zipCodes,
  className,
  mapboxAccessToken,
  initialZoom = 4,
  initialCenter = [-95.7129, 37.0902], // Center of US
  mapStyle = 'mapbox://styles/mapbox/light-v11',
  showFilters = true,
  showLegend = true,
  enableClustering = true,
  heatmapIntensity = 1,
  onZipCodeClick,
  onDataLoad,
  onError,
  onCountySelect,
  onCountyHover,
}) => {
  const mapRef = useRef<any>(null);
  const [viewport, setViewport] = useState({
    longitude: initialCenter[0],
    latitude: initialCenter[1],
    zoom: initialZoom,
  });
  const [tooltipData, setTooltipData] = useState<MapTooltipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(true);
  const [showCountyStatsPanel, setShowCountyStatsPanel] = useState(true);
  const [isMobileView, setIsMobileView] = useState(false);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // DMA state management for zoom and interaction
  const [selectedDMA, setSelectedDMA] = useState<DMAData | null>(null);
  const [hoveredDMA, setHoveredDMA] = useState<string | null>(null);
  const [isZoomedToDMA, setIsZoomedToDMA] = useState(false);

  const [showCountiesInDMA, setShowCountiesInDMA] = useState(false);
  const [selectedCountiesInDMA, setSelectedCountiesInDMA] = useState<CountyData[]>([]);

  // Detect mobile view
  useEffect(() => {
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth < 640);
    };
    
    checkMobileView();
    window.addEventListener('resize', checkMobileView);
    return () => window.removeEventListener('resize', checkMobileView);
  }, []);

  // Filter state management
  const { filters, updateFilters } = useFilters({
    industryId,
    timeframe,
    zipCodes,
  });

  // County selection state (only when enabled)
  const countySelection = useCountySelection();

  // Industries data
  const { industries, loading: industriesLoading, error: industriesError } = useIndustries();

  // Data fetching
  const { data: rawData, loading, error: apiError, refetch } = useMapData(filters);

  // Process data with coordinates
  const [processedData, setProcessedData] = useState<Array<MapDataPoint & { coordinates: [number, number] | null }>>([]);
  const [countyData, setCountyData] = useState<CountyData[]>([]);

  // Process raw data with geocoding
  useEffect(() => {
    if (!rawData) return;

    const processData = async () => {
      setIsLoading(true);
      try {
        const dataWithCoords = await addCoordinatesToData(rawData, mapboxAccessToken);
        setProcessedData(dataWithCoords);
        
        // Always generate county data for DMA functionality
        const aggregatedCountyData = await aggregateDataByCounty(dataWithCoords, mapboxAccessToken);
        setCountyData(aggregatedCountyData);
        
        onDataLoad?.(rawData);
        
        // Auto-fit map to data bounds
        const bounds = calculateMapBounds(dataWithCoords);
        if (bounds && mapRef.current) {
          mapRef.current.fitBounds(
            [bounds.southwest, bounds.northeast],
            { padding: 60, duration: 1000 }
          );
        }
      } catch (err) {
        console.error('Error processing map data:', err);
        setError('Failed to process map data');
      } finally {
        setIsLoading(false);
      }
    };

    processData();
  }, [rawData, mapboxAccessToken, onDataLoad]);

  // Handle API errors
  useEffect(() => {
    if (apiError) {
      setError(apiError.message);
      onError?.(apiError);
    }
  }, [apiError, onError]);

  // Handle industries error
  useEffect(() => {
    if (industriesError) {
      console.warn('Industries loading failed:', industriesError.message);
      // Don't set main error for industries failure, just log it
    }
  }, [industriesError]);

  // Filter valid data points (with coordinates)
  const validDataPoints = processedData.filter(
    (point): point is MapDataPoint & { coordinates: [number, number] } => 
      point.coordinates !== null
  );

  // Create cluster data for heatmap
  const clusterData = enableClustering ? createClusterData(validDataPoints) : null;

  // DMA data processing with selection and hover states
  const dmaData = useMemo(() => {
    try {
      const geojson = getDMAGeoJSON();
      
      if (!geojson.features || geojson.features.length === 0) {
        console.warn('No DMA features found in processed data');
        return {
          type: 'FeatureCollection' as const,
          features: []
        };
      }
      
      console.log(`✅ Loaded ${geojson.features.length} DMA regions for map display`);
      
      // Add selection and hover states to each DMA feature
      const featuresWithState = geojson.features.map(feature => ({
        ...feature,
        properties: {
          ...feature.properties,
          isSelected: selectedDMA?.id === feature.properties?.dmaId,
          isHovered: hoveredDMA === feature.properties?.dmaId,
        }
      }));

      return {
        type: 'FeatureCollection' as const,
        features: featuresWithState
      };
    } catch (error) {
      console.error('❌ Error processing DMA data:', error);
      return {
        type: 'FeatureCollection' as const,
        features: []
      };
    }
  }, [selectedDMA, hoveredDMA]);

  // Create heatmap source data
  const heatmapSourceData = {
    type: 'FeatureCollection' as const,
    features: validDataPoints.map(point => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: point.coordinates,
      },
      properties: {
        weight: point.totalRequests,
        ...point,
      },
    })),
  };

  // Heatmap layer configuration
  const heatmapLayer = {
    id: 'heatmap',
    type: 'heatmap' as const,
    paint: {
      'heatmap-weight': [
        'interpolate',
        ['linear'],
        ['get', 'weight'],
        0, 0,
        100, 1,
      ] as any,
      'heatmap-intensity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0, 0.5 * heatmapIntensity,
        5, 1 * heatmapIntensity,
      ] as any,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(16, 185, 129, 0)', // transparent green
        0.2, 'rgba(16, 185, 129, 0.6)', // green-500
        0.4, 'rgba(34, 197, 94, 0.6)', // green-500
        0.6, 'rgba(234, 179, 8, 0.8)', // yellow-500
        0.8, 'rgba(239, 68, 68, 0.8)', // red-500
        1, 'rgba(220, 38, 38, 1)', // red-600
      ] as any,
      'heatmap-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0, 15,
        5, 20,
        10, 25,
      ] as any,
      'heatmap-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0, 0.8,
        14, 0.6,
      ] as any,
    },
  };

  // County boundary layer configuration - for all counties in DMA
  const allCountyBoundaryLayer = {
    id: 'all-county-boundaries',
    type: 'line' as const,
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
    paint: {
      'line-color': '#10B981', // Green border for all counties
      'line-width': isMobileView ? 2 : 1.5,
      'line-opacity': 0.7,
    },
  };

  // County boundary layer configuration - only for selected counties (filled)
  const countyBoundaryLayer = {
    id: 'county-boundaries',
    type: 'fill' as const,
    layout: {},
    paint: {
      'fill-color': isMobileView 
        ? 'rgba(16, 185, 129, 0.4)' // More visible on mobile
        : 'rgba(16, 185, 129, 0.3)', // green with transparency
      'fill-outline-color': '#10B981', // green border
    },
  };

  const countyBoundaryStrokeLayer = {
    id: 'county-boundaries-stroke',
    type: 'line' as const,
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
    paint: {
      'line-color': '#10B981',
      'line-width': isMobileView ? 3 : 2, // Thicker line on mobile
      'line-opacity': 1, // Fully opaque for selected counties
    },
  };

  // Clickable county fill layer - transparent but clickable areas for all counties
  const countyClickableAreaLayer = {
    id: 'county-clickable-areas',
    type: 'fill' as const,
    layout: {},
    paint: {
      'fill-color': 'rgba(0, 0, 0, 0)', // Completely transparent
      'fill-opacity': 0, // Invisible but still clickable
    },
  };

  // County label layers using native map symbols
  const countyLabelLayer = {
    id: 'county-labels',
    type: 'symbol' as const,
    layout: {
      'text-field': ['get', 'displayName'],
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4, isMobileView ? 12 : 10,    // Larger text on mobile
        8, isMobileView ? 14 : 12,    // Larger text on mobile
        12, isMobileView ? 16 : 14    // Larger text on mobile
      ] as any,
      'text-anchor': 'center',
      'text-justify': 'center',
      'text-allow-overlap': true,     // Always show labels even if they overlap
      'text-ignore-placement': true,  // Ignore placement conflicts
      'symbol-placement': 'point',
      'text-optional': false,         // Never hide the text
    } as any,
    paint: {
      'text-color': [
        'case',
        ['get', 'isSelected'],
        '#FFFFFF', // White text for selected counties
        '#374151'  // Gray text for unselected counties
      ] as any,
      'text-halo-color': [
        'case',
        ['get', 'isSelected'],
        '#10B981', // Green halo for selected counties
        '#FFFFFF'  // White halo for unselected counties
      ] as any,
      'text-halo-width': isMobileView ? 3 : 2, // Thicker halo on mobile for better visibility
      'text-halo-blur': 1,
      'text-opacity': 1,  // Always fully visible
    } as any,
    cursor: 'pointer', // Add pointer cursor for clickable labels
  };

  const countyCallsLayer = {
    id: 'county-calls',
    type: 'symbol' as const,
    layout: {
      'text-field': [
        'concat',
        ['to-string', ['get', 'totalCalls']],
        ' calls'
      ] as any,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4, isMobileView ? 10 : 8,     // Larger text on mobile
        8, isMobileView ? 12 : 10,    // Larger text on mobile
        12, isMobileView ? 14 : 12    // Larger text on mobile
      ] as any,
      'text-anchor': 'center',
      'text-justify': 'center',
      'text-offset': [0, 1.2],        // Slightly below the county name
      'text-allow-overlap': true,     // Always show labels even if they overlap
      'text-ignore-placement': true,  // Ignore placement conflicts
      'symbol-placement': 'point',
      'text-optional': false,         // Never hide the text
    } as any,
    paint: {
      'text-color': [
        'case',
        ['get', 'isSelected'],
        '#D1FAE5', // Light green text for selected counties
        '#6B7280'  // Gray text for unselected counties
      ] as any,
      'text-halo-color': [
        'case',
        ['get', 'isSelected'],
        '#047857', // Dark green for selected counties
        '#FFFFFF'  // White halo for unselected counties
      ] as any,
      'text-halo-width': isMobileView ? 3 : 2, // Thicker halo on mobile
      'text-halo-blur': 1,
      'text-opacity': 1,  // Always fully visible
    } as any,
    cursor: 'pointer', // Add pointer cursor for clickable labels
  };

  // Mobile touch target layer - invisible circles for better touch interaction
  const countyTouchTargetLayer = {
    id: 'county-touch-targets',
    type: 'circle' as const,
    layout: {},
    paint: {
      'circle-radius': isMobileView ? 30 : 15, // Even larger touch targets on mobile
      'circle-color': 'rgba(255, 255, 255, 0)', // Completely transparent
      'circle-opacity': 0, // Always invisible
      'circle-stroke-color': 'transparent', // No stroke
      'circle-stroke-width': 0, // No stroke width
      'circle-stroke-opacity': 0, // No stroke opacity
    },
  };

  // DMA layer configurations
  const dmaBorderLayer = {
    id: 'dma-borders',
    type: 'line' as const,
    paint: {
      'line-color': [
        'case',
        ['get', 'isSelected'],
        '#10B981', // Green for selected DMA
        ['get', 'isHovered'],
        '#6B7280', // Gray for hovered DMA
        '#374151'  // Dark gray for default DMA borders (bold as required)
      ] as any,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0, 3, // Bold default at all zoom levels
        8, 4  // Slightly thicker at higher zoom
      ] as any,
      'line-opacity': 1, // Always fully visible
    },
  };

  // DMA fill layer - transparent but clickable areas for entire DMA regions
  const dmaFillLayer = {
    id: 'dma-areas',
    type: 'fill' as const,
    layout: {},
    paint: {
      'fill-color': 'rgba(0, 0, 0, 0)', // Completely transparent
      'fill-opacity': 0, // Invisible but still clickable
    },
  };

  const dmaLabelLayer = {
    id: 'dma-labels',
    type: 'symbol' as const,
    layout: {
      'text-field': ['get', 'dmaName'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        2, isMobileView ? 12 : 10,
        4, isMobileView ? 14 : 12,
        6, isMobileView ? 16 : 14
      ] as any,
      'text-anchor': 'center',
      'text-justify': 'center',
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'symbol-placement': 'point',
    } as any,
    paint: {
      'text-color': [
        'case',
        ['get', 'isSelected'],
        '#047857', // Dark green for selected DMA
        ['get', 'isHovered'],
        '#374151', // Dark gray for hovered DMA
        '#FFFFFF'  // White for default (visibility on dark style)
      ] as any,
      'text-halo-color': [
        'case',
        ['get', 'isSelected'],
        '#FFFFFF', // White halo for selected
        ['get', 'isHovered'],
        '#FFFFFF', // White halo for hovered
        '#000000'  // Black halo for default
      ] as any,
      'text-halo-width': isMobileView ? 3 : 2,
      'text-halo-blur': 1,
    } as any,
  };

  // Handle marker click
  const handleMarkerClick = useCallback((point: MapDataPoint) => {
    onZipCodeClick?.(point);
  }, [onZipCodeClick]);

  // Handle marker leave
  const handleMarkerLeave = useCallback(() => {
    setTooltipData(null);
  }, []);

  // DMA interaction handlers
  const handleDMAClick = useCallback((dmaId: string, dmaName: string) => {
    const dmaData = getProcessedDMAData();
    const clickedDMA = dmaData.find(dma => dma.id === dmaId);
    
    if (clickedDMA && mapRef.current) {
      // Check if clicking the same DMA when already zoomed in
      if (isZoomedToDMA && selectedDMA?.id === dmaId) {
        // Do nothing - clicking same DMA when already zoomed in
        return;
      }
      
      // Hide counties when switching DMAs (selections preserved)
      setShowCountiesInDMA(false);
      setSelectedCountiesInDMA([]);
      // Note: NOT clearing county selections - they persist across DMA switches
      
      // If switching from another DMA, first zoom out, then zoom into new DMA
      if (isZoomedToDMA && selectedDMA?.id !== dmaId) {
        // First zoom out to show all data
        const bounds = calculateMapBounds(validDataPoints);
        if (bounds) {
          mapRef.current.fitBounds(
            [bounds.southwest, bounds.northeast],
            { padding: 60, duration: 800 }
          );
        } else {
          mapRef.current.flyTo({
            center: initialCenter,
            zoom: initialZoom,
            duration: 800
          });
        }
        
        // After zoom out, zoom into the new DMA
        setTimeout(() => {
          setSelectedDMA(clickedDMA);
          setIsZoomedToDMA(true);
          
          mapRef.current.fitBounds(
            [clickedDMA.bounds.southwest, clickedDMA.bounds.northeast],
            { 
              padding: isMobileView ? 20 : 40, 
              duration: 1200,
              minZoom: 8, // Match the manual zoom threshold for county display
              maxZoom: 8  // Set to exactly the same zoom level as manual detection
            }
          );
             // Show counties and pre-load their boundaries after zoom animation
        setTimeout(() => {
          setShowCountiesInDMA(true);
          
          // Only load boundaries for counties within this specific DMA
          const countiesInDMA = getCountiesInDMA(clickedDMA.id, countyData.map(c => ({
            countyName: c.countyName,
            stateName: c.stateName,
            coordinates: c.coordinates
          })));
          
          console.log(`🚀 Starting lazy loading for ${countiesInDMA.length} counties in DMA: ${clickedDMA.name}`);
          
          // Use lazy loading with viewport awareness
          if (mapRef.current) {
            const bounds = mapRef.current.getBounds();
            if (bounds) {
              const currentViewport = mapRef.current.getMap().getCenter();
              const viewportInfo = {
                center: [currentViewport.lng, currentViewport.lat] as [number, number],
                bounds: {
                  sw: [bounds.getSouthWest().lng, bounds.getSouthWest().lat] as [number, number],
                  ne: [bounds.getNorthEast().lng, bounds.getNorthEast().lat] as [number, number]
                }
              };
              countySelection.lazyLoadCountyBoundaries(countiesInDMA, viewportInfo);
            } else {
              // Fallback without viewport info
              countySelection.lazyLoadCountyBoundaries(countiesInDMA);
            }
          } else {
            // Fallback without viewport info
            countySelection.lazyLoadCountyBoundaries(countiesInDMA);
          }
        }, 1300);
        }, 900); // Start zoom in after zoom out completes
      } else {
        // First time zoom into DMA
        setSelectedDMA(clickedDMA);
        setIsZoomedToDMA(true);
        
        mapRef.current.fitBounds(
          [clickedDMA.bounds.southwest, clickedDMA.bounds.northeast],
          { 
            padding: isMobileView ? 20 : 40, 
            duration: 1500,
            minZoom: 8, // Match the manual zoom threshold for county display
            maxZoom: 8  // Set to exactly the same zoom level as manual detection
          }
        );
        
        // Show counties and pre-load their boundaries after zoom animation
        setTimeout(() => {
          setShowCountiesInDMA(true);
          
          // Only load boundaries for counties within this specific DMA
          const countiesInDMA = getCountiesInDMA(clickedDMA.id, countyData.map(c => ({
            countyName: c.countyName,
            stateName: c.stateName,
            coordinates: c.coordinates
          })));
          
          console.log(`🚀 Starting lazy loading for ${countiesInDMA.length} counties in DMA: ${clickedDMA.name}`);
          
          // Use lazy loading with viewport awareness
          if (mapRef.current) {
            const bounds = mapRef.current.getBounds();
            if (bounds) {
              const currentViewport = mapRef.current.getMap().getCenter();
              const viewportInfo = {
                center: [currentViewport.lng, currentViewport.lat] as [number, number],
                bounds: {
                  sw: [bounds.getSouthWest().lng, bounds.getSouthWest().lat] as [number, number],
                  ne: [bounds.getNorthEast().lng, bounds.getNorthEast().lat] as [number, number]
                }
              };
              countySelection.lazyLoadCountyBoundaries(countiesInDMA, viewportInfo);
            } else {
              // Fallback without viewport info
              countySelection.lazyLoadCountyBoundaries(countiesInDMA);
            }
          } else {
            // Fallback without viewport info
            countySelection.lazyLoadCountyBoundaries(countiesInDMA);
          }
        }, 1600);
      }
    }
  }, [isMobileView, isZoomedToDMA, selectedDMA, countySelection, validDataPoints, initialCenter, initialZoom, calculateMapBounds, countyData]);

  const handleDMAHover = useCallback((dmaId: string | null) => {
    setHoveredDMA(dmaId);
  }, []);

  const handleResetDMAZoom = useCallback(() => {
    if (mapRef.current) {
      setSelectedDMA(null);
      setIsZoomedToDMA(false);
      
      // Hide counties when resetting zoom (selections preserved)
      setShowCountiesInDMA(false);
      setSelectedCountiesInDMA([]);
      // Note: NOT clearing county selections - they persist when resetting zoom
      
      // Zoom back to full data extent
      const bounds = calculateMapBounds(validDataPoints);
      if (bounds) {
        mapRef.current.fitBounds(
          [bounds.southwest, bounds.northeast],
          { padding: 60, duration: 1000 }
        );
      } else {
        // Fallback to US center
        mapRef.current.flyTo({
          center: initialCenter,
          zoom: initialZoom,
          duration: 1000
        });
      }
    }
  }, [validDataPoints, initialCenter, initialZoom, countySelection]);

  // County selection handlers - always available
  const handleCountySelect = useCallback(async (county: CountyData) => {
    await countySelection.selectCounty(county.countyName, county.stateName);
    onCountySelect?.([county]);
  }, [countySelection, onCountySelect]);

  const handleCountyHover = useCallback((county: CountyData | null) => {
    if (county) {
      countySelection.setHoveredCounty(county.countyName);
    } else {
      countySelection.setHoveredCounty(null);
    }
    onCountyHover?.(county);
  }, [countySelection, onCountyHover]);

  // Handle manual zoom changes to show/hide counties based on zoom level and location
  const handleViewportChange = useCallback((newViewport: any) => {
    setViewport(newViewport);
    
    console.log(`🔄 Viewport change: zoom=${newViewport.zoom.toFixed(2)}, center=[${newViewport.longitude.toFixed(4)}, ${newViewport.latitude.toFixed(4)}], isZoomedToDMA=${isZoomedToDMA}, showCountiesInDMA=${showCountiesInDMA}`);
    
    // Update viewport priority for any ongoing lazy loading
    if (mapRef.current) {
      const bounds = mapRef.current.getBounds();
      if (bounds) {
        const viewportInfo = {
          center: [newViewport.longitude, newViewport.latitude] as [number, number],
          bounds: {
            sw: [bounds.getSouthWest().lng, bounds.getSouthWest().lat] as [number, number],
            ne: [bounds.getNorthEast().lng, bounds.getNorthEast().lat] as [number, number]
          }
        };
        countySelection.updateViewportPriority(viewportInfo);
      }
    }
    
    // If currently zoomed into a DMA and user manually zooms out below threshold, hide counties but preserve selections
    if (isZoomedToDMA && showCountiesInDMA && newViewport.zoom < 6) {
      console.log(`⬅️ Zoom out detected (${newViewport.zoom.toFixed(2)} < 6), hiding counties but preserving selections`);
      setShowCountiesInDMA(false);
      setSelectedCountiesInDMA([]);
      // Note: NOT clearing county selections - they persist when zooming out
      setSelectedDMA(null);
      setIsZoomedToDMA(false);
      // Cancel any ongoing lazy loading when zooming out
      countySelection.cancelLazyLoading();
      return;
    }
    
    // If not currently zoomed into a DMA and user zooms in above threshold, check if we're over a DMA
    if (!isZoomedToDMA && newViewport.zoom >= 8) {
      console.log(`🔍 High zoom detected (${newViewport.zoom.toFixed(2)} >= 8), checking for DMA at center...`);
      const dmaData = getProcessedDMAData();
      
      // Find DMA that contains the current map center
      const mapCenter: [number, number] = [newViewport.longitude, newViewport.latitude];
      
      for (const dma of dmaData) {
        // Quick bounds check first
        const { bounds } = dma;
        if (mapCenter[0] >= bounds.southwest[0] && mapCenter[0] <= bounds.northeast[0] &&
            mapCenter[1] >= bounds.southwest[1] && mapCenter[1] <= bounds.northeast[1]) {
          
          console.log(`📍 Center is within bounds of DMA: ${dma.name}, doing precise geometry check...`);
          
          // More precise check: is the center point within the DMA geometry
          const isInsideDMA = pointInFeature(mapCenter, dma.feature);
          
          if (isInsideDMA) {
            console.log(`✅ Manual zoom detected DMA: ${dma.name} at zoom ${newViewport.zoom.toFixed(2)}`);
            
            // Set the DMA as selected and show counties
            setSelectedDMA(dma);
            setIsZoomedToDMA(true);
            setShowCountiesInDMA(true);
            
            // Get counties in this DMA for lazy loading
            const countiesInDMA = getCountiesInDMA(dma.id, countyData.map(c => ({
              countyName: c.countyName,
              stateName: c.stateName,
              coordinates: c.coordinates
            })));
            
            console.log(`🚀 Starting lazy loading for ${countiesInDMA.length} counties in DMA: ${dma.name}`);
            
            // Use lazy loading with viewport awareness
            if (mapRef.current) {
              const bounds = mapRef.current.getBounds();
              if (bounds) {
                const viewportInfo = {
                  center: [newViewport.longitude, newViewport.latitude] as [number, number],
                  bounds: {
                    sw: [bounds.getSouthWest().lng, bounds.getSouthWest().lat] as [number, number],
                    ne: [bounds.getNorthEast().lng, bounds.getNorthEast().lat] as [number, number]
                  }
                };
                countySelection.lazyLoadCountyBoundaries(countiesInDMA, viewportInfo);
              } else {
                // Fallback without viewport info
                countySelection.lazyLoadCountyBoundaries(countiesInDMA);
              }
            } else {
              // Fallback without viewport info
              countySelection.lazyLoadCountyBoundaries(countiesInDMA);
            }
            
            break; // Found the DMA, no need to check others
          } else {
            console.log(`❌ Center is outside DMA geometry for: ${dma.name}`);
          }
        }
      }
    }
    
    // ENHANCED: Also check for DMA changes when already zoomed in (panning between DMAs)
    if (isZoomedToDMA && newViewport.zoom >= 8) {
      console.log(`🔄 Already zoomed in (${newViewport.zoom.toFixed(2)} >= 8), checking for DMA change at center...`);
      const dmaData = getProcessedDMAData();
      
      // Find DMA that contains the current map center
      const mapCenter: [number, number] = [newViewport.longitude, newViewport.latitude];
      let foundNewDMA = null;
      
      for (const dma of dmaData) {
        // Quick bounds check first
        const { bounds } = dma;
        if (mapCenter[0] >= bounds.southwest[0] && mapCenter[0] <= bounds.northeast[0] &&
            mapCenter[1] >= bounds.southwest[1] && mapCenter[1] <= bounds.northeast[1]) {
          
          // More precise check: is the center point within the DMA geometry
          const isInsideDMA = pointInFeature(mapCenter, dma.feature);
          
          if (isInsideDMA) {
            foundNewDMA = dma;
            break; // Found the DMA, no need to check others
          }
        }
      }
      
      // Check if we've moved to a different DMA or moved outside any DMA
      if (foundNewDMA && foundNewDMA.id !== selectedDMA?.id) {
        console.log(`🔄 Panned into different DMA: ${foundNewDMA.name} (was: ${selectedDMA?.name || 'none'})`);
        
        // Cancel any ongoing loading for the previous DMA
        countySelection.cancelLazyLoading();
        
        // Update to the new DMA
        setSelectedDMA(foundNewDMA);
        setShowCountiesInDMA(true);
        
        // Get counties in this new DMA for lazy loading
        const countiesInDMA = getCountiesInDMA(foundNewDMA.id, countyData.map(c => ({
          countyName: c.countyName,
          stateName: c.stateName,
          coordinates: c.coordinates
        })));
        
        console.log(`🚀 Starting lazy loading for ${countiesInDMA.length} counties in new DMA: ${foundNewDMA.name}`);
        
        // Use lazy loading with viewport awareness
        if (mapRef.current) {
          const bounds = mapRef.current.getBounds();
          if (bounds) {
            const viewportInfo = {
              center: [newViewport.longitude, newViewport.latitude] as [number, number],
              bounds: {
                sw: [bounds.getSouthWest().lng, bounds.getSouthWest().lat] as [number, number],
                ne: [bounds.getNorthEast().lng, bounds.getNorthEast().lat] as [number, number]
              }
            };
            countySelection.lazyLoadCountyBoundaries(countiesInDMA, viewportInfo);
          } else {
            // Fallback without viewport info
            countySelection.lazyLoadCountyBoundaries(countiesInDMA);
          }
        } else {
          // Fallback without viewport info
          countySelection.lazyLoadCountyBoundaries(countiesInDMA);
        }
      } else if (!foundNewDMA && selectedDMA) {
        console.log(`🚫 Panned outside of any DMA (was in: ${selectedDMA.name}), hiding counties`);
        
        // Cancel any ongoing loading
        countySelection.cancelLazyLoading();
        
        // Hide counties but keep zoom state (since user is still at high zoom)
        setShowCountiesInDMA(false);
        setSelectedCountiesInDMA([]);
        setSelectedDMA(null);
        // Note: Keep isZoomedToDMA true since we're still at high zoom, just not in a DMA
      } else if (foundNewDMA && foundNewDMA.id === selectedDMA?.id) {
        // Still in the same DMA, just update viewport priority for ongoing loading
        console.log(`📍 Still in same DMA: ${foundNewDMA.name}, updating viewport priorities`);
      }
    }
  }, [isZoomedToDMA, showCountiesInDMA, countySelection, countyData, getProcessedDMAData, getCountiesInDMA, selectedDMA]);

  // Get selected counties for stats panel
  const selectedCounties = countyData.filter(county => countySelection.isCountySelected(county.countyName));

  // Create county boundary GeoJSON data for all counties in DMA (visible when zoomed in)
  const allCountyBoundariesInDMA = useMemo(() => {
    // Show all county boundaries when zoomed into DMA
    if (!isZoomedToDMA || !showCountiesInDMA || !selectedDMA) return null;

    // Get only counties within the selected DMA
    const countiesInDMA = getCountiesInDMA(selectedDMA.id, countyData.map(c => ({
      countyName: c.countyName,
      stateName: c.stateName,
      coordinates: c.coordinates
    })));

    const features: GeoJSON.Feature[] = [];
    
    countiesInDMA.forEach(dmaCounty => {
      // Find the full county data
      const county = countyData.find(c => 
        c.countyName === dmaCounty.countyName && c.stateName === dmaCounty.stateName
      );
      
      if (county) {
        const boundary = countySelection.getCountyBoundary(county.countyName, county.stateName);
        if (boundary) {
          const isSelected = countySelection.isCountySelected(county.countyName);
          const boundaryGeoJSON = countyBoundaryToGeoJSON(boundary);
          
          // Add selection state to properties
          features.push({
            ...boundaryGeoJSON,
            properties: {
              ...boundaryGeoJSON.properties,
              countyName: county.countyName,
              stateName: county.stateName,
              isSelected,
              totalCalls: county.aggregatedStats.totalCallsConnected
            }
          });
        }
      }
    });

    return features.length > 0 ? {
      type: 'FeatureCollection' as const,
      features
    } : null;
  }, [isZoomedToDMA, showCountiesInDMA, selectedDMA, countyData, countySelection]);

  // Create county boundary GeoJSON data for selected counties only (for filled appearance)
  const selectedCountyBoundaries = useMemo(() => {
    const features: GeoJSON.Feature[] = [];
    
    selectedCounties.forEach(county => {
      const boundary = countySelection.getCountyBoundary(county.countyName, county.stateName);
      if (boundary) {
        const boundaryGeoJSON = countyBoundaryToGeoJSON(boundary);
        // Add county information to properties for click handling
        features.push({
          ...boundaryGeoJSON,
          properties: {
            ...boundaryGeoJSON.properties,
            countyName: county.countyName,
            stateName: county.stateName,
            isSelected: true, // This layer only contains selected counties
            totalCalls: county.aggregatedStats.totalCallsConnected
          }
        });
      }
    });

    return features.length > 0 ? {
      type: 'FeatureCollection' as const,
      features
    } : null;
  }, [selectedCounties, countySelection]);

  // Handle stats panel visibility based on selected counties
  useEffect(() => {
    const hasSelectedCounties = selectedCounties.length > 0;
    if (hasSelectedCounties && !showCountyStatsPanel) {
      console.log(`📊 Opening stats panel: ${selectedCounties.length} counties selected`);
      setShowCountyStatsPanel(true);
    }
    // Note: We don't auto-close the panel when no counties are selected
    // The user can manually close it, and it should stay open for their convenience
  }, [selectedCounties.length, showCountyStatsPanel]);

  // Create county shapes data for counties within selected DMA - always show when zoomed into DMA
  const countyShapesData = useMemo(() => {
    // Show counties when we're zoomed into a DMA (county selection always available)
    if (!isZoomedToDMA || !showCountiesInDMA || !selectedDMA) return null;

    // Get only counties within the selected DMA
    const countiesInDMA = getCountiesInDMA(selectedDMA.id, countyData.map(c => ({
      countyName: c.countyName,
      stateName: c.stateName,
      coordinates: c.coordinates
    })));

    const features: GeoJSON.Feature[] = [];
    
    countiesInDMA.forEach(dmaCounty => {
      // Find the full county data
      const county = countyData.find(c => 
        c.countyName === dmaCounty.countyName && c.stateName === dmaCounty.stateName
      );
      
      if (county) {
        const isSelected = countySelection.isCountySelected(county.countyName);
        const isHovered = countySelection.selectionState.hoveredCounty === county.countyName;
        const isLoading = countySelection.isBoundaryLoading(county.countyName, county.stateName);
        
        // Add a point feature for each county's center point for labeling
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: county.coordinates
          },
          properties: {
            countyName: county.countyName,
            stateName: county.stateName,
            displayName: county.countyName,
            totalCalls: county.aggregatedStats.totalCallsConnected,
            isSelected,
            isHovered,
            isLoading,
            countyId: `${county.countyName}-${county.stateName}`,
            isMobile: isMobileView,
            // Add flag to indicate county is selected
            showName: isSelected
          }
        });
      }
    });

    return features.length > 0 ? {
      type: 'FeatureCollection' as const,
      features
    } : null;
  }, [isZoomedToDMA, showCountiesInDMA, selectedDMA, countyData, countySelection, isMobileView]);

  // Handle map click for DMA selection, county selection and tooltip dismissal
  const handleMapClick = useCallback(async (event: any) => {
    // On mobile, prevent selection if we detected dragging
    if (isMobileView && isDragging) {
      return;
    }
    
    // Clear tooltip on click
    setTooltipData(null);
    
    // Check if we have features to process
    if (event.features && event.features.length > 0) {
      console.log(`🖱️ Map click with ${event.features.length} features:`, event.features.map((f: any) => ({ layerId: f.layer?.id, properties: f.properties })));
      
      // First check for county clicks when zoomed into DMA - counties take priority over DMA areas
      if (isZoomedToDMA && showCountiesInDMA) {
        const countyFeature = event.features.find((f: any) => 
          f.layer && (
            f.layer.id === 'county-clickable-areas' ||
            f.layer.id === 'county-labels' || 
            f.layer.id === 'county-calls' || 
            f.layer.id === 'county-touch-targets' ||
            f.layer.id === 'all-county-boundaries' ||
            f.layer.id === 'county-boundaries' ||
            f.layer.id === 'county-boundaries-stroke'
          )
        );
        
        if (countyFeature && countyFeature.properties) {
          const countyName = countyFeature.properties.countyName;
          const stateName = countyFeature.properties.stateName;
          
          console.log(`🏛️ County click detected: ${countyName}, ${stateName} (layer: ${countyFeature.layer.id})`);
          
          const county = countyData.find(c => 
            c.countyName === countyName && c.stateName === stateName
          );
          
          if (county) {
            // Check current selection state before toggling
            const wasSelected = countySelection.isCountySelected(county.countyName);
            console.log(`🔄 About to toggle county selection: ${county.countyName} (currently selected: ${wasSelected})`);
            
            // Toggle county selection using the built-in toggle logic
            await countySelection.selectCounty(county.countyName, county.stateName);
            
            // Call the callback with the county
            onCountySelect?.([county]);
            
            console.log(`✅ County selection toggle completed for: ${county.countyName}`);
            return; // County click processed, don't check for DMA
          } else {
            console.warn(`⚠️ County data not found for: ${countyName}, ${stateName}`);
          }
        }
      }
      
      // Only process DMA clicks if no county was clicked
      const dmaFeature = event.features.find((f: any) => 
        f.layer && (f.layer.id === 'dma-borders' || f.layer.id === 'dma-labels' || f.layer.id === 'dma-areas')
      );
      
      if (dmaFeature && dmaFeature.properties) {
        const dmaId = dmaFeature.properties.dmaId;
        const dmaName = dmaFeature.properties.dmaName;
        
        if (dmaId && dmaName) {
          console.log(`🗺️ DMA click detected: ${dmaName} (layer: ${dmaFeature.layer.id})`);
          handleDMAClick(dmaId, dmaName);
          return;
        }
      }
      
      console.log(`🔍 No matching feature found for click event`);
    } else {
      console.log(`🚫 No features in click event: isZoomedToDMA=${isZoomedToDMA}, showCountiesInDMA=${showCountiesInDMA}`);
    }
  }, [countyData, handleCountySelect, countySelection, isMobileView, isDragging, selectedCounties.length, handleDMAClick, isZoomedToDMA, showCountiesInDMA]);

  // Handle touch start for mobile drag detection
  const handleTouchStart = useCallback((event: any) => {
    if (isMobileView && event.touches && event.touches.length === 1) {
      const touch = event.touches[0];
      setTouchStartPos({ x: touch.clientX, y: touch.clientY });
      setIsDragging(false);
    }
  }, [isMobileView]);

  // Handle touch move for mobile drag detection
  const handleTouchMove = useCallback((event: any) => {
    if (isMobileView && touchStartPos && event.touches && event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPos.x);
      const deltaY = Math.abs(touch.clientY - touchStartPos.y);
      
      // If touch moved more than 15px, consider it a drag (increased threshold)
      if (deltaX > 15 || deltaY > 15) {
        setIsDragging(true);
      }
    }
  }, [isMobileView, touchStartPos]);

  // Handle touch end for mobile
  const handleTouchEnd = useCallback((event: any) => {
    if (isMobileView) {
      // Reset touch state after a small delay
      setTimeout(() => {
        setTouchStartPos(null);
        setIsDragging(false);
      }, 100);
    }
  }, [isMobileView]);

  // Get marker size based on call volume (responsive sizing)
  const getMarkerSize = (totalCalls: number) => {
    const baseSizes = isMobileView 
      ? { large: 40, medium: 32, small: 24 } // Larger on mobile for touch
      : { large: 32, medium: 24, small: 16 }; // Original sizes on desktop
    
    if (totalCalls >= 100) return baseSizes.large;
    if (totalCalls >= 50) return baseSizes.medium;
    return baseSizes.small;
  };

  // Get marker color based on bid range
  const getMarkerColor = (avgBid: number) => {
    if (avgBid >= 100) return '#DC2626'; // red-600
    if (avgBid >= 75) return '#EF4444';  // red-500
    if (avgBid >= 50) return '#F59E0B';  // amber-500
    return '#10B981'; // green-500
  };

  if (loading || isLoading) {
    return (
      <div className={cn("relative w-full h-full bg-gray-50 flex items-center justify-center", className)}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading map data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("relative w-full h-full bg-gray-50 flex items-center justify-center", className)}>
        <div className="text-center p-6">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Map</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              refetch();
            }}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full h-full bg-gray-50", className)}>
      {/* Header with Legend */}
      {showLegend && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-white border-b border-gray-200 px-2 sm:px-4 py-2 shadow-sm">
          <div className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
            {/* Controls row */}
            <div className="flex items-center justify-between sm:justify-start space-x-2 sm:space-x-4">
              <div className="flex items-center space-x-2">
                {showFilters && (
                  <button
                    onClick={() => setShowFilterPanel(!showFilterPanel)}
                    className={cn(
                      "px-2 py-1 text-xs rounded-md transition-colors border whitespace-nowrap touch-manipulation",
                      showFilterPanel
                        ? "bg-green-500 text-white border-green-500"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    {showFilterPanel ? 'Hide Filters' : 'Show Filters'}
                  </button>
                )}
                
                {/* DMA Reset Button */}
                {isZoomedToDMA && (
                  <button
                    onClick={handleResetDMAZoom}
                    className="px-2 py-1 text-xs rounded-md transition-colors border whitespace-nowrap touch-manipulation bg-blue-500 text-white border-blue-500 hover:bg-blue-600"
                  >
                    Reset Zoom
                  </button>
                )}
                
                {selectedCounties.length > 0 && (
                  <button
                    onClick={() => setShowCountyStatsPanel(!showCountyStatsPanel)}
                    className={cn(
                      "px-2 py-1 text-xs rounded-md transition-colors border whitespace-nowrap touch-manipulation",
                      showCountyStatsPanel
                        ? "bg-green-500 text-white border-green-500"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    {showCountyStatsPanel ? 'Hide Stats' : 'Show Stats'}
                  </button>
                )}
              </div>
              
              {/* Legend title - only show on larger screens */}
              <h4 className="hidden sm:block text-sm font-semibold text-gray-900">Map Legend</h4>
            </div>
            
            {/* Legend items row */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-gray-700">
              
              {/* DMA Status Indicator */}
              {selectedDMA && (
                <div className="flex items-center space-x-1 sm:space-x-2 px-2 py-1 bg-blue-50 rounded-md border border-blue-200">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 bg-blue-500" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
                  <span className="whitespace-nowrap font-medium text-blue-700">DMA: {selectedDMA.name}</span>
                </div>
              )}
              
              <div className="flex items-center space-x-1 sm:space-x-2">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-green-500"></div>
                <span className="whitespace-nowrap">Low (&lt;$50)</span>
              </div>
              <div className="flex items-center space-x-1 sm:space-x-2">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-amber-500"></div>
                <span className="whitespace-nowrap">Med ($50-$75)</span>
              </div>
              <div className="flex items-center space-x-1 sm:space-x-2">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
                <span className="whitespace-nowrap">High ($75+)</span>
              </div>
              <div className="text-xs text-gray-600 pl-2 sm:pl-4 border-l border-gray-300">
                <span className="hidden sm:inline">Size = Call Volume</span>
                <span className="sm:hidden">Size = Calls</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading notification for county boundaries */}
      {selectedCounties.some(county => 
        countySelection.isBoundaryLoading(county.countyName, county.stateName)
      ) && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-30">
          <div className="bg-green-500 text-white px-3 py-2 rounded-md shadow-lg text-sm flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            <span>Loading county boundaries...</span>
          </div>
        </div>
      )}

      {/* Map Container */}
      <div 
        className="absolute rounded-lg overflow-hidden shadow-lg"
        style={{
          top: showLegend ? '80px' : '0', // Adjusted height for new responsive header layout
          left: '0',
          right: '0',
          bottom: '0',
        }}
      >
        <Map
          ref={mapRef}
          {...viewport}
          onMove={(evt) => handleViewportChange(evt.viewState)}
          mapboxAccessToken={mapboxAccessToken}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyle}
          onClick={handleMapClick} // Handle clicks on both desktop and mobile
          onTouchStart={isMobileView ? handleTouchStart : undefined}
          onTouchMove={isMobileView ? handleTouchMove : undefined}
          onTouchEnd={isMobileView ? handleTouchEnd : undefined}
          onMouseMove={(event) => {
            // Only handle mouse events on desktop
            if (!isMobileView && event.features && event.features.length > 0) {
              // Check for DMA hover first
              const dmaFeature = event.features.find((f: any) => 
                f.layer && (f.layer.id === 'dma-borders' || f.layer.id === 'dma-labels' || f.layer.id === 'dma-areas')
              );
              
              if (dmaFeature && dmaFeature.properties) {
                const dmaId = dmaFeature.properties.dmaId;
                if (dmaId) {
                  handleDMAHover(dmaId);
                  if (mapRef.current) {
                    mapRef.current.getCanvas().style.cursor = 'pointer';
                  }
                }
                return; // Don't process county hover if DMA is hovered
              }
              
              // Check for county hover if no DMA is hovered and counties are visible
              if (isZoomedToDMA && showCountiesInDMA) {
                const countyFeature = event.features.find((f: any) => 
                  f.layer && (
                    f.layer.id === 'county-clickable-areas' ||
                    f.layer.id === 'county-labels' || 
                    f.layer.id === 'county-calls' || 
                    f.layer.id === 'county-touch-targets' ||
                    f.layer.id === 'all-county-boundaries' ||
                    f.layer.id === 'county-boundaries' ||
                    f.layer.id === 'county-boundaries-stroke'
                  )
                );
                if (countyFeature && mapRef.current) {
                  mapRef.current.getCanvas().style.cursor = 'pointer';
                  return;
                }
              }
              
              // Default cursor when not over interactive elements
              if (mapRef.current) {
                mapRef.current.getCanvas().style.cursor = '';
              }
            } else if (!isMobileView && mapRef.current) {
              // No features under cursor, reset to default
              mapRef.current.getCanvas().style.cursor = '';
            }
          }}
          onMouseEnter={(event) => {
            // Only handle mouse events on desktop
            if (!isMobileView && event.features && event.features.length > 0) {
              // Check for DMA hover first
              const dmaFeature = event.features.find((f: any) => 
                f.layer && (f.layer.id === 'dma-borders' || f.layer.id === 'dma-labels' || f.layer.id === 'dma-areas')
              );
              
              if (dmaFeature && dmaFeature.properties) {
                const dmaId = dmaFeature.properties.dmaId;
                if (dmaId) {
                  handleDMAHover(dmaId);
                  if (mapRef.current) {
                    mapRef.current.getCanvas().style.cursor = 'pointer';
                  }
                }
                return; // Don't process county hover if DMA is hovered
              }
              
              // Check for county hover if no DMA is hovered and counties are visible
              if (isZoomedToDMA && showCountiesInDMA) {
                const countyFeature = event.features.find((f: any) => 
                  f.layer && (
                    f.layer.id === 'county-clickable-areas' ||
                    f.layer.id === 'county-labels' || 
                    f.layer.id === 'county-calls' || 
                    f.layer.id === 'county-touch-targets' ||
                    f.layer.id === 'all-county-boundaries' ||
                    f.layer.id === 'county-boundaries' ||
                    f.layer.id === 'county-boundaries-stroke'
                  )
                );
                if (countyFeature && mapRef.current) {
                  mapRef.current.getCanvas().style.cursor = 'pointer';
                  return;
                }
              }
              
              // Default cursor when not over interactive elements
              if (mapRef.current) {
                mapRef.current.getCanvas().style.cursor = '';
              }
            }
          }}
          onMouseLeave={() => {
            // Only handle mouse events on desktop
            if (!isMobileView) {
              handleDMAHover(null); // Clear DMA hover
              if (mapRef.current) {
                mapRef.current.getCanvas().style.cursor = '';
              }
            }
          }}
          interactiveLayerIds={[
            'dma-borders', 
            'dma-areas',    // Clickable DMA fill areas
            'dma-labels',
            // County interaction layers - always available when counties are visible
            ...(isZoomedToDMA && showCountiesInDMA ? [
              'county-clickable-areas',  // Main clickable layer for county areas
              'county-labels', 
              'county-calls', 
              'county-touch-targets', 
              'all-county-boundaries',
              'county-boundaries', 
              'county-boundaries-stroke'
            ] : [])
          ]}
        >
          {/* Heatmap Layer */}
          <Source id="heatmap-source" type="geojson" data={heatmapSourceData}>
            <Layer {...heatmapLayer} />
          </Source>

          {/* DMA Border and Label Layers - Always visible */}
          {dmaData && dmaData.features && dmaData.features.length > 0 && (
            <Source id="dma-source" type="geojson" data={dmaData}>
              <Layer {...dmaFillLayer} />
              <Layer {...dmaBorderLayer} />
              <Layer {...dmaLabelLayer} />
            </Source>
          )}

          {/* All County Boundaries Layer - Show all when zoomed into DMA */}
          {isZoomedToDMA && showCountiesInDMA && allCountyBoundariesInDMA && (
            <Source id="all-county-boundaries-source" type="geojson" data={allCountyBoundariesInDMA}>
              <Layer {...countyClickableAreaLayer} />
              <Layer {...allCountyBoundaryLayer} />
            </Source>
          )}

          {/* Selected County Boundary Layer - Fill selected counties */}
          {isZoomedToDMA && showCountiesInDMA && selectedCountyBoundaries && (
            <Source id="county-boundaries-source" type="geojson" data={selectedCountyBoundaries}>
              <Layer {...countyBoundaryLayer} />
              <Layer {...countyBoundaryStrokeLayer} />
            </Source>
          )}

          {/* County Labels Layer - Always show when zoomed into DMA */}
          {isZoomedToDMA && showCountiesInDMA && countyShapesData && (
            <Source id="county-labels-source" type="geojson" data={countyShapesData}>
              {/* Touch targets first (bottom layer) */}
              {isMobileView && <Layer {...countyTouchTargetLayer} />}
              {/* Labels on top */}
              <Layer {...countyLabelLayer} />
              <Layer {...countyCallsLayer} />
            </Source>
          )}

          {/* ZIP Code Markers */}
          {validDataPoints.map((point) => (
            <Marker
              key={point.zipCode}
              longitude={point.coordinates[0]}
              latitude={point.coordinates[1]}
              anchor="center"
            >
              <div
                className="cursor-pointer transition-all duration-200 hover:scale-110"
                style={{
                  width: getMarkerSize(point.totalCallsConnected),
                  height: getMarkerSize(point.totalCallsConnected),
                  backgroundColor: getMarkerColor(point.avgBid),
                  border: '2px solid white',
                  borderRadius: '50%',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                }}
                onClick={() => handleMarkerClick(point)}
                onMouseEnter={(e) => {
                  if (!mapRef.current) return;
                  
                  // Get the map container's bounding rect
                  const mapContainer = mapRef.current.getContainer();
                  const rect = mapContainer.getBoundingClientRect();
                  
                  // Calculate position relative to the map container
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  
                  setTooltipData({
                    ...point,
                    position: { x, y },
                  });
                }}
                onTouchStart={(e) => {
                  // Handle touch events for mobile
                  if (!mapRef.current) return;
                  
                  const mapContainer = mapRef.current.getContainer();
                  const rect = mapContainer.getBoundingClientRect();
                  const touch = e.touches[0];
                  
                  // Calculate position relative to the map container
                  const x = touch.clientX - rect.left;
                  const y = touch.clientY - rect.top;
                  
                  setTooltipData({
                    ...point,
                    position: { x, y },
                  });
                  
                  // Note: Removed auto-hide timeout - tooltip stays open until manually closed
                }}
                onMouseLeave={handleMarkerLeave}
              />
            </Marker>
          ))}

          {/* Tooltip */}
          {tooltipData && (
            <Tooltip 
              data={tooltipData} 
              onClose={() => setTooltipData(null)}
            />
          )}
        </Map>
      </div>

      {/* Filter Panel */}
      {showFilters && showFilterPanel && (
        <div 
          className="absolute left-2 sm:left-4 z-10 w-[calc(100vw-1rem)] sm:w-auto sm:max-w-sm"
          style={{ top: showLegend ? '96px' : '16px' }}
        >
          <FilterPanel
            filters={filters}
            onFiltersChange={updateFilters}
            loading={loading}
            onClose={() => setShowFilterPanel(false)}
            industries={industries}
            industriesLoading={industriesLoading}
          />
        </div>
      )}

      {/* County Stats Panel */}
      {selectedCounties.length > 0 && showCountyStatsPanel && (
        <div 
          className={cn(
            "absolute z-10",
            // Always on the right on desktop, full width on mobile
            "right-2 sm:right-4",
            "w-[calc(100vw-1rem)] sm:w-auto"
          )}
          style={{ 
            top: showFilters && showFilterPanel && isMobileView
              ? '350px' // Stack below filter panel on mobile only
              : showLegend ? '96px' : '16px'
          }}
        >
          <CountyStatsPanel
            selectedCounties={selectedCounties}
            onClose={() => {
              // Only hide the panel, don't clear counties
              setShowCountyStatsPanel(false);
            }}
            onCountyDeselect={(countyName) => {
              countySelection.deselectCounty(countyName);
            }}
            onClearAll={() => {
              // Clear all counties and hide panel
              countySelection.clearSelection();
              setShowCountyStatsPanel(false);
            }}
          />
        </div>
      )}

      {/* Lazy Loading Progress Indicator */}
      {countySelection.lazyLoadingState.isLoading && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-4 py-2 shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            <div className="text-sm text-gray-700">
              {countySelection.lazyLoadingState.currentPriority === 'viewport' 
                ? 'Loading counties in view...' 
                : 'Loading remaining counties...'}
            </div>
            {countySelection.lazyLoadingState.totalCount > 0 && (
              <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {countySelection.lazyLoadingState.loadedCount}/{countySelection.lazyLoadingState.totalCount}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default LeadsMap;
