# Leads Magician Map Component - Technical Specification

## Overview

The Leads Magician Map Component is an embeddable React-based visualization that displays call-based lead traffic data on an interactive map using Mapbox. The component serves as a "hot spot radar" for incoming call traffic, allowing users to visualize demand patterns, service activity, and market value across different geographic zones.

## Core Functionality

### Primary Purpose
- Visualize call-based lead traffic by geographic location
- Display demand hotspots with heatmap overlays
- Show bid ranges and conversion metrics per ZIP code
- Enable filtering and exploration of market data

### Key Features
- **Interactive Heatmap**: Visual representation of call volume density
- **ZIP Code Clustering**: Grouping of data points by ZIP code boundaries
- **Dynamic Filtering**: Real-time data filtering via props or UI controls
- **Detailed Tooltips**: Hover/click popups with comprehensive metrics
- **Responsive Design**: Optimized for desktop and mobile views
- **Native Embedding**: Direct React component integration (no iframe)

## API Integration

### Endpoint
```
GET https://api.leads-magician.com/api/v1/map-data
```

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `industryId` | number | Yes | Unique identifier for the industry/campaign |
| `zipCodes` | string | No | Comma-separated list of ZIP codes to filter results |
| `timeframe` | string | No | Data aggregation period. Options: `7_days` (default), `30_days` |

### Example Request
```
https://api.leads-magician.com/api/v1/map-data?industryId=123&timeframe=30_days&zipCodes=90210,10001
```

### Response Schema
```typescript
interface MapDataPoint {
  zipCode: string;           // ZIP code identifier
  totalRequests: number;     // Total lead requests in timeframe
  totalConversions: number;  // Successful conversions
  totalCallsConnected: number; // Connected call count
  maxBid: number;           // Highest bid amount ($)
  minBid: number;           // Lowest bid amount ($)
  avgBid: number;           // Average bid amount ($)
  campaignName: string;     // Associated campaign name
}

type MapDataResponse = MapDataPoint[];
```

### Example Response
```json
[
  {
    "zipCode": "90210",
    "totalRequests": 150,
    "totalConversions": 45,
    "totalCallsConnected": 60,
    "maxBid": 120.5,
    "minBid": 80.0,
    "avgBid": 100.25,
    "campaignName": "Luxury Homes Campaign"
  },
  {
    "zipCode": "10001",
    "totalRequests": 200,
    "totalConversions": 60,
    "totalCallsConnected": 90,
    "maxBid": 110.0,
    "minBid": 70.0,
    "avgBid": 90.0,
    "campaignName": "Urban Living Campaign"
  }
]
```

## Technical Requirements

### Core Dependencies
- **Next.js** (13.0+ with App Router support)
- **Tailwind CSS** (3.0+) for styling
- **Mapbox GL JS** or **react-map-gl** for map rendering
- **HTTP Client** (native fetch API) for API communication

### Map Implementation
- **Base Map**: Mapbox GL JS with customizable style
- **Clustering**: Dynamic ZIP code-based clustering with zoom-level responsiveness
- **Heatmap Layer**: Visual density representation of call volume
- **Marker System**: Individual markers for ZIP codes with data

### Performance Considerations
- **Data Caching**: Implement response caching to minimize API calls
- **Lazy Loading**: Load map data progressively based on viewport
- **Debounced Filtering**: Prevent excessive API requests during filter changes
- **Memory Management**: Proper cleanup of map layers and event listeners

## Component Interface

### Props Schema
```typescript
interface LeadsMapProps {
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
```

### Usage Example
```tsx
import { LeadsMap } from '@/components/LeadsMap';

export default function Dashboard() {
  return (
    <div className="w-full h-screen bg-gray-50">
      <LeadsMap
        industryId={123}
        timeframe="30_days"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN!}
        className="w-full h-full"
        showFilters={true}
        onZipCodeClick={(data) => console.log('ZIP clicked:', data)}
      />
    </div>
  );
}
```

## Visual Design Specifications

### Heatmap Visualization
- **Color Gradient**: Cool (blue) to warm (red) based on call volume
- **Intensity Mapping**: `totalRequests` drives heatmap intensity
- **Opacity Scaling**: Variable opacity based on data density
- **Zoom Responsiveness**: Heatmap detail increases with zoom level

