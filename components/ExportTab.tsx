
import React from 'react';
import { DirectionData, PointData, StationData } from '../types';
import { formatDMS, radiansToDMS, saveBlobWithFilePicker } from '../utils';
import { Download, FileText, FileDown } from 'lucide-react';
import html2pdf from 'html2pdf.js';

interface ExportTabProps {
  station: StationData;
  dirUgaoSO: number | null;
  directionsToPoints: DirectionData[];
  points: PointData[];
}

type DxfPoint = {
  label: string;
  y: number;
  x: number;
  z?: number;
};

const sanitizeDxfText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();

const dxfPair = (code: number, value: string | number): string => `${code}\r\n${value}\r\n`;

const formatDxfNumber = (value: number): string => Number.isFinite(value) ? Number(value.toFixed(6)).toString() : '0';

const DXF_LAYERS = {
  points: 'tacke',
  lines: 'slinije',
  labels: 'brojevi_tacaka',
};

const buildDxf = (points: PointData[], station: StationData): string => {
  const ya = parseFloat(station.ya);
  const xa = parseFloat(station.xa);
  const yb = parseFloat(station.yb);
  const xb = parseFloat(station.xb);

  const dxfPoints: DxfPoint[] = points.map((p) => ({
    label: p.pointNumber,
    y: p.y,
    x: p.x,
    z: p.z,
  }));
  const stationPoint: DxfPoint | null = !isNaN(ya) && !isNaN(xa)
    ? { label: station.stationNumber || 'S', y: ya, x: xa, z: 0 }
    : null;
  const orientationPoint: DxfPoint | null = !isNaN(yb) && !isNaN(xb)
    ? { label: station.orientationNumber || 'O', y: yb, x: xb, z: 0 }
    : null;
  const allDrawingPoints = [
    ...dxfPoints,
    ...(stationPoint ? [stationPoint] : []),
    ...(orientationPoint ? [orientationPoint] : []),
  ];

  const allY = allDrawingPoints.map((p) => p.y).filter((v) => !isNaN(v));
  const allX = allDrawingPoints.map((p) => p.x).filter((v) => !isNaN(v));
  const rangeY = allY.length ? Math.max(...allY) - Math.min(...allY) : 1;
  const rangeX = allX.length ? Math.max(...allX) - Math.min(...allX) : 1;
  const drawingSize = Math.max(rangeY, rangeX, 1);
  const textHeight = drawingSize * 0.012;
  const textOffset = drawingSize * 0.008;

  let dxf = '';
  dxf += dxfPair(0, 'SECTION');
  dxf += dxfPair(2, 'HEADER');
  dxf += dxfPair(0, 'ENDSEC');

  dxf += dxfPair(0, 'SECTION');
  dxf += dxfPair(2, 'TABLES');
  dxf += dxfPair(0, 'TABLE');
  dxf += dxfPair(2, 'LAYER');
  dxf += dxfPair(70, 4);
  [
    { name: '0', color: 7 },
    { name: DXF_LAYERS.points, color: 7 },
    { name: DXF_LAYERS.lines, color: 1 },
    { name: DXF_LAYERS.labels, color: 7 },
  ].forEach((layer) => {
    dxf += dxfPair(0, 'LAYER');
    dxf += dxfPair(2, layer.name);
    dxf += dxfPair(70, 0);
    dxf += dxfPair(62, layer.color);
    dxf += dxfPair(6, 'CONTINUOUS');
  });
  dxf += dxfPair(0, 'ENDTAB');
  dxf += dxfPair(0, 'ENDSEC');

  dxf += dxfPair(0, 'SECTION');
  dxf += dxfPair(2, 'ENTITIES');

  if (!isNaN(ya) && !isNaN(xa) && !isNaN(yb) && !isNaN(xb)) {
    dxf += dxfPair(0, 'LINE');
    dxf += dxfPair(8, DXF_LAYERS.lines);
    dxf += dxfPair(10, formatDxfNumber(ya));
    dxf += dxfPair(20, formatDxfNumber(xa));
    dxf += dxfPair(30, 0);
    dxf += dxfPair(11, formatDxfNumber(yb));
    dxf += dxfPair(21, formatDxfNumber(xb));
    dxf += dxfPair(31, 0);
  }

  const addPoint = (p: DxfPoint) => {
    dxf += dxfPair(0, 'POINT');
    dxf += dxfPair(8, DXF_LAYERS.points);
    dxf += dxfPair(10, formatDxfNumber(p.y));
    dxf += dxfPair(20, formatDxfNumber(p.x));
    dxf += dxfPair(30, formatDxfNumber(p.z ?? 0));
  };

  const addText = (p: DxfPoint, offsetY: number, offsetX: number) => {
    dxf += dxfPair(0, 'TEXT');
    dxf += dxfPair(8, DXF_LAYERS.labels);
    dxf += dxfPair(10, formatDxfNumber(p.y + offsetY));
    dxf += dxfPair(20, formatDxfNumber(p.x + offsetX));
    dxf += dxfPair(30, formatDxfNumber(p.z ?? 0));
    dxf += dxfPair(40, formatDxfNumber(textHeight));
    dxf += dxfPair(1, sanitizeDxfText(p.label));
    dxf += dxfPair(7, 'STANDARD');
    dxf += dxfPair(50, 0);
  };

  dxfPoints.forEach((p) => {
    addPoint(p);
    addText(p, textOffset, -textOffset * 0.5);
  });
  if (orientationPoint) {
    addPoint(orientationPoint);
    addText(orientationPoint, textOffset, -textOffset * 0.5);
  }
  if (stationPoint) {
    addPoint(stationPoint);
    addText(stationPoint, textOffset, -textOffset * 0.5);
  }

  dxf += dxfPair(0, 'ENDSEC');
  dxf += dxfPair(0, 'EOF');
  return dxf;
};

