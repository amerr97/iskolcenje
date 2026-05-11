
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DxfEntityData, DxfDrawingData, MbtilesSourceData, OrthoPhotoData, PointData, StationData, TileSourceData } from '../types';
import { ChevronDown, Layers, Maximize, Ruler, ZoomIn, ZoomOut } from 'lucide-react';
import { fromBlob, GeoTIFF } from 'geotiff';
import proj4 from 'proj4';
import { Capacitor } from '@capacitor/core';

proj4.defs('EPSG:3908', '+proj=tmerc +lat_0=0 +lon_0=18 +k=0.9999 +x_0=6500000 +y_0=0 +ellps=bessel +towgs84=682,-203,480,0,0,0,0 +units=m +no_defs +type=crs');

interface SketchTabProps {
  points: PointData[];
  basePoints: PointData[];
  station: StationData;
  orthoPhoto: OrthoPhotoData | null;
  orthoPhotoFile: File | null;
  orthoWorldFile: File | null;
  tileSource: TileSourceData | null;
  tileFiles: Map<string, string>;
  mbtilesSource: MbtilesSourceData | null;
  getMbtilesTile: ((z: number, x: number, y: number) => Promise<Blob | null>) | null;
  showOrthoPhoto: boolean;
  setShowOrthoPhoto: (show: boolean) => void;
  dxfDrawing: DxfDrawingData | null;
}

type OrthoTile = {
  key: string;
  image: HTMLImageElement;
  sourceTileSize: number;
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  lastUsed: number;
};

const lonLatToTile = (lon: number, lat: number, zoom: number) => {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
};

const tileToLonLat = (x: number, y: number, zoom: number) => {
  const n = 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return {
    lon,
    lat: (latRad * 180) / Math.PI,
  };
};

const epsg3908ToLonLat = (y: number, x: number): [number, number] => {
  return proj4('EPSG:3908', 'WGS84', [y, x]) as [number, number];
};

const lonLatToEpsg3908 = (lon: number, lat: number): [number, number] => {
  return proj4('WGS84', 'EPSG:3908', [lon, lat]) as [number, number];
};

