import React, { useState } from "react";
import { HarvestCastPlayer } from "./HarvestCastPlayer";
import PodcastStudio from "./PodcastStudio";
import PodcastLibrary from "./PodcastLibrary";
import { Sparkles, Upload, Globe, Settings, Mic, Headphones, FileText, Zap, Layout, Library } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useUserStats } from "../hooks/useUserStats";

export default function StudioHome() {
  const { stats } = useUserStats();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [magazineData, setMagazineData] = useState<any>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"analyzer" | "studio" | "library">("analyzer");

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    setError("");

    try {
      const resp = await fetch("/api/v1/analyze-magazine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      if (!resp.ok) {
        throw new Error(`Failed to analyze: ${resp.status}`);
      }

      const data = await resp.json();
      setMagazineData(data.magazine);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze magazine.");
    } finally {
      setLoading(false);
    }
  };

  if (magazineData) {
    return (
      <AnimatePresence mode="wait">
        <motion.div 
          key="player"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="min-h-screen"
        >
          <HarvestCastPlayer initialData={magazineData} />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (view === "library") {
    return (
      <AnimatePresence mode="wait">
        <motion.div 
          key="library"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
        >
          <PodcastLibrary 
            onBack={() => setView("analyzer")} 
            onSelect={(podcast) => {
              // Optionally handle selecting a saved podcast
              console.log("Selected podcast:", podcast);
            }} 
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (view === "studio") {
    return (
      <AnimatePresence mode="wait">
        <motion.div 
          key="studio"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
        >
          <PodcastStudio onBack={() => setView("analyzer")} />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] p-6 lg:p-12 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                <Mic className="text-black w-6 h-6" />
             </div>
             <h1 className="text-2xl font-display font-bold tracking-tighter uppercase grayscale hover:grayscale-0 transition-all cursor-crosshair">Narratif <span className="text-emerald-500">Studio</span></h1>
          </div>
          <div className="flex gap-4">
            {stats && (
              <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 rounded-full py-2">
                <Zap className="w-3 h-3 text-emerald-500 fill-current" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">{stats.credits} Credits</span>
              </div>
            )}
            <button 
              onClick={() => setView("library")}
              className="glass p-2 px-6 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-emerald-500 hover:text-black transition-all border border-emerald-500/20"
            >
              <Library className="w-4 h-4" /> Library
            </button>
            <button 
              onClick={() => setView("studio")}
              className="glass p-2 px-6 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-emerald-500 hover:text-black transition-all border border-emerald-500/20"
            >
              <Layout className="w-4 h-4" /> Studio
            </button>
            <button className="glass p-2 px-4 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-white/10 transition-colors">
              <Settings className="w-4 h-4" />
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px]">
               <div className="w-full h-full bg-black rounded-full overflow-hidden">
                  <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150" className="w-full h-full object-cover" alt="User" />
               </div>
            </div>
          </div>
        </header>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[160px]">
          
          {/* Main Input - Wide Bento */}
          <div className="md:col-span-8 md:row-span-2 bento-card flex flex-col justify-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Globe className="w-32 h-32 text-emerald-500" />
            </div>
            <h2 className="text-3xl font-display font-medium mb-6 flex items-center gap-3">
               Analyze Magazine <Sparkles className="text-emerald-400 w-6 h-6" />
            </h2>
            <form onSubmit={handleAnalyze} className="relative z-10 space-y-4">
              <div className="relative">
                <input 
                  type="url" 
                  placeholder="https://harvestsa.co.za/magazine/82/"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-lg focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
                  required
                />
                <div className="absolute right-3 top-3">
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl px-6 py-2 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loading ? "Analyzing..." : <>Generate <Zap className="w-4 h-4 fill-current" /></>}
                  </button>
                </div>
              </div>
              <p className="text-sm text-zinc-500 px-2 italic">Shift from static print to dynamic audio in seconds.</p>
            </form>
          </div>

          {/* Quick Upload - Bento with Input */}
          <div className="md:col-span-4 md:row-span-1 bento-card flex items-center gap-5 cursor-pointer hover:scale-[1.02] active:scale-95 group relative overflow-hidden">
             <input 
                type="file" 
                accept=".pdf"
                className="absolute inset-0 opacity-0 cursor-pointer z-20"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  setLoading(true);
                  setError(null);
                  const formData = new FormData();
                  formData.append("file", file);

                  try {
                    const resp = await fetch("/api/v1/upload-pdf", {
                      method: "POST",
                      body: formData,
                    });
                    
                    if (!resp.ok) {
                      const errData = await resp.json();
                      throw new Error(errData.error || "PDF analysis failed");
                    }
                    const data = await resp.json();
                    setMagazineData(data.magazine);
                  } catch (err: any) {
                    setError(err.message || "Failed to process PDF");
                  } finally {
                    setLoading(false);
                  }
                }}
             />
             <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-black transition-colors">
                <Upload className="w-6 h-6" />
             </div>
             <div>
                <h3 className="font-bold">PDF Upload</h3>
                <p className="text-xs text-zinc-500">Extract all articles at once</p>
             </div>
             {loading && (
               <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 backdrop-blur-sm">
                 <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                   <Zap className="text-emerald-500" />
                 </motion.div>
               </div>
             )}
          </div>

          {/* Voices - Small Bento */}
          <div className="md:col-span-4 md:row-span-1 bento-card flex items-center gap-5 cursor-pointer hover:border-amber-500/30 group">
             <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-amber-500 group-hover:text-black transition-colors">
                <Headphones className="w-6 h-6" />
             </div>
             <div>
                <h3 className="font-bold">24 Voices</h3>
                <p className="text-xs text-zinc-500">Neural South African voices</p>
             </div>
          </div>

          {/* Stats/History - Side Bento */}
          <div className="md:col-span-4 md:row-span-2 bento-card flex flex-col justify-between">
              <div>
                <h3 className="font-display text-zinc-400 uppercase text-xs tracking-widest mb-4">Past Sessions</h3>
                <div className="space-y-4">
                    {[
                        { title: "Harvest SA #81", date: "2 days ago", type: "Magazine" },
                        { title: "Agri Monthly", date: "5 days ago", type: "PDF" },
                        { title: "Weekly Roundup", date: "1 week ago", type: "Manual" }
                    ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center group cursor-pointer">
                            <div>
                                <p className="text-sm font-medium group-hover:text-emerald-400 transition-colors">{item.title}</p>
                                <p className="text-[10px] text-zinc-500">{item.date} • {item.type}</p>
                            </div>
                            <FileText className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400" />
                        </div>
                    ))}
                </div>
              </div>
              <button className="w-full py-2 bg-white/5 rounded-xl text-xs font-semibold hover:bg-white/10 transition-colors">View All Archive</button>
          </div>

          {/* AI Progress - Narrow Bento */}
          <div className="md:col-span-8 md:row-span-1 bento-card flex items-center justify-between">
             <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                    <img src="https://images.unsplash.com/photo-1531123897727-8f129e1eb1c4?q=80&w=200" className="w-8 h-8 rounded-full border-2 border-black" alt="T" />
                    <img src="https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?q=80&w=200" className="w-8 h-8 rounded-full border-2 border-black" alt="N" />
                </div>
                <p className="text-sm font-medium">Thandi & Njabulo active</p>
             </div>
             <div className="flex gap-1">
                {[1,2,3,4,5,6,7,8].map(i => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < 6 ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
                ))}
             </div>
          </div>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-[2rem] text-sm flex items-center gap-3 backdrop-blur-md"
          >
            <span className="text-xl">⚠️</span> {error}
          </motion.div>
        )}
      </div>

      {/* Background Ambience */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-500/10 blur-[120px] rounded-full animate-pulse delay-1000" />
      </div>
    </div>
  );
}