### Marker Design
- **Base Style**: Circular markers with campaign-specific colors
- **Size Scaling**: Marker size correlates with `totalCallsConnected`
- **Border Styling**: Border thickness indicates bid range (max - min)
- **Hover States**: Elevated appearance with shadow effects

### Clustering Behavior
- **Zoom Levels**: 
  - Levels 1-8: Country/state-level clustering
  - Levels 9-12: City-level clustering
  - Levels 13+: Individual ZIP code markers
- **Cluster Labels**: Show aggregate counts and average metrics
- **Expansion Animation**: Smooth transitions when zooming into clusters

## Interactive Features

### Tooltip System
**Trigger**: Hover over markers or heatmap areas

**Content Structure**:
```
ZIP Code: [zipCode]
Campaign: [campaignName]
───────────────────────
📞 Total Requests: [totalRequests]
✅ Conversions: [totalConversions] ([conversion rate]%)
☎️ Calls Connected: [totalCallsConnected]
───────────────────────
💰 Bid Range: $[minBid] - $[maxBid]
📊 Average Bid: $[avgBid]
```

### Click Interactions
- **ZIP Code Click**: Trigger `onZipCodeClick` callback with full data
- **Cluster Click**: Zoom to cluster bounds
- **Map Click**: Clear any active selections

### Filter Controls
**Industry Selector**:
- Dropdown or autocomplete for industry selection
- Updates `industryId` parameter

**Timeframe Toggle**:
- Radio buttons or toggle for 7_days/30_days
- Visual indicator of current selection

**ZIP Code Filter**:
- Multi-select input for specific ZIP codes
- Autocomplete with validation

### Responsive Design

### Breakpoint Specifications (Tailwind CSS)
- **Desktop** (`lg:` ≥1024px): Full feature set, side-by-side filters
- **Tablet** (`md:` 768px-1023px): Collapsible filter panel
- **Mobile** (`sm:` ≤767px): Overlay filters, simplified tooltips

### Tailwind Responsive Classes
```css
/* Base mobile-first approach */
.map-container {
  @apply w-full h-64 md:h-96 lg:h-[600px];
}

.filter-panel {
  @apply absolute top-4 left-4 right-4 
         bg-white rounded-lg shadow-lg p-4
         md:relative md:w-80 md:top-0 md:left-0 md:right-auto
         lg:w-96;
}

.tooltip {
  @apply bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl
         max-w-xs sm:max-w-sm md:max-w-md;
}
```

## Styling with Tailwind CSS

### Component Styling Approach
```tsx
// Example component structure with Tailwind
const LeadsMap: React.FC<LeadsMapProps> = ({ className, ...props }) => {
  return (
    <div className={cn("relative w-full h-full bg-gray-50", className)}>
      {/* Map Container */}
      <div className="absolute inset-0 rounded-lg overflow-hidden shadow-lg">
        {/* Mapbox container */}
      </div>
      
      {/* Filter Panel */}
      <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-sm">
        {/* Filter controls */}
      </div>
      
      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-10 bg-white rounded-lg shadow-xl border border-gray-200 p-3">
        {/* Legend content */}
      </div>
    </div>
  );
};
```

### Key Tailwind Classes for Map Components
```css
/* Map Container */
.map-container {
  @apply relative w-full h-full bg-gray-50 rounded-lg overflow-hidden;
}

/* Markers */
.map-marker {
  @apply absolute w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-lg cursor-pointer transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 hover:scale-110 hover:shadow-xl;
}

.map-marker--high-volume {
  @apply bg-red-500 w-8 h-8;
}

.map-marker--medium-volume {
  @apply bg-yellow-500 w-7 h-7;
}

.map-marker--low-volume {
  @apply bg-blue-500 w-6 h-6;
}

/* Tooltip */
.map-tooltip {
  @apply absolute z-50 bg-gray-900 text-white text-sm rounded-lg p-3 shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-full animate-tooltip-fade;
}

.map-tooltip::after {
  @apply absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900;
  content: '';
}

/* Filter Panel */
.filter-panel {
  @apply bg-white rounded-lg shadow-xl border border-gray-200 p-4 space-y-4;
}

.filter-input {
  @apply w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent;
}

.filter-button {
  @apply px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200;
}

/* Legend */
.legend {
  @apply bg-white rounded-lg shadow-xl border border-gray-200 p-3 space-y-2;
}

.legend-item {
  @apply flex items-center space-x-2 text-sm text-gray-700;
}

.legend-color {
  @apply w-4 h-4 rounded-full;
}
```

