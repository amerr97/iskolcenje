
import React from 'react';
import { DxfDrawingData, FieldType, PointData } from '../types';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, FileCode2, Trash2 } from 'lucide-react';
import { decodeFileText, guessDelimiter } from '../utils';
import { parseDxfDrawing } from '../dxf';

interface InputDataTabProps {
  fileData: string[][];
  setFileData: (data: string[][]) => void;
  fileName: string;
  setFileName: (name: string) => void;
  mapping: FieldType[];
  setMapping: (mapping: FieldType[]) => void;
  setPoints: (points: PointData[]) => void;
  pointsCount: number;
  uploadTitle?: string;
  uploadInputId?: string;
  dxfDrawing?: DxfDrawingData | null;
  setDxfDrawing?: (drawing: DxfDrawingData | null) => void;
}

const InputDataTab: React.FC<InputDataTabProps> = ({
  fileData,
  setFileData,
  fileName,
  setFileName,
  mapping,
  setMapping,
  setPoints,
  pointsCount,
  uploadTitle = 'Ulazni podaci',
  uploadInputId = 'file-upload',
  dxfDrawing,
  setDxfDrawing
}) => {
  const [fileText, setFileText] = React.useState('');
  const [delimiter, setDelimiter] = React.useState(',');

  const parseRows = React.useCallback((text: string, selectedDelimiter: string) => {
    const splitByDelimiter = (line: string) => {
      if (selectedDelimiter === 'tab') return line.split(/\t+/);
      if (selectedDelimiter === 'space') return line.trim().split(/\s+/);
      return line.split(selectedDelimiter);
    };

    return text
      .replace(/^\uFEFF/, '')
      .split(/\r\n|\r|\n/)
      .filter(line => line.trim() !== '')
      .map(line => splitByDelimiter(line).map(cell => cell.trim()));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      const text = decodeFileText(buffer);
      setFileText(text);
      const guessed = guessDelimiter(text);
      setDelimiter(guessed);
      const rows = parseRows(text, guessed);
      setFileData(rows);
      const columnsCount = Math.max(...rows.map(row => row.length), 0);
      const defaults = [
        FieldType.POINT_NUMBER,
        FieldType.EASTING,
        FieldType.NORTHING,
        FieldType.HEIGHT
      ];
      const nextMapping: FieldType[] = [];
      for (let i = 0; i < columnsCount; i += 1) {
        nextMapping.push(mapping[i] || defaults[i] || FieldType.NONE);
      }
      setMapping(nextMapping.length > 0 ? nextMapping : [FieldType.POINT_NUMBER, FieldType.EASTING, FieldType.NORTHING]);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDxfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !setDxfDrawing) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const text = decodeFileText(buffer);
        const drawing = parseDxfDrawing(text, file.name);
        if (drawing.entities.length === 0) {
          alert('DXF je učitan, ali nisu pronađeni podržani elementi za prikaz.');
          return;
        }
        setDxfDrawing(drawing);
      } catch (error) {
        console.error('DXF nije učitan:', error);
        alert('DXF fajl nije moguće učitati.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const updateMapping = (index: number, type: FieldType) => {
    const newMapping = [...mapping];
    newMapping[index] = type;
    setMapping(newMapping);
  };

  const processData = () => {
    if (fileData.length === 0) return;

    const hasPoint = mapping.includes(FieldType.POINT_NUMBER);
    const hasE = mapping.includes(FieldType.EASTING);
    const hasN = mapping.includes(FieldType.NORTHING);

    if (!hasPoint || !hasE || !hasN) {
      alert("Morate mapirati: Broj tačke, Easting (Y) i Northing (X)!");
      return;
    }

    const newPoints: PointData[] = fileData.map(row => {
      let p: PointData = { pointNumber: '', y: 0, x: 0, z: 0 };
      mapping.forEach((type, idx) => {
        const val = row[idx];
        if (!val) return;
        if (type === FieldType.POINT_NUMBER) p.pointNumber = val;
        if (type === FieldType.EASTING) p.y = parseFloat(val) || 0;
        if (type === FieldType.NORTHING) p.x = parseFloat(val) || 0;
        if (type === FieldType.HEIGHT) p.z = parseFloat(val) || 0;
      });
      return p;
    }).filter(p => p.pointNumber !== '');

    setPoints(newPoints);
  };

  const handleDelimiterChange = (newDelimiter: string) => {
    setDelimiter(newDelimiter);
    if (!fileText) return;
    const rows = parseRows(fileText, newDelimiter);
    setFileData(rows);
    const columnsCount = Math.max(...rows.map(row => row.length), 0);
    if (columnsCount > mapping.length) {
      const defaults = [
        FieldType.POINT_NUMBER,
        FieldType.EASTING,
        FieldType.NORTHING,
        FieldType.HEIGHT
      ];
      const next = [...mapping];
      for (let i = mapping.length; i < columnsCount; i += 1) {
        next.push(defaults[i] || FieldType.NONE);
      }
      setMapping(next);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 1. File Upload Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Upload className="text-indigo-600 w-5 h-5" /> 1. {uploadTitle}
        </h2>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 mb-2 block">Odaberite .txt ili .csv fajl</span>
            <div className="relative group">
              <input 
                type="file" 
                accept=".txt,.csv" 
                onChange={handleFileUpload}
                className="hidden" 
                id={uploadInputId}
              />
              <label 
                htmlFor={uploadInputId}
                className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-slate-50 border-2 border-slate-200 border-dashed rounded-xl appearance-none cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 focus:outline-none group-hover:bg-indigo-50/50"
              >
                <FileSpreadsheet className="w-8 h-8 text-slate-400 mb-2 group-hover:text-indigo-500 transition-colors" />
                <span className="text-sm font-medium text-slate-600 text-center truncate w-full px-2">
                  {fileName || "Kliknite za odabir fajla"}
                </span>
              </label>
            </div>
          </label>
        </div>
      </div>

      {setDxfDrawing && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <FileCode2 className="text-indigo-600 w-5 h-5" /> DXF crtež
          </h2>
          <div className="grid md:grid-cols-[1fr_auto] gap-4 items-stretch">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 mb-2 block">Odaberite .dxf fajl za prikaz u skici</span>
              <div className="relative group">
                <input
                  type="file"
                  accept=".dxf"
                  onChange={handleDxfUpload}
                  className="hidden"
                  id={`${uploadInputId}-dxf`}
                />
                <label
                  htmlFor={`${uploadInputId}-dxf`}
                  className="flex flex-col items-center justify-center w-full h-28 px-4 transition bg-slate-50 border-2 border-slate-200 border-dashed rounded-xl appearance-none cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 focus:outline-none group-hover:bg-indigo-50/50"
                >
                  <FileCode2 className="w-8 h-8 text-slate-400 mb-2 group-hover:text-indigo-500 transition-colors" />
                  <span className="text-sm font-medium text-slate-600 text-center truncate w-full px-2">
                    {dxfDrawing?.name || 'Kliknite za odabir DXF fajla'}
                  </span>
                </label>
              </div>
            </label>
            {dxfDrawing && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 min-w-48 flex flex-col justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Učitan DXF</span>
                  <p className="text-sm font-bold text-slate-800 truncate">{dxfDrawing.name}</p>
                  <p className="text-xs text-slate-500">{dxfDrawing.layers.length} slojeva, {dxfDrawing.entities.length} elemenata</p>
                </div>
                <button
                  onClick={() => setDxfDrawing(null)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 active:scale-95 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Ukloni DXF
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Column Mapping Section */}
      {fileData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" /> Definisanje kolona
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-[10px] sm:text-xs text-slate-600 font-semibold">Delimiter</label>
              <select
                value={delimiter}
                onChange={(e) => handleDelimiterChange(e.target.value)}
                className="bg-white border border-slate-300 rounded-md text-[11px] font-semibold py-1 px-2 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900"
              >
                <option value=",">Zarez (,)</option>
                <option value=";">Tačka-zarez (;)</option>
                <option value="space">Razmak (space)</option>
                <option value="tab">Tab</option>
                <option value="|">Uspravna crta (|)</option>
              </select>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {mapping.map((type, idx) => (
                    <th key={idx} className="p-3 w-40">
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Kolona {idx + 1}</span>
                        <select
                          value={type}
                          onChange={(e) => updateMapping(idx, e.target.value as FieldType)}
                          className="w-full bg-white border border-slate-300 rounded-md text-[11px] font-bold py-1 px-1.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow cursor-pointer hover:border-slate-400 text-slate-900"
                        >
                          {Object.values(FieldType).map(f => (
                            <option key={f} value={f} className="text-slate-900 font-medium">{f}</option>
                          ))}
                        </select>
                      </div>
                    </th>
                  ))}
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fileData.slice(0, 5).map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50/50 transition-colors">
                    {row.slice(0, 5).map((cell, cellIndex) => (
                      <td key={cellIndex} className="p-3 text-xs font-mono text-slate-600">{cell}</td>
                    ))}
                    <td className="p-3"></td>
                  </tr>
                ))}
                {fileData.length > 5 && (
                  <tr>
                    <td colSpan={6} className="p-2 text-center text-[10px] text-slate-400 italic bg-slate-50/30">
                      Prikazano je samo prvih 5 redova...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Status and Process Button Section */}
      {fileData.length > 0 && (
        <div className="bg-slate-50 rounded-2xl p-5 md:p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Status uvoza i obrada
          </h3>
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Učitano redova</span>
              <span className="font-mono font-bold text-lg text-slate-800">{fileData.length}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Validnih tačaka</span>
              <span className="font-mono font-bold text-lg text-emerald-600">{pointsCount}</span>
            </div>
            <div className="flex items-end">
              <button
                onClick={processData}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-200 active:scale-95 uppercase tracking-wide"
              >
                Uvezi podatke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InputDataTab;
