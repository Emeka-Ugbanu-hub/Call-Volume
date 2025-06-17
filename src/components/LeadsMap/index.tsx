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
  initialCenter = [-95.7129, 37.0902],
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


  const [selectedDMA, setSelectedDMA] = useState<DMAData | null>(null);
  const [hoveredDMA, setHoveredDMA] = useState<string | null>(null);
  const [isZoomedToDMA, setIsZoomedToDMA] = useState(false);

  const [showCountiesInDMA, setShowCountiesInDMA] = useState(false);
  const [selectedCountiesInDMA, setSelectedCountiesInDMA] = useState<CountyData[]>([]);


  useEffect(() => {
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth < 640);
    };
    
    checkMobileView();
    window.addEventListener('resize', checkMobileView);
    return () => window.removeEventListener('resize', checkMobileView);
  }, []);


  const { filters, updateFilters } = useFilters({
    industryId,
    timeframe,
    zipCodes,
  });


  const countySelection = useCountySelection();


  const { industries, loading: industriesLoading, error: industriesError } = useIndustries();


  const { data: rawData, loading, error: apiError, refetch } = useMapData(filters);


  const [processedData, setProcessedData] = useState<Array<MapDataPoint & { coordinates: [number, number] | null }>>([]);
  const [countyData, setCountyData] = useState<CountyData[]>([]);


  useEffect(() => {
    if (!rawData) return;

    const processData = async () => {
      setIsLoading(true);
      try {
        const dataWithCoords = await addCoordinatesToData(rawData, mapboxAccessToken);
        setProcessedData(dataWithCoords);
        

        const aggregatedCountyData = await aggregateDataByCounty(dataWithCoords, mapboxAccessToken);
        setCountyData(aggregatedCountyData);
        
        onDataLoad?.(rawData);
        

        const bounds = calculateMapBounds(dataWithCoords);
        if (bounds && mapRef.current) {
          mapRef.current.fitBounds(
            [bounds.southwest, bounds.northeast],
            { padding: 60, duration: 1000 }
          );
        }
      } catch (err) {
        setError('Failed to process map data');
      } finally {
        setIsLoading(false);
      }
    };

    processData();
  }, [rawData, mapboxAccessToken, onDataLoad]);


  useEffect(() => {
    if (apiError) {
      setError(apiError.message);
      onError?.(apiError);
    }
  }, [apiError, onError]);


  useEffect(() => {
    if (industriesError) {
    }
  }, [industriesError]);


  const validDataPoints = processedData.filter(
    (point): point is MapDataPoint & { coordinates: [number, number] } => 
      point.coordinates !== null
  );


  const clusterData = enableClustering ? createClusterData(validDataPoints) : null;


  const dmaData = useMemo(() => {
    try {
      const geojson = getDMAGeoJSON();
      
      if (!geojson.features || geojson.features.length === 0) {
        return {
          type: 'FeatureCollection' as const,
          features: []
        };
      }
      
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
      return {
        type: 'FeatureCollection' as const,
        features: []
      };
    }
  }, [selectedDMA, hoveredDMA]);


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
        0, 'rgba(16, 185, 129, 0)',
        0.2, 'rgba(16, 185, 129, 0.6)', 
        0.4, 'rgba(34, 197, 94, 0.6)', 
        0.6, 'rgba(234, 179, 8, 0.8)', 
        0.8, 'rgba(239, 68, 68, 0.8)', 
        1, 'rgba(220, 38, 38, 1)', 
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


  const allCountyBoundaryLayer = {
    id: 'all-county-boundaries',
    type: 'line' as const,
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
    paint: {
      'line-color': '#10B981', 
      'line-width': isMobileView ? 2 : 1.5,
      'line-opacity': 0.7,
    },
  };


  const countyBoundaryLayer = {
    id: 'county-boundaries',
    type: 'fill' as const,
    layout: {},
    paint: {
      'fill-color': isMobileView 
        ? 'rgba(16, 185, 129, 0.4)' 
        : 'rgba(16, 185, 129, 0.3)', 
      'fill-outline-color': '#10B981', 
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
      'line-width': isMobileView ? 3 : 2,  
      'line-opacity': 1, 
    },
  };

  const countyClickableAreaLayer = {
    id: 'county-clickable-areas',
    type: 'fill' as const,
    layout: {},
    paint: {
      'fill-color': 'rgba(0, 0, 0, 0)',
      'fill-opacity': 0, 
    },
  };


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
        4, isMobileView ? 12 : 10,  
        8, isMobileView ? 14 : 12,  
        12, isMobileView ? 16 : 14    
      ] as any,
      'text-anchor': 'center',
      'text-justify': 'center',
      'text-allow-overlap': true,    
      'text-ignore-placement': true, 
      'symbol-placement': 'point',
      'text-optional': false,      
    } as any,
    paint: {
      'text-color': [
        'case',
        ['get', 'isSelected'],
        '#FFFFFF', 
        '#374151' 
      ] as any,
      'text-halo-color': [
        'case',
        ['get', 'isSelected'],
        '#10B981',
        '#FFFFFF'  
      ] as any,
      'text-halo-width': isMobileView ? 3 : 2,
      'text-halo-blur': 1,
      'text-opacity': 1, 
    } as any,
    cursor: 'pointer', 
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
        4, isMobileView ? 10 : 8,    
        8, isMobileView ? 12 : 10,    
        12, isMobileView ? 14 : 12   
      ] as any,
      'text-anchor': 'center',
      'text-justify': 'center',
      'text-offset': [0, 1.2],      
      'text-allow-overlap': true,    
      'text-ignore-placement': true, 
      'symbol-placement': 'point',
      'text-optional': false,        
    } as any,
    paint: {
      'text-color': [
        'case',
        ['get', 'isSelected'],
        '#D1FAE5',
        '#6B7280' 
      ] as any,
      'text-halo-color': [
        'case',
        ['get', 'isSelected'],
        '#047857',
        '#FFFFFF' 
      ] as any,
      'text-halo-width': isMobileView ? 3 : 2, 
      'text-halo-blur': 1,
      'text-opacity': 1, 
    } as any,
    cursor: 'pointer', 
  };


  const countyTouchTargetLayer = {
    id: 'county-touch-targets',
    type: 'circle' as const,
    layout: {},
    paint: {
      'circle-radius': isMobileView ? 30 : 15, 
      'circle-color': 'rgba(255, 255, 255, 0)',
      'circle-opacity': 0, 
      'circle-stroke-color': 'transparent', 
      'circle-stroke-width': 0, 
      'circle-stroke-opacity': 0, 
    },
  };


  const dmaBorderLayer = {
    id: 'dma-borders',
    type: 'line' as const,
    paint: {
      'line-color': [
        'case',
        ['get', 'isSelected'],
        '#10B981', 
        ['get', 'isHovered'],
        '#6B7280', 
        '#374151'  
      ] as any,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0, 3, 
        8, 4  
      ] as any,
      'line-opacity': 1, 
    },
  };


  const dmaFillLayer = {
    id: 'dma-areas',
    type: 'fill' as const,
    layout: {},
    paint: {
      'fill-color': 'rgba(0, 0, 0, 0)',  
      'fill-opacity': 0, 
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
        '#047857',  
        ['get', 'isHovered'],
        '#374151',
        '#FFFFFF'  
      ] as any,
      'text-halo-color': [
        'case',
        ['get', 'isSelected'],
        '#FFFFFF',
        ['get', 'isHovered'],
        '#FFFFFF', 
        '#000000'  
      ] as any,
      'text-halo-width': isMobileView ? 3 : 2,
      'text-halo-blur': 1,
    } as any,
  };


  const handleMarkerClick = useCallback((point: MapDataPoint) => {
    onZipCodeClick?.(point);
  }, [onZipCodeClick]);

  const handleMarkerLeave = useCallback(() => {
    setTooltipData(null);
  }, []);


  const handleDMAClick = useCallback((dmaId: string, dmaName: string) => {
    const dmaData = getProcessedDMAData();
    const clickedDMA = dmaData.find(dma => dma.id === dmaId);
    
    if (clickedDMA && mapRef.current) {
  
      if (isZoomedToDMA && selectedDMA?.id === dmaId) {

        return;
      }
      

      setShowCountiesInDMA(false);
      setSelectedCountiesInDMA([]);

      

      if (isZoomedToDMA && selectedDMA?.id !== dmaId) {
     
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
        
      
        setTimeout(() => {
          setSelectedDMA(clickedDMA);
          setIsZoomedToDMA(true);
          
          mapRef.current.fitBounds(
            [clickedDMA.bounds.southwest, clickedDMA.bounds.northeast],
            { 
              padding: isMobileView ? 20 : 40, 
              duration: 1200,
              minZoom: 8,
              maxZoom: 8 
            }
          );
             setTimeout(() => {
          setShowCountiesInDMA(true);
          
          const countiesInDMA = getCountiesInDMA(clickedDMA.id, countyData.map(c => ({
            countyName: c.countyName,
            stateName: c.stateName,
            coordinates: c.coordinates
          })));
          
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
              
              countySelection.lazyLoadCountyBoundaries(countiesInDMA);
            }
          } else {
          
            countySelection.lazyLoadCountyBoundaries(countiesInDMA);
          }
        }, 1300);
        }, 900);
      } else {
      
        setSelectedDMA(clickedDMA);
        setIsZoomedToDMA(true);
        
        mapRef.current.fitBounds(
          [clickedDMA.bounds.southwest, clickedDMA.bounds.northeast],
          { 
            padding: isMobileView ? 20 : 40, 
            duration: 1500,
            minZoom: 8, 
            maxZoom: 8  
          }
        );
        
        setTimeout(() => {
          setShowCountiesInDMA(true);
          
          const countiesInDMA = getCountiesInDMA(clickedDMA.id, countyData.map(c => ({
            countyName: c.countyName,
            stateName: c.stateName,
            coordinates: c.coordinates
          })));
          
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
           
              countySelection.lazyLoadCountyBoundaries(countiesInDMA);
            }
          } else {
      
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
      
  
      setShowCountiesInDMA(false);
      setSelectedCountiesInDMA([]);
     
      

      const bounds = calculateMapBounds(validDataPoints);
      if (bounds) {
        mapRef.current.fitBounds(
          [bounds.southwest, bounds.northeast],
          { padding: 60, duration: 1000 }
        );
      } else {

        mapRef.current.flyTo({
          center: initialCenter,
          zoom: initialZoom,
          duration: 1000
        });
      }
    }
  }, [validDataPoints, initialCenter, initialZoom, countySelection]);


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


  const handleViewportChange = useCallback((newViewport: any) => {
    setViewport(newViewport);
    
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
    

    if (isZoomedToDMA && showCountiesInDMA && newViewport.zoom < 6) {
      setShowCountiesInDMA(false);
      setSelectedCountiesInDMA([]);
      setSelectedDMA(null);
      setIsZoomedToDMA(false);
     
      countySelection.cancelLazyLoading();
      return;
    }
    

    if (!isZoomedToDMA && newViewport.zoom >= 8) {
      const dmaData = getProcessedDMAData();
      
     
      const mapCenter: [number, number] = [newViewport.longitude, newViewport.latitude];
      
      for (const dma of dmaData) {

        const { bounds } = dma;
        if (mapCenter[0] >= bounds.southwest[0] && mapCenter[0] <= bounds.northeast[0] &&
            mapCenter[1] >= bounds.southwest[1] && mapCenter[1] <= bounds.northeast[1]) {
          
          const isInsideDMA = pointInFeature(mapCenter, dma.feature);
          
          if (isInsideDMA) {
            
            setSelectedDMA(dma);
            setIsZoomedToDMA(true);
            setShowCountiesInDMA(true);
            
           
            const countiesInDMA = getCountiesInDMA(dma.id, countyData.map(c => ({
              countyName: c.countyName,
              stateName: c.stateName,
              coordinates: c.coordinates
            })));
            
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
              
                countySelection.lazyLoadCountyBoundaries(countiesInDMA);
              }
            } else {
            
              countySelection.lazyLoadCountyBoundaries(countiesInDMA);
            }
            
            break;
          } else {
          }
        }
      }
    }
    

    if (isZoomedToDMA && newViewport.zoom >= 8) {
      const dmaData = getProcessedDMAData();
      
 
      const mapCenter: [number, number] = [newViewport.longitude, newViewport.latitude];
      let foundNewDMA = null;
      
      for (const dma of dmaData) {
     
        const { bounds } = dma;
        if (mapCenter[0] >= bounds.southwest[0] && mapCenter[0] <= bounds.northeast[0] &&
            mapCenter[1] >= bounds.southwest[1] && mapCenter[1] <= bounds.northeast[1]) {
          
        
          const isInsideDMA = pointInFeature(mapCenter, dma.feature);
          
          if (isInsideDMA) {
            foundNewDMA = dma;
            break;
          }
        }
      }
      

      if (foundNewDMA && foundNewDMA.id !== selectedDMA?.id) {
        
        countySelection.cancelLazyLoading();
        
   
        setSelectedDMA(foundNewDMA);
        setShowCountiesInDMA(true);
        

        const countiesInDMA = getCountiesInDMA(foundNewDMA.id, countyData.map(c => ({
          countyName: c.countyName,
          stateName: c.stateName,
          coordinates: c.coordinates
        })));
        
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
     
            countySelection.lazyLoadCountyBoundaries(countiesInDMA);
          }
        } else {

          countySelection.lazyLoadCountyBoundaries(countiesInDMA);
        }
      } else if (!foundNewDMA && selectedDMA) {
        
        countySelection.cancelLazyLoading();
        
       
        setShowCountiesInDMA(false);
        setSelectedCountiesInDMA([]);
        setSelectedDMA(null);
      } else if (foundNewDMA && foundNewDMA.id === selectedDMA?.id) {
      }
    }
  }, [isZoomedToDMA, showCountiesInDMA, countySelection, countyData, getProcessedDMAData, getCountiesInDMA, selectedDMA]);


  const selectedCounties = countyData.filter(county => countySelection.isCountySelected(county.countyName));

  const allCountyBoundariesInDMA = useMemo(() => {

    if (!isZoomedToDMA || !showCountiesInDMA || !selectedDMA) return null;


    const countiesInDMA = getCountiesInDMA(selectedDMA.id, countyData.map(c => ({
      countyName: c.countyName,
      stateName: c.stateName,
      coordinates: c.coordinates
    })));

    const features: GeoJSON.Feature[] = [];
    
    countiesInDMA.forEach(dmaCounty => {

      const county = countyData.find(c => 
        c.countyName === dmaCounty.countyName && c.stateName === dmaCounty.stateName
      );
      
      if (county) {
        const boundary = countySelection.getCountyBoundary(county.countyName, county.stateName);
        if (boundary) {
          const isSelected = countySelection.isCountySelected(county.countyName);
          const boundaryGeoJSON = countyBoundaryToGeoJSON(boundary);
          
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


  const selectedCountyBoundaries = useMemo(() => {
    const features: GeoJSON.Feature[] = [];
    
    selectedCounties.forEach(county => {
      const boundary = countySelection.getCountyBoundary(county.countyName, county.stateName);
      if (boundary) {
        const boundaryGeoJSON = countyBoundaryToGeoJSON(boundary);

        features.push({
          ...boundaryGeoJSON,
          properties: {
            ...boundaryGeoJSON.properties,
            countyName: county.countyName,
            stateName: county.stateName,
            isSelected: true,
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


  useEffect(() => {
    const hasSelectedCounties = selectedCounties.length > 0;
    if (hasSelectedCounties && !showCountyStatsPanel) {
      setShowCountyStatsPanel(true);
    }
  }, [selectedCounties.length, showCountyStatsPanel]);


  const countyShapesData = useMemo(() => {

    if (!isZoomedToDMA || !showCountiesInDMA || !selectedDMA) return null;

    const countiesInDMA = getCountiesInDMA(selectedDMA.id, countyData.map(c => ({
      countyName: c.countyName,
      stateName: c.stateName,
      coordinates: c.coordinates
    })));

    const features: GeoJSON.Feature[] = [];
    
    countiesInDMA.forEach(dmaCounty => {
      const county = countyData.find(c => 
        c.countyName === dmaCounty.countyName && c.stateName === dmaCounty.stateName
      );
      
      if (county) {
        const isSelected = countySelection.isCountySelected(county.countyName);
        const isHovered = countySelection.selectionState.hoveredCounty === county.countyName;
        const isLoading = countySelection.isBoundaryLoading(county.countyName, county.stateName);
        
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

  const handleMapClick = useCallback(async (event: any) => {

    if (isMobileView && isDragging) {
      return;
    }
    

    setTooltipData(null);
    

    if (event.features && event.features.length > 0) {
      
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
          
          const county = countyData.find(c => 
            c.countyName === countyName && c.stateName === stateName
          );
          
          if (county) {
            const wasSelected = countySelection.isCountySelected(county.countyName);
            
            await countySelection.selectCounty(county.countyName, county.stateName);
            
            onCountySelect?.([county]);
            
            return;
          } else {
          }
        }
      }
      
 
      const dmaFeature = event.features.find((f: any) => 
        f.layer && (f.layer.id === 'dma-borders' || f.layer.id === 'dma-labels' || f.layer.id === 'dma-areas')
      );
      
      if (dmaFeature && dmaFeature.properties) {
        const dmaId = dmaFeature.properties.dmaId;
        const dmaName = dmaFeature.properties.dmaName;
        
        if (dmaId && dmaName) {
          handleDMAClick(dmaId, dmaName);
          return;
        }
      }
      
    } else {
    }
  }, [countyData, handleCountySelect, countySelection, isMobileView, isDragging, selectedCounties.length, handleDMAClick, isZoomedToDMA, showCountiesInDMA]);


  const handleTouchStart = useCallback((event: any) => {
    if (isMobileView && event.touches && event.touches.length === 1) {
      const touch = event.touches[0];
      setTouchStartPos({ x: touch.clientX, y: touch.clientY });
      setIsDragging(false);
    }
  }, [isMobileView]);


  const handleTouchMove = useCallback((event: any) => {
    if (isMobileView && touchStartPos && event.touches && event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPos.x);
      const deltaY = Math.abs(touch.clientY - touchStartPos.y);
      

      if (deltaX > 15 || deltaY > 15) {
        setIsDragging(true);
      }
    }
  }, [isMobileView, touchStartPos]);

  const handleTouchEnd = useCallback((event: any) => {
    if (isMobileView) {

      setTimeout(() => {
        setTouchStartPos(null);
        setIsDragging(false);
      }, 100);
    }
  }, [isMobileView]);


  const getMarkerSize = (totalCalls: number) => {
    const baseSizes = isMobileView 
      ? { large: 40, medium: 32, small: 24 } 
      : { large: 32, medium: 24, small: 16 }; 
    
    if (totalCalls >= 100) return baseSizes.large;
    if (totalCalls >= 50) return baseSizes.medium;
    return baseSizes.small;
  };


  const getMarkerColor = (avgBid: number) => {
    if (avgBid >= 100) return '#DC2626';
    if (avgBid >= 75) return '#EF4444';  
    if (avgBid >= 50) return '#F59E0B';  
    return '#10B981';
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
          top: showLegend ? '80px' : '0',  
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
          onClick={handleMapClick}
          onTouchStart={isMobileView ? handleTouchStart : undefined}
          onTouchMove={isMobileView ? handleTouchMove : undefined}
          onTouchEnd={isMobileView ? handleTouchEnd : undefined}
          onMouseMove={(event) => {
   
            if (!isMobileView && event.features && event.features.length > 0) {
      
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
                return; 
              }
              
         
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
              
           
              if (mapRef.current) {
                mapRef.current.getCanvas().style.cursor = '';
              }
            } else if (!isMobileView && mapRef.current) {

              mapRef.current.getCanvas().style.cursor = '';
            }
          }}
          onMouseEnter={(event) => {

            if (!isMobileView && event.features && event.features.length > 0) {

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
                return;
              }
              

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
              
        
              if (mapRef.current) {
                mapRef.current.getCanvas().style.cursor = '';
              }
            }
          }}
          onMouseLeave={() => {

            if (!isMobileView) {
              handleDMAHover(null); 
              if (mapRef.current) {
                mapRef.current.getCanvas().style.cursor = '';
              }
            }
          }}
          interactiveLayerIds={[
            'dma-borders', 
            'dma-areas',   
            'dma-labels',

            ...(isZoomedToDMA && showCountiesInDMA ? [
              'county-clickable-areas',  
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
              {isMobileView && <Layer {...countyTouchTargetLayer} />}
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
                  
           
                  const mapContainer = mapRef.current.getContainer();
                  const rect = mapContainer.getBoundingClientRect();
                  
             
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  
                  setTooltipData({
                    ...point,
                    position: { x, y },
                  });
                }}
                onTouchStart={(e) => {
         
                  if (!mapRef.current) return;
                  
                  const mapContainer = mapRef.current.getContainer();
                  const rect = mapContainer.getBoundingClientRect();
                  const touch = e.touches[0];
                  
                  const x = touch.clientX - rect.left;
                  const y = touch.clientY - rect.top;
                  
                  setTooltipData({
                    ...point,
                    position: { x, y },
                  });
                  
            
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
         
            "right-2 sm:right-4",
            "w-[calc(100vw-1rem)] sm:w-auto"
          )}
          style={{ 
            top: showFilters && showFilterPanel && isMobileView
              ? '350px' 
              : showLegend ? '96px' : '16px'
          }}
        >
          <CountyStatsPanel
            selectedCounties={selectedCounties}
            onClose={() => {
              setShowCountyStatsPanel(false);
            }}
            onCountyDeselect={(countyName) => {
              countySelection.deselectCounty(countyName);
            }}
            onClearAll={() => {
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
