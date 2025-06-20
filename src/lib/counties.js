
export function formatCountyName(countyName, stateName) {
  return `${countyName}, ${stateName}`;
}

export function parseCountyName(fullCountyName) {
  const parts = fullCountyName.split(', ');
  if (parts.length !== 2) return null;
  return { county: parts[0], state: parts[1] };
}

export function sortCountiesByName(counties) {
  return [...counties].sort((a, b) => {
    const nameA = formatCountyName(a.countyName, a.stateName);
    const nameB = formatCountyName(b.countyName, b.stateName);
    return nameA.localeCompare(nameB);
  });
}

export function sortCountiesByStats(
  counties, 
  sortBy,
  order
) {
  return [...counties].sort((a, b) => {
    const valueA = a.aggregatedStats[sortBy];
    const valueB = b.aggregatedStats[sortBy];
    
    if (order === 'desc') {
      return valueB - valueA;
    } else {
      return valueA - valueB;
    }
  });
}

export function filterCountiesByState(counties, stateName) {
  return counties.filter(county => county.stateName === stateName);
}

export function filterCountiesByMinRequests(counties, minRequests){
  return counties.filter(county => county.aggregatedStats.totalRequests >= minRequests);
}

export function getTopCountiesByRequests(counties, limit = 10) {
  return sortCountiesByStats(counties, 'totalRequests', 'desc').slice(0, limit);
}

export function getTopCountiesByConversions(counties, limit = 10) {
  return sortCountiesByStats(counties, 'totalConversions', 'desc').slice(0, limit);
}

export function getCountyStatsForZipCodes(
  counties, 
  zipCodes
){
  return counties.filter(county => 
    county.zipCodes.some(zip => zipCodes.includes(zip))
  );
}

export function calculateCountyMetrics(county) {
  const stats = county.aggregatedStats;
  return {
    conversionRate: stats.totalRequests > 0 
      ? (stats.totalConversions / stats.totalRequests) * 100 
      : 0,
    connectionRate: stats.totalRequests > 0 
      ? (stats.totalCallsConnected / stats.totalRequests) * 100 
      : 0,
    averageMetricsPerZip: {
      requestsPerZip: stats.totalRequests / stats.zipCodeCount,
      conversionsPerZip: stats.totalConversions / stats.zipCodeCount,
      connectionsPerZip: stats.totalCallsConnected / stats.zipCodeCount,
    },
  };
}

export function aggregateMultipleCounties(counties) {
  if (counties.length === 0) {
    return {
      totalRequests: 0,
      totalConversions: 0,
      totalCallsConnected: 0,
      totalZipCodes: 0,
      countyCount: 0,
      avgBid: 0,
      minBid: 0,
      maxBid: 0,
      conversionRate: 0,
      connectionRate: 0,
    };
  }

  const aggregated = counties.reduce((acc, county) => {
    const stats = county.aggregatedStats;
    return {
      totalRequests: acc.totalRequests + stats.totalRequests,
      totalConversions: acc.totalConversions + stats.totalConversions,
      totalCallsConnected: acc.totalCallsConnected + stats.totalCallsConnected,
      totalZipCodes: acc.totalZipCodes + stats.zipCodeCount,
      countyCount: acc.countyCount + 1,
      avgBidSum: acc.avgBidSum + stats.avgBid,
      minBid: Math.min(acc.minBid, stats.minBid),
      maxBid: Math.max(acc.maxBid, stats.maxBid),
    };
  }, {
    totalRequests: 0,
    totalConversions: 0,
    totalCallsConnected: 0,
    totalZipCodes: 0,
    countyCount: 0,
    avgBidSum: 0,
    minBid: Infinity,
    maxBid: -Infinity,
  });

  const avgBid = aggregated.avgBidSum / aggregated.countyCount;
  const conversionRate = aggregated.totalRequests > 0 
    ? (aggregated.totalConversions / aggregated.totalRequests) * 100 
    : 0;
  const connectionRate = aggregated.totalRequests > 0 
    ? (aggregated.totalCallsConnected / aggregated.totalRequests) * 100 
    : 0;

  return {
    ...aggregated,
    avgBid,
    conversionRate,
    connectionRate,
    minBid: aggregated.minBid === Infinity ? 0 : aggregated.minBid,
    maxBid: aggregated.maxBid === -Infinity ? 0 : aggregated.maxBid,
  };
}


export function createCountyKey(countyName, stateName) {
  return `${countyName}|${stateName}`;
}


export function parseCountyKey(key)  {
  const parts = key.split('|');
  if (parts.length !== 2) return null;
  return { countyName: parts[0], stateName: parts[1] };
}