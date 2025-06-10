// TypeScript definitions for the LeadsMap component
export interface MapDataPoint {
  zipCode: string;
  totalRequests: number;
  totalConversions: number;
  totalCallsConnected: number;
  maxBid: number;
  minBid: number;
  avgBid: number;
  campaignName: string;
  coordinates?: [number, number] | null;
}

export type MapDataResponse = MapDataPoint[];

export interface LeadsMapProps {
  // Required Props
  industryId: number;
  
  // Optional Configuration
  timeframe?: '7_days' | '30_days';
  zipCodes?: string[];
  className?: string;
  
  // Map Configuration
  mapboxAccessToken: string;
  initialZoom?: number;
  initialCenter?: [longitude: number, latitude: number];
  mapStyle?: string;
  
  // UI Configuration
  showFilters?: boolean;
  showLegend?: boolean;
  enableClustering?: boolean;
  heatmapIntensity?: number;
  
  // Event Handlers
  onZipCodeClick?: (data: MapDataPoint) => void;
  onDataLoad?: (data: MapDataPoint[]) => void;
  onError?: (error: Error) => void;
}

export interface MapFilters {
  industryId: number;
  timeframe: '7_days' | '30_days';
  zipCodes?: string[];
}

export interface MapTooltipData extends MapDataPoint {
  position: { x: number; y: number };
}

// County selection types
export interface CountyData {
  countyName: string;
  stateName: string;
  zipCodes: string[];
  coordinates: [number, number]; // County center
  bounds: {
    southwest: [number, number];
    northeast: [number, number];
  };
  aggregatedStats: {
    totalRequests: number;
    totalConversions: number;
    totalCallsConnected: number;
    avgBid: number;
    minBid: number;
    maxBid: number;
    zipCodeCount: number;
  };
}

export interface CountySelectionState {
  selectedCounties: string[]; // County names
  hoveredCounty: string | null;
  showCountyStats: boolean;
}

// Extended props for county selection
export interface LeadsMapPropsWithCounties extends LeadsMapProps {
  enableCountySelection?: boolean;
  onCountySelect?: (counties: CountyData[]) => void;
  onCountyHover?: (county: CountyData | null) => void;
}

export interface ClusterPoint extends MapDataPoint {
  clusterId: string;
  clusterSize: number;
  coordinates: [number, number];
}

export interface ClusterData {
  id: string;
  coordinates: [number, number];
  pointCount: number;
  avgMetrics: {
    totalRequests: number;
    totalConversions: number;
    totalCallsConnected: number;
    avgBid: number;
  };
}

export interface MapError {
  type: 'network' | 'validation' | 'mapbox' | 'geocoding' | 'unknown';
  message: string;
  details?: any;
}

// County boundary types for Nominatim integration
export interface CountyBoundaryData {
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

export interface CountyLabel {
  name: string;
  state: string;
  position: [number, number]; // [longitude, latitude]
  totalCalls: number;
  isSelected: boolean;
  boundary?: CountyBoundaryData;
}

// Extended county selection state to include boundaries
export interface CountySelectionStateWithBoundaries extends CountySelectionState {
  selectedCountyBoundaries: Map<string, CountyBoundaryData>;
  loadingBoundaries: Set<string>;
}
