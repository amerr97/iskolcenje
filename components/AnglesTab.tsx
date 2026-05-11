
import React from 'react';
import { DirectionData, StationData } from '../types';
import { formatDMS, radiansToDMS } from '../utils';
import { Compass, Hash, MoveHorizontal, RotateCw } from 'lucide-react';

interface AnglesTabProps {
  station: StationData;
  dirUgaoSO: number | null;
  distSO: number | null;
  directionsToPoints: DirectionData[];
}

const AnglesTab: React.FC<AnglesTabProps> = ({ station, dirUgaoSO, distSO, directionsToPoints }) => {
  const isReady = dirUgaoSO !== null && distSO !== null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Compass className="text-indigo-600 w-5 h-5" /> 3. Direkcioni uglovi
        </h2>

        {!isReady ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500">
            <p className="font-medium">Nema izračunatih podataka.</p>
            <p className="text-sm">Prvo unesite i sračunajte koordinate u tabu 'Stanica-Orijentacija'.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-indigo-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest mb-1">Bazni Direkcioni Ugao (v<sub>AB</sub>)</p>
                  <p className="text-3xl font-bold font-mono tracking-tight">
                    {formatDMS(radiansToDMS(dirUgaoSO!))}
                  </p>
                  <p className="mt-2 text-indigo-200 text-sm flex items-center gap-1">
                    Sa: <span className="font-bold text-white">{station.stationNumber || 'A'}</span> na 
                    <span className="font-bold text-white">{station.orientationNumber || 'B'}</span>
                  </p>
                </div>
                <div className="h-px md:h-12 md:w-px bg-white/20"></div>
                <div>
                  <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest mb-1">Udaljenost (d<sub>AB</sub>)</p>
                  <p className="text-3xl font-bold font-mono tracking-tight">
                    {distSO?.toFixed(3)} <span className="text-lg font-medium opacity-70">m</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <RotateCw className="w-4 h-4 text-indigo-500" /> Uglovi na ostale tačke
                </h3>
                <span className="bg-white border border-slate-300 rounded px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  {directionsToPoints.length} Tačaka
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 font-semibold"><div className="flex items-center gap-1"><Hash className="w-3 h-3"/> Tačka</div></th>
                      <th className="px-4 py-3 font-semibold"><div className="flex items-center gap-1"><RotateCw className="w-3 h-3"/> Direkcioni Ugao</div></th>
                      <th className="px-4 py-3 font-semibold"><div className="flex items-center gap-1"><MoveHorizontal className="w-3 h-3"/> Dužina [m]</div></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {directionsToPoints.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-700">{d.pointNumber}</td>
                        <td className="px-4 py-3 font-mono text-indigo-600 font-medium">{formatDMS(radiansToDMS(d.directionAngle))}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{d.distance.toFixed(3)}</td>
                      </tr>
                    ))}
                    {directionsToPoints.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-400 italic">
                          Učitajte tačke u tabu 'Ulazni podaci' za prikaz liste.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnglesTab;
