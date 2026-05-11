
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { FieldType, PointData, DirectionData, StationData, JobData, JobStateData, OrthoPhotoData, TileSourceData, MbtilesSourceData, DxfDrawingData } from './types';
import Sidebar from './components/Sidebar';
import JobTab from './components/JobTab';
import InputDataTab from './components/InputDataTab';
import StationTab from './components/StationTab';
import AnglesTab from './components/AnglesTab';
import ElementsTab from './components/ElementsTab';
import SketchTab from './components/SketchTab';
import ExportTab from './components/ExportTab';
import UpdatesTab, { compareVersions, extractVersion, GithubRelease, RELEASE_API_URL } from './components/UpdatesTab';
import AboutTab from './components/AboutTab';
import { calculateDirection } from './utils';
import { Menu } from 'lucide-react';
import { fromBlob } from 'geotiff';
import { Capacitor } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem } from '@capacitor/filesystem';
import initSqlJs, { Database } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

const AppLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="0.5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    {/* Grid lines background */}
    <path d="M0 6H24" stroke="white" strokeWidth="0.3" strokeOpacity="0.4" />
    <path d="M0 12H24" stroke="white" strokeWidth="0.3" strokeOpacity="0.4" />
    <path d="M0 18H24" stroke="white" strokeWidth="0.3" strokeOpacity="0.4" />
    <path d="M6 0V24" stroke="white" strokeWidth="0.3" strokeOpacity="0.4" />
    <path d="M12 0V24" stroke="white" strokeWidth="0.3" strokeOpacity="0.4" />
    <path d="M18 0V24" stroke="white" strokeWidth="0.3" strokeOpacity="0.4" />
    {/* Enlarged Letter E with glow */}
    <path 
      d="M5 4H19V7.5H9V10.5H17V13.5H9V16.5H19V20H5V4Z" 
      fill="currentColor" 
      filter="url(#glow)"
    />
  </svg>
);

const readFileAsText = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.onerror = reject;
  reader.readAsText(file);
});

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as ArrayBuffer);
  reader.onerror = reject;
  reader.readAsArrayBuffer(file);
});

const base64ToFile = (data: string, name: string, mimeType: string): File => {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], name, { type: mimeType || 'application/octet-stream' });
};

const pickedNativeFileToFile = async (pickedFile: {
  blob?: Blob;
  data?: string;
  mimeType: string;
  name: string;
  path?: string;
}): Promise<File | null> => {
  if (pickedFile.data) {
    return base64ToFile(pickedFile.data, pickedFile.name, pickedFile.mimeType);
  }

  if (pickedFile.blob) {
    return new File([pickedFile.blob], pickedFile.name, {
      type: pickedFile.mimeType || pickedFile.blob.type || 'application/octet-stream',
    });
  }

  if (pickedFile.path) {
    try {
      const fileUrl = Capacitor.convertFileSrc(pickedFile.path);
      const response = await fetch(fileUrl);
      if (response.ok) {
        const blob = await response.blob();
        return new File([blob], pickedFile.name, {
          type: pickedFile.mimeType || blob.type || 'application/octet-stream',
        });
      }
    } catch (error) {
      console.warn('convertFileSrc/fetch nije procitao fajl, pokusavam Filesystem:', error);
    }

    const readResult = await Filesystem.readFile({ path: pickedFile.path });
    if (typeof readResult.data === 'string') {
      return base64ToFile(readResult.data, pickedFile.name, pickedFile.mimeType);
    }
  }

  console.warn('File picker nije vratio citljiv fajl:', {
    name: pickedFile.name,
    mimeType: pickedFile.mimeType,
    hasBlob: Boolean(pickedFile.blob),
    hasData: Boolean(pickedFile.data),
    path: pickedFile.path,
  });
  return null;
};

const loadImageSize = (dataUrl: string): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = reject;
  img.src = dataUrl;
});

const parseWorldFileBounds = (text: string, width: number, height: number) => {
  const values = text
    .split(/\r\n|\r|\n/)
    .map((line) => parseFloat(line.trim().replace(',', '.')))
    .filter((value) => Number.isFinite(value));
  if (values.length < 6) return null;

  const [pixelSizeY, rotationY, rotationX, pixelSizeX, centerY, centerX] = values;
  if (Math.abs(rotationY) > 1e-9 || Math.abs(rotationX) > 1e-9) {
    alert('World fajl ima rotaciju. Trenutno je podrzan ortofoto bez rotacije.');
  }

  const halfPixelY = pixelSizeY / 2;
  const halfPixelX = pixelSizeX / 2;
  const minY = centerY - halfPixelY;
  const maxY = centerY + pixelSizeY * width - halfPixelY;
  const maxX = centerX - halfPixelX;
  const minX = centerX + pixelSizeX * height - halfPixelX;

  return {
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY),
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
  };
};

