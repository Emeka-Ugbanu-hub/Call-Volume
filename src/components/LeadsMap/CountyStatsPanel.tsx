import React, { useState } from 'react';
import { CountyData } from './types';
import { aggregateMultipleCounties, formatCountyName } from '@/lib/counties';

interface CountyStatsPanelProps {
  selectedCounties: CountyData[];
  onClose: () => void;
  onCountyDeselect?: (countyName: string) => void;
  onClearAll?: () => void;
}

export default function CountyStatsPanel({
  selectedCounties,
  onClose,
  onCountyDeselect,
  onClearAll
}: CountyStatsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (selectedCounties.length === 0) return null;

  const aggregatedStats = aggregateMultipleCounties(selectedCounties);

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(Math.round(num));
  };

  const formatCurrency = (num: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const formatPercentage = (num: number): string => {
    return `${num.toFixed(1)}%`;
  };

  return (
    <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full sm:min-w-80 sm:max-w-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">
            Selected Counties
          </h3>
          <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
            {selectedCounties.length}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:bg-gray-200 rounded-md transition-colors touch-manipulation "
            aria-label={isCollapsed ? "Expand county stats" : "Collapse county stats"}
          >
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-md transition-colors touch-manipulation"
            aria-label="Close county stats"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Counties List */}
      {!isCollapsed && (
        <div className="max-h-60 sm:max-h-96 overflow-y-auto">
          {selectedCounties.map((county) => (
            <div
              key={`${county.countyName}-${county.stateName}`}
              className="p-3 sm:p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start sm:items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900 text-sm sm:text-base pr-2">
                  {county.countyName}, {county.stateName}
                </h4>
                {onCountyDeselect && (
                  <button
                    onClick={() => onCountyDeselect(county.countyName)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 touch-manipulation"
                    aria-label={`Remove ${county.countyName}`}
                  >
                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Total Calls:</span>
                  <span className="font-medium text-gray-900">
                    {formatNumber(county.aggregatedStats.totalCallsConnected)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Requests:</span>
                  <span className="font-medium text-gray-900">
                    {formatNumber(county.aggregatedStats.totalRequests)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Bid:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(county.aggregatedStats.avgBid)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>ZIP Codes:</span>
                  <span className="font-medium text-gray-900">
                    {county.aggregatedStats.zipCodeCount}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Footer (only show if multiple counties) */}
      {!isCollapsed && selectedCounties.length > 1 && (
        <div className="p-3 sm:p-4 bg-green-50 border-t border-gray-200">
          <div className="text-xs sm:text-sm font-medium text-green-900 mb-2">
            Total Summary ({selectedCounties.length} counties)
          </div>
          <div className="text-xs sm:text-sm text-green-800 space-y-1">
            <div className="flex justify-between">
              <span>Total Calls:</span>
              <span className="font-medium">
                {formatNumber(aggregatedStats.totalCallsConnected)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total Requests:</span>
              <span className="font-medium">
                {formatNumber(aggregatedStats.totalRequests)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Avg Bid:</span>
              <span className="font-medium">
                {formatCurrency(aggregatedStats.avgBid)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Button */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClearAll || onClose}
            className="w-full bg-red-50 hover:bg-red-100 text-red-700 font-medium py-2 px-4 rounded-md transition-colors border border-red-200 touch-manipulation"
          >
            Clear All Counties
          </button>
        </div>
      )}
    </div>
  );
}