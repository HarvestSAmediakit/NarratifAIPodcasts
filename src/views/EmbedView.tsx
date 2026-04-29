import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { EmbedPlayer } from "../components/EmbedPlayer";
import { Zap } from "lucide-react";
import { motion } from "motion/react";

export function EmbedView() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [episode, setEpisode] = useState<any>(null);
  const [publisher, setPublisher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      if (!episodeId) return;
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/episodes/single/${episodeId}`);
        if (!res.ok) throw new Error("Episode not found");
        const data = await res.json();
        setEpisode(data);

        // Fetch publisher info if available
        if (data.publisherId) {
          const pubRes = await fetch(`/api/v1/brand-config/${data.publisherId}`);
          if (pubRes.ok) {
            const pubData = await pubRes.json();
            setPublisher(pubData);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [episodeId]);

  if (loading) {
    return (
      <div className="w-screen h-screen bg-[#050505] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <Zap className="text-emerald-500 w-8 h-8" />
        </motion.div>
      </div>
    );
  }

  if (error || !episode) {
    return (
      <div className="w-screen h-screen bg-[#050505] flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-red-400 font-bold mb-2">Error</p>
          <p className="text-zinc-500 text-sm">{error || "Episode not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#050505] flex items-center justify-center overflow-hidden">
       <EmbedPlayer episode={episode} publisher={publisher} />
    </div>
  );
}