## Error Handling

### API Error States
- **Network Errors**: Display retry mechanism with exponential backoff
- **Invalid Parameters**: Show parameter validation messages
- **Empty Results**: Display "No data available" state with helpful messaging
- **Rate Limiting**: Implement request queuing with user feedback

### Map Error States
- **Mapbox Token Issues**: Clear error message with setup instructions
- **Geocoding Failures**: Fallback to coordinate-based positioning
- **Browser Compatibility**: Graceful degradation for unsupported browsers

## Performance Targets

### Loading Performance
- **Initial Load**: < 3 seconds to interactive
- **API Response**: < 500ms average response time
- **Map Render**: < 1 second for initial map display

### Runtime Performance
- **Filter Updates**: < 200ms response time
- **Zoom/Pan**: 60fps animation smoothness
- **Memory Usage**: < 50MB heap size for typical datasets

## Security Considerations

### API Security
- **Token Management**: Secure storage of Mapbox access tokens
- **Request Validation**: Client-side parameter validation
- **Rate Limiting**: Respect API rate limits with proper error handling

### Data Privacy
- **Location Data**: No storage of user location information
- **API Responses**: Cache management with appropriate TTL
- **Error Logging**: Sanitize error logs to prevent data leakage

## Development Guidelines

### Code Organization
```
src/
├── app/
│   └── dashboard/
│       └── page.tsx               # Dashboard page with map
├── components/
│   ├── ui/                        # Shadcn/ui components
│   └── LeadsMap/
│       ├── index.tsx              # Main component
│       ├── MapContainer.tsx       # Map rendering logic
│       ├── HeatmapLayer.tsx       # Heatmap implementation
│       ├── MarkerLayer.tsx        # Marker rendering
│       ├── FilterPanel.tsx        # Filter controls
│       ├── Tooltip.tsx            # Tooltip component
│       └── types.ts               # TypeScript definitions
├── hooks/
│   ├── useMapData.ts              # API data fetching
│   ├── useMapbox.ts               # Mapbox integration
│   └── useFilters.ts              # Filter state management
├── lib/
│   ├── utils.ts                   # Utility functions (cn, etc.)
│   ├── geocoding.ts               # ZIP code to coordinates
│   ├── clustering.ts              # Data clustering logic
│   └── api.ts                     # API client functions
└── styles/
    └── globals.css                # Tailwind imports and custom styles
```


### Browser Compatibility
- **Modern Browsers**: Chrome 70+, Firefox 65+, Safari 12+, Edge 79+
- **Fallbacks**: Graceful degradation for older browsers
- **Mobile**: iOS Safari 12+, Chrome Mobile 70+

## Deployment Considerations

### Build Configuration (Next.js)
```javascript
// next.config.js - Production optimizations
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['mapbox-gl', 'react-map-gl'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  images: {
    domains: ['api.mapbox.com'],
  },
  // Bundle analyzer for monitoring size
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig
```

### Tailwind Production Configuration
```javascript
// tailwind.config.js - Production optimizations
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Custom configurations
    },
  },
  plugins: [],
  // Production optimizations
  corePlugins: {
    preflight: true,
  },
  // Purge unused styles
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: ['./src/**/*.{js,jsx,ts,tsx}'],
  },
}
```

### Environment Variables (Next.js)
```bash
# .env.local
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
LEADS_API_BASE_URL=https://api.leads-magician.com
LEADS_API_VERSION=v1

# .env.example
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_public_token
LEADS_API_BASE_URL=https://api.leads-magician.com
LEADS_API_VERSION=v1
```

### Next.js Configuration
```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
  images: {
    domains: ['api.mapbox.com'],
  },
  experimental: {
    optimizePackageImports: ['mapbox-gl', 'react-map-gl'],
  },
}

module.exports = nextConfig
```

### Tailwind Configuration
```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Custom colors for heatmap
        heatmap: {
          cold: '#3B82F6',    // blue-500
          warm: '#EF4444',    // red-500
          hot: '#DC2626',     // red-600
        },
        // Brand colors
        brand: {
          primary: '#1E40AF', // blue-800
          secondary: '#64748B', // slate-500
        }
      },
      animation: {
        'marker-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'tooltip-fade': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
```