const SketchTab: React.FC<SketchTabProps> = ({
  points,
  basePoints,
  station,
  orthoPhoto,
  orthoPhotoFile,
  orthoWorldFile,
  tileSource,
  tileFiles,
  mbtilesSource,
  getMbtilesTile,
  showOrthoPhoto,
  setShowOrthoPhoto,
  dxfDrawing,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orthoImageRef = useRef<HTMLImageElement | null>(null);
  const tileCacheRef = useRef<Map<string, OrthoTile>>(new Map());
  const pendingTilesRef = useRef<Set<string>>(new Set());
  const activeTileLoadsRef = useRef(0);
  const tiffRef = useRef<GeoTIFF | null>(null);
  const fullImageRef = useRef<any>(null);
  const tileTimerRef = useRef<number | null>(null);
  const xyzImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const mbtilesImageCacheRef = useRef<Map<string, HTMLImageElement | null>>(new Map());
  const mbtilesPendingRef = useRef<Set<string>>(new Set());
  const googleImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const ortofoto26ImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [tileVersion, setTileVersion] = useState(0);
  const [showGoogleSatellite, setShowGoogleSatellite] = useState(false);
  const [showOrtofoto26, setShowOrtofoto26] = useState(false);
  const [pointColor, setPointColor] = useState('#000000');
  const [pointSize, setPointSize] = useState(2);
  const [pointSizeInput, setPointSizeInput] = useState('2');
  const [showBaseLayer, setShowBaseLayer] = useState(false);
  const [basePointColor, setBasePointColor] = useState('#16A34A');
  const [isMeasureMode, setIsMeasureMode] = useState(false);
  const [measurePointA, setMeasurePointA] = useState<PointData | null>(null);
  const [measurePointB, setMeasurePointB] = useState<PointData | null>(null);
  const [showDxfOverlay, setShowDxfOverlay] = useState(true);
  const [isDxfLayersOpen, setIsDxfLayersOpen] = useState(false);
  const [dxfLayerVisibility, setDxfLayerVisibility] = useState<Record<string, boolean>>({});
  const viewRef = useRef<{
    width: number;
    height: number;
    baseScale: number;
    centerX: number;
    centerY: number;
    offsetX: number;
    offsetY: number;
    zoom: number;
  } | null>(null);
  
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pinchStartDistance = useRef<number | null>(null);
  const previousVisibleDataCount = useRef(0);

  const ya = parseFloat(station.ya);
  const xa = parseFloat(station.xa);
  const yb = parseFloat(station.yb);
  const xb = parseFloat(station.xb);

  const getBounds = useCallback(() => {
    const allY = [
      ...points.map(p => p.y),
      ...(showBaseLayer ? basePoints.map(p => p.y) : []),
      ya,
      yb,
      ...(orthoPhoto ? [orthoPhoto.minY, orthoPhoto.maxY] : []),
      ...(showDxfOverlay && dxfDrawing?.bounds ? [dxfDrawing.bounds.minY, dxfDrawing.bounds.maxY] : []),
    ].filter(v => !isNaN(v)); // Easting
    const allX = [
      ...points.map(p => p.x),
      ...(showBaseLayer ? basePoints.map(p => p.x) : []),
      xa,
      xb,
      ...(orthoPhoto ? [orthoPhoto.minX, orthoPhoto.maxX] : []),
      ...(showDxfOverlay && dxfDrawing?.bounds ? [dxfDrawing.bounds.minX, dxfDrawing.bounds.maxX] : []),
    ].filter(v => !isNaN(v)); // Northing

    if (allY.length === 0) return null;

    return {
      minY: Math.min(...allY),
      maxY: Math.max(...allY),
      minX: Math.min(...allX),
      maxX: Math.max(...allX),
    };
  }, [points, basePoints, showBaseLayer, ya, xa, yb, xb, orthoPhoto, showDxfOverlay, dxfDrawing]);

  useEffect(() => {
    if (basePoints.length > 0) {
      setShowBaseLayer(true);
    }
  }, [basePoints.length]);

  useEffect(() => {
    const visibleDataCount =
      points.length +
      (showBaseLayer ? basePoints.length : 0) +
      (!isNaN(ya) && !isNaN(xa) ? 1 : 0) +
      (!isNaN(yb) && !isNaN(xb) ? 1 : 0) +
      (orthoPhoto ? 1 : 0) +
      (showDxfOverlay && dxfDrawing?.bounds ? 1 : 0);

    if (previousVisibleDataCount.current === 0 && visibleDataCount > 0) {
      setOffset({ x: 0, y: 0 });
      setZoom(1);
    }
    previousVisibleDataCount.current = visibleDataCount;
  }, [points.length, basePoints.length, showBaseLayer, ya, xa, yb, xb, orthoPhoto, showDxfOverlay, dxfDrawing]);

  useEffect(() => {
    if (!dxfDrawing) {
      setDxfLayerVisibility({});
      setIsDxfLayersOpen(false);
      return;
    }
    setShowDxfOverlay(true);
    setDxfLayerVisibility((prev) => {
      const next: Record<string, boolean> = {};
      dxfDrawing.layers.forEach((layer) => {
        next[layer.name] = prev[layer.name] ?? true;
      });
      return next;
    });
  }, [dxfDrawing]);

  useEffect(() => {
    xyzImageCacheRef.current.clear();
    mbtilesImageCacheRef.current.clear();
    mbtilesPendingRef.current.clear();
    googleImageCacheRef.current.clear();
    setTileVersion(version => version + 1);
  }, [tileSource, tileFiles, mbtilesSource, getMbtilesTile]);

  useEffect(() => {
    orthoImageRef.current = null;
    tileCacheRef.current.clear();
    pendingTilesRef.current.clear();
    activeTileLoadsRef.current = 0;
    tiffRef.current = null;
    fullImageRef.current = null;
    if (!orthoPhoto) return;
    const image = new Image();
    image.onload = () => {
      orthoImageRef.current = image;
      draw();
    };
    image.src = orthoPhoto.dataUrl;
  }, [orthoPhoto]);

  const requestOrthoTiles = useCallback((visible: {
    minY: number;
    maxY: number;
    minX: number;
    maxX: number;
    finalScale: number;
  }) => {
    if (!orthoPhoto || !orthoPhotoFile || !/\.(tif|tiff)$/i.test(orthoPhotoFile.name)) return;
    if (tileTimerRef.current) window.clearTimeout(tileTimerRef.current);

    tileTimerRef.current = window.setTimeout(async () => {
      try {
        const tiff = tiffRef.current ?? await fromBlob(orthoPhotoFile);
        tiffRef.current = tiff;
        const fullImage = fullImageRef.current ?? await tiff.getImage(0);
        fullImageRef.current = fullImage;
        const fullWidth = fullImage.getWidth();
        const fullHeight = fullImage.getHeight();

        const overlapMinY = Math.max(visible.minY, orthoPhoto.minY);
        const overlapMaxY = Math.min(visible.maxY, orthoPhoto.maxY);
        const overlapMinX = Math.max(visible.minX, orthoPhoto.minX);
        const overlapMaxX = Math.min(visible.maxX, orthoPhoto.maxX);
        if (overlapMinY >= overlapMaxY || overlapMinX >= overlapMaxX) return;

        const x0 = Math.max(0, Math.floor(((overlapMinY - orthoPhoto.minY) / (orthoPhoto.maxY - orthoPhoto.minY)) * fullWidth));
        const x1 = Math.min(fullWidth, Math.ceil(((overlapMaxY - orthoPhoto.minY) / (orthoPhoto.maxY - orthoPhoto.minY)) * fullWidth));
        const y0 = Math.max(0, Math.floor(((orthoPhoto.maxX - overlapMaxX) / (orthoPhoto.maxX - orthoPhoto.minX)) * fullHeight));
        const y1 = Math.min(fullHeight, Math.ceil(((orthoPhoto.maxX - overlapMinX) / (orthoPhoto.maxX - orthoPhoto.minX)) * fullHeight));
        if (x1 <= x0 || y1 <= y0) return;

        const rasterPerWorld = fullWidth / Math.max(orthoPhoto.maxY - orthoPhoto.minY, 1);
        const rasterPerScreen = rasterPerWorld / Math.max(visible.finalScale, 0.000001);
        const sourceTileSize = Math.max(
          512,
          Math.min(4096, 512 * Math.pow(2, Math.floor(Math.log2(Math.max(1, rasterPerScreen)))))
        );
        const outputTileSize = 512;
        const minTileX = Math.floor(x0 / sourceTileSize);
        const maxTileX = Math.floor((x1 - 1) / sourceTileSize);
        const minTileY = Math.floor(y0 / sourceTileSize);
        const maxTileY = Math.floor((y1 - 1) / sourceTileSize);
        const centerTileX = (minTileX + maxTileX) / 2;
        const centerTileY = (minTileY + maxTileY) / 2;

        const candidates: Array<{ tx: number; ty: number; distance: number }> = [];
        for (let ty = minTileY; ty <= maxTileY; ty += 1) {
          for (let tx = minTileX; tx <= maxTileX; tx += 1) {
            candidates.push({
              tx,
              ty,
              distance: Math.hypot(tx - centerTileX, ty - centerTileY),
            });
          }
        }
        candidates.sort((a, b) => a.distance - b.distance);

        const loadTile = async (tx: number, ty: number) => {
          const sx0 = tx * sourceTileSize;
          const sy0 = ty * sourceTileSize;
          const sx1 = Math.min(fullWidth, sx0 + sourceTileSize);
          const sy1 = Math.min(fullHeight, sy0 + sourceTileSize);
          if (sx1 <= sx0 || sy1 <= sy0) return;
          const key = `${orthoPhoto.id}:${sourceTileSize}:${tx}:${ty}`;
          if (tileCacheRef.current.has(key) || pendingTilesRef.current.has(key)) return;
          pendingTilesRef.current.add(key);
          activeTileLoadsRef.current += 1;
          try {
            const outWidth = Math.max(1, Math.round(((sx1 - sx0) / sourceTileSize) * outputTileSize));
            const outHeight = Math.max(1, Math.round(((sy1 - sy0) / sourceTileSize) * outputTileSize));
            const rgb = await fullImage.readRGB({
              window: [sx0, sy0, sx1, sy1],
              width: outWidth,
              height: outHeight,
              interleave: true,
              resampleMethod: 'nearest',
            });
            const canvas = document.createElement('canvas');
            canvas.width = outWidth;
            canvas.height = outHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const imageData = ctx.createImageData(outWidth, outHeight);
            for (let i = 0, j = 0; i < outWidth * outHeight; i += 1, j += 3) {
              imageData.data[i * 4] = rgb[j] ?? 0;
              imageData.data[i * 4 + 1] = rgb[j + 1] ?? rgb[j] ?? 0;
              imageData.data[i * 4 + 2] = rgb[j + 2] ?? rgb[j] ?? 0;
              imageData.data[i * 4 + 3] = 255;
            }
            ctx.putImageData(imageData, 0, 0);

            const tileImage = new Image();
            tileImage.onload = () => {
              const minY = orthoPhoto.minY + (sx0 / fullWidth) * (orthoPhoto.maxY - orthoPhoto.minY);
              const maxY = orthoPhoto.minY + (sx1 / fullWidth) * (orthoPhoto.maxY - orthoPhoto.minY);
              const maxX = orthoPhoto.maxX - (sy0 / fullHeight) * (orthoPhoto.maxX - orthoPhoto.minX);
              const minX = orthoPhoto.maxX - (sy1 / fullHeight) * (orthoPhoto.maxX - orthoPhoto.minX);
              tileCacheRef.current.set(key, {
                key,
                image: tileImage,
                sourceTileSize,
                minY,
                maxY,
                minX,
                maxX,
                lastUsed: Date.now(),
              });
              if (tileCacheRef.current.size > 160) {
                const sorted = [...tileCacheRef.current.values()].sort((a, b) => a.lastUsed - b.lastUsed);
                sorted.slice(0, tileCacheRef.current.size - 160).forEach(tile => tileCacheRef.current.delete(tile.key));
              }
              setTileVersion(version => version + 1);
            };
            tileImage.src = canvas.toDataURL('image/jpeg', 0.9);
          } finally {
            pendingTilesRef.current.delete(key);
            activeTileLoadsRef.current = Math.max(0, activeTileLoadsRef.current - 1);
          }
        };

        const maxQueue = 24;
        for (const candidate of candidates.slice(0, maxQueue)) {
          if (activeTileLoadsRef.current >= 2) break;
          void loadTile(candidate.tx, candidate.ty);
        }
      } catch (error) {
        console.warn('Ortofoto tileovi nisu ucitani:', error);
      }
    }, 120);
  }, [orthoPhoto, orthoPhotoFile]);

  const fitView = useCallback(() => {
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const commitPointSize = useCallback(() => {
    const parsed = Number.parseInt(pointSizeInput, 10);
    const safeValue = Number.isNaN(parsed) ? pointSize : Math.min(12, Math.max(1, parsed));
    setPointSize(safeValue);
    setPointSizeInput(String(safeValue));
  }, [pointSizeInput, pointSize]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    
    // Reset transform and scale for DPR
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);
    
    const bounds = getBounds();
    if (!bounds) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Učitajte podatke za prikaz skice.', width / 2, height / 2);
      return;
    }

    const { minY, maxY, minX, maxX } = bounds;
    const rangeY = maxY - minY || 1;
    const rangeX = maxX - minX || 1;

    // Base scaling to fit initial view
    const paddingFactor = 0.8;
    const baseScale = Math.min(
      (width * paddingFactor) / rangeY,
      (height * paddingFactor) / rangeX
    );

    const centerX = (minY + maxY) / 2;
    const centerY = (minX + maxX) / 2;
    viewRef.current = {
      width,
      height,
      baseScale,
      centerX,
      centerY,
      offsetX: offset.x,
      offsetY: offset.y,
      zoom,
    };

    // Coordinate transformation function
    const toScreen = (y: number, x: number) => {
      const finalScale = baseScale * zoom;
      const screenX = width / 2 + offset.x + (y - centerX) * finalScale;
      const screenY = height / 2 + offset.y - (x - centerY) * finalScale; // Invert X/Northing for screen
      return { x: screenX, y: screenY };
    };
    const screenToWorld = (screenX: number, screenY: number) => {
      const finalScale = baseScale * zoom;
      return {
        y: centerX + (screenX - width / 2 - offset.x) / finalScale,
        x: centerY - (screenY - height / 2 - offset.y) / finalScale,
      };
    };

    // Use a more vibrant Red
    const RED_COLOR = '#ff0000';
    const dxfLayerColors = new Map(dxfDrawing?.layers.map(layer => [layer.name, layer.color]) ?? []);
    const drawDxfPath = (entity: DxfEntityData) => {
      const layerVisible = dxfLayerVisibility[entity.layer] ?? true;
      if (!showDxfOverlay || !layerVisible) return;

      const color = dxfLayerColors.get(entity.layer) ?? '#0284c7';
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.95;

      if ((entity.type === 'LINE' || entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.points && entity.points.length > 0) {
        const first = toScreen(entity.points[0].y, entity.points[0].x);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        entity.points.slice(1).forEach((point) => {
          const pos = toScreen(point.y, point.x);
          ctx.lineTo(pos.x, pos.y);
        });
        if (entity.closed) ctx.closePath();
        ctx.stroke();
      }

      if (entity.type === 'POINT' && entity.points?.[0]) {
        const pos = toScreen(entity.points[0].y, entity.points[0].x);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      if ((entity.type === 'CIRCLE' || entity.type === 'ARC') && entity.center && entity.radius) {
        const center = toScreen(entity.center.y, entity.center.x);
        const radiusPoint = toScreen(entity.center.y + entity.radius, entity.center.x);
        const radiusPx = Math.max(1, Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y));

        if (entity.type === 'CIRCLE') {
          ctx.beginPath();
          ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const start = entity.startAngle ?? 0;
          const end = entity.endAngle ?? 360;
          const normalizedEnd = end < start ? end + 360 : end;
          const segments = Math.max(12, Math.ceil((normalizedEnd - start) / 10));
          ctx.beginPath();
          for (let i = 0; i <= segments; i += 1) {
            const angleDeg = start + ((normalizedEnd - start) * i) / segments;
            const angle = (angleDeg * Math.PI) / 180;
            const point = toScreen(
              entity.center.y + Math.cos(angle) * entity.radius,
              entity.center.x + Math.sin(angle) * entity.radius
            );
            if (i === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    };
    const drawMeasureSnapMarker = (p: PointData, label: 'A' | 'B') => {
      const pos = toScreen(p.y, p.x);
      const radius = Math.max(pointSize + 5, 8);

      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0284c7';
      ctx.fillStyle = 'rgba(14,165,233,0.18)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos.x - radius - 4, pos.y);
      ctx.lineTo(pos.x - radius + 2, pos.y);
      ctx.moveTo(pos.x + radius - 2, pos.y);
      ctx.lineTo(pos.x + radius + 4, pos.y);
      ctx.moveTo(pos.x, pos.y - radius - 4);
      ctx.lineTo(pos.x, pos.y - radius + 2);
      ctx.moveTo(pos.x, pos.y + radius - 2);
      ctx.lineTo(pos.x, pos.y + radius + 4);
      ctx.stroke();

      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0369a1';
      ctx.fillText(label, pos.x, pos.y);
      ctx.restore();
    };

    if (orthoPhoto && showOrthoPhoto && orthoImageRef.current) {
      const topLeft = toScreen(orthoPhoto.minY, orthoPhoto.maxX);
      const bottomRight = toScreen(orthoPhoto.maxY, orthoPhoto.minX);
      ctx.drawImage(
        orthoImageRef.current,
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y
      );

      const tiles = [...tileCacheRef.current.values()]
        .filter(tile => tile.maxY >= bounds.minY && tile.minY <= bounds.maxY && tile.maxX >= bounds.minX && tile.minX <= bounds.maxX)
        .sort((a, b) => b.sourceTileSize - a.sourceTileSize);
      tiles.forEach((tile) => {
        tile.lastUsed = Date.now();
        const detailTopLeft = toScreen(tile.minY, tile.maxX);
        const detailBottomRight = toScreen(tile.maxY, tile.minX);
        ctx.drawImage(
          tile.image,
          detailTopLeft.x,
          detailTopLeft.y,
          detailBottomRight.x - detailTopLeft.x,
          detailBottomRight.y - detailTopLeft.y
        );
      });

      const topLeftWorld = screenToWorld(0, 0);
      const bottomRightWorld = screenToWorld(width, height);
      requestOrthoTiles({
        minY: Math.min(topLeftWorld.y, bottomRightWorld.y),
        maxY: Math.max(topLeftWorld.y, bottomRightWorld.y),
        minX: Math.min(topLeftWorld.x, bottomRightWorld.x),
        maxX: Math.max(topLeftWorld.x, bottomRightWorld.x),
        finalScale: baseScale * zoom,
      });
    }

    if (tileSource && showOrthoPhoto) {
      const topLeftWorld = screenToWorld(0, 0);
      const bottomRightWorld = screenToWorld(width, height);
      const visibleMinY = Math.min(topLeftWorld.y, bottomRightWorld.y);
      const visibleMaxY = Math.max(topLeftWorld.y, bottomRightWorld.y);
      const visibleMinX = Math.min(topLeftWorld.x, bottomRightWorld.x);
      const visibleMaxX = Math.max(topLeftWorld.x, bottomRightWorld.x);
      const centerWorld = screenToWorld(width / 2, height / 2);
      const [centerLon, centerLat] = epsg3908ToLonLat(centerWorld.y, centerWorld.x);
      const metersPerPixelTile = rangeY / (width * zoom);
      const tileZoomRaw = Math.log2(156543.03392 / Math.max(metersPerPixelTile, 0.001));
      const zoomLevel = Math.max(tileSource.minZoom, Math.min(tileSource.maxZoom, Math.round(tileZoomRaw)));
      const corners = [
        epsg3908ToLonLat(visibleMinY, visibleMinX),
        epsg3908ToLonLat(visibleMinY, visibleMaxX),
        epsg3908ToLonLat(visibleMaxY, visibleMinX),
        epsg3908ToLonLat(visibleMaxY, visibleMaxX),
        [centerLon, centerLat] as [number, number],
      ];
      const tileCoords = corners.map(([lon, lat]) => lonLatToTile(lon, lat, zoomLevel));
      const minTileX = Math.min(...tileCoords.map(tile => tile.x)) - 1;
      const maxTileX = Math.max(...tileCoords.map(tile => tile.x)) + 1;
      const minTileY = Math.min(...tileCoords.map(tile => tile.y)) - 1;
      const maxTileY = Math.max(...tileCoords.map(tile => tile.y)) + 1;

      for (let tx = minTileX; tx <= maxTileX; tx += 1) {
        for (let ty = minTileY; ty <= maxTileY; ty += 1) {
          const fileY = tileSource.tms ? (2 ** zoomLevel - 1 - ty) : ty;
          const key = `${zoomLevel}/${tx}/${fileY}.png`;
          const nativeUrl = tileSource.path ? `${Capacitor.convertFileSrc(tileSource.path)}/${key}` : undefined;
          const url = tileFiles.get(key) ?? nativeUrl;
          if (!url) continue;

          let image = xyzImageCacheRef.current.get(key);
          if (!image) {
            image = new Image();
            image.onload = () => setTileVersion(version => version + 1);
            image.onerror = () => xyzImageCacheRef.current.delete(key);
            image.src = url;
            xyzImageCacheRef.current.set(key, image);
          }
          if (!image.complete || image.naturalWidth === 0) continue;

          const nw = tileToLonLat(tx, ty, zoomLevel);
          const se = tileToLonLat(tx + 1, ty + 1, zoomLevel);
          const [minTileYWorld, maxTileXWorld] = lonLatToEpsg3908(nw.lon, nw.lat);
          const [maxTileYWorld, minTileXWorld] = lonLatToEpsg3908(se.lon, se.lat);
          const topLeft = toScreen(minTileYWorld, maxTileXWorld);
          const bottomRight = toScreen(maxTileYWorld, minTileXWorld);
          ctx.drawImage(
            image,
            topLeft.x,
            topLeft.y,
            bottomRight.x - topLeft.x,
            bottomRight.y - topLeft.y
          );
        }
      }

      if (xyzImageCacheRef.current.size > 300) {
        xyzImageCacheRef.current.clear();
      }
    }

    if (mbtilesSource && getMbtilesTile && showOrthoPhoto) {
      const topLeftWorld = screenToWorld(0, 0);
      const bottomRightWorld = screenToWorld(width, height);
      const visibleMinY = Math.min(topLeftWorld.y, bottomRightWorld.y);
      const visibleMaxY = Math.max(topLeftWorld.y, bottomRightWorld.y);
      const visibleMinX = Math.min(topLeftWorld.x, bottomRightWorld.x);
      const visibleMaxX = Math.max(topLeftWorld.x, bottomRightWorld.x);
      const centerWorld = screenToWorld(width / 2, height / 2);
      const [centerLon, centerLat] = epsg3908ToLonLat(centerWorld.y, centerWorld.x);
      const metersPerPixelMbtiles = rangeY / (width * zoom);
      const mbtilesZoomRaw = Math.log2(156543.03392 / Math.max(metersPerPixelMbtiles, 0.001));
      const zoomLevel = Math.max(mbtilesSource.minZoom, Math.min(mbtilesSource.maxZoom, Math.round(mbtilesZoomRaw)));
      const corners = [
        epsg3908ToLonLat(visibleMinY, visibleMinX),
        epsg3908ToLonLat(visibleMinY, visibleMaxX),
        epsg3908ToLonLat(visibleMaxY, visibleMinX),
        epsg3908ToLonLat(visibleMaxY, visibleMaxX),
        [centerLon, centerLat] as [number, number],
      ];
      const tileCoords = corners.map(([lon, lat]) => lonLatToTile(lon, lat, zoomLevel));
      const minTileX = Math.min(...tileCoords.map(tile => tile.x)) - 1;
      const maxTileX = Math.max(...tileCoords.map(tile => tile.x)) + 1;
      const minTileY = Math.min(...tileCoords.map(tile => tile.y)) - 1;
      const maxTileY = Math.max(...tileCoords.map(tile => tile.y)) + 1;

      for (let tx = minTileX; tx <= maxTileX; tx += 1) {
        for (let ty = minTileY; ty <= maxTileY; ty += 1) {
          const dbY = mbtilesSource.scheme === 'xyz' ? ty : (2 ** zoomLevel - 1 - ty);
          const key = `${zoomLevel}/${tx}/${dbY}`;
          let image = mbtilesImageCacheRef.current.get(key);
          if (image === undefined) {
            image = null;
            if (!mbtilesPendingRef.current.has(key)) {
              mbtilesPendingRef.current.add(key);
              void getMbtilesTile(zoomLevel, tx, dbY)
                .then((blob) => {
                  if (!blob) {
                    mbtilesImageCacheRef.current.set(key, null);
                    return;
                  }
                  const url = URL.createObjectURL(blob);
                  const nextImage = new Image();
                  nextImage.onload = () => {
                    URL.revokeObjectURL(url);
                    setTileVersion(version => version + 1);
                  };
                  nextImage.onerror = () => {
                    URL.revokeObjectURL(url);
                    mbtilesImageCacheRef.current.set(key, null);
                  };
                  nextImage.src = url;
                  mbtilesImageCacheRef.current.set(key, nextImage);
                })
                .catch((error) => {
                  console.warn('MBTiles tile nije ucitan:', error);
                  mbtilesImageCacheRef.current.set(key, null);
                })
                .finally(() => {
                  mbtilesPendingRef.current.delete(key);
                });
            }
          }
          if (!image || !image.complete || image.naturalWidth === 0) continue;

          const nw = tileToLonLat(tx, ty, zoomLevel);
          const se = tileToLonLat(tx + 1, ty + 1, zoomLevel);
          const [minTileYWorld, maxTileXWorld] = lonLatToEpsg3908(nw.lon, nw.lat);
          const [maxTileYWorld, minTileXWorld] = lonLatToEpsg3908(se.lon, se.lat);
          const topLeft = toScreen(minTileYWorld, maxTileXWorld);
          const bottomRight = toScreen(maxTileYWorld, minTileXWorld);
          ctx.drawImage(
            image,
            topLeft.x,
            topLeft.y,
            bottomRight.x - topLeft.x,
            bottomRight.y - topLeft.y
          );
        }
      }

      if (mbtilesImageCacheRef.current.size > 500) {
        mbtilesImageCacheRef.current.clear();
      }
    }

    // Google Satellite XYZ tiles
    if (showGoogleSatellite) {
      const GOOGLE_SAT_URL = 'https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}';
      const GOOGLE_MIN_ZOOM = 1;
      const GOOGLE_MAX_ZOOM = 20;
      const topLeftWorld = screenToWorld(0, 0);
      const bottomRightWorld = screenToWorld(width, height);
      const visibleMinY = Math.min(topLeftWorld.y, bottomRightWorld.y);
      const visibleMaxY = Math.max(topLeftWorld.y, bottomRightWorld.y);
      const visibleMinX = Math.min(topLeftWorld.x, bottomRightWorld.x);
      const visibleMaxX = Math.max(topLeftWorld.x, bottomRightWorld.x);
      const centerWorld = screenToWorld(width / 2, height / 2);
      const [centerLon, centerLat] = epsg3908ToLonLat(centerWorld.y, centerWorld.x);
      const metersPerPixelGoogle = rangeY / (width * zoom);
      const googleZoomRaw = Math.log2(156543.03392 / Math.max(metersPerPixelGoogle, 0.001));
      const zoomLevel = Math.max(GOOGLE_MIN_ZOOM, Math.min(GOOGLE_MAX_ZOOM, Math.round(googleZoomRaw)));
      const corners = [
        epsg3908ToLonLat(visibleMinY, visibleMinX),
        epsg3908ToLonLat(visibleMinY, visibleMaxX),
        epsg3908ToLonLat(visibleMaxY, visibleMinX),
        epsg3908ToLonLat(visibleMaxY, visibleMaxX),
        [centerLon, centerLat] as [number, number],
      ];
      const tileCoords = corners.map(([lon, lat]) => lonLatToTile(lon, lat, zoomLevel));
      const minTileX = Math.min(...tileCoords.map(t => t.x)) - 1;
      const maxTileX = Math.max(...tileCoords.map(t => t.x)) + 1;
      const minTileY = Math.min(...tileCoords.map(t => t.y)) - 1;
      const maxTileY = Math.max(...tileCoords.map(t => t.y)) + 1;

      for (let tx = minTileX; tx <= maxTileX; tx += 1) {
        for (let ty = minTileY; ty <= maxTileY; ty += 1) {
          const key = `google:${zoomLevel}/${tx}/${ty}`;
          let image = googleImageCacheRef.current.get(key);
          if (!image) {
            image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => setTileVersion(version => version + 1);
            image.onerror = () => googleImageCacheRef.current.delete(key);
            image.src = GOOGLE_SAT_URL
              .replace('{z}', String(zoomLevel))
              .replace('{x}', String(tx))
              .replace('{y}', String(ty));
            googleImageCacheRef.current.set(key, image);
          }
          if (!image.complete || image.naturalWidth === 0) continue;

          const nw = tileToLonLat(tx, ty, zoomLevel);
          const se = tileToLonLat(tx + 1, ty + 1, zoomLevel);
          const [minTileYWorld, maxTileXWorld] = lonLatToEpsg3908(nw.lon, nw.lat);
          const [maxTileYWorld, minTileXWorld] = lonLatToEpsg3908(se.lon, se.lat);
          const topLeft = toScreen(minTileYWorld, maxTileXWorld);
          const bottomRight = toScreen(maxTileYWorld, minTileXWorld);
          ctx.drawImage(
            image,
            topLeft.x,
            topLeft.y,
            bottomRight.x - topLeft.x,
            bottomRight.y - topLeft.y
          );
        }
      }

      if (googleImageCacheRef.current.size > 300) {
        googleImageCacheRef.current.clear();
      }
    }


    // ortofoto26 GitHub XYZ tiles
    if (showOrtofoto26) {
      const ORTOFOTO26_URL = 'https://amerr97.github.io/orto-tiles/{z}/{x}/{y}.png';
      const ORTOFOTO26_MIN_ZOOM = 16;
      const ORTOFOTO26_MAX_ZOOM = 21;
      const topLeftWorld = screenToWorld(0, 0);
      const bottomRightWorld = screenToWorld(width, height);
      const visibleMinY = Math.min(topLeftWorld.y, bottomRightWorld.y);
      const visibleMaxY = Math.max(topLeftWorld.y, bottomRightWorld.y);
      const visibleMinX = Math.min(topLeftWorld.x, bottomRightWorld.x);
      const visibleMaxX = Math.max(topLeftWorld.x, bottomRightWorld.x);
      const centerWorld = screenToWorld(width / 2, height / 2);
      const [centerLon, centerLat] = epsg3908ToLonLat(centerWorld.y, centerWorld.x);
      const metersPerPixelOrtofoto26 = rangeY / (width * zoom);
      const ortofoto26ZoomRaw = Math.log2(156543.03392 / Math.max(metersPerPixelOrtofoto26, 0.001));
      const zoomLevel = Math.max(
        ORTOFOTO26_MIN_ZOOM,
        Math.min(ORTOFOTO26_MAX_ZOOM, Math.round(ortofoto26ZoomRaw))
      );
      const corners = [
        epsg3908ToLonLat(visibleMinY, visibleMinX),
        epsg3908ToLonLat(visibleMinY, visibleMaxX),
        epsg3908ToLonLat(visibleMaxY, visibleMinX),
        epsg3908ToLonLat(visibleMaxY, visibleMaxX),
        [centerLon, centerLat] as [number, number],
      ];
      const tileCoords = corners.map(([lon, lat]) => lonLatToTile(lon, lat, zoomLevel));
      const minTileX = Math.min(...tileCoords.map(t => t.x)) - 1;
      const maxTileX = Math.max(...tileCoords.map(t => t.x)) + 1;
      const minTileY = Math.min(...tileCoords.map(t => t.y)) - 1;
      const maxTileY = Math.max(...tileCoords.map(t => t.y)) + 1;

      for (let tx = minTileX; tx <= maxTileX; tx += 1) {
        for (let ty = minTileY; ty <= maxTileY; ty += 1) {
          const key = `ortofoto26:${zoomLevel}/${tx}/${ty}`;
          let image = ortofoto26ImageCacheRef.current.get(key);
          if (!image) {
            image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => setTileVersion(version => version + 1);
            image.onerror = () => ortofoto26ImageCacheRef.current.delete(key);
            image.src = ORTOFOTO26_URL
              .replace('{z}', String(zoomLevel))
              .replace('{x}', String(tx))
              .replace('{y}', String(ty));
            ortofoto26ImageCacheRef.current.set(key, image);
          }
          if (!image.complete || image.naturalWidth === 0) continue;

          const nw = tileToLonLat(tx, ty, zoomLevel);
          const se = tileToLonLat(tx + 1, ty + 1, zoomLevel);
          const [minTileYWorld, maxTileXWorld] = lonLatToEpsg3908(nw.lon, nw.lat);
          const [maxTileYWorld, minTileXWorld] = lonLatToEpsg3908(se.lon, se.lat);
          const topLeft = toScreen(minTileYWorld, maxTileXWorld);
          const bottomRight = toScreen(maxTileYWorld, minTileXWorld);
          ctx.drawImage(
            image,
            topLeft.x,
            topLeft.y,
            bottomRight.x - topLeft.x,
            bottomRight.y - topLeft.y
          );
        }
      }

      if (ortofoto26ImageCacheRef.current.size > 300) {
        ortofoto26ImageCacheRef.current.clear();
      }
    }

    if (!isNaN(ya) && !isNaN(xa) && !isNaN(yb) && !isNaN(xb)) {
      const start = toScreen(ya, xa);
      const end = toScreen(yb, xb);
      ctx.strokeStyle = RED_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    // 2. Draw Points (Fixed pixel size)
    const labelFontSize = Math.max(6, pointSize * 3);
    ctx.font = `${labelFontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'left';

    points.forEach(p => {
      const pos = toScreen(p.y, p.x);
      
      // Configurable point color and radius (px)
      ctx.fillStyle = pointColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pointSize, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = pointColor;
      ctx.fillText(p.pointNumber, pos.x + pointSize + 2, pos.y + Math.max(2, pointSize / 2));
    });

    if (showBaseLayer) {
      const baseLabelSize = 10;
      ctx.font = `${baseLabelSize}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      basePoints.forEach((p) => {
        const pos = toScreen(p.y, p.x);
        ctx.fillStyle = basePointColor;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.max(pointSize, 2), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = basePointColor;
        ctx.fillText(p.pointNumber, pos.x + Math.max(pointSize, 2) + 3, pos.y - 2);
      });
    }

    if (measurePointA && measurePointB) {
      const a = toScreen(measurePointA.y, measurePointA.x);
      const b = toScreen(measurePointB.y, measurePointB.x);
      const distance = Math.hypot(measurePointB.y - measurePointA.y, measurePointB.x - measurePointA.x);

      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const label = `${distance.toFixed(3)} m`;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(midX - textWidth / 2 - 6, midY - 16, textWidth + 12, 18);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(label, midX, midY - 3);
    }

    if (measurePointA) {
      drawMeasureSnapMarker(measurePointA, 'A');
    }

    if (measurePointB) {
      drawMeasureSnapMarker(measurePointB, 'B');
    }

    // 3. Draw Markers (Fixed pixel size squares)
    const markerSize = 6;

    // Orientation (B)
    if (!isNaN(yb) && !isNaN(xb)) {
      const pos = toScreen(yb, xb);
      ctx.fillStyle = RED_COLOR;
      ctx.fillRect(pos.x - markerSize/2, pos.y - markerSize/2, markerSize, markerSize);
      ctx.fillStyle = RED_COLOR;
      ctx.fillText(station.orientationNumber || 'O', pos.x + markerSize, pos.y - markerSize/2);
    }

    // Station (A)
    if (!isNaN(ya) && !isNaN(xa)) {
      const pos = toScreen(ya, xa);
      ctx.fillStyle = RED_COLOR;
      ctx.fillRect(pos.x - markerSize/2, pos.y - markerSize/2, markerSize, markerSize);
      ctx.fillStyle = RED_COLOR;
      ctx.fillText(station.stationNumber || 'S', pos.x + markerSize, pos.y - markerSize/2);
    }

    dxfDrawing?.entities.forEach(drawDxfPath);

    if (measurePointA) {
      drawMeasureSnapMarker(measurePointA, 'A');
    }

    if (measurePointB) {
      drawMeasureSnapMarker(measurePointB, 'B');
    }

  }, [points, basePoints, station, offset, zoom, getBounds, ya, xa, yb, xb, orthoPhoto, tileSource, tileFiles, mbtilesSource, getMbtilesTile, showOrthoPhoto, requestOrthoTiles, tileVersion, showGoogleSatellite, showOrtofoto26, pointColor, pointSize, showBaseLayer, basePointColor, measurePointA, measurePointB, dxfDrawing, showDxfOverlay, dxfLayerVisibility]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const onStart = (clientX: number, clientY: number, touchCount: number = 1) => {
    if (isMeasureMode) return;
    if (touchCount === 2) {
      // Two fingers for pinch-to-zoom
      const touches = (event as TouchEvent).touches;
      const dist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      pinchStartDistance.current = dist;
      isDragging.current = false; // Disable dragging if pinch is active
    } else if (touchCount === 1) {
      // One finger for panning
      isDragging.current = true;
      lastPos.current = { x: clientX, y: clientY };
      pinchStartDistance.current = null; // Disable pinch if only one finger
    }
  };

  const onMove = (clientX: number, clientY: number, touchCount: number = 1) => {
    if (isMeasureMode) return;
    if (touchCount === 2 && pinchStartDistance.current !== null) {
      const touches = (event as TouchEvent).touches;
      const currentDist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      const scaleFactor = currentDist / pinchStartDistance.current;
      setZoom(prev => Math.min(100, Math.max(0.01, prev * scaleFactor)));
      pinchStartDistance.current = currentDist; // Update for continuous pinch
    } else if (touchCount === 1 && isDragging.current) {
      const dx = clientX - lastPos.current.x;
      const dy = clientY - lastPos.current.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPos.current = { x: clientX, y: clientY };
    }
  };

  const onEnd = () => {
    isDragging.current = false;
    pinchStartDistance.current = null;
  };

  const handleMeasurePick = (clientX: number, clientY: number) => {
    const measureCandidates = [...points, ...(showBaseLayer ? basePoints : [])];
    if (!isMeasureMode || measureCandidates.length === 0) return;
    const canvas = canvasRef.current;
    const view = viewRef.current;
    if (!canvas || !view) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    const finalScale = view.baseScale * view.zoom;

    let nearest: PointData | null = null;
    let nearestDistPx = Number.POSITIVE_INFINITY;

    for (const p of measureCandidates) {
      const sx = view.width / 2 + view.offsetX + (p.y - view.centerX) * finalScale;
      const sy = view.height / 2 + view.offsetY - (p.x - view.centerY) * finalScale;
      const d = Math.hypot(sx - clickX, sy - clickY);
      if (d < nearestDistPx) {
        nearestDistPx = d;
        nearest = p;
      }
    }

    if (!nearest || nearestDistPx > 24) return;
    if (!measurePointA || (measurePointA && measurePointB)) {
      setMeasurePointA(nearest);
      setMeasurePointB(null);
      return;
    }
    if (
      measurePointA.pointNumber === nearest.pointNumber &&
      measurePointA.x === nearest.x &&
      measurePointA.y === nearest.y
    ) return;
    setMeasurePointB(nearest);
  };

  return (
    <div className="fixed inset-0 md:relative md:h-[calc(100vh-120px)] bg-white overflow-hidden flex flex-col animate-in fade-in duration-300">
      {/* Corner Toolbar — niže na mobitelu da ne bude uz header */}
      <div className="absolute top-[calc(5.5rem+env(safe-area-inset-top,0px))] right-4 z-20 flex flex-col gap-2 md:top-4">
        <div className="flex flex-col bg-white/95 backdrop-blur border border-slate-200 shadow-md rounded-xl overflow-hidden">
          <button onClick={() => setZoom(prev => prev * 1.2)} className="p-3 hover:bg-slate-50 transition-colors border-b border-slate-100 text-slate-700 active:bg-slate-200">
            <ZoomIn className="w-5 h-5" />
          </button>
          <button onClick={() => setZoom(prev => prev * 0.8)} className="p-3 hover:bg-slate-50 transition-colors text-slate-700 active:bg-slate-200">
            <ZoomOut className="w-5 h-5" />
          </button>
        </div>
        <button 
          onClick={fitView} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl shadow-md flex items-center justify-center transition-all active:scale-90"
          title="Zoom Extents"
        >
          <Maximize className="w-5 h-5" />
        </button>
        <div className="relative">
          <button
            onClick={() => setIsLayersOpen(prev => !prev)}
            className="bg-white hover:bg-slate-50 text-slate-700 p-3 rounded-xl shadow-md border border-slate-200 flex items-center justify-center transition-all active:scale-90"
            title="Slojevi"
          >
            <Layers className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setIsMeasureMode(prev => {
                const next = !prev;
                if (!next) {
                  setMeasurePointA(null);
                  setMeasurePointB(null);
                }
                return next;
              });
            }}
            className={`mt-2 p-3 rounded-xl shadow-md border flex items-center justify-center transition-all active:scale-90 ${
              isMeasureMode ? 'bg-sky-600 border-sky-700 text-white' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Mjerni alat"
          >
            <Ruler className="w-5 h-5" />
          </button>
          {isLayersOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-xl p-3 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={showGoogleSatellite}
                  onChange={(e) => {
                    googleImageCacheRef.current.clear();
                    setShowGoogleSatellite(e.target.checked);
                  }}
                  className="accent-indigo-600"
                />
                Google Satellite
              </label>
              <p className="text-xs text-slate-400 leading-tight">Zahtijeva internet konekciju.</p>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={showOrtofoto26}
                  onChange={(e) => {
                    ortofoto26ImageCacheRef.current.clear();
                    setShowOrtofoto26(e.target.checked);
                  }}
                  className="accent-indigo-600"
                />
                ortofoto26
              </label>
              <p className="text-xs text-slate-400 leading-tight">20.04.2026</p>
              {dxfDrawing && (
                <>
                  <div className="h-px bg-slate-200 my-1" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={showDxfOverlay}
                        onChange={(e) => setShowDxfOverlay(e.target.checked)}
                        className="accent-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => setIsDxfLayersOpen(prev => !prev)}
                        className="min-w-0 flex-1 inline-flex items-center justify-between gap-2 text-left text-sm font-semibold text-slate-700"
                        title={dxfDrawing.name}
                      >
                        <span className="truncate">{dxfDrawing.name}</span>
                        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isDxfLayersOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {isDxfLayersOpen && (
                      <div className="max-h-44 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1">
                        {dxfDrawing.layers.map((layer) => (
                          <label key={layer.name} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              checked={dxfLayerVisibility[layer.name] ?? true}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setDxfLayerVisibility(prev => ({ ...prev, [layer.name]: checked }));
                              }}
                              className="accent-indigo-600"
                            />
                            <span
                              className="h-2.5 w-2.5 rounded-full border border-white shadow-sm shrink-0"
                              style={{ backgroundColor: layer.color }}
                            />
                            <span className="truncate flex-1" title={layer.name}>{layer.name}</span>
                            <span className="text-[10px] text-slate-400">{layer.entityCount}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="h-px bg-slate-200 my-1" />
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={showBaseLayer}
                  onChange={(e) => setShowBaseLayer(e.target.checked)}
                  className="accent-indigo-600"
                />
                Osnova
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">Boja osnove</span>
                <input
                  type="color"
                  value={basePointColor}
                  onChange={(e) => setBasePointColor(e.target.value)}
                  className="h-7 w-9 rounded border border-slate-300 bg-white p-0"
                  title="Boja osnove"
                  aria-label="Boja osnove"
                />
              </div>
              <div className="h-px bg-slate-200 my-1" />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">Tacke</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">Odaberi boju</span>
                  <input
                    type="color"
                    value={pointColor}
                    onChange={(e) => setPointColor(e.target.value)}
                    className="h-7 w-9 rounded border border-slate-300 bg-white p-0"
                    title="Odaberi boju"
                    aria-label="Odaberi boju"
                  />
                </div>
                <p className="text-xs text-slate-500 leading-tight">Odabrana boja: {pointColor.toUpperCase()}</p>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                <span>Velicina</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    step={1}
                    value={pointSizeInput}
                    onChange={(e) => setPointSizeInput(e.target.value)}
                    onBlur={commitPointSize}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        commitPointSize();
                      }
                    }}
                    className="w-14 rounded border border-slate-300 px-2 py-1 text-right text-sm font-medium text-slate-700"
                  />
                  <span className="text-xs text-slate-500">px</span>
                </div>
              </label>
              <div className="h-px bg-slate-200 my-1" />
              <div className="text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold">Mjerni alat</p>
                <p>{isMeasureMode ? 'Aktivan: kliknite dvije tacke.' : 'Iskljucen'}</p>
                {measurePointA && <p>A: {measurePointA.pointNumber}</p>}
                {measurePointB && <p>B: {measurePointB.pointNumber}</p>}
                {measurePointA && measurePointB && (
                  <p className="font-semibold text-slate-800">
                    Duzina: {Math.hypot(measurePointB.y - measurePointA.y, measurePointB.x - measurePointA.x).toFixed(3)} m
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Sketch Canvas */}
      <div className="flex-1 w-full relative touch-none">
        <canvas 
          ref={canvasRef}
          className="w-full h-full block cursor-move"
          onClick={(e) => handleMeasurePick(e.clientX, e.clientY)}
          onMouseDown={(e) => onStart(e.clientX, e.clientY, 1)}
          onMouseMove={(e) => onMove(e.clientX, e.clientY, 1)}
          onMouseUp={onEnd}
          onMouseLeave={onEnd}
          onTouchStart={(e) => onStart(e.touches[0].clientX, e.touches[0].clientY, e.touches.length)}
          onTouchMove={(e) => onMove(e.touches[0].clientX, e.touches[0].clientY, e.touches.length)}
          onTouchEnd={onEnd}
          onWheel={(e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom(prev => Math.min(100, Math.max(0.01, prev * factor)));
          }}
        />
      </div>
    </div>
  );
};

export default SketchTab;
