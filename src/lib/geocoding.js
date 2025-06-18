const GEOCODE_CACHE = {};

export async function geocodeZipCode(zipCode, mapboxToken) {

  if (GEOCODE_CACHE[zipCode]) {
    return GEOCODE_CACHE[zipCode];
  }
  
  try {
  
    if (mapboxToken) {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zipCode)}.json?types=postcode&country=US&access_token=${mapboxToken}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const coordinates = data.features[0].center;
          GEOCODE_CACHE[zipCode] = coordinates;
          return coordinates;
        }
      }
    }
    
   
    console.warn(`Unable to geocode ZIP code: ${zipCode}`);
    return null;
  } catch (error) {
    console.error(`Error geocoding ZIP code ${zipCode}:`, error);
    return null;
  }
}

export async function addCoordinatesToData(
  data, 
  mapboxToken
) {
  const results = await Promise.all(
    data.map(async (point) => ({
      ...point,
      coordinates: await geocodeZipCode(point.zipCode, mapboxToken),
    }))
  );
  
  return results;
}

export function calculateMapBounds(data) {
  const validCoordinates = data
    .map(d => d.coordinates)
    .filter((coord) => coord !== null);
    
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


export async function getCountyForZipCode(zipCode, mapboxToken){
  try {
    if (mapboxToken) {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zipCode)}.json?types=postcode&country=US&access_token=${mapboxToken}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          

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
  data,
  mapboxToken
) {
  const countyMap = new Map();
  

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
    
    const countyEntry = countyMap.get(countyKey);
    countyEntry.zipCodes.push(point.zipCode);
    countyEntry.dataPoints.push(point );
  }
  
 
  const countyData = [];
  

  const countyEntries = Array.from(countyMap.entries());
  
  for (const [countyKey, entry] of countyEntries) {
    const { dataPoints, county, state, zipCodes } = entry;
    
    if (dataPoints.length === 0) continue;
    

    const bounds = calculateMapBounds(dataPoints);
    if (!bounds) continue;
    

    const centerLng = (bounds.southwest[0] + bounds.northeast[0]) / 2;
    const centerLat = (bounds.southwest[1] + bounds.northeast[1]) / 2;
    

    const totalRequests = dataPoints.reduce((sum, p) => sum + p.totalRequests, 0);
    const totalConversions = dataPoints.reduce((sum, p) => sum + p.totalConversions, 0);
    const totalCallsConnected = dataPoints.reduce((sum, p) => sum + p.totalCallsConnected, 0);
    const bids = dataPoints.map((p) => p.avgBid);
    const avgBid = bids.reduce((sum, bid) => sum + bid, 0) / bids.length;
    const minBid = Math.min(...dataPoints.map((p) => p.minBid));
    const maxBid = Math.max(...dataPoints.map((p) => p.maxBid));
    
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
