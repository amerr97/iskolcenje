
import React from 'react';
import { DirectionData, StationData } from '../types';
import { formatDMS, radiansToDMS } from '../utils';
import { List } from 'lucide-react';

interface ElementsTabProps {
  station: StationData;
  dirUgaoSO: number | null;
  directionsToPoints: DirectionData[];
}

const ElementsTab: React.FC<ElementsTabProps> = ({ station, dirUgaoSO, directionsToPoints }) => {
  const isReady = dirUgaoSO !== null && directionsToPoints.length > 0;
  const sortedElements = React.useMemo(() => {
    if (dirUgaoSO === null) return [];
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
  }, [dirUgaoSO, directionsToPoints]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Main Title Bar */}
        <div className="p-4 md:p-6 bg-slate-900 text-white">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <List className="text-indigo-400 w-5 h-5" /> 4. Elementi iskolčenja
            </h2>
            <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 w-full sm:w-auto shadow-inner">
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest leading-none mb-1">Trenutni proračun</p>
              <p className="text-xs md:text-sm font-bold truncate">
                Stanica: <span className="text-white">{station.stationNumber || '?'}</span> 
                <span className="mx-2 opacity-30">|</span> 
                Orijentacija: <span className="text-white">{station.orientationNumber || '?'}</span>
              </p>
            </div>
          </div>
        </div>

        {!isReady ? (
          <div className="p-12 text-center text-slate-400 bg-slate-50 border-t border-slate-100 italic">
            Potrebno je učitati tačke i sračunati bazni direkcioni ugao u prethodnim koracima.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-full table-auto">
              <thead>
                <tr className="bg-slate-100 text-[10px] md:text-xs font-bold text-slate-600 tracking-wider border-b border-slate-200">
                  <th className="p-2 md:p-4 w-16 md:w-24 whitespace-nowrap">Tačka</th>
                  <th className="p-2 md:p-4 whitespace-nowrap text-center">Hz-I</th>
                  <th className="p-2 md:p-4 whitespace-nowrap text-center">Hz-II</th>
                  <th className="p-2 md:p-4 whitespace-nowrap text-right">Dužina [m]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {sortedElements.map((d, i) => {
                  return (
                    <tr 
                      key={`${d.pointNumber}-${i}`}
                      className={`transition-colors text-[11px] md:text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-slate-200/40'} hover:bg-indigo-100/50`}
                    >
                      <td className="p-2 md:p-4 font-bold text-slate-900 border-r border-slate-200/50 whitespace-nowrap">
                        {d.pointNumber}
                      </td>
                      <td className="p-2 md:p-4 font-mono font-medium text-indigo-700 whitespace-nowrap text-center tracking-tighter sm:tracking-normal">
                        {formatDMS(radiansToDMS(d.hzRad))}
                      </td>
                      <td className="p-2 md:p-4 font-mono text-slate-600 whitespace-nowrap text-center tracking-tighter sm:tracking-normal">
                        {formatDMS(radiansToDMS(d.hz2Rad))}
                      </td>
                      <td className="p-2 md:p-4 font-mono font-bold text-slate-800 text-right whitespace-nowrap">
                        {d.distance.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px] md:text-[11px] text-slate-400 font-medium">
          <div className="flex items-center gap-4">
             <span className="bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm text-slate-500">Hz = v<sub>SP</sub> - v<sub>SO</sub></span>
             <span className="italic hidden sm:inline">Format: Stepen° Minuta' Sekunda''</span>
          </div>
          <span className="font-bold text-slate-300 tracking-widest uppercase">E iskolčenje</span>
        </div>
      </div>
    </div>
  );
};

export default ElementsTab;
