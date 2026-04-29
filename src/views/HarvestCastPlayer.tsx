import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, FastForward, Rewind, Share2, Volume2, Mic, Settings, Sparkles, ChevronLeft, Download, ExternalLink, MessageSquare, Headphones, Zap, FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const HARVEST_DATA = {
  issueId: "82",
  title: "Harvest SA: Securing Food Resources",
  description: "Deep dive into precision irrigation and sustainable farming in the Western Cape. Hosted by Thandi and Njabulo.",
  hosts: {
    thandi: { name: "Thandi", avatar: "https://images.unsplash.com/photo-1531123897727-8f129e1eb1c4?q=80&w=200", color: "#10b981", voice: "en-ZA-Standard-A" },
    njabulo: { name: "Njabulo", avatar: "https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?q=80&w=200", color: "#f59e0b", voice: "en-ZA-Standard-B" }
  },
  segments: [
    { id: 1, type: "intro", host: "both", topic: "The Current State of Water", duration: "1:30" },
    { id: 2, type: "article", host: "thandi", topic: "Western Cape Precision Irrigation", duration: "4:20" },
    { id: 3, type: "advertorial", host: "njabulo", topic: "Irrig8 Sponsor Read", duration: "0:45", sponsor: true },
    { id: 4, type: "article", host: "njabulo", topic: "Land Reform Realities", duration: "5:12" },
    { id: 5, type: "outro", host: "both", topic: "Looking to 2027", duration: "2:00" }
  ]
};

