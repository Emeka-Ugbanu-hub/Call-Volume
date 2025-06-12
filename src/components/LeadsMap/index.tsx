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
  mapStyle = 'mapbox://styles/mapbox/dark-v11',
  showFilters = true,
  showLegend = true,
  enableClustering = true,
  heatmapIntensity = 1,
  enableCountySelection = false,
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
        
        // Generate county data if county selection is enabled
        if (enableCountySelection) {
          const aggregatedCountyData = await aggregateDataByCounty(dataWithCoords, mapboxAccessToken);
          setCountyData(aggregatedCountyData);
        }
        
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
  }, [rawData, mapboxAccessToken, onDataLoad, enableCountySelection]);

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

  // County boundary layer configuration
  const countyBoundaryLayer = {
    id: 'county-boundaries',
    type: 'fill' as const,
    paint: {
      'fill-color': isMobileView 
        ? 'rgba(16, 185, 129, 0.3)' // More visible on mobile
        : 'rgba(16, 185, 129, 0.2)', // green with transparency
      'fill-outline-color': '#10B981', // green border
    },
  };

  const countyBoundaryStrokeLayer = {
    id: 'county-boundaries-stroke',
    type: 'line' as const,
    paint: {
      'line-color': '#10B981',
      'line-width': isMobileView ? 3 : 2, // Thicker line on mobile
      'line-opacity': 0.9, // More opaque
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
        '#047857', // Dark green halo for selected counties
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

  // Handle marker click
  const handleMarkerClick = useCallback((point: MapDataPoint) => {
    onZipCodeClick?.(point);
  }, [onZipCodeClick]);

  // Handle marker leave
  const handleMarkerLeave = useCallback(() => {
    setTooltipData(null);
  }, []);

  // County selection handlers
  const handleCountySelect = useCallback(async (county: CountyData) => {
    if (!enableCountySelection) return;
    
    await countySelection.selectCounty(county.countyName, county.stateName);
    onCountySelect?.([county]);
  }, [enableCountySelection, countySelection, onCountySelect]);

  const handleCountyHover = useCallback((county: CountyData | null) => {
    if (!enableCountySelection) return;
    
    if (county) {
      countySelection.setHoveredCounty(county.countyName);
    } else {
      countySelection.setHoveredCounty(null);
    }
    onCountyHover?.(county);
  }, [enableCountySelection, countySelection, onCountyHover]);

  // Get selected counties for stats panel
  const selectedCounties = enableCountySelection 
    ? countyData.filter(county => countySelection.isCountySelected(county.countyName))
    : [];

  // Create county boundary GeoJSON data for selected counties
  const selectedCountyBoundaries = useMemo(() => {
    if (!enableCountySelection) return null;

    const features: GeoJSON.Feature[] = [];
    
    selectedCounties.forEach(county => {
      const boundary = countySelection.getCountyBoundary(county.countyName, county.stateName);
      if (boundary) {
        features.push(countyBoundaryToGeoJSON(boundary));
      }
    });

    return features.length > 0 ? {
      type: 'FeatureCollection' as const,
      features
    } : null;
  }, [enableCountySelection, selectedCounties, countySelection]);

  // Create county shapes data for all counties with their labels
  const countyShapesData = useMemo(() => {
    if (!enableCountySelection) return null;

    const features: GeoJSON.Feature[] = [];
    
    countyData.forEach(county => {
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
          isMobile: isMobileView
        }
      });
    });

    return features.length > 0 ? {
      type: 'FeatureCollection' as const,
      features
    } : null;
  }, [enableCountySelection, countyData, countySelection, isMobileView]);

  // Handle map click for county selection and tooltip dismissal
  const handleMapClick = useCallback((event: any) => {
    // On mobile, prevent county selection if we detected dragging
    if (isMobileView && isDragging) {
      return;
    }
    
    // Clear tooltip on click
    setTooltipData(null);
    
    // Handle county selection if enabled
    if (enableCountySelection && event.features && event.features.length > 0) {
      const countyFeature = event.features.find((f: any) => 
        f.layer && (
          f.layer.id === 'county-labels' || 
          f.layer.id === 'county-calls' || 
          f.layer.id === 'county-touch-targets'
        )
      );
      
      if (countyFeature && countyFeature.properties) {
        const countyName = countyFeature.properties.countyName;
        const stateName = countyFeature.properties.stateName;
        
        const county = countyData.find(c => 
          c.countyName === countyName && c.stateName === stateName
        );
        
        if (county) {
          // Toggle county selection instead of just selecting
          const isCurrentlySelected = countySelection.isCountySelected(county.countyName);
          if (isCurrentlySelected) {
            countySelection.deselectCounty(county.countyName);
          } else {
            handleCountySelect(county);
            // Show stats panel when first county is selected
            if (selectedCounties.length === 0) {
              setShowCountyStatsPanel(true);
            }
          }
        }
      }
    }
  }, [enableCountySelection, countyData, handleCountySelect, countySelection, isMobileView, isDragging, selectedCounties.length]);

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
                
                {enableCountySelection && selectedCounties.length > 0 && (
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
      {enableCountySelection && selectedCounties.some(county => 
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
          onMove={(evt) => setViewport(evt.viewState)}
          mapboxAccessToken={mapboxAccessToken}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyle}
          onClick={handleMapClick} // Handle clicks on both desktop and mobile
          onTouchStart={isMobileView ? handleTouchStart : undefined}
          onTouchMove={isMobileView ? handleTouchMove : undefined}
          onTouchEnd={isMobileView ? handleTouchEnd : undefined}
          onMouseEnter={(event) => {
            // Only handle mouse events on desktop
            if (!isMobileView && enableCountySelection && event.features && event.features.length > 0) {
              const countyFeature = event.features.find((f: any) => 
                f.layer && (
                  f.layer.id === 'county-labels' || 
                  f.layer.id === 'county-calls' || 
                  f.layer.id === 'county-touch-targets'
                )
              );
              if (countyFeature && mapRef.current) {
                mapRef.current.getCanvas().style.cursor = 'pointer';
              }
            }
          }}
          onMouseLeave={() => {
            // Only handle mouse events on desktop
            if (!isMobileView && mapRef.current) {
              mapRef.current.getCanvas().style.cursor = '';
            }
          }}
          interactiveLayerIds={enableCountySelection ? ['county-labels', 'county-calls', 'county-touch-targets'] : []}
        >
          {/* Heatmap Layer */}
          <Source id="heatmap-source" type="geojson" data={heatmapSourceData}>
            <Layer {...heatmapLayer} />
          </Source>

          {/* County Boundary Layer */}
          {enableCountySelection && selectedCountyBoundaries && (
            <Source id="county-boundaries-source" type="geojson" data={selectedCountyBoundaries}>
              <Layer {...countyBoundaryLayer} />
              <Layer {...countyBoundaryStrokeLayer} />
            </Source>
          )}

          {/* County Labels Layer (native map labeling) */}
          {enableCountySelection && countyShapesData && (
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
      {enableCountySelection && selectedCounties.length > 0 && showCountyStatsPanel && (
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

    </div>
  );
};

export default LeadsMap;
