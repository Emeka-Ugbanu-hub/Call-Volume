'use client';

import { LeadsMap } from '@/components/LeadsMap';
import { useState } from 'react';

export default function DashboardPage() {
  const [selectedZipCode, setSelectedZipCode] = useState<string | null>(null);

  const handleZipCodeClick = (data: any) => {
    setSelectedZipCode(data.zipCode);
  };

  const handleDataLoad = (data: any[]) => {
  };

  const handleError = (error: Error) => {
    console.error('Map error:', error);
  };

  const handleCountySelect = (counties: any[]) => {
  };

  const handleCountyHover = (county: any) => {
  };


  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!mapboxToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Configuration Required</h1>
          <p className="text-gray-600 mb-6 max-w-md">
            Please set your <code className="bg-gray-200 px-2 py-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> environment variable to use the map component.
          </p>
          <div className="bg-gray-100 p-4 rounded-lg text-left text-sm font-mono">
            <p className="mb-2">1. Copy .env.example to .env.local</p>
            <p className="mb-2">2. Get your token from: <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">mapbox.com</a></p>
            <p>3. Set NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                Leads Magician Map
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Visualize call-based lead traffic and market demand
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 flex-shrink-0">
              {selectedZipCode && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 sm:px-4 sm:py-2">
                  <p className="text-xs sm:text-sm text-green-800">
                    Selected: <span className="font-semibold">ZIP {selectedZipCode}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="h-[calc(100vh-180px)] sm:h-[calc(100vh-200px)] min-h-[400px] sm:min-h-[600px]">
            <LeadsMap
              industryId={123} 
              timeframe="30_days"
              mapboxAccessToken={mapboxToken}
              className="w-full h-full"
              showFilters={true}
              showLegend={true}
              enableClustering={true}
              heatmapIntensity={1}
              onZipCodeClick={handleZipCodeClick}
              onDataLoad={handleDataLoad}
              onError={handleError}
              onCountySelect={handleCountySelect}
              onCountyHover={handleCountyHover}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-4 sm:mt-8">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-4">
          <p className="text-center text-xs sm:text-sm text-gray-500">
            Leads Magician Map Component - Built with Next.js, Tailwind CSS, and Mapbox
          </p>
        </div>
      </footer>
    </div>
  );
}