const getStakeoutRows = (directionsToPoints: DirectionData[], dirUgaoSO: number) => {
  return directionsToPoints
    .map((direction) => {
      let hzRad = direction.directionAngle - dirUgaoSO;
      if (hzRad < 0) hzRad += 2 * Math.PI;

      let hz2Rad = hzRad + Math.PI;
      if (hz2Rad >= 2 * Math.PI) hz2Rad -= 2 * Math.PI;

      return {
        ...direction,
        hzRad,
        hz2Rad,
      };
    })
    .sort((a, b) => a.hzRad - b.hzRad);
};

const ExportTab: React.FC<ExportTabProps> = ({ station, dirUgaoSO, directionsToPoints, points }) => {
  const exportCSV = async () => {
    if (dirUgaoSO === null || directionsToPoints.length === 0) return;

    let csvContent = `Iskolcenje ${station.stationNumber || 'A'} Orijentacija ${station.orientationNumber || 'B'}\n`;
    csvContent += `Tacka,Hz (I polugirus),Hz-II (II polug.),Dužina [m]\n`;

    getStakeoutRows(directionsToPoints, dirUgaoSO).forEach(d => {
      csvContent += `${d.pointNumber},"${formatDMS(radiansToDMS(d.hzRad))}","${formatDMS(radiansToDMS(d.hz2Rad))}",${d.distance.toFixed(3)}\n`;
    });

    const defaultName = `elementi_iskolcenja_${station.stationNumber || 'izvoz'}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });

    try {
      await saveBlobWithFilePicker({
        defaultName,
        mimeType: 'text/csv',
        blob,
      });
    } catch (error) {
      console.error('Greška prilikom izvoza CSV:', error);
      alert('Došlo je do greške prilikom čuvanja CSV fajla.');
    }
  };

  const exportPDF = async () => {
    if (dirUgaoSO === null || directionsToPoints.length === 0) return;

    // Generisanje HTML sadržaja za PDF
    let htmlContent = `
      <h1 style="text-align: center;">Iskolcenje ${station.stationNumber || 'A'} Orijentacija ${station.orientationNumber || 'B'}</h1>
      <table style="width:100%; border-collapse: collapse; margin-top: 20px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Tačka</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Hz-I</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Hz-II</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Dužina [m]</th>
          </tr>
        </thead>
        <tbody>
    `;

    getStakeoutRows(directionsToPoints, dirUgaoSO).forEach(d => {
      htmlContent += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${d.pointNumber}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${formatDMS(radiansToDMS(d.hzRad))}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${formatDMS(radiansToDMS(d.hz2Rad))}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${d.distance.toFixed(3)}</td>
        </tr>
      `;
    });

    htmlContent += `
        </tbody>
      </table>
    `;

    const defaultName = `elementi_iskolcenja_${station.stationNumber || 'izvoz'}.pdf`;

    try {
      const opt = {
        margin: 1,
        filename: defaultName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };

      const pdfBlob = await new Promise<Blob>((resolve, reject) => {
        html2pdf()
          .from(htmlContent)
          .set(opt)
          .outputPdf('blob')
          .then((blob: Blob) => resolve(blob))
          .catch(reject);
      });

      await saveBlobWithFilePicker({
        defaultName,
        mimeType: 'application/pdf',
        blob: pdfBlob,
      });
    } catch (error) {
      console.error('Greška prilikom izvoza PDF:', error);
      alert('Došlo je do greške prilikom čuvanja PDF fajla.');
    }
  };

  const exportDXF = async () => {
    if (points.length === 0) return;

    const defaultName = `skica_iskolcenja_${station.stationNumber || 'izvoz'}.dxf`;
    const dxfContent = buildDxf(points, station);
    const blob = new Blob([dxfContent], { type: 'application/dxf;charset=us-ascii' });

    try {
      await saveBlobWithFilePicker({
        defaultName,
        mimeType: 'application/dxf',
        blob,
      });
    } catch (error) {
      console.error('Greška prilikom izvoza DXF:', error);
      alert('Došlo je do greške prilikom čuvanja DXF fajla.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
          <Download className="text-indigo-600 w-6 h-6" /> Izvoz podataka
        </h2>
        <p className="text-slate-500 mb-2">Sačuvajte proračune za dalju obradu u CAD alatima ili štampu.</p>
        <p className="text-slate-500 text-sm mb-8">
          Pritiskom na izvoz otvara se dijalog za izbor <b>mjesta</b> i <b>naziva fajla</b> (na Android/iOS sistemski „Sačuvaj kao“). U pregledaču: ako je podržano, koristi se dijalog čuvanja; inače unos naziva i preuzimanje fajla.
        </p>

        <div className="max-w-md">
          <button 
            onClick={exportCSV}
            disabled={!dirUgaoSO}
            className="w-full flex items-center gap-4 p-6 bg-white border border-slate-200 rounded-2xl hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-14 h-14 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FileText className="w-7 h-7" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-800">CSV Tabela</h3>
              <p className="text-sm text-slate-500">Izvezi elemente iskolčenja u .csv formatu</p>
            </div>
          </button>
          <button 
            onClick={exportPDF}
            disabled={!dirUgaoSO}
            className="w-full flex items-center gap-4 p-6 bg-white border border-slate-200 rounded-2xl hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            <div className="w-14 h-14 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FileDown className="w-7 h-7" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-800">PDF Tabela</h3>
              <p className="text-sm text-slate-500">Izvezi elemente iskolčenja u .pdf formatu</p>
            </div>
          </button>
          <button
            onClick={exportDXF}
            disabled={points.length === 0}
            className="w-full flex items-center gap-4 p-6 bg-white border border-slate-200 rounded-2xl hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            <div className="w-14 h-14 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FileDown className="w-7 h-7" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-800">DXF Skica</h3>
              <p className="text-sm text-slate-500">Izvezi tacke, linije i brojeve tacaka u .dxf formatu</p>
            </div>
          </button>
        </div>
        
        {!dirUgaoSO && (
          <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm font-medium">
            Izvoz će postati dostupan nakon što izvršite proračun stanice i orijentacije.
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportTab;
