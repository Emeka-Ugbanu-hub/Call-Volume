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

  industryId: number;
  

  timeframe?: '7_days' | '30_days';
  zipCodes?: string[];
  className?: string;
  

  mapboxAccessToken: string;
  initialZoom?: number;
  initialCenter?: [longitude: number, latitude: number];
  mapStyle?: string;
  

  showFilters?: boolean;
  showLegend?: boolean;
  enableClustering?: boolean;
  heatmapIntensity?: number;
  

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


export interface Industry {
  campaign_id: number;
  campaign_name: string;
}

export type IndustriesResponse = Industry[];


export interface CountyData {
  countyName: string;
  stateName: string;
  zipCodes: string[];
  coordinates: [number, number]; 
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
  selectedCounties: string[]; 
  hoveredCounty: string | null;
  showCountyStats: boolean;
}


export interface LeadsMapPropsWithCounties extends LeadsMapProps {
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


export interface CountyBoundaryData {
  name: string;
  state: string;
  center: [number, number]; 
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
  position: [number, number];
  totalCalls: number;
  isSelected: boolean;
  boundary?: CountyBoundaryData;
}


export interface CountySelectionStateWithBoundaries extends CountySelectionState {
  selectedCountyBoundaries: Map<string, CountyBoundaryData>;
  loadingBoundaries: Set<string>;
}
