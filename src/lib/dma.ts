import { feature } from 'topojson-client';
import * as topojson from 'topojson-client';
import dmaTopology from '@/dma.json';

export interface DMAData {
  id: string;
  name: string;
  bounds: {
    southwest: [number, number];
    northeast: [number, number];
  };
  center: [number, number];
  feature: GeoJSON.Feature;
}

export interface DMATopology {
  type: 'Topology';
  objects: {
    nielsen_dma: {
      type: 'GeometryCollection';
      geometries: Array<{
        type: 'Polygon' | 'MultiPolygon';
        properties: {
          dma1: string;
          id: string;
          [key: string]: any;
        };
        arcs?: any;
      }>;
    };
  };
  arcs: any[];
  transform?: {
    scale: number[];
    translate: number[];
  };
}

/**
 * County data interface for spatial filtering
 */
export interface CountyPoint {
  countyName: string;
  stateName: string;
  coordinates: [number, number];
}

/**
 * Calculate bounding box and center for a GeoJSON feature
 */
function calculateGeometry(feature: GeoJSON.Feature): { 
  bounds: { southwest: [number, number]; northeast: [number, number] }; 
  center: [number, number]; 
} {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const processCoordinates = (coords: any) => {
    if (typeof coords[0] === 'number') {
      // Single coordinate pair
      const [lng, lat] = coords;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    } else {
      // Array of coordinates
      coords.forEach(processCoordinates);
    }
  };

  if (feature.geometry) {
    const geom = feature.geometry as any;
    if (geom.coordinates) {
      processCoordinates(geom.coordinates);
    }
  }

  const bounds = {
    southwest: [minLng, minLat] as [number, number],
    northeast: [maxLng, maxLat] as [number, number]
  };

  const center: [number, number] = [
    (minLng + maxLng) / 2,
    (minLat + maxLat) / 2
  ];

  return { bounds, center };
}

/**
 * Convert TopoJSON to GeoJSON and process DMA data
 */
export function getProcessedDMAData(): DMAData[] {
  try {
    const topology = dmaTopology as any; // Use any for flexibility with TopoJSON structure
    
    if (!topology.objects?.nielsen_dma) {
      console.warn('Invalid DMA topology: missing nielsen_dma object');
      return [];
    }

    // Convert TopoJSON to GeoJSON FeatureCollection
    const geojsonResult = feature(topology as any, topology.objects.nielsen_dma as any) as any;
    
    // Handle both single feature and feature collection cases
    let featureCollection: GeoJSON.FeatureCollection;
    if (geojsonResult.type === 'FeatureCollection') {
      featureCollection = geojsonResult;
    } else {
      // Single feature, wrap in collection
      featureCollection = {
        type: 'FeatureCollection',
        features: [geojsonResult]
      };
    }
    
    const dmaData: DMAData[] = featureCollection.features.map((feat, index) => {
      const properties = feat.properties || {};
      const dmaName = properties.dma1 || properties.name || `DMA ${index + 1}`;
      const dmaId = properties.id || `dma-${index}`;

      const { bounds, center } = calculateGeometry(feat);

      return {
        id: dmaId,
        name: dmaName,
        feature: feat,
        bounds,
        center
      };
    });

    console.log(`Processed ${dmaData.length} DMA regions`);
    return dmaData;
  } catch (error) {
    console.error('Error processing DMA data:', error);
    return [];
  }
}

/**
 * Get DMA GeoJSON as a FeatureCollection for map rendering
 */
export function getDMAGeoJSON(): GeoJSON.FeatureCollection {
  const dmaData = getProcessedDMAData();
  
  return {
    type: 'FeatureCollection',
    features: dmaData.map(dma => ({
      ...dma.feature,
      properties: {
        ...dma.feature.properties,
        dmaId: dma.id,
        dmaName: dma.name,
        center: dma.center
      }
    }))
  };
}

/**
 * Find DMA by name (case insensitive)
 */
export function findDMAByName(name: string): DMAData | null {
  const dmaData = getProcessedDMAData();
  return dmaData.find(dma => 
    dma.name.toLowerCase().includes(name.toLowerCase())
  ) || null;
}

/**
 * Get bounds for a specific DMA by ID
 */
export function getDMABounds(dmaId: string): { southwest: [number, number]; northeast: [number, number] } | null {
  const dmaData = getProcessedDMAData();
  const dma = dmaData.find(d => d.id === dmaId);
  return dma ? dma.bounds : null;
}

/**
 * Get center point for a specific DMA by ID
 */
export function getDMACenter(dmaId: string): [number, number] | null {
  const dmaData = getProcessedDMAData();
  const dma = dmaData.find(d => d.id === dmaId);
  return dma ? dma.center : null;
}

/**
 * Check if a point is within a polygon using ray casting algorithm
 */
function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Check if a point is within a GeoJSON feature geometry
 */
export function pointInFeature(point: [number, number], feature: GeoJSON.Feature): boolean {
  if (!feature.geometry) return false;
  
  const geometry = feature.geometry;
  
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][];
    // Check exterior ring (first in coordinates array)
    return pointInPolygon(point, coords[0]);
  } else if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates as number[][][][];
    // Check if point is in any of the polygons
    for (const polygon of coords) {
      if (pointInPolygon(point, polygon[0])) {
        return true;
      }
    }
    return false;
  }
  
  return false;
}

/**
 * Get counties that fall within a specific DMA boundary
 */
export function getCountiesInDMA(dmaId: string, allCounties: CountyPoint[]): CountyPoint[] {
  const dmaData = getProcessedDMAData();
  const targetDMA = dmaData.find(dma => dma.id === dmaId);
  
  if (!targetDMA) {
    console.warn(`DMA with ID ${dmaId} not found`);
    return [];
  }
  
  const countiesInDMA: CountyPoint[] = [];
  
  // First, do a quick bounds check to filter out counties that are clearly outside
  const { bounds } = targetDMA;
  const candidateCounties = allCounties.filter(county => {
    const [lng, lat] = county.coordinates;
    return lng >= bounds.southwest[0] && lng <= bounds.northeast[0] &&
           lat >= bounds.southwest[1] && lat <= bounds.northeast[1];
  });
  
  console.log(`🔍 Spatial filtering for DMA ${targetDMA.name}: ${candidateCounties.length}/${allCounties.length} counties within bounds`);
  
  // Then, do precise point-in-polygon testing for remaining candidates
  for (const county of candidateCounties) {
    if (pointInFeature(county.coordinates, targetDMA.feature)) {
      countiesInDMA.push(county);
    }
  }
  
  console.log(`✅ Found ${countiesInDMA.length} counties within DMA ${targetDMA.name}`);
  
  return countiesInDMA;
}

/**
 * Check if a county is within a specific DMA
 */
export function isCountyInDMA(dmaId: string, county: CountyPoint): boolean {
  const dmaData = getProcessedDMAData();
  const targetDMA = dmaData.find(dma => dma.id === dmaId);
  
  if (!targetDMA) return false;
  
  // Quick bounds check first
  const { bounds } = targetDMA;
  const [lng, lat] = county.coordinates;
  if (lng < bounds.southwest[0] || lng > bounds.northeast[0] ||
      lat < bounds.southwest[1] || lat > bounds.northeast[1]) {
    return false;
  }
  
  // Precise point-in-polygon test
  return pointInFeature(county.coordinates, targetDMA.feature);
}
