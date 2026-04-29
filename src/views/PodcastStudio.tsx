import React, { useState, useEffect, useRef } from 'react';
import { usePodcastGenerator } from '../hooks/usePodcastGenerator';
import { useUserStats } from '../hooks/useUserStats';
import { Sparkles, ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle, Play, Tag, Mic, Headphones, User, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface PodcastStudioProps {
  onBack: () => void;
}

const VOICES = [
  { id: 'thandi', name: 'Thandi (Default)', role: 'Host', accent: 'en-ZA' },
  { id: 'njabulo', name: 'Njabulo (Default)', role: 'Co-Host', accent: 'en-ZA' },
  { id: 'lungile', name: 'Lungile', role: 'Professional', accent: 'en-ZA' },
  { id: 'sibusiso', name: 'Sibusiso', role: 'Energetic', accent: 'en-ZA' },
  { id: 'zanele', name: 'Zanele', role: 'Soft', accent: 'en-ZA' },
  { id: 'johan', name: 'Johan', role: 'Afrikaans Accent', accent: 'en-ZA' },
];

export default function PodcastStudio({ onBack }: PodcastStudioProps) {
  // Input State
  const [title, setTitle] = useState('');
  const [articleBody, setArticleBody] = useState('');
  const [category, setCategory] = useState('Business');
  const [selectedVoices, setSelectedVoices] = useState({ host1: 'thandi', host2: 'njabulo' });
  
  // Editable metadata state
  const [editableTitle, setEditableTitle] = useState('');
  const [editableTeaser, setEditableTeaser] = useState('');
  const [editableCategory, setEditableCategory] = useState('Business');
  const [editableTags, setEditableTags] = useState('');

  // Custom Hooks
  const { generate, loading, progress, stage, data, error } = usePodcastGenerator();
  const { stats } = useUserStats();
  
  useEffect(() => {
    if (data) {
        setEditableTitle(data.title);
        setEditableTeaser(data.teaser);
        setEditableCategory(category);
        setEditableTags(data.tags?.join(', ') || '');
    }
  }, [data]);

  // Audio State
  const [audioJobId, setAudioJobId] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<string | null>(null);
  const [audioSegments, setAudioSegments] = useState<any[]>([]);
  const [isAudioGenerating, setIsAudioGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const handleSavePodcast = async () => {
    if (!data) {
        alert("No podcast data available to save.");
        return;
    }
    setIsSaving(true);
    try {
        await addDoc(collection(db, 'podcasts'), {
            title: editableTitle,
            teaser: editableTeaser,
            category: editableCategory,
            tags: editableTags.split(',').map(t => t.trim()),
            transcript: data.transcript || [],
            createdAt: new Date().toISOString()
        });
        alert("Podcast saved successfully!");
    } catch (e) {
        console.error(e);
        alert("Failed to save podcast.");
    } finally {
        setIsSaving(false);
    }
  }

  const handleGenerateAudio = async () => {
    if (!data) return;
    setIsAudioGenerating(true);
    
    // Determine speaker mapping
    const host1Voice = selectedVoices.host1;
    const host2Voice = selectedVoices.host2;
    const host1Name = VOICES.find(v => v.id === host1Voice)?.name.split(' ')[0] || "Thandi";
    // Usually host2 is the other speaker
    
    try {
        const audioResp = await fetch("/api/v1/audio-generation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                transcript: data.transcript.map((line) => {
                    // If speaker name includes host1Name, use host1Voice, else host2Voice
                    const isHost1 = line.speaker.toLowerCase().includes(host1Name.toLowerCase());
                    return {
                        text: line.text,
                        speaker: line.speaker,
                        voiceName: isHost1 ? host1Voice : host2Voice,
                        lang: "en-ZA"
                    };
                }),
                publisherId: "demo-publisher-id",
                title: data.title
            })
        });
        const { id: jobId } = await audioResp.json();
        setAudioJobId(jobId);
        
        // Poll
        const poll = async () => {
             const statusResp = await fetch(`/api/v1/audio-generation/status/${jobId}`);
             const statusData = await statusResp.json();
             console.log("[DEBUG] Audio status:", statusData);
             setAudioStatus(statusData.status);
             if (statusData.status === 'done') {
                 console.log("[DEBUG] Audio segments:", statusData.segments);
                 setAudioSegments(statusData.segments || []);
                 setIsAudioGenerating(false);
             } else if (statusData.status === 'error') {
                 setIsAudioGenerating(false);
                 alert("Audio generation failed: " + statusData.error);
             } else {
                 setTimeout(poll, 2000);
             }
        };
        poll();
    } catch(e) {
        setIsAudioGenerating(false);
        console.error(e);
    }
  }

  useEffect(() => {
    console.log("[DEBUG] Playback effect:", { isPlaying, currentAudioIndex, segment: audioSegments[currentAudioIndex] });
    if (isPlaying && audioSegments.length > 0) {
        if (!audioSegments[currentAudioIndex]?.audioContent) {
            console.error("[DEBUG] No audio content for segment", currentAudioIndex);
            return;
        }
        if (audioRef.current) audioRef.current.pause();

        const audio = new Audio(`data:audio/mp3;base64,${audioSegments[currentAudioIndex].audioContent}`);
        audioRef.current = audio;
        
        audio.onplay = () => { console.log("[DEBUG] Audio playing"); setIsPlaying(true); };
        audio.onpause = () => { console.log("[DEBUG] Audio paused"); setIsPlaying(false); };
        audio.onended = () => {
            console.log("[DEBUG] Audio ended");
            if (currentAudioIndex < audioSegments.length - 1) {
                setCurrentAudioIndex(prev => prev + 1);
            } else {
                setIsPlaying(false);
            }
        };
        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
        audio.play().catch(e => console.error("[DEBUG] Playback failed:", e));
    } else if (!isPlaying && audioRef.current) {
        audioRef.current.pause();
    }
  }, [currentAudioIndex, isPlaying, audioSegments]);

  const handleDownloadMp3 = () => {
    if (!audioSegments.length) return;
    const buffers = audioSegments.map(s => {
        const raw = window.atob(s.audioContent);
        const array = new Uint8Array(new ArrayBuffer(raw.length));
        for(let i = 0; i < raw.length; i++) {
            array[i] = raw.charCodeAt(i);
        }
        return array;
    });
    const totalLength = buffers.reduce((acc, val) => acc + val.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for(let b of buffers) {
        result.set(b, offset);
        offset += b.length;
    }
    const blob = new Blob([result], { type: 'audio/mp3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data?.title || 'podcast'}.mp3`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerate = () => {
    if (!articleBody.trim()) return;
    if (stats && stats.credits <= 0) {
      alert("You have run out of credits. Please purchase more to continue.");
      return;
    }
    
    generate({
      articleBody,
      title: title || "Untitled Insight",
      category,
      format: "two-host",
      host1Name: VOICES.find(v => v.id === selectedVoices.host1)?.name.split(' ')[0] || "Thandi",
      host2Name: VOICES.find(v => v.id === selectedVoices.host2)?.name.split(' ')[0] || "Njabulo"
    });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 lg:p-12 font-sans selection:bg-emerald-500/30">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </button>

        <header className="mb-12 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-display font-bold tracking-tight mb-2">Podcast <span className="text-emerald-500">Studio</span></h1>
            <p className="text-zinc-500">Turn any long-form text into a conversational audio script for Thandi and Njabulo.</p>
          </div>
          {stats && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-6 py-3 rounded-2xl flex items-center gap-3">
              <Zap className="w-4 h-4 text-emerald-500 fill-current" />
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none mb-1">Available Credits</p>
                <p className="text-xl font-bold text-emerald-400 leading-none">{stats.credits}</p>
              </div>
            </div>
          )}
        </header>

        {/* ERROR TOAST */}
        <AnimatePresence>
          {error && (
            <motion.div 
               initial={{ opacity: 0, y: -20 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -20 }}
               className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 gap-8">
          {/* INPUT AREA */}
          {!loading && !data && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass p-8 rounded-[2.5rem] border border-white/5 space-y-6"
            >
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Topic / Headline</label>
                <input 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  placeholder="e.g., The Future of Sustainable Farming in Africa"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Host 1 Voice</label>
                  <select 
                    value={selectedVoices.host1}
                    onChange={e => setSelectedVoices({ ...selectedVoices, host1: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-emerald-500/50 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.5em_1.5em] bg-[right_1.5rem_center] bg-no-repeat"
                  >
                    {VOICES.map(v => (
                       <option key={v.id} value={v.id} className="bg-zinc-900">{v.name} ({v.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Host 2 Voice</label>
                  <select 
                    value={selectedVoices.host2}
                    onChange={e => setSelectedVoices({ ...selectedVoices, host2: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-emerald-500/50 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.5em_1.5em] bg-[right_1.5rem_center] bg-no-repeat"
                  >
                    {VOICES.map(v => (
                       <option key={v.id} value={v.id} className="bg-zinc-900">{v.name} ({v.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Article Body / Notes</label>
                <textarea 
                  value={articleBody} 
                  onChange={e => setArticleBody(e.target.value)}
                  placeholder="Paste the full article or your research notes here..." 
                  rows={12}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-emerald-500/50 transition-all font-sans leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap gap-4 pt-4">
                <button 
                  onClick={handleGenerate}
                  className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 group"
                >
                  Generate Script <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {/* PROGRESS STATE */}
          {loading && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="glass p-12 rounded-[2.5rem] flex flex-col items-center text-center space-y-8"
            >
              <div className="relative">
                <div className="w-32 h-32 rounded-full border-4 border-emerald-500/20 flex items-center justify-center">
                  <span className="text-4xl font-display font-bold text-emerald-500">{progress}%</span>
                </div>
                <motion.div 
                  className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                />
              </div>
              
              <div>
                <h3 className="text-2xl font-bold mb-2 flex items-center justify-center gap-3">
                  {stage} <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                </h3>
                <p className="text-zinc-500">Thandi and Njabulo are reviewing your notes...</p>
              </div>

              <div className="w-full max-w-sm h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-emerald-500"
                  animate={{ width: `${progress}%` }}
                />
              </div>
            </motion.div>
          )}

          {/* RESULT VIEW */}
          {data && !loading && (
            <motion.div 
               initial={{ opacity: 0, y: 30 }}
               animate={{ opacity: 1, y: 0 }}
               className="space-y-8"
            >
              <div className="glass p-8 rounded-[2.5rem] border border-emerald-500/20">
                <div className="flex flex-wrap gap-2 mb-6">
                  {data.tags?.map((tag, i) => (
                    <span key={i} className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded-full uppercase tracking-widest">{tag}</span>
                  ))}
                </div>
                <div className="space-y-4 mb-8">
                  <input 
                    value={editableTitle}
                    onChange={e => setEditableTitle(e.target.value)}
                    className="text-4xl font-display font-bold bg-transparent border-b border-white/10 w-full focus:outline-none focus:border-emerald-500/50 pb-2"
                    placeholder="Podcast Title"
                  />
                  <textarea 
                    value={editableTeaser}
                    onChange={e => setEditableTeaser(e.target.value)}
                    className="text-zinc-400 text-xl leading-relaxed italic bg-transparent border-none w-full focus:outline-none resize-none"
                    rows={2}
                    placeholder="Podcast Teaser"
                  />
                </div>
                
                <div className="flex items-center gap-6 p-4 bg-white/5 rounded-2xl border border-white/5">
                   <div className="flex -space-x-2">
                       <img src="https://images.unsplash.com/photo-1531123897727-8f129e1eb1c4?q=80&w=200" className="w-10 h-10 rounded-full border-2 border-black" alt="Thandi" />
                       <img src="https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?q=80&w=200" className="w-10 h-10 rounded-full border-2 border-black" alt="Njabulo" />
                   </div>
                   <div className="text-sm font-medium">
                      <p className="text-white">Narrated by Thandi & Njabulo</p>
                      <p className="text-zinc-500">Estimated Duration: {data.duration}</p>
                   </div>
                   <div className="ml-auto">
                      <button 
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/v1/episodes/publish", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                publisherId: "demo-publisher-id",
                                title: data.title,
                                teaser: data.teaser,
                                transcript: data.transcript,
                                cat: category,
                                host1: selectedVoices.host1,
                                host2: selectedVoices.host2,
                                tags: data.tags
                              })
                            });
                            if (!res.ok) throw new Error("Publish failed");
                            const resData = await res.json();
                            alert("Published! Episode ID: " + resData.id);
                          } catch (err: any) {
                            alert("Error: " + err.message);
                          }
                        }}
                        className="p-3 px-6 bg-emerald-500 text-black rounded-xl hover:scale-105 transition-transform shadow-lg flex items-center gap-2 font-bold"
                      >
                        Publish Episode <Play className="w-4 h-4 fill-current" />
                      </button>
                   </div>
                </div>
              </div>

              <div className="glass p-8 rounded-[2.5rem] space-y-10">
                <div className="flex items-center justify-between border-b border-white/5 pb-6">
                   <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em]">Podcast Transcript</h3>
                   <div className="flex gap-2">
                      <button className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-zinc-400 transition-colors"><Mic className="w-4 h-4" /></button>
                      <button className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-zinc-400 transition-colors"><Headphones className="w-4 h-4" /></button>
                   </div>
                </div>

                <div className="space-y-12">
                  {data.transcript.map((line, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex gap-6 items-start group"
                    >
                      <div className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-xl ${line.speaker.toLowerCase().includes('thandi') ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'}`}>
                          {line.speaker.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                          {line.speaker}
                          <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                          <span className="font-mono lowercase opacity-50">0:{(idx*15).toString().padStart(2,'0')}</span>
                        </div>
                        <p className="text-2xl font-medium font-sans leading-relaxed tracking-tight group-hover:text-emerald-400 transition-colors duration-500">
                          {line.text}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                 <div className="glass p-8 rounded-[2.5rem]">
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6">Key Takeaways</h4>
                    <ul className="space-y-4">
                      {data.takeaways.map((item, i) => (
                        <li key={i} className="flex gap-3 text-zinc-300">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                          <p className="text-sm font-medium">{item}</p>
                        </li>
                      ))}
                    </ul>
                 </div>
               <div className="glass p-8 rounded-[2.5rem] flex flex-col justify-center items-center text-center space-y-6">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                       <Send className="w-8 h-8 text-emerald-500" />
                    </div>
                    <div>
                       <h4 className="font-bold mb-2">Ready for Broadcast?</h4>
                       <p className="text-xs text-zinc-500">Generate audio, push this episode to the main player, or download.</p>
                       
                       {/* Audio Player section */}
                       <div className="mt-6 flex flex-col items-center justify-center space-y-4">
                           {audioSegments.length === 0 ? (
                               <button 
                                 onClick={handleGenerateAudio}
                                 disabled={isAudioGenerating}
                                 className="py-3 px-8 bg-zinc-800 disabled:opacity-50 text-white rounded-xl hover:bg-zinc-700 transition flex items-center gap-2 font-bold shadow-lg"
                               >
                                 {isAudioGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Synthesizing Audio ({audioStatus})...</> : <><Mic className="w-4 h-4"/> Generate Full Audio</>}
                               </button>
                           ) : (
                               <div className="flex flex-col items-center gap-4 bg-black/40 p-6 rounded-3xl border border-white/5 w-full">
                                   <div className="flex items-center justify-between w-full text-[10px] font-mono text-zinc-500">
                                       <span>{Math.floor(currentTime/60)}:{(Math.floor(currentTime%60)).toString().padStart(2,'0')}</span>
                                       <div className="flex-1 mx-4 h-1 bg-white/5 rounded-full relative overflow-hidden">
                                           <motion.div 
                                             className="absolute top-0 left-0 h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]" 
                                             animate={{ width: `${Math.min(100, (currentTime / (audioRef.current?.duration || 1)) * 100)}%` }}
                                           />
                                       </div>
                                       <span>{audioRef.current?.duration ? `${Math.floor(audioRef.current.duration/60)}:${(Math.floor(audioRef.current.duration%60)).toString().padStart(2,'0')}` : "--:--"}</span>
                                   </div>
                                   <button 
                                     onClick={() => setIsPlaying(!isPlaying)}
                                     className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-xl hover:scale-105 transition-all shadow-emerald-500/20"
                                   >
                                     {isPlaying ? <span className="w-4 h-4 bg-black" /> : <Play className="w-8 h-8 fill-current translate-x-1" />}
                                   </button>
                               </div>
                           )}
                       </div>
                    </div>
                    <div className="flex gap-3 w-full mt-4">
                       <button onClick={handleDownloadMp3} disabled={audioSegments.length === 0} className="flex-1 py-3 bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-xs font-bold hover:bg-white/10 transition-all">Download MP3</button>
<button onClick={handleSavePodcast} disabled={isSaving || audioSegments.length === 0} className="flex-1 py-3 bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-xs font-bold hover:bg-white/10 transition-all">
    {isSaving ? "Saving..." : "Save Podcast"}
</button>
                       <button 
                        onClick={() => setTitle('') || setArticleBody('') || generate({articleBody: '', title: '', category: '', format: '', host1Name: '', host2Name: ''})} 
                        className="flex-1 py-3 bg-emerald-500 text-black rounded-2xl text-xs font-bold hover:bg-emerald-400 transition-all shadow-lg"
                       >
                         Start New
                       </button>
                    </div>
                 </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Decorative */}
      <div className="fixed top-0 right-0 w-[40%] h-[60%] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-0 left-0 w-[30%] h-[40%] bg-teal-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </div>
  );
}
