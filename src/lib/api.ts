import { MapDataResponse, MapFilters, IndustriesResponse } from '@/components/LeadsMap/types';

// Use Next.js API route as proxy to avoid CORS issues
const API_BASE_URL = '/api'; // Local Next.js API routes
const API_VERSION = ''; // Not needed for local routes

class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchMapData(filters: MapFilters): Promise<MapDataResponse> {
  const url = new URL(`${API_BASE_URL}/map-data`, window.location.origin);
  
  // Add query parameters
  url.searchParams.set('industryId', filters.industryId.toString());
  url.searchParams.set('timeframe', filters.timeframe);
  
  if (filters.zipCodes && filters.zipCodes.length > 0) {
    url.searchParams.set('zipCodes', filters.zipCodes.join(','));
  }

  try {
    // Simple headers for local API route - authentication handled by proxy
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
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
    
    // Validate response structure
    if (!Array.isArray(data)) {
      throw new ApiError('Invalid response format: expected array');
    }

    return data as MapDataResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Network error: Unable to connect to API');
    }
    
    throw new ApiError('Unknown error occurred while fetching data', undefined, error);
  }
}

// Cache implementation for API responses
class ApiCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  
  private generateKey(filters: MapFilters): string {
    return JSON.stringify(filters);
  }
  
  set(filters: MapFilters, data: any, ttlMinutes = 5): void {
    const key = this.generateKey(filters);
    const ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }
  
  get(filters: MapFilters): any | null {
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
  
  clear(): void {
    this.cache.clear();
  }
}

export const apiCache = new ApiCache();

export async function fetchMapDataWithCache(filters: MapFilters): Promise<MapDataResponse> {
  // Check cache first
  const cached = apiCache.get(filters);
  if (cached) {
    return cached;
  }
  
  // Fetch fresh data
  const data = await fetchMapData(filters);
  
  // Cache the result
  apiCache.set(filters, data);
  
  return data;
}

export async function fetchIndustries(): Promise<IndustriesResponse> {
  const url = new URL(`${API_BASE_URL}/industries`, window.location.origin);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
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
    
    // Validate response structure
    if (!Array.isArray(data)) {
      throw new ApiError('Invalid industries response format: expected array');
    }

    return data as IndustriesResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Network error: Unable to connect to Industries API');
    }
    
    throw new ApiError('Unknown error occurred while fetching industries', undefined, error);
  }
}
