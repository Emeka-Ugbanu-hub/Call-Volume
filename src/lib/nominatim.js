
const COUNTY_BOUNDARY_CACHE = {};


export async function fetchCountyBoundary(
  countyName, 
  stateName
){
  const cacheKey = `${countyName}, ${stateName}`;
  

  if (COUNTY_BOUNDARY_CACHE[cacheKey]) {
    return COUNTY_BOUNDARY_CACHE[cacheKey];
  }

  try {
   
    const cleanCountyName = countyName.replace(/\s+County$/i, '');
    
   
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

    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.warn(`No boundary data found for ${cacheKey}`);
      return null;
    }

    const result = data[0];
    
    if (!result.geojson) {
      console.warn(`No geometry data found for ${cacheKey}`);
      return null;
    }

   
    const [latMin, latMax, lonMin, lonMax] = result.boundingbox.map(Number);
    
    const boundary = {
      name: cleanCountyName,
      state: stateName,
      center: [Number(result.lon), Number(result.lat)],
      bounds: {
        southwest: [lonMin, latMin],
        northeast: [lonMax, latMax]
      },
      geometry: {
        type: result.geojson.type ,
        coordinates: result.geojson.coordinates
      }
    };

   
    COUNTY_BOUNDARY_CACHE[cacheKey] = boundary;
    
    return boundary;
  } catch (error) {
    console.error(`Error fetching county boundary for ${cacheKey}:`, error);
    return null;
  }
}


export function countyBoundaryToGeoJSON(boundary) {
  return {
    type: 'Feature',
    properties: {
      name: boundary.name,
      state: boundary.state,
      displayName: `${boundary.name} County, ${boundary.state}`
    },
    geometry: boundary.geometry 
  };
}


export async function fetchMultipleCountyBoundaries(
  counties
) {
  const promises = counties.map(county => 
    fetchCountyBoundary(county.name, county.state)
  );
  
  const results = await Promise.all(promises);
return results.filter((boundary) => boundary !== null);
}


export function isPointInCountyBounds(
  point, 
  boundary
) {
  const [lon, lat] = point;
  const { southwest, northeast } = boundary.bounds;
  
  return (
    lon >= southwest[0] && 
    lon <= northeast[0] && 
    lat >= southwest[1] && 
    lat <= northeast[1]
  );
}
