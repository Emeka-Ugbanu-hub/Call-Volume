'use client';

import { Marker } from 'react-map-gl';

import { cn } from '@/lib/utils';



export const CountyLabel = ({
  county,
  isSelected,
  isHovered,
  isLoading = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  return (
    <Marker
      longitude={county.coordinates[0]}
      latitude={county.coordinates[1]}
      anchor="center"
    >
      <div
        className={cn(
          "cursor-pointer transition-all duration-200 flex flex-col items-center justify-center",
          "font-semibold shadow-lg rounded-md border-2",
          "hover:scale-105 transform touch-manipulation",
          // Responsive sizing - larger on mobile for better touch targets
          "text-xs sm:text-[10px] px-2 py-1 sm:px-1.5 sm:py-0.5",
          "min-w-[60px] sm:min-w-[50px] min-h-[40px] sm:min-h-[32px]",
          isSelected
            ? "bg-green-600 text-white border-green-800 scale-110"
            : "bg-white text-gray-800 border-gray-300 hover:bg-green-50 hover:border-green-400",
          isHovered && !isSelected && "bg-green-50 border-green-300 scale-105",
          isLoading && "opacity-70"
        )}
        onClick={() => onClick(county)}
        onMouseEnter={() => onMouseEnter(county)}
        onMouseLeave={onMouseLeave}
        title={`${county.countyName}, ${county.stateName} - ${county.aggregatedStats.totalCallsConnected} calls`}
      >
        <div className="text-xs sm:text-[10px] leading-tight text-center">
          {county.countyName}
        </div>
        <div className="text-[10px] sm:text-[8px] text-opacity-80 leading-tight">
          {county.aggregatedStats.totalCallsConnected} calls
        </div>
        {isLoading && (
          <div className="absolute -top-1 -right-1">
            <div className="w-3 h-3 border border-green-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </Marker>
  );
};

export default CountyLabel;