export function HarvestCastPlayer({ initialData }: { initialData?: any }) {
  const data = initialData || HARVEST_DATA;
  const [playingId, setPlayingId] = useState<number>(data.segments[0].id);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // ── TRANSCRIPT & AUDIO STATE ──
  const [generations, setGenerations] = useState<Record<number, any[]>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [genTarget, setGenTarget] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);

  const [showNotes, setShowNotes] = useState<any>(null);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcript' | 'notes'>('transcript');
  const [showEmbedModal, setShowEmbedModal] = useState(false);

  const activeSegment = data.segments.find((s: any) => s.id === playingId) || data.segments[0];
  
  const embedCode = `<iframe 
  src="${window.location.origin}/embed/demo-episode-id" 
  width="100%" 
  height="450" 
  frameborder="0" 
  style="border-radius: 12px; overflow: hidden;"
></iframe>`;
  
  // ── AUDIO SYSTEM ──
  const playCurrentSegment = () => {
    const segmentGen = generations[playingId];
    if (!segmentGen || !segmentGen[currentAudioIndex]?.audioContent) return;

    if (audioRef.current) {
        audioRef.current.pause();
    }

    const audio = new Audio(`data:audio/mp3;base64,${segmentGen[currentAudioIndex].audioContent}`);
    audioRef.current = audio;
    
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => {
        if (currentAudioIndex < segmentGen.length - 1) {
            setCurrentAudioIndex(prev => prev + 1);
        } else {
            setIsPlaying(false);
        }
    };
    audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
    };

    audio.play().catch(e => console.error("Playback failed:", e));
  };

  useEffect(() => {
    if (isPlaying && generations[playingId]) {
        playCurrentSegment();
    } else if (!isPlaying && audioRef.current) {
        audioRef.current.pause();
    }
  }, [playingId, currentAudioIndex, isPlaying]);

  const handleGenerateNotes = async () => {
    setIsGeneratingNotes(true);
    try {
        const resp = await fetch("/api/v1/generate-show-notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ magazine: data })
        });
        const notesData = await resp.json();
        setShowNotes(notesData.showNotes);
        setActiveTab('notes');
    } catch (e) {
        console.error(e);
    } finally {
        setIsGeneratingNotes(false);
    }
  };

  const transcriptSegments = generations[playingId] || [
     { speaker: "Thandi", text: "Welcome to Narratif. This is your audio companion for Harvest South Africa, Issue 82." },
     { speaker: "Thandi", text: "Today, we're exploring the intersection of tradition and technology in the Western Cape agricultural sector." },
     { speaker: "Njabulo", text: "I'm Thandi, and I'm joined by Njabulo for this deep dive into securing our food resources." }
  ];


  const togglePlay = (id: number) => {
    if (playingId === id) {
      setIsPlaying(!isPlaying);
    } else {
      setPlayingId(id);
      setIsPlaying(true);
      setCurrentTime(0);
      setCurrentAudioIndex(0);
    }
  };

  // ── TRANSCRIPTION TRIGGER ──
  const handleGenerate = async (segmentId: number) => {
    setIsGenerating(true);
    setGenTarget(segmentId);
    try {
        const seg = data.segments.find((s: any) => s.id === segmentId);
        
        // 1. Generate Structured Transcript
        const transcriptPrompt = `
Generate a high-quality, engaging podcast script for a segment called "${seg.topic}".
Magazine Context: ${data.title} - ${data.description}.
Host Roles:
- Thandi: Warm, authoritative South African female voice. Uses occasional South African English/Afrikaans/isiZulu colloquialisms (e.g., 'lekker', 'yebo', 'sharp').
- Njabulo: Energetic, tech-savvy South African male voice.
Format: A natural conversation between Thandi and Njabulo about the topic.
Length: 8-12 dialogue exchanges.

RETURN JSON:
{
  "segments": [
    { "speaker": "Thandi", "text": "...", "voiceName": "thandi" },
    { "speaker": "Njabulo", "text": "...", "voiceName": "njabulo" }
  ]
}
`;
        
        const resp = await fetch("/api/v1/generate-transcript", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: transcriptPrompt })
        });
        const scriptData = await resp.json();
        const scriptSegments = scriptData.segments || [];

        // 2. Trigger Audio Generation Job
        const audioResp = await fetch("/api/v1/audio-generation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                transcript: scriptSegments.map((s: any) => ({
                    text: s.text,
                    speaker: s.speaker,
                    voiceName: s.voiceName,
                    lang: "en-ZA"
                })),
                publisherId: "user-1",
                title: seg.topic
            })
        });
        const { id: jobId } = await audioResp.json();

        // 3. Poll for Job Completion
        const pollJob = async () => {
            const statusResp = await fetch(`/api/v1/audio-generation/status/${jobId}`);
            const statusData = await statusResp.json();
            
            if (statusData.status === "done") {
                setGenerations(prev => ({ ...prev, [segmentId]: statusData.segments }));
                setIsGenerating(false);
                setGenTarget(null);
            } else if (statusData.status === "error") {
                throw new Error(statusData.error);
            } else {
                setTimeout(pollJob, 2000);
            }
        };
        pollJob();

    } catch (e) {
        console.error(e);
        setIsGenerating(false);
        setGenTarget(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans p-4 md:p-8 relative overflow-hidden flex flex-col">
      
      {/* Liquid Glass Background Effects */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_50%,#10b98110_0%,transparent_50%)]" />
      
      <div className="max-w-7xl mx-auto flex flex-col flex-1 w-full min-h-0">
        
        {/* Top Navigation */}
        <header className="flex justify-between items-center mb-8 shrink-0">
           <button onClick={() => window.location.reload()} className="glass p-2 px-4 rounded-xl flex items-center gap-2 text-sm font-medium hover:bg-white/10 transition-all">
              <ChevronLeft className="w-4 h-4" /> Exit Studio
           </button>
           <div className="flex gap-3">
              <button 
                onClick={() => setShowEmbedModal(true)}
                className="glass p-2 px-4 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-white/10 transition-all"
              >
                 <ExternalLink className="w-4 h-4" /> Embed
              </button>
              <button className="glass p-2 px-4 rounded-xl text-sm font-medium flex items-center gap-2">
                 <Share2 className="w-4 h-4" /> Share
              </button>
              <button className="bg-emerald-500 text-black p-2 px-4 rounded-xl text-sm font-bold shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                 Distribute
              </button>
           </div>
        </header>

        {/* Dynamic Layout: Controls (Left) and Transcript (Right/Bottom) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-0">
          
          {/* PLAYER CORE - LEFT PANEL */}
          <div className="lg:col-span-5 flex flex-col gap-6 h-full min-h-0">
            
            {/* Main Cover Bento */}
            <div className="liquid-glass rounded-[2.5rem] p-8 flex-1 flex flex-col items-center justify-center text-center relative overflow-hidden group min-h-[300px]">
                <div className="absolute top-4 left-4 flex gap-2">
                   <div className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-1 rounded-full border border-emerald-500/20 uppercase tracking-widest">Studio 2026</div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div 
                    key={playingId}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.1, opacity: 0 }}
                    className="relative z-10 w-full"
                  >
                    <div className="w-48 h-48 md:w-56 md:h-56 bg-emerald-950 rounded-[3rem] mx-auto mb-8 shadow-2xl overflow-hidden border border-white/10 group-hover:rotate-3 transition-transform duration-700 relative">
                       <img 
                          src="https://images.unsplash.com/photo-1592982537447-6f2a6a0c5c1b?q=80&w=600&auto=format&fit=crop" 
                          className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-1000" 
                          alt="Cover" 
                       />
                       <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/20 to-transparent mix-blend-overlay" />
                    </div>
                    <h1 className="text-3xl font-display font-bold tracking-tight mb-2 line-clamp-2">{activeSegment.title || activeSegment.topic}</h1>
                    <p className="text-emerald-500 font-medium tracking-widest uppercase text-xs mb-4">Issue {data.issueId} • Segment {activeSegment.id}</p>
                    {activeSegment.description && (
                      <p className="text-zinc-400 text-sm italic line-clamp-3 max-w-sm mx-auto opacity-70 group-hover:opacity-100 transition-opacity">
                         "{activeSegment.description}"
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
                
                {/* Host Avatars with Presence */}
                <div className="flex gap-4 mt-12 bg-white/5 p-2 rounded-full border border-white/10">
                   <div className={`p-1 rounded-full border-2 transition-all duration-500 ${activeSegment.host === 'thandi' || activeSegment.host === 'both' ? 'border-emerald-500 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-transparent opacity-40'}`}>
                      <div className="w-10 h-10 rounded-full overflow-hidden">
                        <img src={data.hosts?.thandi?.avatar} className="w-full h-full object-cover" alt="Thandi" />
                      </div>
                   </div>
                   <div className={`p-1 rounded-full border-2 transition-all duration-500 ${activeSegment.host === 'njabulo' || activeSegment.host === 'both' ? 'border-amber-500 scale-110 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'border-transparent opacity-40'}`}>
                      <div className="w-10 h-10 rounded-full overflow-hidden">
                        <img src={data.hosts?.njabulo?.avatar} className="w-full h-full object-cover" alt="Njabulo" />
                      </div>
                   </div>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="glass rounded-[2rem] p-6 flex flex-col gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex justify-between items-center px-4">
                    <span className="text-[10px] font-mono text-zinc-500">{Math.floor(currentTime/60)}:{(Math.floor(currentTime%60)).toString().padStart(2,'0')}</span>
                    <div className="flex-1 mx-6 h-1 bg-white/5 rounded-full relative overflow-hidden">
                        <motion.div 
                          className="absolute top-0 left-0 h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]" 
                          animate={{ width: `${Math.min(100, (currentTime / (audioRef.current?.duration || 1)) * 100)}%` }}
                        />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                        {audioRef.current?.duration ? `${Math.floor(audioRef.current.duration/60)}:${(Math.floor(audioRef.current.duration%60)).toString().padStart(2,'0')}` : activeSegment.duration}
                    </span>
                </div>
                <div className="flex justify-center items-center gap-10">
                    <button className="text-zinc-500 hover:text-white transition-colors"><Rewind className="w-6 h-6" /></button>
                    <button 
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-xl hover:scale-110 transition-all active:scale-95 shadow-emerald-500/20"
                    >
                        {isPlaying ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current translate-x-1" />}
                    </button>
                    <button className="text-zinc-500 hover:text-white transition-colors"><FastForward className="w-6 h-6" /></button>
                </div>
            </div>
          </div>

          {/* TRANSCRIPT PANEL - RIGHT PANEL */}
          <div className="lg:col-span-7 flex flex-col gap-6 h-full min-h-0">
             
             {/* Segments Quick Bar */}
             <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-none shrink-0">
                {data.segments.map((seg: any) => (
                    <button 
                        key={seg.id}
                        onClick={() => togglePlay(seg.id)}
                        className={`flex-shrink-0 px-6 py-3 rounded-2xl text-[10px] font-bold transition-all border uppercase tracking-widest ${playingId === seg.id ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10'}`}
                    >
                        {seg.type === 'advertorial' ? <span className="flex items-center gap-1">Ad <Zap className="w-3 h-3 fill-current" /></span> : `Segment 0${seg.id}`}
                    </button>
                ))}
             </div>

             {/* Main Transcript Body */}
             <div className="liquid-glass rounded-[3rem] flex-1 flex flex-col min-h-0 overflow-hidden relative border-white/5">
                <div className="p-8 border-b border-white/5 flex justify-between items-center shrink-0">
                    <div className="flex gap-6">
                        <button 
                          onClick={() => setActiveTab('transcript')}
                          className={`font-display font-semibold flex items-center gap-2 tracking-tight transition-all pb-2 border-b-2 ${activeTab === 'transcript' ? 'text-emerald-400 border-emerald-400' : 'text-zinc-600 border-transparent'}`}
                        >
                            <Sparkles className="w-4 h-4" /> Transcript
                        </button>
                        <button 
                          onClick={() => activeTab === 'notes' || showNotes ? setActiveTab('notes') : handleGenerateNotes()}
                          className={`font-display font-semibold flex items-center gap-2 tracking-tight transition-all pb-2 border-b-2 ${activeTab === 'notes' ? 'text-amber-400 border-amber-400' : 'text-zinc-600 border-transparent'}`}
                        >
                            <FileText className="w-4 h-4" /> Show Notes {isGeneratingNotes && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Zap className="w-3 h-3 text-amber-500" /></motion.div>}
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button className="glass p-2 rounded-xl hover:bg-white/10"><MessageSquare className="w-4 h-4" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-12 scroll-smooth scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                    <AnimatePresence mode="wait">
                        {activeTab === 'transcript' ? (
                          <motion.div 
                            key="transcript-view"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="max-w-2xl mx-auto relative"
                          >
                              {/* Sliding Highlight Indicator */}
                              {currentAudioIndex >= 0 && transcriptSegments.length > 0 && (
                                  <motion.div 
                                     layoutId="highlight"
                                     className="absolute -left-4 w-[calc(100%+32px)] bg-emerald-500/10 rounded-[2rem] pointer-events-none -z-10 border border-emerald-500/10"
                                     style={{ 
                                        top: `${currentAudioIndex * 120 + 0}px`, 
                                        height: "100px" 
                                     }}
                                     transition={{ type: "spring", stiffness: 200, damping: 25 }}
                                  />
                              )}

                              {transcriptSegments.map((segment, idx) => (
                                  <div 
                                    key={idx} 
                                    onClick={() => {
                                        setCurrentAudioIndex(idx);
                                        setIsPlaying(true);
                                    }}
                                    className={`transcript-segment cursor-pointer flex gap-8 py-8 items-start group transition-all duration-500 ${currentAudioIndex === idx ? 'opacity-100 scale-[1.02]' : 'opacity-20 hover:opacity-40'}`}
                                  >
                                      <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-[10px] font-bold shadow-xl ${segment.speaker === 'Thandi' ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'}`}>
                                          {segment.speaker === 'Thandi' ? 'TH' : 'NJ'}
                                      </div>
                                      <div className="space-y-1">
                                          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">{segment.speaker} • Segment {idx + 1}</p>
                                          <p className="text-2xl font-medium leading-relaxed font-sans tracking-tight">{segment.text}</p>
                                      </div>
                                  </div>
                              ))}
                              
                              {transcriptSegments.length === 0 && !isGenerating && (
                                  <div className="text-center py-24 text-zinc-600">
                                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                                         <Headphones className="w-8 h-8 opacity-20" />
                                      </div>
                                      <p className="font-display uppercase tracking-widest text-xs">Awaiting neural transcription...</p>
                                      <button 
                                        onClick={() => handleGenerate(playingId)}
                                        className="mt-6 glass px-6 py-2 rounded-full text-xs font-bold hover:bg-emerald-500 hover:text-black transition-all"
                                      >
                                        Extract Scripts
                                      </button>
                                  </div>
                              )}
                          </motion.div>
                        ) : (
                          <motion.div 
                            key="notes-view"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="max-w-2xl mx-auto"
                          >
                             {showNotes ? (
                               <div className="space-y-12">
                                 <div>
                                    <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mb-4">Executive Summary</h4>
                                    <p className="text-2xl leading-relaxed font-sans font-light text-zinc-200">
                                       {showNotes.summary}
                                    </p>
                                 </div>

                                 <div className="space-y-8">
                                    <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mb-4">Key Takeaways</h4>
                                    {showNotes.takeaways?.map((item: any, i: number) => (
                                      <div key={i} className="flex gap-6 group cursor-pointer hover:bg-white/5 p-4 rounded-2xl transition-all -ml-4">
                                         <div className="bg-amber-500/20 text-amber-500 px-3 py-1 rounded-full h-fit text-[10px] font-bold font-mono">
                                            {item.time}
                                         </div>
                                         <div>
                                            <h5 className="text-xl font-bold mb-2 group-hover:text-amber-400 transition-colors">{item.title}</h5>
                                            <p className="text-sm text-zinc-400 group-hover:text-zinc-200 transition-colors">{item.description}</p>
                                         </div>
                                      </div>
                                    ))}
                                 </div>

                                 <div className="flex flex-wrap gap-2">
                                    {showNotes.tags?.map((tag: string, i: number) => (
                                      <span key={i} className="px-4 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-medium text-zinc-500">#{tag}</span>
                                    ))}
                                 </div>
                               </div>
                             ) : (
                               <div className="text-center py-24 text-zinc-600">
                                   <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                                      <Zap className="w-8 h-8 opacity-20" />
                                   </div>
                                   <p className="font-display uppercase tracking-widest text-xs">AI is synthesizing takeaways...</p>
                               </div>
                             )}
                          </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Status Bar */}
                <div className="p-6 px-12 bg-black/60 border-t border-white/5 flex items-center justify-between shrink-0 backdrop-blur-3xl">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                             <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Neural Stream</span>
                        </div>
                        <div className="h-4 w-px bg-white/10" />
                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Model: Gemini 2.5 Flash</span>
                    </div>
                    <div className="flex items-center gap-6 text-zinc-500 uppercase font-bold text-[10px] tracking-widest">
                         <div className="flex items-center gap-2">
                             <Download className="w-4 h-4 cursor-pointer hover:text-white" />
                             <span>Export</span>
                         </div>
                         <div className="flex items-center gap-2">
                             <ExternalLink className="w-4 h-4 cursor-pointer hover:text-white" />
                             <span>Preview</span>
                         </div>
                    </div>
                </div>
             </div>
          </div>

        </div>
      </div>

      <EmbedModal 
        isOpen={showEmbedModal} 
        onClose={() => setShowEmbedModal(false)} 
        embedCode={embedCode} 
      />

      {/* Decorative Blur Orbs */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/5 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />
    </div>
  );
}

function EmbedModal({ isOpen, onClose, embedCode }: { isOpen: boolean, onClose: () => void, embedCode: string }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl glass rounded-[2.5rem] p-8 border-white/10 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-400">
            <Zap className="w-5 h-5 fill-current" /> Embed Player
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <span className="text-2xl">&times;</span>
          </button>
        </div>
        <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
          Copy the code below to feature this episode on your magazine website or blog. 
          The player is responsive and adapts to any container.
        </p>
        
        <div className="bg-black/60 rounded-2xl p-4 font-mono text-[10px] text-emerald-500/70 relative group border border-white/5 mb-6">
          <pre className="whitespace-pre-wrap break-all">{embedCode}</pre>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(embedCode);
              alert("Copied to clipboard!");
            }}
            className="absolute top-2 right-2 p-2 px-4 bg-emerald-500 text-black text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2"
          >
            <Download className="w-3 h-3" /> Copy Code
          </button>
        </div>
        
        <div className="flex gap-4">
           <button onClick={onClose} className="flex-1 py-4 bg-white/5 rounded-2xl font-bold hover:bg-white/10 transition-colors">Done</button>
        </div>
      </motion.div>
    </div>
  );
}
