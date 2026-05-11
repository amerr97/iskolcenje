
export enum FieldType {
  NONE = "Ne koristi se",
  POINT_NUMBER = "Broj tačke",
  EASTING = "Easting (Y)",
  NORTHING = "Northing (X)",
  HEIGHT = "Visina (Z)"
}

export interface PointData {
  pointNumber: string;
  y: number; // Easting
  x: number; // Northing
  z: number; // Height
}

export type DxfEntityType = 'LINE' | 'LWPOLYLINE' | 'POLYLINE' | 'CIRCLE' | 'ARC' | 'POINT';

export interface DxfPoint {
  y: number;
  x: number;
}

export interface DxfEntityData {
  type: DxfEntityType;
  layer: string;
  points?: DxfPoint[];
  center?: DxfPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  closed?: boolean;
}

export interface DxfLayerData {
  name: string;
  color: string;
  entityCount: number;
}

export interface DxfDrawingData {
  name: string;
  layers: DxfLayerData[];
  entities: DxfEntityData[];
  bounds: {
    minY: number;
    maxY: number;
    minX: number;
    maxX: number;
  } | null;
}

export interface DirectionData {
  pointNumber: string;
  directionAngle: number; // in radians
  distance: number;
}

export interface DMS {
  deg: number;
  min: number;
  sec: number;
}

export interface StationData {
  stationNumber: string;
  orientationNumber: string;
  ya: string;
  xa: string;
  yb: string;
  xb: string;
}

export interface JobStateData {
  fileData: string[][];
  fileName: string;
  mapping: FieldType[];
  points: PointData[];
  baseFileData: string[][];
  baseFileName: string;
  baseMapping: FieldType[];
  basePoints: PointData[];
  station: StationData;
  dirUgaoSO: number | null;
  distSO: number | null;
  orthoPhoto: OrthoPhotoData | null;
  showOrthoPhoto: boolean;
  tileSource: TileSourceData | null;
  mbtilesSource: MbtilesSourceData | null;
  dxfDrawing: DxfDrawingData | null;
}

export interface JobData {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: JobStateData;
}

export interface OrthoPhotoData {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
}

export interface TileSourceData {
  name: string;
  path?: string;
  minZoom: number;
  maxZoom: number;
  tms: boolean;
}

export interface MbtilesSourceData {
  name: string;
  path?: string;
  minZoom: number;
  maxZoom: number;
  format: string;
  scheme: 'xyz' | 'tms';
}
