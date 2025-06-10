// Nominatim (OpenStreetMap) API integration for county boundaries
export interface NominatimCountyResponse {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: [string, string, string, string]; // [lat_min, lat_max, lon_min, lon_max]
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  geojson?: {
    type: string;
    coordinates: number[][][] | number[][][][]; // Polygon or MultiPolygon
  };
}

export interface CountyBoundary {
  name: string;
  state: string;
  center: [number, number]; // [longitude, latitude]
  bounds: {
    southwest: [number, number];
    northeast: [number, number];
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

// Cache for county boundaries to avoid repeated API calls
const COUNTY_BOUNDARY_CACHE: Record<string, CountyBoundary> = {};

/**
 * Fetch county boundary from Nominatim API
 */
export async function fetchCountyBoundary(
  countyName: string, 
  stateName: string
): Promise<CountyBoundary | null> {
  const cacheKey = `${countyName}, ${stateName}`;
  
  // Check cache first
  if (COUNTY_BOUNDARY_CACHE[cacheKey]) {
    return COUNTY_BOUNDARY_CACHE[cacheKey];
  }

  try {
    // Clean county name (remove "County" suffix if present)
    const cleanCountyName = countyName.replace(/\s+County$/i, '');
    
    // Use our proxy API endpoint to avoid CORS issues
    const searchUrl = `/api/county-boundary?` + 
      `county=${encodeURIComponent(cleanCountyName)}&` +
      `state=${encodeURIComponent(stateName)}`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const data: NominatimCountyResponse[] = await response.json();
    
    if (!data || data.length === 0) {
      console.warn(`No boundary data found for ${cacheKey}`);
      return null;
    }

    const result = data[0];
    
    if (!result.geojson) {
      console.warn(`No geometry data found for ${cacheKey}`);
      return null;
    }

    // Parse bounding box
    const [latMin, latMax, lonMin, lonMax] = result.boundingbox.map(Number);
    
    const boundary: CountyBoundary = {
      name: cleanCountyName,
      state: stateName,
      center: [Number(result.lon), Number(result.lat)],
      bounds: {
        southwest: [lonMin, latMin],
        northeast: [lonMax, latMax]
      },
      geometry: {
        type: result.geojson.type as 'Polygon' | 'MultiPolygon',
        coordinates: result.geojson.coordinates
      }
    };

    // Cache the result
    COUNTY_BOUNDARY_CACHE[cacheKey] = boundary;
    
    return boundary;
  } catch (error) {
    console.error(`Error fetching county boundary for ${cacheKey}:`, error);
    return null;
  }
}

/**
 * Convert county boundary to GeoJSON feature for map rendering
 */
export function countyBoundaryToGeoJSON(boundary: CountyBoundary): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {
      name: boundary.name,
      state: boundary.state,
      displayName: `${boundary.name} County, ${boundary.state}`
    },
    geometry: boundary.geometry as GeoJSON.Geometry
  };
}

/**
 * Get multiple county boundaries
 */
export async function fetchMultipleCountyBoundaries(
  counties: Array<{ name: string; state: string }>
): Promise<CountyBoundary[]> {
  const promises = counties.map(county => 
    fetchCountyBoundary(county.name, county.state)
  );
  
  const results = await Promise.all(promises);
  return results.filter((boundary): boundary is CountyBoundary => boundary !== null);
}

/**
 * Check if a point is within county bounds (rough check using bounding box)
 */
export function isPointInCountyBounds(
  point: [number, number], 
  boundary: CountyBoundary
): boolean {
  const [lon, lat] = point;
  const { southwest, northeast } = boundary.bounds;
  
  return (
    lon >= southwest[0] && 
    lon <= northeast[0] && 
    lat >= southwest[1] && 
    lat <= northeast[1]
  );
}
