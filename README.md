# LeadsMap - Interactive React Map Component

A powerful, embeddable React map component for visualizing call-based lead traffic using Mapbox. Built with TypeScript, Next.js, and Tailwind CSS.

## Features

✨ **Interactive Map Visualization**
- Mapbox GL JS integration with react-map-gl
- Heatmap layers for lead density visualization
- Clustered markers with zoom-based aggregation
- Responsive design for all screen sizes

🎯 **Advanced Filtering**
- Time-based filtering (7 days, 30 days)
- ZIP code filtering with multi-select
- Real-time filter updates with debouncing
- Collapsible filter panel for mobile

📊 **Rich Data Display**
- Detailed tooltips with metrics (requests, conversions, bids)
- Interactive markers with click handlers
- Color-coded visualization based on bid amounts
- Real-time conversion rate calculations

🚀 **Performance Optimized**
- Data caching with automatic cache invalidation
- Lazy loading and code splitting
- Debounced user interactions
- Efficient clustering algorithms

🛠 **Developer Friendly**
- Full TypeScript support
- Comprehensive error handling
- Flexible props interface
- Easy integration and customization

## Installation

1. **Install Dependencies**
```bash
npm install react react-dom next mapbox-gl react-map-gl
npm install -D typescript @types/react @types/node tailwindcss
```

2. **Setup Environment Variables**
Create a `.env.local` file:
```env
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
NEXT_PUBLIC_API_BASE_URL=your_api_endpoint_here
```

3. **Get a Mapbox Token**
- Sign up at [mapbox.com](https://www.mapbox.com)
- Create a new access token
- Add it to your environment variables

## Usage

### Basic Implementation

```tsx
import { LeadsMap } from '@/components/LeadsMap';

export default function MyPage() {
  return (
    <div className="h-96 w-full">
      <LeadsMap
        industryId={123}
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!}
        onZipCodeClick={(data) => console.log('ZIP clicked:', data)}
        onDataLoad={(data) => console.log('Data loaded:', data.length)}
        onError={(error) => console.error('Map error:', error)}
      />
    </div>
  );
}
```

### Advanced Configuration

```tsx
<LeadsMap
  // Required
  industryId={123}
  mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!}
  
  // Optional Configuration
  timeframe="30_days"
  zipCodes={["90210", "10001", "60601"]}
  className="rounded-lg shadow-lg"
  
  // Map Settings
  initialZoom={6}
  initialCenter={[-98.5, 39.8]} // Center of USA
  mapStyle="mapbox://styles/mapbox/streets-v11"
  
  // UI Options
  showFilters={true}
  showLegend={true}
  enableClustering={true}
  heatmapIntensity={1.5}
  
  // Event Handlers
  onZipCodeClick={(data) => {
    // Handle ZIP code click
    router.push(\`/zip/\${data.zipCode}\`);
  }}
  onDataLoad={(data) => {
    // Handle data load
    setMetrics(calculateMetrics(data));
  }}
  onError={(error) => {
    // Handle errors
    toast.error('Failed to load map data');
  }}
/>
```

## Component Props

### Required Props

| Prop | Type | Description |
|------|------|-------------|
| `industryId` | `number` | Industry ID for filtering leads data |
| `mapboxAccessToken` | `string` | Mapbox access token for map rendering |

### Optional Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `timeframe` | `'7_days' \| '30_days'` | `'7_days'` | Time range for data filtering |
| `zipCodes` | `string[]` | `undefined` | Array of ZIP codes to filter by |
| `className` | `string` | `undefined` | Additional CSS classes |
| `initialZoom` | `number` | `5` | Initial map zoom level |
| `initialCenter` | `[number, number]` | `[-98.5, 39.8]` | Initial map center coordinates |
| `mapStyle` | `string` | `'mapbox://styles/mapbox/light-v10'` | Mapbox style URL |
| `showFilters` | `boolean` | `true` | Show/hide filter panel |
| `showLegend` | `boolean` | `true` | Show/hide map legend |
| `enableClustering` | `boolean` | `true` | Enable marker clustering |
| `heatmapIntensity` | `number` | `1` | Heatmap intensity multiplier |

### Event Handlers

| Prop | Type | Description |
|------|------|-------------|
| `onZipCodeClick` | `(data: MapDataPoint) => void` | Called when a ZIP code marker is clicked |
| `onDataLoad` | `(data: MapDataPoint[]) => void` | Called when map data is loaded |
| `onError` | `(error: Error) => void` | Called when an error occurs |

## Data Structure

### MapDataPoint Interface

```typescript
interface MapDataPoint {
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
```

## API Integration

The component expects your API to return data in the following format:

```typescript
// GET /api/leads/map-data?industryId=123&timeframe=7_days&zipCodes=90210,10001
{
  "data": [
    {
      "zipCode": "90210",
      "totalRequests": 150,
      "totalConversions": 23,
      "totalCallsConnected": 89,
      "maxBid": 75.50,
      "minBid": 25.00,
      "avgBid": 52.25,
      "campaignName": "Home Services - Beverly Hills"
    }
    // ... more data points
  ]
}
```

## Styling and Customization

### Tailwind CSS Classes

The component uses Tailwind CSS for styling. Key classes include:

- `bg-white` - Background colors
- `rounded-lg` - Border radius
- `shadow-xl` - Box shadows
- `text-gray-900` - Text colors
- `p-4` - Padding

### Custom Mapbox Styles

You can use any Mapbox style URL:

```tsx
// Light theme
mapStyle="mapbox://styles/mapbox/light-v10"

// Dark theme  
mapStyle="mapbox://styles/mapbox/dark-v10"

// Satellite
mapStyle="mapbox://styles/mapbox/satellite-v9"

// Custom style
mapStyle="mapbox://styles/your-username/your-style-id"
```

## Performance Considerations

### Data Caching

- API responses are cached for 5 minutes
- Cache keys include all filter parameters
- Automatic cache invalidation on filter changes

### Optimization Tips

1. **Limit ZIP Codes**: Filter to relevant ZIP codes only
2. **Use Clustering**: Enable clustering for large datasets
3. **Optimize Images**: Use WebP format for custom markers
4. **Debounce Filters**: Built-in 300ms debouncing for filter changes

## Error Handling

The component includes comprehensive error handling:

```tsx
<LeadsMap
  industryId={123}
  mapboxAccessToken={token}
  onError={(error) => {
    switch (error.type) {
      case 'network':
        // Handle network errors
        break;
      case 'mapbox':
        // Handle Mapbox errors
        break;
      case 'geocoding':
        // Handle geocoding errors
        break;
      default:
        // Handle unknown errors
        break;
    }
  }}
/>
```

## Browser Support

- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For questions or issues:
- Create an issue on GitHub
- Check the documentation
- Review the example implementations

---

Built with ❤️ using React, TypeScript, Next.js, and Mapbox GL JS.
