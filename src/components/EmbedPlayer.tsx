import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Mic, Headphones, Zap, FileText, ChevronRight, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface EmbedPlayerProps {
  episode: any;
  publisher?: any;
}

export function EmbedPlayer({ episode, publisher }: EmbedPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const transcript = episode.transcript || [];
  const audioUrls = episode.audioUrls || [];

  const handlePlayPause = () => {
    if (audioUrls.length === 0) return;
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    if (isPlaying && audioUrls[currentAudioIndex]) {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        
        // This assumes audioUrls are base64 or relative paths. 
        // Based on server.ts, they might be base64 if cached or actual URLs if published.
        const src = audioUrls[currentAudioIndex].startsWith("data:") 
          ? audioUrls[currentAudioIndex] 
          : (audioUrls[currentAudioIndex].startsWith("http") ? audioUrls[currentAudioIndex] : `/api/v1/audio/${audioUrls[currentAudioIndex]}`);
        
        const audio = new Audio(src);
        audioRef.current = audio;
        
        audio.onplay = () => setIsPlaying(true);
        audio.onpause = () => setIsPlaying(false);
        audio.onended = () => {
            if (currentAudioIndex < audioUrls.length - 1) {
                setCurrentAudioIndex(prev => prev + 1);
            } else {
                setIsPlaying(false);
                setCurrentAudioIndex(0);
            }
        };
        audio.ontimeupdate = () => {
            setCurrentTime(audio.currentTime);
        };

        audio.play().catch(e => {
          console.error("Playback failed:", e);
          setIsPlaying(false);
        });
    } else if (!isPlaying && audioRef.current) {
        audioRef.current.pause();
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [isPlaying, currentAudioIndex]);

  return (
    <div className="w-full h-full bg-[#050505] text-white font-sans overflow-hidden flex flex-col border border-white/10 rounded-2xl relative">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,#10b98110_0%,transparent_50%)]" />
      
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Mic className="text-black w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold truncate max-w-[150px]">{episode.title}</h1>
            <p className="text-[10px] text-zinc-500">{publisher?.name || "Narratif Audio"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <Zap className="w-3 h-3 text-emerald-500" />
           <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Narratif</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
        <div className="flex gap-4 items-center">
             <div className="w-20 h-20 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 flex-shrink-0">
                <img 
                  src="https://images.unsplash.com/photo-1592982537447-6f2a6a0c5c1b?q=80&w=200&auto=format&fit=crop" 
                  className="w-full h-full object-cover grayscale opacity-50" 
                  alt="Cover" 
                />
             </div>
             <div className="flex-1 min-w-0">
               <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                 {episode.teaser || "No teaser available for this episode."}
               </p>
             </div>
        </div>

        {/* Transcript Preview */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
            <FileText className="w-3 h-3" /> Transcript
          </div>
          <div className="space-y-4">
            {transcript.length > 0 ? (
              transcript.slice(0, 5).map((line: any, idx: number) => (
                <div 
                  key={idx} 
                  className={`flex gap-3 transition-opacity duration-300 ${currentAudioIndex === idx ? 'opacity-100' : 'opacity-40'}`}
                >
                  <div className={`w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-[8px] font-bold ${line.speaker === 'Thandi' ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'}`}>
                    {line.speaker === 'Thandi' ? 'TH' : 'NJ'}
                  </div>
                  <p className="text-xs leading-relaxed">{line.text}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-600 italic">No transcript segments available.</p>
            )}
            {transcript.length > 5 && (
              <p className="text-[10px] text-zinc-700 text-center uppercase tracking-widest">More in full player...</p>
            )}
          </div>
        </div>
      </div>

      {/* Progress & Controls */}
      <div className="p-4 bg-white/2 border-t border-white/5 shrink-0 backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-mono text-zinc-500">{Math.floor(currentTime/60)}:{(Math.floor(currentTime%60)).toString().padStart(2,'0')}</span>
            <div className="flex-1 mx-4 h-1 bg-white/5 rounded-full relative overflow-hidden">
                <motion.div 
                  className="absolute top-0 left-0 h-full bg-emerald-500" 
                  animate={{ width: `${Math.min(100, (currentTime / (audioRef.current?.duration || 1)) * 100)}%` }}
                />
            </div>
            <span className="text-[9px] font-mono text-zinc-500">
                {audioRef.current?.duration ? `${Math.floor(audioRef.current.duration/60)}:${(Math.floor(audioRef.current.duration%60)).toString().padStart(2,'0')}` : "--:--"}
            </span>
        </div>
        
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
              <button className="text-zinc-500 hover:text-white transition-colors" onClick={() => setCurrentAudioIndex(Math.max(0, currentAudioIndex - 1))}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={handlePlayPause}
                className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-lg hover:scale-105 transition-all"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
              </button>
              <button className="text-zinc-500 hover:text-white transition-colors" onClick={() => setCurrentAudioIndex(Math.min(audioUrls.length - 1, currentAudioIndex + 1))}>
                <ChevronRight className="w-4 h-4" />
              </button>
           </div>
           <a 
            href={`${window.location.origin}/episodes/${episode.id}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] font-bold text-zinc-500 hover:text-emerald-500 transition-colors uppercase tracking-widest flex items-center gap-1"
           >
             Full Experience <Headphones className="w-3 h-3" />
           </a>
        </div>
      </div>
    </div>
  );
}
