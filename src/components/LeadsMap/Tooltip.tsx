'use client';

import { useEffect, useState } from 'react';
import { MapTooltipData } from './types';
import { cn } from '@/lib/utils';

interface TooltipProps {
  data: MapTooltipData;
  className?: string;
  onClose?: () => void;
}

export const Tooltip: React.FC<TooltipProps> = ({ data, className, onClose }) => {
  const [dimensions, setDimensions] = useState({ width: 1024, height: 768 });

  useEffect(() => {

    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const conversionRate = data.totalRequests > 0 
    ? ((data.totalConversions / data.totalRequests) * 100).toFixed(1)
    : '0.0';


  const isMobile = dimensions.width < 640; 
  const isTablet = dimensions.width < 1024; 
  
 
  let tooltipWidth;
  if (isMobile) {
   
    tooltipWidth = 'auto';
  } else {

    const baseWidth = isTablet ? 240 : 260;
    const maxWidth = isTablet ? 280 : 300;
    const minWidth = 220;
    tooltipWidth = Math.max(minWidth, Math.min(baseWidth, maxWidth));
  }
  
  const tooltipHeight = isMobile ? 180 : 200;
  const padding = isMobile ? 10 : 15;
  

  let left = data.position.x;
  let top = data.position.y - tooltipHeight - padding;
  
  
  if (isMobile && tooltipWidth === 'auto') {
   
    left = Math.max(padding, Math.min(data.position.x - 120, dimensions.width - 240 - padding));
  } else {
 
    const width = typeof tooltipWidth === 'number' ? tooltipWidth : 240;
    if (left + width > dimensions.width) {
      left = dimensions.width - width - padding;
    }
    if (left < padding) {
      left = padding;
    }
  }
  

  if (top < padding) {
    top = data.position.y + padding; 
  }
  
 
  const arrowLeft = isMobile && tooltipWidth === 'auto' 
    ? 120 
    : Math.max(10, Math.min((typeof tooltipWidth === 'number' ? tooltipWidth : 240) - 10, data.position.x - left));
  const showArrowBottom = top > data.position.y; 

  return (
    <div
      className={cn(
        "absolute z-50 bg-gray-900 text-white rounded-lg shadow-2xl pointer-events-none",
        "animate-tooltip-fade",

        "p-2 sm:p-3 text-xs sm:text-sm",

        "sm:pointer-events-none pointer-events-auto",

        "leading-tight",

        isMobile ? "max-w-[calc(100vw-20px)] min-w-[200px] w-max" : "",
        className
      )}
      style={{
        left: left,
        top: top,
        transform: 'none',
        ...(typeof tooltipWidth === 'number' ? { width: tooltipWidth } : {}),
      }}
    >
      {/* Mobile close button */}
      {isMobile && onClose && (
        <button
          className="absolute top-1 right-1 p-1 hover:bg-gray-700 rounded-full transition-colors pointer-events-auto"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {/* Header */}
      <div className="border-b border-gray-700 pb-1 mb-1">
        <div className="font-semibold text-sm">ZIP Code: {data.zipCode}</div>
        <div className="text-gray-300 text-xs truncate">{data.campaignName}</div>
      </div>

      {/* Metrics */}
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <span className="text-green-300 text-xs">📞</span>
          <span className="text-xs">Total Requests: <span className="font-semibold">{data.totalRequests.toLocaleString()}</span></span>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-green-300 text-xs">✅</span>
          <span className="text-xs">
            Conversions: <span className="font-semibold">{data.totalConversions.toLocaleString()}</span>
            <span className="text-gray-400 ml-1">({conversionRate}%)</span>
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-yellow-300 text-xs">☎️</span>
          <span className="text-xs">Calls Connected: <span className="font-semibold">{data.totalCallsConnected.toLocaleString()}</span></span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-700 my-1"></div>

      {/* Bid Information */}
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <span className="text-red-300 text-xs">💰</span>
          <span className="text-xs">
            Bid Range: <span className="font-semibold">${data.minBid.toFixed(2)} - ${data.maxBid.toFixed(2)}</span>
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-purple-300 text-xs">📊</span>
          <span className="text-xs">Average Bid: <span className="font-semibold">${data.avgBid.toFixed(2)}</span></span>
        </div>
      </div>

      {/* Tooltip Arrow */}
      {showArrowBottom ? (
        <div 
          className="absolute bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"
          style={{ left: arrowLeft }}
        ></div>
      ) : (
        <div 
          className="absolute top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"
          style={{ left: arrowLeft }}
        ></div>
      )}
    </div>
  );
};