const buildGeoTiffOrthoPhoto = async (file: File): Promise<OrthoPhotoData> => {
  const tiff = await fromBlob(file);
  const fullImage = await tiff.getImage(0);
  const bbox = fullImage.getBoundingBox();
  const imageCount = await tiff.getImageCount();
  const maxPreviewSize = 1024;
  let image = fullImage;

  for (let i = 1; i < imageCount; i += 1) {
    const candidate = await tiff.getImage(i);
    if (Math.max(candidate.getWidth(), candidate.getHeight()) <= maxPreviewSize) {
      image = candidate;
      break;
    }
    if (Math.max(candidate.getWidth(), candidate.getHeight()) < Math.max(image.getWidth(), image.getHeight())) {
      image = candidate;
    }
  }

  const sourceWidth = image.getWidth();
  const sourceHeight = image.getHeight();
  const scale = Math.min(1, maxPreviewSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const rgb = await image.readRGB({ width, height, interleave: true, resampleMethod: 'nearest' });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Ne mogu pripremiti ortofoto prikaz.');

  const imageData = ctx.createImageData(width, height);
  for (let i = 0, j = 0; i < width * height; i += 1, j += 3) {
    imageData.data[i * 4] = rgb[j] ?? 0;
    imageData.data[i * 4 + 1] = rgb[j + 1] ?? rgb[j] ?? 0;
    imageData.data[i * 4 + 2] = rgb[j + 2] ?? rgb[j] ?? 0;
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  return {
    id: `${Date.now()}-${file.name}`,
    name: file.name,
    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    width,
    height,
    minY: bbox[0],
    minX: bbox[1],
    maxY: bbox[2],
    maxX: bbox[3],
  };
};

const buildTiffWorldFileOrthoPhoto = async (imageFile: File, worldFile: File): Promise<OrthoPhotoData> => {
  const tiff = await fromBlob(imageFile);
  const fullImage = await tiff.getImage(0);
  const sourceWidthForBounds = fullImage.getWidth();
  const sourceHeightForBounds = fullImage.getHeight();
  const imageCount = await tiff.getImageCount();
  const maxPreviewSize = 1024;
  let image = fullImage;

  for (let i = 1; i < imageCount; i += 1) {
    const candidate = await tiff.getImage(i);
    if (Math.max(candidate.getWidth(), candidate.getHeight()) <= maxPreviewSize) {
      image = candidate;
      break;
    }
    if (Math.max(candidate.getWidth(), candidate.getHeight()) < Math.max(image.getWidth(), image.getHeight())) {
      image = candidate;
    }
  }

  const scale = Math.min(1, maxPreviewSize / Math.max(image.getWidth(), image.getHeight()));
  const width = Math.max(1, Math.round(image.getWidth() * scale));
  const height = Math.max(1, Math.round(image.getHeight() * scale));
  const rgb = await image.readRGB({ width, height, interleave: true, resampleMethod: 'nearest' });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Ne mogu pripremiti ortofoto prikaz.');

  const imageData = ctx.createImageData(width, height);
  for (let i = 0, j = 0; i < width * height; i += 1, j += 3) {
    imageData.data[i * 4] = rgb[j] ?? 0;
    imageData.data[i * 4 + 1] = rgb[j + 1] ?? rgb[j] ?? 0;
    imageData.data[i * 4 + 2] = rgb[j + 2] ?? rgb[j] ?? 0;
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  const worldText = await readFileAsText(worldFile);
  const bounds = parseWorldFileBounds(worldText, sourceWidthForBounds, sourceHeightForBounds);
  if (!bounds) {
    throw new Error('World fajl nije ispravan.');
  }

  return {
    id: `${Date.now()}-${imageFile.name}`,
    name: imageFile.name,
    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    width,
    height,
    ...bounds,
  };
};

const buildWorldFileOrthoPhoto = async (imageFile: File, worldFile: File): Promise<OrthoPhotoData> => {
  const dataUrl = await readFileAsDataUrl(imageFile);
  const { width, height } = await loadImageSize(dataUrl);
  const worldText = await readFileAsText(worldFile);
  const bounds = parseWorldFileBounds(worldText, width, height);
  if (!bounds) {
    throw new Error('World fajl nije ispravan.');
  }

  return {
    id: `${Date.now()}-${imageFile.name}`,
    name: imageFile.name,
    dataUrl,
    width,
    height,
    ...bounds,
  };
};

const parseTileReport = (text: string): Pick<TileSourceData, 'minZoom' | 'maxZoom' | 'tms'> | null => {
  const minMatch = text.match(/minZoom:\s*(\d+)/);
  const maxMatch = text.match(/maxZoom:\s*(\d+)/);
  const tmsMatch = text.match(/tms:\s*(true|false)/);
  if (!minMatch || !maxMatch) return null;
  return {
    minZoom: Number(minMatch[1]),
    maxZoom: Number(maxMatch[1]),
    tms: tmsMatch ? tmsMatch[1] === 'true' : false,
  };
};

const detectTileZoomsFromNativeFolder = async (folderPath: string): Promise<Pick<TileSourceData, 'minZoom' | 'maxZoom' | 'tms'>> => {
  // 1) Pokušaj čitanja QGIS report.html (ako postoji) za min/max + TMS.
  try {
    const report = await Filesystem.readFile({ path: `${folderPath.replace(/[\\\/]+$/, '')}/report.html` });
    if (typeof report.data === 'string') {
      const parsed = parseTileReport(report.data);
      if (parsed) return parsed;
    }
  } catch {
    // ignore
  }

  // 2) Fallback: autodetekcija min/max zoom iz imena foldera (npr. /17/72240/47725.png).
  // tms ne možemo pouzdano pogoditi bez metapodataka, pa ostaje false (XYZ).
  try {
    const result = await Filesystem.readdir({ path: folderPath });
    const entries = (result as unknown as { files?: string[]; directories?: string[] }).files
      ?? (result as unknown as { files?: string[]; directories?: string[] }).directories
      ?? [];
    const zooms = entries
      .map((name) => {
        const normalized = name.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
        return /^\d+$/.test(normalized) ? Number(normalized) : null;
      })
      .filter((value): value is number => value !== null && Number.isFinite(value));
    if (zooms.length > 0) {
      return { minZoom: Math.min(...zooms), maxZoom: Math.max(...zooms), tms: false };
    }
  } catch (error) {
    console.warn('Ne mogu procitati tile folder za autodetekciju:', error);
  }

  // 3) Zadnji fallback
  return { minZoom: 0, maxZoom: 22, tms: false };
};

let sqlModulePromise: ReturnType<typeof initSqlJs> | null = null;
const getSqlModule = () => {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs({
      locateFile: () => sqlWasmUrl,
    });
  }
  return sqlModulePromise;
};

const getMbtilesMetadataValue = (db: Database, key: string): string | null => {
  const result = db.exec('SELECT value FROM metadata WHERE name = ?', [key]);
  return result[0]?.values?.[0]?.[0]?.toString() ?? null;
};

const getSqlMbtilesZoomRange = (db: Database): Pick<MbtilesSourceData, 'minZoom' | 'maxZoom'> => {
  const result = db.exec('SELECT MIN(zoom_level), MAX(zoom_level) FROM tiles');
  const row = result[0]?.values?.[0];
  return {
    minZoom: Number(row?.[0] ?? 0),
    maxZoom: Number(row?.[1] ?? 22),
  };
};

const getNativeMetadataValue = async (db: SQLiteDBConnection, key: string): Promise<string | null> => {
  const result = await db.query('SELECT value FROM metadata WHERE name = ? LIMIT 1', [key]);
  const row = result.values?.[0] as { value?: unknown } | undefined;
  return row?.value?.toString() ?? null;
};

const getNativeMbtilesZoomRange = async (db: SQLiteDBConnection): Promise<Pick<MbtilesSourceData, 'minZoom' | 'maxZoom'>> => {
  const result = await db.query('SELECT MIN(zoom_level) AS minZoom, MAX(zoom_level) AS maxZoom FROM tiles');
  const row = result.values?.[0] as { minZoom?: unknown; maxZoom?: unknown } | undefined;
  return {
    minZoom: Number(row?.minZoom ?? 0),
    maxZoom: Number(row?.maxZoom ?? 22),
  };
};

const blobFromSqlValue = (value: unknown, format: string): Blob | null => {
  const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;
  if (value instanceof Uint8Array) {
    return new Blob([value], { type: mimeType });
  }
  if (value instanceof ArrayBuffer) {
    return new Blob([value], { type: mimeType });
  }
  if (Array.isArray(value)) {
    return new Blob([new Uint8Array(value)], { type: mimeType });
  }
  if (typeof value === 'string') {
    const base64 = value.startsWith('data:') ? value.split(',')[1] : value;
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    } catch {
      return null;
    }
  }
  return null;
};

const detectTileZoomsFromFiles = (files: File[]): Pick<TileSourceData, 'minZoom' | 'maxZoom' | 'tms'> => {
  const zooms = files
    .map((file) => {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const match = path.replace(/\\/g, '/').match(/(?:^|\/)(\d+)\/\d+\/\d+\.(png|jpg|jpeg|webp)$/i);
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => value !== null);
  return {
    minZoom: zooms.length ? Math.min(...zooms) : 0,
    maxZoom: zooms.length ? Math.max(...zooms) : 0,
    tms: false,
  };
};

const App: React.FC = () => {
  const ANDROID_BUILD_VERSION = import.meta.env.VITE_ANDROID_VERSION_NAME || '1.0.0';
  const UPDATE_CHECK_STORAGE_KEY = 'update-check-status-v1';
  const JOBS_STORAGE_KEY = 'e-iskolcenje-jobs-v1';
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const [activeTab, setActiveTab] = useState('job');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateRelease, setUpdateRelease] = useState<GithubRelease | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  
  // App State
  const [fileData, setFileData] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<FieldType[]>([
    FieldType.POINT_NUMBER,
    FieldType.EASTING,
    FieldType.NORTHING,
    FieldType.HEIGHT,
    FieldType.NONE
  ]);
  const [points, setPoints] = useState<PointData[]>([]);
  const [baseFileData, setBaseFileData] = useState<string[][]>([]);
  const [baseFileName, setBaseFileName] = useState("");
  const [baseMapping, setBaseMapping] = useState<FieldType[]>([
    FieldType.POINT_NUMBER,
    FieldType.EASTING,
    FieldType.NORTHING,
    FieldType.HEIGHT,
    FieldType.NONE
  ]);
  const [basePoints, setBasePoints] = useState<PointData[]>([]);
  const [station, setStation] = useState<StationData>({
    stationNumber: '',
    orientationNumber: '',
    ya: '',
    xa: '',
    yb: '',
    xb: ''
  });

  const [dirUgaoSO, setDirUgaoSO] = useState<number | null>(null);
  const [distSO, setDistSO] = useState<number | null>(null);
  const [orthoPhoto, setOrthoPhoto] = useState<OrthoPhotoData | null>(null);
  const [orthoPhotoFile, setOrthoPhotoFile] = useState<File | null>(null);
  const [orthoWorldFile, setOrthoWorldFile] = useState<File | null>(null);
  const [showOrthoPhoto, setShowOrthoPhoto] = useState(true);
  const [tileSource, setTileSource] = useState<TileSourceData | null>(null);
  const [tileFiles, setTileFiles] = useState<Map<string, string>>(new Map());
  const [mbtilesSource, setMbtilesSource] = useState<MbtilesSourceData | null>(null);
  const [mbtilesDb, setMbtilesDb] = useState<Database | null>(null);
  const [dxfDrawing, setDxfDrawing] = useState<DxfDrawingData | null>(null);
  const sqlite = useMemo(() => new SQLiteConnection(CapacitorSQLite), []);
  const nativeMbtilesRef = useRef<SQLiteDBConnection | null>(null);
  const nativeMbtilesPathRef = useRef<string | null>(null);

  const createCurrentJobState = (): JobStateData => ({
    fileData,
    fileName,
    mapping,
    points,
    baseFileData,
    baseFileName,
    baseMapping,
    basePoints,
    station,
    dirUgaoSO,
    distSO,
    orthoPhoto,
    showOrthoPhoto,
    tileSource,
    mbtilesSource,
    dxfDrawing,
  });

  const applyJobState = (state: JobStateData) => {
    setFileData(state.fileData ?? []);
    setFileName(state.fileName ?? '');
    setMapping(state.mapping ?? [
      FieldType.POINT_NUMBER,
      FieldType.EASTING,
      FieldType.NORTHING,
      FieldType.HEIGHT,
      FieldType.NONE
    ]);
    setPoints(state.points ?? []);
    setBaseFileData(state.baseFileData ?? []);
    setBaseFileName(state.baseFileName ?? '');
    setBaseMapping(state.baseMapping ?? [
      FieldType.POINT_NUMBER,
      FieldType.EASTING,
      FieldType.NORTHING,
      FieldType.HEIGHT,
      FieldType.NONE
    ]);
    setBasePoints(state.basePoints ?? []);
    setStation(state.station ?? {
      stationNumber: '',
      orientationNumber: '',
      ya: '',
      xa: '',
      yb: '',
      xb: ''
    });
    setDirUgaoSO(state.dirUgaoSO ?? null);
    setDistSO(state.distSO ?? null);
    setOrthoPhoto(state.orthoPhoto ?? null);
    setShowOrthoPhoto(state.showOrthoPhoto ?? true);
    setTileSource(state.tileSource ?? null);
    setMbtilesSource(state.mbtilesSource ?? null);
    setDxfDrawing(state.dxfDrawing ?? null);
    setMbtilesDb(null);
    setTileFiles(new Map());
  };

  const closeNativeMbtiles = useCallback(async () => {
    const connection = nativeMbtilesRef.current;
    const path = nativeMbtilesPathRef.current;
    nativeMbtilesRef.current = null;
    nativeMbtilesPathRef.current = null;
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.warn('MBTiles konekcija nije zatvorena:', error);
      }
    }
    if (path) {
      try {
        await sqlite.closeNCConnection(path);
      } catch (error) {
        console.warn('NC MBTiles konekcija nije zatvorena:', error);
      }
    }
  }, [sqlite]);

  const emptyJobState = (): JobStateData => ({
    fileData: [],
    fileName: '',
    mapping: [
      FieldType.POINT_NUMBER,
      FieldType.EASTING,
      FieldType.NORTHING,
      FieldType.HEIGHT,
      FieldType.NONE
    ],
    points: [],
    baseFileData: [],
    baseFileName: '',
    baseMapping: [
      FieldType.POINT_NUMBER,
      FieldType.EASTING,
      FieldType.NORTHING,
      FieldType.HEIGHT,
      FieldType.NONE
    ],
    basePoints: [],
    station: {
      stationNumber: '',
      orientationNumber: '',
      ya: '',
      xa: '',
      yb: '',
      xb: ''
    },
    dirUgaoSO: null,
    distSO: null,
    orthoPhoto: null,
    showOrthoPhoto: true,
    tileSource: null,
    mbtilesSource: null,
    dxfDrawing: null,
  });

  const directionsToPoints = useMemo<DirectionData[]>(() => {
    const ya = parseFloat(station.ya);
    const xa = parseFloat(station.xa);
    if (isNaN(ya) || isNaN(xa) || points.length === 0) return [];

    return points.map(p => {
      const { angle, distance } = calculateDirection(ya, xa, p.y, p.x);
      return {
        pointNumber: p.pointNumber,
        directionAngle: angle,
        distance
      };
    });
  }, [station.ya, station.xa, points]);

  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(JOBS_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as {
          jobs?: JobData[];
          currentJobId?: string | null;
        };
        setJobs(Array.isArray(parsed.jobs) ? parsed.jobs : []);
        const savedCurrent = parsed.currentJobId ?? null;
        if (savedCurrent && parsed.jobs?.some((job) => job.id === savedCurrent)) {
          const job = parsed.jobs.find((item) => item.id === savedCurrent);
          if (job) {
            setCurrentJobId(job.id);
            applyJobState(job.state);
          }
        }
      }
    } catch {
      setJobs([]);
      setCurrentJobId(null);
    } finally {
      setJobsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!jobsLoaded) return;
    localStorage.setItem(
      JOBS_STORAGE_KEY,
      JSON.stringify({
        jobs,
        currentJobId,
      })
    );
  }, [jobs, currentJobId, jobsLoaded]);

  useEffect(() => {
    if (!jobsLoaded || !currentJobId) return;
    const state = createCurrentJobState();
    setJobs((prev) => prev.map((job) => (
      job.id === currentJobId
        ? { ...job, state, updatedAt: Date.now() }
        : job
    )));
  }, [
    fileData,
    fileName,
    mapping,
    points,
    baseFileData,
    baseFileName,
    baseMapping,
    basePoints,
    station,
    dirUgaoSO,
    distSO,
    orthoPhoto,
    showOrthoPhoto,
    tileSource,
    mbtilesSource,
    dxfDrawing,
    currentJobId,
    jobsLoaded,
  ]);

  const handleCreateJob = (name: string) => {
    const now = Date.now();
    const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    const newJob: JobData = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      state: emptyJobState(),
    };
    setJobs((prev) => [newJob, ...prev]);
    setCurrentJobId(id);
    applyJobState(newJob.state);
    setActiveTab('input');
  };

  const handleLoadJob = (id: string) => {
    const job = jobs.find((item) => item.id === id);
    if (!job) return;
    setCurrentJobId(job.id);
    applyJobState(job.state);
    setActiveTab('input');
  };

  const handleDeleteJob = (id: string) => {
    const job = jobs.find((item) => item.id === id);
    if (!job) return;
    const confirmed = window.confirm(`Obrisati posao "${job.name}"?`);
    if (!confirmed) return;
    setJobs((prev) => prev.filter((item) => item.id !== id));
    if (currentJobId === id) {
      setCurrentJobId(null);
      applyJobState(emptyJobState());
      setActiveTab('job');
    }
  };

  const handleLoadOrthoPhoto = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files);
    const imageFile = selected.find((file) => /\.(tif|tiff|jpg|jpeg|png)$/i.test(file.name));
    const worldFile = selected.find((file) => /\.(jgw|pgw|tfw|wld)$/i.test(file.name));
    if (!imageFile) {
      alert('Odaberite ortofoto fajl (.tif, .jpg ili .png).');
      return;
    }

    try {
      // GeoTIFF od 20k×20k često je prevelik za direktno učitavanje u WebView memoriji.
      // Za velike fajlove preporučujemo MBTiles/tiles (offline) umjesto decode-a cijelog TIFF-a.
      const TIFF_TOO_LARGE_BYTES = 120 * 1024 * 1024; // 120MB prag (sigurnije za mobitele)
      if (/\.(tif|tiff)$/i.test(imageFile.name) && imageFile.size > TIFF_TOO_LARGE_BYTES) {
        alert(
          'Odabrani GeoTIFF je prevelik za direktno učitavanje na mobitelu.\n\n' +
          'Preporuka: eksportujte ortofoto kao MBTiles (XYZ/TMS) ili tile folder i učitajte kroz "Učitaj MBTiles" / "Učitaj tile folder".'
        );
        return;
      }
      let nextOrtho: OrthoPhotoData;
      if (/\.(tif|tiff)$/i.test(imageFile.name)) {
        if (worldFile) {
          nextOrtho = await buildTiffWorldFileOrthoPhoto(imageFile, worldFile);
        } else {
          nextOrtho = await buildGeoTiffOrthoPhoto(imageFile);
        }
      } else {
        if (!worldFile) {
          alert('Za JPG/PNG ortofoto odaberite i world fajl (.jgw, .pgw ili .wld) u istom odabiru.');
          return;
        }
        nextOrtho = await buildWorldFileOrthoPhoto(imageFile, worldFile);
      }
      setOrthoPhoto(nextOrtho);
      setOrthoPhotoFile(imageFile);
      setOrthoWorldFile(worldFile ?? null);
      setShowOrthoPhoto(true);
    } catch (error) {
      console.error('Greska pri ucitavanju ortofota:', error);
      alert(error instanceof Error ? error.message : 'Nije moguce ucitati ortofoto.');
    }
  };

  const handleClearOrthoPhoto = () => {
    setOrthoPhoto(null);
    setOrthoPhotoFile(null);
    setOrthoWorldFile(null);
    setShowOrthoPhoto(true);
  };

  const handleLoadTileFolder = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files);
    const reportFile = selected.find((file) => file.name.toLowerCase() === 'report.html');
    const report = reportFile ? parseTileReport(await readFileAsText(reportFile)) : null;
    const detected = report ?? detectTileZoomsFromFiles(selected);
    const nextTileFiles = new Map<string, string>();

    selected.forEach((file) => {
      const relativePath = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, '/');
      const match = relativePath.match(/(?:^|\/)(\d+)\/(\d+)\/(\d+\.(?:png|jpg|jpeg|webp))$/i);
      if (!match) return;
      const key = `${match[1]}/${match[2]}/${match[3]}`;
      nextTileFiles.set(key, URL.createObjectURL(file));
    });

    if (nextTileFiles.size === 0) {
      alert('Odabrani folder ne izgleda kao XYZ tile folder.');
      return;
    }

    setTileFiles(nextTileFiles);
    setTileSource({
      name: 'Tiles',
      minZoom: detected.minZoom,
      maxZoom: detected.maxZoom,
      tms: detected.tms,
    });
    setOrthoPhoto(null);
    setOrthoPhotoFile(null);
    setOrthoWorldFile(null);
  };

  const handlePickTileFolder = async () => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const result = await FilePicker.pickDirectory();
      if (!result.path) return true;
      setTileFiles(new Map());
      const detected = await detectTileZoomsFromNativeFolder(result.path);
      setTileSource({
        name: result.path.split(/[\\/]/).filter(Boolean).pop() || 'Tiles',
        path: result.path,
        minZoom: detected.minZoom,
        maxZoom: detected.maxZoom,
        tms: detected.tms,
      });
      setOrthoPhoto(null);
      setOrthoPhotoFile(null);
      setOrthoWorldFile(null);
      return true;
    } catch (error) {
      console.error('Greska pri izboru tile foldera:', error);
      alert('Nije moguce otvoriti folder picker za tiles.');
      return true;
    }
  };

  const handleClearTileSource = () => {
    tileFiles.forEach((url) => URL.revokeObjectURL(url));
    setTileFiles(new Map());
    setTileSource(null);
  };

  const handleLoadMbtiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      await closeNativeMbtiles();
      const MBTILES_SQLJS_LIMIT_BYTES = 80 * 1024 * 1024; // sql.js zahtijeva učitavanje cijelog fajla u RAM
      if (Capacitor.isNativePlatform() && file.size > MBTILES_SQLJS_LIMIT_BYTES) {
        alert(
          'MBTiles fajl je velik i na Androidu se ne može sigurno učitati kroz web input (učita se cijeli u RAM).\n\n' +
          'Molimo koristite dugme "Učitaj MBTiles" (native picker) da aplikacija otvori fajl direktno sa diska.'
        );
        return;
      }
      if (!Capacitor.isNativePlatform() && file.size > MBTILES_SQLJS_LIMIT_BYTES) {
        alert(
          'MBTiles fajl je prevelik za web učitavanje (sql.js učitava cijeli fajl u memoriju).\n\n' +
          'Koristite mobilnu (native) verziju ili učitajte tile folder.'
        );
        return;
      }
      const SQL = await getSqlModule();
      const buffer = await readFileAsArrayBuffer(file);
      const db = new SQL.Database(new Uint8Array(buffer));
      const detectedZooms = getSqlMbtilesZoomRange(db);
      const minZoom = Number(getMbtilesMetadataValue(db, 'minzoom') ?? detectedZooms.minZoom);
      const maxZoom = Number(getMbtilesMetadataValue(db, 'maxzoom') ?? detectedZooms.maxZoom);
      const format = getMbtilesMetadataValue(db, 'format') ?? 'png';
      const schemeValue = getMbtilesMetadataValue(db, 'scheme');
      const scheme: 'xyz' | 'tms' = schemeValue === 'xyz' ? 'xyz' : 'tms';

      setMbtilesDb((oldDb) => {
        oldDb?.close();
        return db;
      });
      setMbtilesSource({
        name: file.name,
        minZoom,
        maxZoom,
        format,
        scheme,
      });
      handleClearTileSource();
      handleClearOrthoPhoto();
    } catch (error) {
      console.error('Greska pri ucitavanju MBTiles:', error);
      alert(error instanceof Error ? error.message : 'Nije moguce ucitati MBTiles fajl.');
    }
  };

  const handlePickMbtiles = async () => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      // Neki Android uređaji/ROM-ovi blokiraju picker bez eksplicitnog permission request-a.
      // Ovo ne daje pristup svemu, ali stabilizira otvaranje file browsera.
      try {
        await FilePicker.requestPermissions();
      } catch (error) {
        console.warn('FilePicker permission request nije uspio:', error);
      }
      const result = await FilePicker.pickFiles({
        limit: 1,
        readData: false,
        types: ['*/*'],
      });
      const picked = result.files[0];
      if (!picked) return true;

      if (!picked.path) {
        const file = await pickedNativeFileToFile(picked);
        if (!file) {
          alert('File browser nije vratio putanju MBTiles fajla.');
          return true;
        }
        const list = new DataTransfer();
        list.items.add(file);
        await handleLoadMbtiles(list.files);
        return true;
      }

      await closeNativeMbtiles();
      setMbtilesDb((oldDb) => {
        oldDb?.close();
        return null;
      });

      // File picker često vraća putanju koja nije direktno čitljiva SQLite pluginu (npr. content://).
      // Rješenje: kopirati fajl u "NC database" lokaciju koju plugin može garantovano da vidi.
      const fileName = (picked.name || picked.path.split(/[\\/]/).filter(Boolean).pop() || 'mbtiles.mbtiles').trim();
      const dest = await sqlite.getNCDatabasePath('default', fileName);
      const destPath = dest.path || '';
      if (!destPath) {
        throw new Error('Ne mogu odrediti destinaciju za MBTiles fajl.');
      }
      await FilePicker.copyFile({
        from: picked.path,
        to: destPath,
        overwrite: true,
      });

      const connection = await sqlite.createNCConnection(destPath, 1);
      await connection.open();
      const detectedZooms = await getNativeMbtilesZoomRange(connection);
      const minZoom = Number(await getNativeMetadataValue(connection, 'minzoom') ?? detectedZooms.minZoom);
      const maxZoom = Number(await getNativeMetadataValue(connection, 'maxzoom') ?? detectedZooms.maxZoom);
      const format = await getNativeMetadataValue(connection, 'format') ?? 'png';
      const schemeValue = await getNativeMetadataValue(connection, 'scheme');
      const scheme: 'xyz' | 'tms' = schemeValue === 'xyz' ? 'xyz' : 'tms';

      nativeMbtilesRef.current = connection;
      nativeMbtilesPathRef.current = destPath;
      setMbtilesSource({
        name: picked.name || fileName || 'MBTiles',
        path: destPath,
        minZoom,
        maxZoom,
        format,
        scheme,
      });
      handleClearTileSource();
      handleClearOrthoPhoto();
      return true;
    } catch (error) {
      console.error('Greska pri izboru MBTiles:', error);
      const message = error instanceof Error ? error.message : String(error ?? '');
      alert(
        'Nije moguće otvoriti file browser za MBTiles.\n\n' +
        (message ? `Detalji: ${message}\n\n` : '') +
        'Pokušaj ponovo ili koristi web odabir fajla (fallback).'
      );
      // Vraćamo false da bi UI mogao otvoriti HTML <input type="file"> kao fallback.
      return false;
    }
  };

  const handleClearMbtiles = () => {
    void closeNativeMbtiles();
    setMbtilesDb((oldDb) => {
      oldDb?.close();
      return null;
    });
    setMbtilesSource(null);
  };

  const getMbtilesTile = useCallback(async (z: number, x: number, y: number): Promise<Blob | null> => {
    const source = mbtilesSource;
    if (!source) return null;
    const nativeConnection = nativeMbtilesRef.current;
    if (nativeConnection) {
      const result = await nativeConnection.query(
        'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ? LIMIT 1',
        [z, x, y]
      );
      const row = result.values?.[0] as { tile_data?: unknown } | undefined;
      return blobFromSqlValue(row?.tile_data, source.format);
    }
    if (mbtilesDb) {
      const result = mbtilesDb.exec(
        'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ? LIMIT 1',
        [z, x, y]
      );
      return blobFromSqlValue(result[0]?.values?.[0]?.[0], source.format);
    }
    return null;
  }, [mbtilesSource, mbtilesDb]);

  const handlePickOrthoPhoto = async () => {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      handleClearOrthoPhoto();
      const result = await FilePicker.pickFiles({
        limit: 0,
        readData: true,
      });
      const files = (await Promise.all(result.files.map((file) => pickedNativeFileToFile(file))))
        .filter((file): file is File => Boolean(file));

      if (files.length === 0) {
        alert('File browser nije vratio citljiv ortofoto fajl.');
        return true;
      }

      const list = new DataTransfer();
      files.forEach((file) => list.items.add(file));
      await handleLoadOrthoPhoto(list.files);
      return true;
    } catch (error) {
      console.error('Greska pri izboru ortofota:', error);
      alert('Nije moguce otvoriti file browser za ortofoto.');
      return true;
    }
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    const autoCheckUpdates = async () => {
      const savedRaw = localStorage.getItem(UPDATE_CHECK_STORAGE_KEY);
      let lastCheckedAt = 0;
      if (savedRaw) {
        try {
          const saved = JSON.parse(savedRaw) as {
            checkedAt: number;
            updateAvailable: boolean;
            release: GithubRelease | null;
            error: string | null;
            currentVersion: string;
          };
          lastCheckedAt = saved.checkedAt ?? 0;
          setUpdateAvailable(Boolean(saved.updateAvailable));
          setUpdateRelease(saved.release ?? null);
          setUpdateError(saved.error ?? null);
        } catch {
          // Ignore invalid cache and fallback to fresh check.
        }
      }

      if (Date.now() - lastCheckedAt < ONE_DAY_MS) return;

      try {
        const currentVersion = ANDROID_BUILD_VERSION;

        const response = await fetch(RELEASE_API_URL, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!response.ok) {
          throw new Error(`GitHub API greška (${response.status})`);
        }
        const releaseData = (await response.json()) as GithubRelease;
        const localVersion = extractVersion(currentVersion);
        const remoteVersion = extractVersion(releaseData.tag_name || releaseData.name);
        const hasUpdate = compareVersions(remoteVersion, localVersion) > 0;

        setUpdateAvailable(hasUpdate);
        setUpdateRelease(releaseData);
        setUpdateError(null);
        localStorage.setItem(
          UPDATE_CHECK_STORAGE_KEY,
          JSON.stringify({
            checkedAt: Date.now(),
            updateAvailable: hasUpdate,
            release: releaseData,
            error: null,
            currentVersion,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nepoznata greška';
        setUpdateError(message);
        localStorage.setItem(
          UPDATE_CHECK_STORAGE_KEY,
          JSON.stringify({
            checkedAt: Date.now(),
            updateAvailable: false,
            release: null,
            error: message,
            currentVersion: ANDROID_BUILD_VERSION,
          })
        );
      }
    };

    void autoCheckUpdates();
  }, [ANDROID_BUILD_VERSION]);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 overflow-hidden">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        hasUpdateBadge={updateAvailable}
        appVersionLabel={ANDROID_BUILD_VERSION}
      />
      
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between shadow-md z-30">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight">E <span className="text-indigo-400">iskolčenje</span></h1>
            <div className="bg-indigo-600 p-1.5 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <AppLogo className="text-white w-4 h-4" />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50 relative">
          <div className="max-w-6xl mx-auto p-4 md:p-8">
            {activeTab === 'job' && (
              <JobTab
                jobs={jobs}
                currentJobId={currentJobId}
                onCreateJob={handleCreateJob}
                onLoadJob={handleLoadJob}
                onDeleteJob={handleDeleteJob}
              />
            )}
            {activeTab === 'input' && (
              <InputDataTab 
                fileData={fileData} 
                setFileData={setFileData}
                fileName={fileName}
                setFileName={setFileName}
                mapping={mapping}
                setMapping={setMapping}
                setPoints={setPoints}
                pointsCount={points.length}
                uploadTitle="Ulazni podaci"
                uploadInputId="file-upload-input"
                dxfDrawing={dxfDrawing}
                setDxfDrawing={setDxfDrawing}
              />
            )}
            {activeTab === 'base' && (
              <InputDataTab
                fileData={baseFileData}
                setFileData={setBaseFileData}
                fileName={baseFileName}
                setFileName={setBaseFileName}
                mapping={baseMapping}
                setMapping={setBaseMapping}
                setPoints={setBasePoints}
                pointsCount={basePoints.length}
                uploadTitle="Osnova"
                uploadInputId="file-upload-base"
              />
            )}
            {activeTab === 'station' && (
              <StationTab 
                station={station} 
                setStation={setStation} 
                basePoints={basePoints}
                onCalculate={(angle, dist) => {
                  setDirUgaoSO(angle);
                  setDistSO(dist);
                }}
              />
            )}
            {activeTab === 'angles' && (
              <AnglesTab 
                station={station} 
                dirUgaoSO={dirUgaoSO} 
                distSO={distSO} 
                directionsToPoints={directionsToPoints}
              />
            )}
            {activeTab === 'elements' && (
              <ElementsTab 
                station={station}
                dirUgaoSO={dirUgaoSO}
                directionsToPoints={directionsToPoints}
              />
            )}
            {activeTab === 'sketch' && (
              <SketchTab 
                points={points} 
                basePoints={basePoints}
                station={station} 
                orthoPhoto={orthoPhoto}
                orthoPhotoFile={orthoPhotoFile}
                orthoWorldFile={orthoWorldFile}
                tileSource={tileSource}
                tileFiles={tileFiles}
                mbtilesSource={mbtilesSource}
                getMbtilesTile={getMbtilesTile}
                showOrthoPhoto={showOrthoPhoto}
                setShowOrthoPhoto={setShowOrthoPhoto}
                dxfDrawing={dxfDrawing}
              />
            )}
            {activeTab === 'export' && (
              <ExportTab 
                station={station}
                dirUgaoSO={dirUgaoSO}
                directionsToPoints={directionsToPoints}
                points={points}
              />
            )}
            {activeTab === 'updates' && (
              <UpdatesTab
                initialCurrentVersion={ANDROID_BUILD_VERSION}
                initialRelease={updateRelease}
                initialError={updateError}
                onUpdateStatusChange={({ currentVersion, release, updateAvailable: hasUpdate, checkedAt, error }) => {
                  setUpdateRelease(release);
                  setUpdateAvailable(hasUpdate);
                  setUpdateError(error);
                  localStorage.setItem(
                    UPDATE_CHECK_STORAGE_KEY,
                    JSON.stringify({
                      checkedAt,
                      updateAvailable: hasUpdate,
                      release,
                      error,
                      currentVersion,
                    })
                  );
                }}
              />
            )}
            {activeTab === 'about' && <AboutTab />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
