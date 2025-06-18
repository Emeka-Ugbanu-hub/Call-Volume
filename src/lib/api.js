const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.leads-magician.com/api';
const API_VERSION = 'v1';
const INDUSTRIES_API_KEY = process.env.NEXT_PUBLIC_INDUSTRIES_API_KEY || 'VoarWqi3dh6tslo9ClU5WNjT4lAHJIAL';
const MAP_DATA_API_KEY = process.env.NEXT_PUBLIC_MAP_DATA_API_KEY || 'suNDIseaDvENTerIPeRICariCaNAbAlm'; 

class ApiError extends Error {
  constructor(message, status = undefined, data = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function fetchMapData(filters) {
  const url = new URL(`${API_BASE_URL}/${API_VERSION}/map-data`);
  
  // Add query parameters
  url.searchParams.set('industryId', filters.industryId.toString());
  url.searchParams.set('timeframe', filters.timeframe);
  
  if (filters.zipCodes && filters.zipCodes.length > 0) {
    url.searchParams.set('zipCodes', filters.zipCodes.join(','));
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MAP_DATA_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        `API request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorData
      );
    }

    const data = await response.json();
    
   
    if (!Array.isArray(data)) {
      throw new ApiError('Invalid response format: expected array');
    }

    return data ;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Network/CORS error: Unable to connect to external API. Please check if CORS is enabled on the API server.');
    }
    
    throw new ApiError('Unknown error occurred while fetching data', undefined, error);
  }
}


class ApiCache {
  constructor() {
    this.cache = new Map();
  }
  
 
  generateKey(filters) {
    return JSON.stringify(filters);
  }
  
 
  set(filters, data, ttlMinutes = 5) {
    const key = this.generateKey(filters);
    const ttl = ttlMinutes * 60 * 1000; 
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }
  
 
  get(filters) {
    const key = this.generateKey(filters);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
 
  clear() {
    this.cache.clear();
  }
}

export const apiCache = new ApiCache();

export async function fetchMapDataWithCache(filters) {

  const cached = apiCache.get(filters);
  if (cached) {
    return cached;
  }
  

  const data = await fetchMapData(filters);
  

  apiCache.set(filters, data);
  
  return data;
}

export async function fetchIndustries() {
  const url = new URL(`${API_BASE_URL}/${API_VERSION}/industries`);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${INDUSTRIES_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        `Industries API request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorData
      );
    }

    const data = await response.json();
    
  
    if (!Array.isArray(data)) {
      throw new ApiError('Invalid industries response format: expected array');
    }

    return data ;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Network/CORS error: Unable to connect to external Industries API. Please check if CORS is enabled on the API server.');
    }
    
    throw new ApiError('Unknown error occurred while fetching industries', undefined, error);
  }
}
