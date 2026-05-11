import React from 'react';
import { Info, HelpCircle, User, Calendar, Layers, Calculator, FileText, MapPin, Compass, Map as MapIcon, Database } from 'lucide-react';

const AboutTab: React.FC = () => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Info className="text-indigo-600 w-6 h-6" /> O aplikaciji E iskolcenje
        </h2>

        <div className="prose prose-slate max-w-none">
          <div className="grid md:grid-cols-2 gap-10">
            <section className="space-y-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-500" /> Nacin koristenja
              </h3>

              <div className="space-y-6 text-slate-600 text-sm leading-relaxed">
                <p className="text-slate-700 font-medium italic border-l-2 border-slate-200 pl-4">
                  Aplikacija omogucava brzi proracun elemenata iskolcenja. Tacke mozete uvesti iz <code className="bg-slate-100 px-1 py-0.5 rounded">.txt</code> ili <code className="bg-slate-100 px-1 py-0.5 rounded">.csv</code> fajla.
                </p>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <p className="font-bold text-slate-800">Kreiranje posla</p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Kreiranje posla omogucava da kreirate posao, svi podaci se automatski spasavaju.
                    Podatke je moguce naknadno ucitati, pregledati ili modifikovati.
                  </p>
                </div>

                <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 p-4 space-y-2">
                  <p className="font-bold text-slate-800 flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-600" /> Osnova
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    U tabu <b>Osnova</b> mozete dodati poseban fajl sa koordinatama osnove. Te tacke sluze za brz izbor u tabu <b>Stanica-Orijentacija</b>.
                  </p>
                </div>

                <div className="flex gap-4">
                  <div className="flex-none w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">1</div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 flex items-center gap-2"><FileText className="w-4 h-4" /> Uvoz podataka</p>
                    <p>Odaberite fajl i mapirajte kolone: <b>Broj tacke</b>, <b>Easting (Y)</b>, <b>Northing (X)</b>, pa kliknite <b>UVEZI PODATKE</b>.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-none w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">2</div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 flex items-center gap-2"><MapPin className="w-4 h-4" /> Stanica i orijentacija</p>
                    <p>Unesite koordinate stajalista (A) i orijentacije (B), zatim pritisnite <b>SRACUNAJ</b>.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-none w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">3</div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 flex items-center gap-2"><Compass className="w-4 h-4" /> Direkcioni uglovi i iskolcenje</p>
                    <p>U tabovima dobijate proracun baznog ugla, uglove prema tackama i elemente za polarnu metodu.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-none w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">4</div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 flex items-center gap-2"><MapIcon className="w-4 h-4" /> Vizuelni prikaz i izvoz</p>
                    <p>Skica prikazuje tacke, stajaliste i orijentaciju. Podatke mozete izvesti u <code className="bg-slate-100 px-1 rounded">.csv</code> i <code className="bg-slate-100 px-1 rounded">.pdf</code>.</p>
                  </div>
                </div>

                <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 p-4 space-y-2">
                  <p className="font-bold text-slate-800 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" /> Layer
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Moze se odabrati Google map satelitski snimak, ili ortofoto snimak.
                    Za ovo je potrebna internet konekcija.
                    Moguce je mijenjati boje tacaka, kao i velicinu.
                  </p>
                </div>

                <div className="bg-slate-50 border-l-4 border-indigo-500 p-4 rounded-r-xl mt-6">
                  <p className="font-bold text-slate-800 flex items-center gap-2 mb-1">
                    <Calculator className="w-4 h-4" /> Proracun direkcionog ugla:
                  </p>
                  <p className="text-xs">
                    Unijeti podatke u tab <span className="font-bold text-indigo-600">Stanica-Orijentacija</span>, kliknuti <span className="font-bold text-indigo-600 uppercase">SRACUNAJ</span>, a rezultat je u tabu <span className="font-bold text-indigo-600">Direkcioni uglovi</span>.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" /> Tehnicke napomene
              </h3>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm space-y-4">
                <div>
                  <p className="font-bold text-slate-700 mb-1">Koordinatni sistem:</p>
                  <p className="text-slate-600 italic">Aplikacija koristi geodetski koordinatni sistem (X-osa sjever, Y-osa istok).</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-1">Preciznost:</p>
                  <p className="text-slate-600">Duzine se prikazuju na 3 decimalna mjesta, a uglovi u DMS formatu.</p>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100 flex flex-col items-center space-y-6">
                <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl flex items-center gap-8 shadow-xl">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-indigo-400" />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-1">Autor</p>
                      <p className="font-bold text-sm">Amer Moco</p>
                    </div>
                  </div>
                  <div className="w-px h-8 bg-slate-700"></div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-indigo-400" />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none mb-1">Datum</p>
                      <p className="font-bold text-sm">Maj 2026</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center pt-2">
                  <img
                    src="am_logo.png"
                    alt="AM Logo"
                    className="h-16 w-auto object-contain hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutTab;
