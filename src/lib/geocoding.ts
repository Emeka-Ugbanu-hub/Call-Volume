import { MapDataPoint, CountyData } from '@/components/LeadsMap/types';

// Cache for geocoded coordinates to avoid repeated API calls
const GEOCODE_CACHE: Record<string, [number, number]> = {};

export async function geocodeZipCode(zipCode: string, mapboxToken?: string): Promise<[number, number] | null> {
  // Check cache first
  if (GEOCODE_CACHE[zipCode]) {
    return GEOCODE_CACHE[zipCode];
  }
  
  try {
    // Use Mapbox Geocoding API if token is provided
    if (mapboxToken) {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zipCode)}.json?types=postcode&country=US&access_token=${mapboxToken}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const coordinates: [number, number] = data.features[0].center;
          GEOCODE_CACHE[zipCode] = coordinates;
          return coordinates;
        }
      }
    }
    
    // Fallback to alternative geocoding service (you can use any service here)
    // For now, return null if no service is available
    console.warn(`Unable to geocode ZIP code: ${zipCode}`);
    return null;
  } catch (error) {
    console.error(`Error geocoding ZIP code ${zipCode}:`, error);
    return null;
  }
}

export async function addCoordinatesToData(
  data: MapDataPoint[], 
  mapboxToken?: string
): Promise<Array<MapDataPoint & { coordinates: [number, number] | null }>> {
  const results = await Promise.all(
    data.map(async (point) => ({
      ...point,
      coordinates: await geocodeZipCode(point.zipCode, mapboxToken),
    }))
  );
  
  return results;
}

export function calculateMapBounds(data: Array<{ coordinates: [number, number] | null }>): {
  southwest: [number, number];
  northeast: [number, number];
} | null {
  const validCoordinates = data
    .map(d => d.coordinates)
    .filter((coord): coord is [number, number] => coord !== null);
    
  if (validCoordinates.length === 0) return null;
  
  const lngs = validCoordinates.map(coord => coord[0]);
  const lats = validCoordinates.map(coord => coord[1]);
  
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  
  return {
    southwest: [minLng, minLat],
    northeast: [maxLng, maxLat],
  };
}

// County geocoding and aggregation functions
export async function getCountyForZipCode(zipCode: string, mapboxToken?: string): Promise<{
  county: string;
  state: string;
} | null> {
  try {
    if (mapboxToken) {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zipCode)}.json?types=postcode&country=US&access_token=${mapboxToken}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          
          // Extract county and state from context
          const context = feature.context || [];
          let county = '';
          let state = '';
          
          for (const ctx of context) {
            if (ctx.id && ctx.id.includes('district')) {
              county = ctx.text;
            } else if (ctx.id && ctx.id.includes('region')) {
              state = ctx.text;
            }
          }
          
          if (county && state) {
            return { county, state };
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`Error getting county for ZIP code ${zipCode}:`, error);
    return null;
  }
}

export async function aggregateDataByCounty(
  data: Array<MapDataPoint & { coordinates: [number, number] | null }>,
  mapboxToken?: string
): Promise<CountyData[]> {
  const countyMap = new Map<string, {
    zipCodes: string[];
    dataPoints: Array<MapDataPoint & { coordinates: [number, number] }>;
    county: string;
    state: string;
  }>();
  
  // Group data by county
  for (const point of data) {
    if (!point.coordinates) continue;
    
    const countyInfo = await getCountyForZipCode(point.zipCode, mapboxToken);
    if (!countyInfo) continue;
    
    const countyKey = `${countyInfo.county}, ${countyInfo.state}`;
    
    if (!countyMap.has(countyKey)) {
      countyMap.set(countyKey, {
        zipCodes: [],
        dataPoints: [],
        county: countyInfo.county,
        state: countyInfo.state,
      });
    }
    
    const countyEntry = countyMap.get(countyKey)!;
    countyEntry.zipCodes.push(point.zipCode);
    countyEntry.dataPoints.push(point as MapDataPoint & { coordinates: [number, number] });
  }
  
  // Calculate aggregated stats for each county
  const countyData: CountyData[] = [];
  
  // Convert map entries to array to avoid iterator issues
  const countyEntries = Array.from(countyMap.entries());
  
  for (const [countyKey, entry] of countyEntries) {
    const { dataPoints, county, state, zipCodes } = entry;
    
    if (dataPoints.length === 0) continue;
    
    // Calculate bounds
    const bounds = calculateMapBounds(dataPoints);
    if (!bounds) continue;
    
    // Calculate center point
    const centerLng = (bounds.southwest[0] + bounds.northeast[0]) / 2;
    const centerLat = (bounds.southwest[1] + bounds.northeast[1]) / 2;
    
    // Aggregate statistics with explicit typing
    const totalRequests = dataPoints.reduce((sum: number, p: MapDataPoint & { coordinates: [number, number] }) => sum + p.totalRequests, 0);
    const totalConversions = dataPoints.reduce((sum: number, p: MapDataPoint & { coordinates: [number, number] }) => sum + p.totalConversions, 0);
    const totalCallsConnected = dataPoints.reduce((sum: number, p: MapDataPoint & { coordinates: [number, number] }) => sum + p.totalCallsConnected, 0);
    const bids = dataPoints.map((p: MapDataPoint & { coordinates: [number, number] }) => p.avgBid);
    const avgBid = bids.reduce((sum: number, bid: number) => sum + bid, 0) / bids.length;
    const minBid = Math.min(...dataPoints.map((p: MapDataPoint & { coordinates: [number, number] }) => p.minBid));
    const maxBid = Math.max(...dataPoints.map((p: MapDataPoint & { coordinates: [number, number] }) => p.maxBid));
    
    countyData.push({
      countyName: county,
      stateName: state,
      zipCodes,
      coordinates: [centerLng, centerLat],
      bounds,
      aggregatedStats: {
        totalRequests,
        totalConversions,
        totalCallsConnected,
        avgBid,
        minBid,
        maxBid,
        zipCodeCount: zipCodes.length,
      },
    });
  }
  
  return countyData;
}
