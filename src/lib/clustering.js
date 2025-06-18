

export function createClusterData(
  dataPoints,
  zoom = 5
) {
  if (!dataPoints || dataPoints.length === 0) {
    return [];
  }


  if (zoom > 8) {
    return dataPoints.map(point => ({
      ...point,
      clusterId: point.zipCode,
      clusterSize: 1,
      coordinates: point.coordinates || [0, 0]
    }));
  }

  const clusters = [];
  const processed = new Set();

  for (const point of dataPoints) {
    if (processed.has(point.zipCode) || !point.coordinates) {
      continue;
    }

    const cluster = {
      ...point,
      clusterId: point.zipCode,
      clusterSize: 1,
      coordinates: point.coordinates
    };


    const clusterRadius = getClusterRadius(zoom);
    
    for (const otherPoint of dataPoints) {
      if (
        otherPoint.zipCode !== point.zipCode &&
        !processed.has(otherPoint.zipCode) &&
        otherPoint.coordinates
      ) {
        const distance = calculateDistance(
          point.coordinates,
          otherPoint.coordinates
        );

        if (distance < clusterRadius) {

          cluster.totalRequests += otherPoint.totalRequests;
          cluster.totalConversions += otherPoint.totalConversions;
          cluster.totalCallsConnected += otherPoint.totalCallsConnected;
          cluster.avgBid = (cluster.avgBid + otherPoint.avgBid) / 2;
          cluster.minBid = Math.min(cluster.minBid, otherPoint.minBid);
          cluster.maxBid = Math.max(cluster.maxBid, otherPoint.maxBid);
          cluster.clusterSize++;
          
   
          cluster.coordinates = [
            (cluster.coordinates[0] + otherPoint.coordinates[0]) / 2,
            (cluster.coordinates[1] + otherPoint.coordinates[1]) / 2
          ];

          processed.add(otherPoint.zipCode);
        }
      }
    }

    clusters.push(cluster);
    processed.add(point.zipCode);
  }

  return clusters;
}

function getClusterRadius(zoom) {

  return Math.max(0.1, 2 / Math.pow(2, zoom));
}


function calculateDistance(
  coord1,
  coord2
) {
  const dx = coord1[0] - coord2[0];
  const dy = coord1[1] - coord2[1];
  return Math.sqrt(dx * dx + dy * dy);
}


export function getBidColor(avgBid) {
  if (avgBid < 50) return '#10B981'; 
  if (avgBid < 75) return '#F59E0B'; 
  return '#EF4444'; 
}


export function getMarkerSize(totalRequests) {
  return Math.max(8, Math.min(40, Math.log(totalRequests + 1) * 5));
}