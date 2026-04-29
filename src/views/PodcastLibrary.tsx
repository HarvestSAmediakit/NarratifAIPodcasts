import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Trash2, Calendar, Tag, ArrowLeft, Loader2, Music } from 'lucide-react';

interface PodcastLibraryProps {
  onBack: () => void;
  onSelect: (podcast: any) => void;
}

export default function PodcastLibrary({ onBack, onSelect }: PodcastLibraryProps) {
  const [podcasts, setPodcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPodcasts();
  }, []);

  const fetchPodcasts = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'podcasts'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPodcasts(docs);
    } catch (e) {
      console.error("Error fetching podcasts:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this save?")) return;
    try {
      await deleteDoc(doc(db, 'podcasts', id));
      setPodcasts(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      alert("Delete failed.");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] p-6 lg:p-12">
      <div className="max-w-5xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </button>

        <div className="flex justify-between items-center mb-12">
           <h1 className="text-4xl font-display font-bold">Saved <span className="text-emerald-500">Podcasts</span></h1>
           <p className="text-zinc-500 text-sm">{podcasts.length} items in your library</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
            <p className="text-zinc-500">Loading your archive...</p>
          </div>
        ) : podcasts.length === 0 ? (
          <div className="glass p-12 rounded-[2.5rem] text-center space-y-4">
             <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                <Music className="w-8 h-8 text-zinc-700" />
             </div>
             <h3 className="text-xl font-bold">Library is empty</h3>
             <p className="text-zinc-500 max-w-xs mx-auto text-sm">Generate and save scripts in the Studio to see them here.</p>
             <button onClick={onBack} className="px-6 py-3 bg-emerald-500 text-black rounded-xl font-bold">Go to Studio</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
             <AnimatePresence>
               {podcasts.map((podcast, idx) => (
                 <motion.div
                   key={podcast.id}
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: idx * 0.05 }}
                   onClick={() => onSelect(podcast)}
                   className="glass p-6 md:p-8 rounded-3xl border border-white/5 hover:border-emerald-500/30 transition-all cursor-pointer group relative overflow-hidden"
                 >
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1 space-y-2">
                         <div className="flex gap-2 mb-2">
                            {podcast.tags?.map((tag: string, i: number) => (
                               <span key={i} className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{tag}</span>
                            ))}
                         </div>
                         <h3 className="text-xl font-bold group-hover:text-emerald-400 transition-colors">{podcast.title}</h3>
                         <p className="text-sm text-zinc-500 line-clamp-1">{podcast.teaser || "No description provided."}</p>
                      </div>
                      
                      <div className="flex items-center gap-6">
                         <div className="text-right hidden sm:block">
                            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                               <Calendar className="w-3 h-3" />
                               {new Date(podcast.createdAt).toLocaleDateString()}
                            </div>
                         </div>
                         <div className="flex gap-2">
                            <button 
                               onClick={(e) => handleDelete(podcast.id, e)}
                               className="p-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                            <button className="p-3 bg-emerald-500 text-black rounded-xl hover:scale-105 transition-all flex items-center gap-2 font-bold px-5">
                               Listen <Play className="w-4 h-4 fill-current" />
                            </button>
                         </div>
                      </div>
                   </div>
                 </motion.div>
               ))}
             </AnimatePresence>
          </div>
        )}
      </div>
      
      {/* Decorative */}
      <div className="fixed top-0 right-0 w-[40%] h-[60%] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </div>
  );
}
