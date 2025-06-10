import type { MapDataPoint, ClusterPoint } from '@/components/LeadsMap/types';

/**
 * Simple clustering algorithm that groups nearby ZIP codes
 * This is a basic implementation for demo purposes
 */
export function createClusterData(
  dataPoints: MapDataPoint[],
  zoom: number = 5
): ClusterPoint[] {
  if (!dataPoints || dataPoints.length === 0) {
    return [];
  }

  // At high zoom levels, don't cluster
  if (zoom > 8) {
    return dataPoints.map(point => ({
      ...point,
      clusterId: point.zipCode,
      clusterSize: 1,
      coordinates: point.coordinates || [0, 0]
    }));
  }

  const clusters: ClusterPoint[] = [];
  const processed = new Set<string>();

  for (const point of dataPoints) {
    if (processed.has(point.zipCode) || !point.coordinates) {
      continue;
    }

    const cluster: ClusterPoint = {
      ...point,
      clusterId: point.zipCode,
      clusterSize: 1,
      coordinates: point.coordinates
    };

    // Find nearby points to cluster
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
          // Merge the points
          cluster.totalRequests += otherPoint.totalRequests;
          cluster.totalConversions += otherPoint.totalConversions;
          cluster.totalCallsConnected += otherPoint.totalCallsConnected;
          cluster.avgBid = (cluster.avgBid + otherPoint.avgBid) / 2;
          cluster.minBid = Math.min(cluster.minBid, otherPoint.minBid);
          cluster.maxBid = Math.max(cluster.maxBid, otherPoint.maxBid);
          cluster.clusterSize++;
          
          // Update cluster center (simple average)
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

/**
 * Calculate the clustering radius based on zoom level
 */
function getClusterRadius(zoom: number): number {
  // Smaller radius at higher zoom levels
  return Math.max(0.1, 2 / Math.pow(2, zoom));
}

/**
 * Calculate distance between two coordinate points
 * Simple Euclidean distance for demo purposes
 */
function calculateDistance(
  coord1: [number, number],
  coord2: [number, number]
): number {
  const dx = coord1[0] - coord2[0];
  const dy = coord1[1] - coord2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get color based on bid amount for visualization
 */
export function getBidColor(avgBid: number): string {
  if (avgBid < 50) return '#10B981'; // green for low bids
  if (avgBid < 75) return '#F59E0B'; // amber for medium bids
  return '#EF4444'; // red for high bids
}

/**
 * Get marker size based on total requests
 */
export function getMarkerSize(totalRequests: number): number {
  return Math.max(8, Math.min(40, Math.log(totalRequests + 1) * 5));
}