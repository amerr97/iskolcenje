
import React from 'react';
import { 
  FileText, 
  Database,
  Briefcase,
  MapPin, 
  DraftingCompass, 
  List, 
  Map as MapIcon, 
  Download, 
  RefreshCw,
  Info,
  X
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  hasUpdateBadge?: boolean;
  appVersionLabel?: string;
}

// App Icon: Stylized bold letter "E" with grid lines and glow
const AppLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <filter id="glow-sidebar" x="-20%" y="-20%" width="140%" height="140%">
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
      filter="url(#glow-sidebar)"
    />
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  onClose,
  hasUpdateBadge = false,
  appVersionLabel = 'Web verzija',
}) => {
  const menuItems = [
    { id: 'job', label: 'Posao', icon: Briefcase },
    { id: 'input', label: 'Ulazni podaci', icon: FileText },
    { id: 'base', label: 'Osnova', icon: Database },
    { id: 'station', label: 'Stanica-Orijentacija', icon: MapPin },
    { id: 'angles', label: 'Direkcioni uglovi', icon: DraftingCompass },
    { id: 'elements', label: 'Elementi iskolčenja', icon: List },
    { id: 'sketch', label: 'Skica', icon: MapIcon },
    { id: 'export', label: 'Izvezi', icon: Download },
   // { id: 'updates', label: 'Provjeri ažuriranja', icon: RefreshCw },
    { id: 'about', label: 'O aplikaciji', icon: Info },
  ];

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      <aside className={`
        fixed inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 z-50 transition-transform duration-300 ease-in-out md:translate-x-0 md:static shrink-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20 flex items-center justify-center">
              <AppLogo className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              <span className="text-white font-bold">E</span> <span className="text-indigo-400">iskolčenje</span>
            </h1>
          </div>
          <button onClick={onClose} className="md:hidden p-1.5 hover:bg-slate-800 rounded-lg text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                activeTab === item.id 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon className={`w-5 h-5 transition-transform ${
                item.id === 'angles' ? 'rotate-90' : ''
              } ${activeTab === item.id ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'}`} />
              <span className="font-medium text-sm lg:text-base flex items-center gap-2">
                {item.label}
                {item.id === 'updates' && hasUpdateBadge && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold leading-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    UPDATE
                  </span>
                )}
              </span>
            </button>
          ))}
        </nav>

        <div className="p-4 bg-slate-900/50">
          <p className="text-[10px] text-slate-500 text-center font-medium uppercase tracking-widest italic opacity-50">{`v${appVersionLabel}`}</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
