
import React, { useEffect, useRef, useState } from 'react';
import { PointData, StationData } from '../types';
import { MapPin, Calculator, ChevronDown } from 'lucide-react';
import { calculateDirection } from '../utils';

const coordsMatchBase = (p: PointData, ya: string, xa: string): boolean => {
  const ey = parseFloat(ya);
  const ex = parseFloat(xa);
  if (Number.isNaN(ey) || Number.isNaN(ex)) return false;
  return Math.abs(p.y - ey) < 1e-6 && Math.abs(p.x - ex) < 1e-6;
};

interface StationTabProps {
  station: StationData;
  setStation: (s: StationData) => void;
  basePoints: PointData[];
  onCalculate: (angle: number, distance: number) => void;
}

const StationTab: React.FC<StationTabProps> = ({ station, setStation, basePoints, onCalculate }) => {
  const [openBasePicker, setOpenBasePicker] = useState<'station' | 'orientation' | null>(null);
  const stationPickerRef = useRef<HTMLDivElement>(null);
  const orientPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (stationPickerRef.current?.contains(t)) return;
      if (orientPickerRef.current?.contains(t)) return;
      setOpenBasePicker(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  // Refs for sequential focus
  const stationNumRef = useRef<HTMLInputElement>(null);
  const yaRef = useRef<HTMLInputElement>(null);
  const xaRef = useRef<HTMLInputElement>(null);
  const orientNumRef = useRef<HTMLInputElement>(null);
  const ybRef = useRef<HTMLInputElement>(null);
  const xbRef = useRef<HTMLInputElement>(null);

  const inputSequence = [
    stationNumRef,
    yaRef,
    xaRef,
    orientNumRef,
    ybRef,
    xbRef
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStation({ ...station, [e.target.name]: e.target.value });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextRef = inputSequence[currentIndex + 1];
      if (nextRef && nextRef.current) {
        nextRef.current.focus();
      } else {
        // Last field, trigger calculation
        handleCalculate();
      }
    }
  };

  const handleCalculate = () => {
    const ya = parseFloat(station.ya);
    const xa = parseFloat(station.xa);
    const yb = parseFloat(station.yb);
    const xb = parseFloat(station.xb);

    if (isNaN(ya) || isNaN(xa) || isNaN(yb) || isNaN(xb)) {
      alert("Unesite validne numeričke koordinate.");
      return;
    }

    const { angle, distance } = calculateDirection(ya, xa, yb, xb);
    onCalculate(angle, distance);
  };

  const applyStationFromBase = (point: PointData) => {
    setStation({
      ...station,
      stationNumber: point.pointNumber,
      ya: String(point.y),
      xa: String(point.x)
    });
    setOpenBasePicker(null);
  };

  const clearStationFromBase = () => {
    setStation({
      ...station,
      stationNumber: '',
      ya: '',
      xa: ''
    });
    setOpenBasePicker(null);
  };

  const applyOrientationFromBase = (point: PointData) => {
    setStation({
      ...station,
      orientationNumber: point.pointNumber,
      yb: String(point.y),
      xb: String(point.x)
    });
    setOpenBasePicker(null);
  };

  const clearOrientationFromBase = () => {
    setStation({
      ...station,
      orientationNumber: '',
      yb: '',
      xb: ''
    });
    setOpenBasePicker(null);
  };

  const stationMatchesBase = (p: PointData) =>
    p.pointNumber === station.stationNumber && coordsMatchBase(p, station.ya, station.xa);
  const orientMatchesBase = (p: PointData) =>
    p.pointNumber === station.orientationNumber && coordsMatchBase(p, station.yb, station.xb);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <MapPin className="text-indigo-400 w-5 h-5" /> 2. Stanica i Orijentacija
          </h2>
          <span className="hidden sm:inline text-xs text-slate-400">Pritisnite Enter za prelazak na sledeće polje</span>
        </div>

        <div className="p-4 md:p-6 grid md:grid-cols-2 gap-6 md:gap-10">
          {/* Station Card */}
          <div className="bg-indigo-600 rounded-2xl p-5 md:p-6 text-white shadow-lg shadow-indigo-200 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold text-lg shadow-inner">A</div>
              <div>
                <h3 className="font-bold text-lg">Stajalište (Stanica)</h3>
                <p className="text-indigo-200 text-xs">Koordinate stajališta</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-indigo-100 uppercase mb-1.5 block tracking-widest">Broj tačke</label>
                <div className="flex gap-2 items-start">
                  <input 
                    ref={stationNumRef}
                    type="text" name="stationNumber" value={station.stationNumber} 
                    onChange={handleChange}
                    onKeyDown={(e) => handleKeyDown(e, 0)}
                    placeholder="npr. S1"
                    className="min-w-0 flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-xl focus:bg-white/20 focus:ring-2 focus:ring-white/40 outline-none transition-all placeholder:text-white/30 text-white font-medium"
                  />
                  <div className="relative shrink-0" ref={stationPickerRef}>
                    <button
                      type="button"
                      disabled={basePoints.length === 0}
                      title={basePoints.length === 0 ? 'Učitajte tačke u tabu Osnova' : 'Izaberite tačku iz osnove'}
                      onClick={() => setOpenBasePicker(o => (o === 'station' ? null : 'station'))}
                      className="flex items-center gap-1 px-2.5 py-2 bg-white/15 border border-white/25 rounded-xl text-[11px] font-bold uppercase tracking-wide text-white hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Osnova
                      <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openBasePicker === 'station' ? 'rotate-180' : ''}`} />
                    </button>
                    {openBasePicker === 'station' && (
                      <div className="absolute right-0 z-50 mt-1 w-[min(100vw-2rem,18rem)] max-h-56 overflow-y-auto rounded-xl border border-white/20 bg-slate-900 shadow-xl py-1 text-left">
                        {basePoints.map((p) => (
                          <label
                            key={`st-${p.pointNumber}-${p.y}-${p.x}`}
                            className="flex cursor-pointer items-start gap-2 px-3 py-2 text-xs hover:bg-white/10"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-indigo-400"
                              checked={stationMatchesBase(p)}
                              onChange={(e) => {
                                if (e.target.checked) applyStationFromBase(p);
                                else if (stationMatchesBase(p)) clearStationFromBase();
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-semibold text-white block">{p.pointNumber}</span>
                              <span className="font-mono text-[10px] text-indigo-200">
                                Y {p.y} · X {p.x}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-indigo-100 uppercase mb-1.5 block tracking-widest">Y</label>
                <input 
                  ref={yaRef}
                  type="text" name="ya" value={station.ya} 
                  onChange={handleChange}
                  onKeyDown={(e) => handleKeyDown(e, 1)}
                  placeholder="0.000"
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl font-mono focus:bg-white/20 focus:ring-2 focus:ring-white/40 outline-none transition-all placeholder:text-white/30 text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-indigo-100 uppercase mb-1.5 block tracking-widest">X</label>
                <input 
                  ref={xaRef}
                  type="text" name="xa" value={station.xa} 
                  onChange={handleChange}
                  onKeyDown={(e) => handleKeyDown(e, 2)}
                  placeholder="0.000"
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl font-mono focus:bg-white/20 focus:ring-2 focus:ring-white/40 outline-none transition-all placeholder:text-white/30 text-white"
                />
              </div>
            </div>
          </div>

          {/* Orientation Card */}
          <div className="bg-slate-700 rounded-2xl p-5 md:p-6 text-white shadow-lg shadow-slate-200 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold text-lg shadow-inner">B</div>
              <div>
                <h3 className="font-bold text-lg">Orijentaciona tačka</h3>
                <p className="text-slate-300 text-xs">Koordinate orijentacione tačke</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-slate-300 uppercase mb-1.5 block tracking-widest">Broj tačke</label>
                <div className="flex gap-2 items-start">
                  <input 
                    ref={orientNumRef}
                    type="text" name="orientationNumber" value={station.orientationNumber} 
                    onChange={handleChange}
                    onKeyDown={(e) => handleKeyDown(e, 3)}
                    placeholder="npr. O1"
                    className="min-w-0 flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-xl focus:bg-white/20 focus:ring-2 focus:ring-white/40 outline-none transition-all placeholder:text-white/30 text-white font-medium"
                  />
                  <div className="relative shrink-0" ref={orientPickerRef}>
                    <button
                      type="button"
                      disabled={basePoints.length === 0}
                      title={basePoints.length === 0 ? 'Učitajte tačke u tabu Osnova' : 'Izaberite tačku iz osnove'}
                      onClick={() => setOpenBasePicker(o => (o === 'orientation' ? null : 'orientation'))}
                      className="flex items-center gap-1 px-2.5 py-2 bg-white/10 border border-white/20 rounded-xl text-[11px] font-bold uppercase tracking-wide text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Osnova
                      <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openBasePicker === 'orientation' ? 'rotate-180' : ''}`} />
                    </button>
                    {openBasePicker === 'orientation' && (
                      <div className="absolute right-0 z-50 mt-1 w-[min(100vw-2rem,18rem)] max-h-56 overflow-y-auto rounded-xl border border-white/20 bg-slate-800 shadow-xl py-1 text-left">
                        {basePoints.map((p) => (
                          <label
                            key={`or-${p.pointNumber}-${p.y}-${p.x}`}
                            className="flex cursor-pointer items-start gap-2 px-3 py-2 text-xs hover:bg-white/10"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-slate-300"
                              checked={orientMatchesBase(p)}
                              onChange={(e) => {
                                if (e.target.checked) applyOrientationFromBase(p);
                                else if (orientMatchesBase(p)) clearOrientationFromBase();
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-semibold text-white block">{p.pointNumber}</span>
                              <span className="font-mono text-[10px] text-slate-300">
                                Y {p.y} · X {p.x}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase mb-1.5 block tracking-widest">Y</label>
                <input 
                  ref={ybRef}
                  type="text" name="yb" value={station.yb} 
                  onChange={handleChange}
                  onKeyDown={(e) => handleKeyDown(e, 4)}
                  placeholder="0.000"
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl font-mono focus:bg-white/20 focus:ring-2 focus:ring-white/40 outline-none transition-all placeholder:text-white/30 text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase mb-1.5 block tracking-widest">X</label>
                <input 
                  ref={xbRef}
                  type="text" name="xb" value={station.xb} 
                  onChange={handleChange}
                  onKeyDown={(e) => handleKeyDown(e, 5)}
                  placeholder="0.000"
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl font-mono focus:bg-white/20 focus:ring-2 focus:ring-white/40 outline-none transition-all placeholder:text-white/30 text-white"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 bg-slate-100/30 border-t border-slate-200 flex justify-center items-center">
          <button 
            onClick={handleCalculate}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-20 rounded-xl flex items-center justify-center gap-2 shadow-xl shadow-indigo-200 transition-all active:scale-95 text-xl uppercase tracking-wider"
          >
            <Calculator className="w-6 h-6" /> Sračunaj
          </button>
        </div>
      </div>
    </div>
  );
};

export default StationTab;
