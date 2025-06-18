import { feature } from 'topojson-client';
import dmaTopology from '../dma.json'


function calculateGeometry(feature) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const processCoordinates = (coords) => {
    if (typeof coords[0] === 'number') {

      const [lng, lat] = coords;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    } else {

      coords.forEach(processCoordinates);
    }
  };

  if (feature.geometry) {
    const geom = feature.geometry ;
    if (geom.coordinates) {
      processCoordinates(geom.coordinates);
    }
  }

  const bounds = {
    southwest: [minLng, minLat] ,
    northeast: [maxLng, maxLat] 
  };

  const center = [
    (minLng + maxLng) / 2,
    (minLat + maxLat) / 2
  ];

  return { bounds, center };
}


export function getProcessedDMAData() {
  try {
    const topology = dmaTopology ;

    if (!topology.objects?.nielsen_dma) {
      console.warn('Invalid DMA topology: missing nielsen_dma object');
      return [];
    }


    const geojsonResult = feature(topology, topology.objects.nielsen_dma );


    let featureCollection;
    if (geojsonResult.type === 'FeatureCollection') {
      featureCollection = geojsonResult;
    } else {

      featureCollection = {
        type: 'FeatureCollection',
        features: [geojsonResult]
      };
    }

    const dmaData = featureCollection.features.map((feat, index) => {
      const properties = feat.properties || {};
      const dmaName = properties.dma1 || properties.name || `DMA ${index + 1}`;
      const dmaId = properties.id || `dma-${index}`;

      const { bounds, center } = calculateGeometry(feat);

      return {
        id: dmaId,
        name: dmaName,
        feature: feat,
        bounds,
        center
      };
    });

    return dmaData;
  } catch (error) {
    console.error('Error processing DMA data:', error);
    return [];
  }
}


export function getDMAGeoJSON() {
  const dmaData = getProcessedDMAData();

  return {
    type: 'FeatureCollection',
    features: dmaData.map(dma => ({
      ...dma.feature,
      properties: {
        ...dma.feature.properties,
        dmaId: dma.id,
        dmaName: dma.name,
        center: dma.center
      }
    }))
  };
}


export function findDMAByName(name) {
  const dmaData = getProcessedDMAData();
  return dmaData.find(dma =>
    dma.name.toLowerCase().includes(name.toLowerCase())
  ) || null;
}


export function getDMABounds(dmaId) {
  const dmaData = getProcessedDMAData();
  const dma = dmaData.find(d => d.id === dmaId);
  return dma ? dma.bounds : null;
}

export function getDMACenter(dmaId) {
  const dmaData = getProcessedDMAData();
  const dma = dmaData.find(d => d.id === dmaId);
  return dma ? dma.center : null;
}


function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}


export function pointInFeature(point, feature) {
  if (!feature.geometry) return false;

  const geometry = feature.geometry;

  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates ;

    return pointInPolygon(point, coords[0]);
  } else if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates ;

    for (const polygon of coords) {
      if (pointInPolygon(point, polygon[0])) {
        return true;
      }
    }
    return false;
  }

  return false;
}


export function getCountiesInDMA(dmaId, allCounties) {
  const dmaData = getProcessedDMAData();
  const targetDMA = dmaData.find(dma => dma.id === dmaId);

  if (!targetDMA) {
    console.warn(`DMA with ID ${dmaId} not found`);
    return [];
  }

  const countiesInDMA = [];


  const { bounds } = targetDMA;
  const candidateCounties = allCounties.filter(county => {
    const [lng, lat] = county.coordinates;
    return lng >= bounds.southwest[0] && lng <= bounds.northeast[0] &&
      lat >= bounds.southwest[1] && lat <= bounds.northeast[1];
  });

  for (const county of candidateCounties) {
    if (pointInFeature(county.coordinates, targetDMA.feature)) {
      countiesInDMA.push(county);
    }
  }

  return countiesInDMA;
}


export function isCountyInDMA(dmaId, county) {
  const dmaData = getProcessedDMAData();
  const targetDMA = dmaData.find(dma => dma.id === dmaId);

  if (!targetDMA) return false;


  const { bounds } = targetDMA;
  const [lng, lat] = county.coordinates;
  if (lng < bounds.southwest[0] || lng > bounds.northeast[0] ||
    lat < bounds.southwest[1] || lat > bounds.northeast[1]) {
    return false;
  }


  return pointInFeature(county.coordinates, targetDMA.feature);
}
