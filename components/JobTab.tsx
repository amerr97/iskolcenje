import React, { useState } from 'react';
import { Briefcase, Plus, Trash2, Clock3 } from 'lucide-react';
import { JobData } from '../types';

interface JobTabProps {
  jobs: JobData[];
  currentJobId: string | null;
  onCreateJob: (name: string) => void;
  onLoadJob: (id: string) => void;
  onDeleteJob: (id: string) => void;
}

const formatDate = (value: number): string => {
  if (!value) return '';
  return new Intl.DateTimeFormat('bs-BA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const JobTab: React.FC<JobTabProps> = ({
  jobs,
  currentJobId,
  onCreateJob,
  onLoadJob,
  onDeleteJob,
}) => {
  const [jobName, setJobName] = useState('');

  const handleCreate = () => {
    const name = jobName.trim();
    if (!name) {
      alert('Unesite ime posla.');
      return;
    }
    onCreateJob(name);
    setJobName('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
          <Briefcase className="text-indigo-600 w-6 h-6" /> Posao
        </h2>
        <p className="text-slate-500 text-sm mb-6">
          Kreirajte novi posao ili ucitajte postojeci. Aktivni posao se automatski cuva dok radite.
        </p>

        <div className="grid md:grid-cols-[1fr_auto] gap-3 max-w-2xl">
          <input
            type="text"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            placeholder="Ime posla"
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900"
          />
          <button
            onClick={handleCreate}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-xl transition-all shadow-lg shadow-indigo-200 active:scale-95"
          >
            <Plus className="w-5 h-5" /> Novi posao
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Postojeci poslovi</h3>
          <span className="text-xs font-semibold text-slate-400">{jobs.length}</span>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            Nema sacuvanih poslova.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {jobs.map((job) => {
              const active = job.id === currentJobId;
              return (
                <div
                  key={job.id}
                  className={`flex items-center gap-3 ${
                    active ? 'bg-indigo-50/70' : 'bg-white'
                  }`}
                >
                  <button
                    onClick={() => onLoadJob(job.id)}
                    className="min-w-0 flex-1 text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800 truncate">{job.name}</h4>
                      {active && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                          Aktivno
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Clock3 className="w-3.5 h-3.5" />
                      <span>Zadnja izmjena: {formatDate(job.updatedAt)}</span>
                    </div>
                  </button>
                  <div className="pr-3 shrink-0">
                    <button
                      onClick={() => onDeleteJob(job.id)}
                      className="inline-flex items-center justify-center p-2.5 rounded-xl text-red-600 hover:bg-red-50 transition-colors"
                      title="Obrisi posao"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default JobTab;
