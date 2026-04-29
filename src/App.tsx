import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import StudioHome from "./views/StudioHome";
import { EmbedView } from "./views/EmbedView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StudioHome />} />
      <Route path="/studio" element={<StudioHome />} />
      <Route path="/embed/:episodeId" element={<EmbedView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
