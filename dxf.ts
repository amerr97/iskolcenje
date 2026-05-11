import { DxfDrawingData, DxfEntityData, DxfLayerData, DxfPoint } from './types';

type DxfPair = {
  code: number;
  value: string;
};

const DXF_LAYER_COLORS = [
  '#e11d48',
  '#f59e0b',
  '#16a34a',
  '#0284c7',
  '#7c3aed',
  '#db2777',
  '#475569',
  '#0f766e',
];

const parseNumber = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const readPairs = (text: string): DxfPair[] => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const pairs: DxfPair[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
};

const getLayer = (pairs: DxfPair[], fallback = '0') => (
  pairs.find((pair) => pair.code === 8)?.value || fallback
);

const getFirstNumber = (pairs: DxfPair[], code: number): number | null => {
  const pair = pairs.find((item) => item.code === code);
  return parseNumber(pair?.value);
};

const getPolylinePoints = (pairs: DxfPair[]): DxfPoint[] => {
  const points: DxfPoint[] = [];
  let pendingY: number | null = null;

  pairs.forEach((pair) => {
    if (pair.code === 10) {
      pendingY = parseNumber(pair.value);
      return;
    }
    if (pair.code === 20 && pendingY !== null) {
      const x = parseNumber(pair.value);
      if (x !== null) points.push({ y: pendingY, x });
      pendingY = null;
    }
  });

  return points;
};

const parseEntity = (type: string, pairs: DxfPair[]): DxfEntityData | null => {
  const layer = getLayer(pairs);

  if (type === 'LINE') {
    const y1 = getFirstNumber(pairs, 10);
    const x1 = getFirstNumber(pairs, 20);
    const y2 = getFirstNumber(pairs, 11);
    const x2 = getFirstNumber(pairs, 21);
    if (y1 === null || x1 === null || y2 === null || x2 === null) return null;
    return { type: 'LINE', layer, points: [{ y: y1, x: x1 }, { y: y2, x: x2 }] };
  }

  if (type === 'LWPOLYLINE') {
    const points = getPolylinePoints(pairs);
    const flags = getFirstNumber(pairs, 70) ?? 0;
    if (points.length < 2) return null;
    return { type: 'LWPOLYLINE', layer, points, closed: (flags & 1) === 1 };
  }

  if (type === 'CIRCLE' || type === 'ARC') {
    const y = getFirstNumber(pairs, 10);
    const x = getFirstNumber(pairs, 20);
    const radius = getFirstNumber(pairs, 40);
    if (y === null || x === null || radius === null || radius <= 0) return null;
    const entity: DxfEntityData = { type: type as 'CIRCLE' | 'ARC', layer, center: { y, x }, radius };
    if (type === 'ARC') {
      entity.startAngle = getFirstNumber(pairs, 50) ?? 0;
      entity.endAngle = getFirstNumber(pairs, 51) ?? 360;
    }
    return entity;
  }

  if (type === 'POINT') {
    const y = getFirstNumber(pairs, 10);
    const x = getFirstNumber(pairs, 20);
    if (y === null || x === null) return null;
    return { type: 'POINT', layer, points: [{ y, x }] };
  }

  return null;
};

const calculateBounds = (entities: DxfEntityData[]): DxfDrawingData['bounds'] => {
  const ys: number[] = [];
  const xs: number[] = [];
  const addPoint = (point: DxfPoint) => {
    ys.push(point.y);
    xs.push(point.x);
  };

  entities.forEach((entity) => {
    entity.points?.forEach(addPoint);
    if (entity.center && entity.radius) {
      ys.push(entity.center.y - entity.radius, entity.center.y + entity.radius);
      xs.push(entity.center.x - entity.radius, entity.center.x + entity.radius);
    }
  });

  if (ys.length === 0 || xs.length === 0) return null;
  return {
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
  };
};

const buildLayers = (entities: DxfEntityData[]): DxfLayerData[] => {
  const counts = new Map<string, number>();
  entities.forEach((entity) => counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1));

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entityCount], index) => ({
      name,
      entityCount,
      color: DXF_LAYER_COLORS[index % DXF_LAYER_COLORS.length],
    }));
};

export const parseDxfDrawing = (text: string, name: string): DxfDrawingData => {
  const pairs = readPairs(text);
  const entities: DxfEntityData[] = [];
  let inEntities = false;
  let currentType: string | null = null;
  let currentPairs: DxfPair[] = [];
  let polylineLayer = '0';
  let polylineClosed = false;
  let polylinePoints: DxfPoint[] = [];

  const flushEntity = () => {
    if (!currentType) return;
    const entity = parseEntity(currentType, currentPairs);
    if (entity) entities.push(entity);
    currentType = null;
    currentPairs = [];
  };

  const flushPolyline = () => {
    if (polylinePoints.length >= 2) {
      entities.push({
        type: 'POLYLINE',
        layer: polylineLayer,
        points: polylinePoints,
        closed: polylineClosed,
      });
    }
    polylineLayer = '0';
    polylineClosed = false;
    polylinePoints = [];
  };

  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];

    if (pair.code === 0 && pair.value === 'SECTION' && pairs[i + 1]?.code === 2 && pairs[i + 1]?.value === 'ENTITIES') {
      inEntities = true;
      i += 1;
      continue;
    }

    if (!inEntities) continue;

    if (pair.code === 0 && pair.value === 'ENDSEC') {
      flushEntity();
      flushPolyline();
      inEntities = false;
      continue;
    }

    if (pair.code === 0) {
      if (currentType === 'POLYLINE' && pair.value === 'VERTEX') {
        const vertexPairs: DxfPair[] = [];
        i += 1;
        while (i < pairs.length && pairs[i].code !== 0) {
          vertexPairs.push(pairs[i]);
          i += 1;
        }
        i -= 1;
        const y = getFirstNumber(vertexPairs, 10);
        const x = getFirstNumber(vertexPairs, 20);
        if (y !== null && x !== null) polylinePoints.push({ y, x });
        continue;
      }

      if (currentType === 'POLYLINE' && pair.value === 'SEQEND') {
        flushPolyline();
        currentType = null;
        currentPairs = [];
        continue;
      }

      flushEntity();

      if (pair.value === 'POLYLINE') {
        currentType = 'POLYLINE';
        const headerPairs: DxfPair[] = [];
        i += 1;
        while (i < pairs.length && pairs[i].code !== 0) {
          headerPairs.push(pairs[i]);
          i += 1;
        }
        i -= 1;
        polylineLayer = getLayer(headerPairs);
        polylineClosed = ((getFirstNumber(headerPairs, 70) ?? 0) & 1) === 1;
        polylinePoints = [];
        continue;
      }

      if (['LINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'POINT'].includes(pair.value)) {
        currentType = pair.value;
        currentPairs = [];
      }
      continue;
    }

    if (currentType && currentType !== 'POLYLINE') {
      currentPairs.push(pair);
    }
  }

  flushEntity();
  flushPolyline();

  return {
    name,
    layers: buildLayers(entities),
    entities,
    bounds: calculateBounds(entities),
  };
};
