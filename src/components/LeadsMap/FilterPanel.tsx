'use client';

import { useState, useCallback } from 'react';
import { MapFilters, Industry } from './types';
import { cn } from '@/lib/utils';

interface FilterPanelProps {
  filters: MapFilters;
  onFiltersChange: (updates: Partial<MapFilters>) => void;
  loading?: boolean;
  className?: string;
  onClose?: () => void;
  industries?: Industry[];
  industriesLoading?: boolean;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFiltersChange,
  loading = false,
  className,
  onClose,
  industries = [],
  industriesLoading = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [zipCodeInput, setZipCodeInput] = useState(
    filters.zipCodes ? filters.zipCodes.join(', ') : ''
  );

  const handleTimeframeChange = useCallback((timeframe: '7_days' | '30_days') => {
    onFiltersChange({ timeframe });
  }, [onFiltersChange]);

  const handleIndustryChange = useCallback((industryId: number) => {
    if (industryId > 0) {
      onFiltersChange({ industryId });
    }
  }, [onFiltersChange]);

  const handleZipCodeSubmit = useCallback(() => {
    const zipCodes = zipCodeInput
      .split(',')
      .map(zip => zip.trim())
      .filter(zip => zip.length > 0);
    
    onFiltersChange({ zipCodes: zipCodes.length > 0 ? zipCodes : undefined });
  }, [zipCodeInput, onFiltersChange]);

  const handleZipCodeKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleZipCodeSubmit();
    }
  }, [handleZipCodeSubmit]);

  const clearZipCodes = useCallback(() => {
    setZipCodeInput('');
    onFiltersChange({ zipCodes: undefined });
  }, [onFiltersChange]);

  return (
    <div className={cn(
      "bg-white rounded-lg shadow-xl border border-gray-200",
      // Fixed width to maintain consistency when collapsed/expanded
      "w-full sm:min-w-80 sm:max-w-sm",
      className
    )}>
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
            {/* Active filter indicator */}
            {(filters.zipCodes && filters.zipCodes.length > 0) && (
              <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                {filters.zipCodes.length} ZIP{filters.zipCodes.length !== 1 ? 's' : ''}
              </span>
            )}
            {industries.length > 0 && (
              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                {industries.find(ind => ind.campaign_id === filters.industryId)?.campaign_name || 'Industry'}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 hover:bg-gray-200 rounded-md transition-colors touch-manipulation"
              aria-label={isCollapsed ? "Expand filters" : "Collapse filters"}
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
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-200 rounded-md transition-colors touch-manipulation"
                aria-label="Close filters"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Content - Collapsible */}
      {!isCollapsed && (
        <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
          {/* Timeframe Filter */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Time Range
            </label>
            <div className="flex space-x-1 sm:space-x-2">
              <button
                onClick={() => handleTimeframeChange('7_days')}
                disabled={loading}
                className={cn(
                  "flex-1 px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-md border transition-colors duration-200",
                  filters.timeframe === '7_days'
                    ? "bg-green-500 text-white border-green-500"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
                  loading && "opacity-50 cursor-not-allowed"
                )}
              >
                7 Days
              </button>
              <button
                onClick={() => handleTimeframeChange('30_days')}
                disabled={loading}
                className={cn(
                  "flex-1 px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-md border transition-colors duration-200",
                  filters.timeframe === '30_days'
                    ? "bg-green-500 text-white border-green-500"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
                  loading && "opacity-50 cursor-not-allowed"
                )}
              >
                30 Days
              </button>
            </div>
          </div>

          {/* Industry Filter */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Industry
            </label>
            <select
              value={filters.industryId || ''}
              onChange={(e) => handleIndustryChange(Number(e.target.value))}
              disabled={loading || industriesLoading}
              className={cn(
                "w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md",
                "focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent",
                "disabled:bg-gray-50 disabled:text-gray-500",
                (loading || industriesLoading) && "opacity-50 cursor-not-allowed"
              )}
            >
              {industriesLoading ? (
                <option value="">Loading industries...</option>
              ) : industries.length === 0 ? (
                <option value="">No industries available</option>
              ) : (
                <>
                  <option value="">Select an industry</option>
                  {industries.map((industry) => (
                    <option key={industry.campaign_id} value={industry.campaign_id}>
                      {industry.campaign_name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* ZIP Code Filter */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              ZIP Codes (optional)
            </label>
            <div className="space-y-2">
              <input
                type="text"
                value={zipCodeInput}
                onChange={(e) => setZipCodeInput(e.target.value)}
                onKeyPress={handleZipCodeKeyPress}
                placeholder="Enter ZIP codes, separated by commas"
                disabled={loading}
                className={cn(
                  "w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md",
                  "focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent",
                  "disabled:bg-gray-50 disabled:text-gray-500",
                  loading && "opacity-50 cursor-not-allowed"
                )}
              />
              <div className="flex space-x-2">
                <button
                  onClick={handleZipCodeSubmit}
                  disabled={loading}
                  className={cn(
                    "flex-1 px-2 sm:px-3 py-1 text-xs sm:text-sm bg-green-500 text-white rounded-md",
                    "hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2",
                    "transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  Apply
                </button>
                <button
                  onClick={clearZipCodes}
                  disabled={loading}
                  className={cn(
                    "px-2 sm:px-3 py-1 text-xs sm:text-sm bg-gray-200 text-gray-700 rounded-md",
                    "hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2",
                    "transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Active Filters Display */}
          {filters.zipCodes && filters.zipCodes.length > 0 && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                Active ZIP Codes
              </label>
              <div className="flex flex-wrap gap-1">
                {filters.zipCodes.map((zipCode) => (
                  <span
                    key={zipCode}
                    className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-md"
                  >
                    {zipCode}
                    <button
                      onClick={() => {
                        const newZipCodes = filters.zipCodes!.filter(z => z !== zipCode);
                        onFiltersChange({ 
                          zipCodes: newZipCodes.length > 0 ? newZipCodes : undefined 
                        });
                        setZipCodeInput(newZipCodes.join(', '));
                      }}
                      disabled={loading}
                      className="ml-1 text-green-600 hover:text-green-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex items-center justify-center py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
              <span className="ml-2 text-xs text-gray-600">Updating...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};