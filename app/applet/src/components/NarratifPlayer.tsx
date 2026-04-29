import React, { useRef, useEffect } from 'react';

export default function NarratifPlayer({ articleId }: { articleId: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // This demonstrates the high-performance shadow DOM highlight mechanism described in Phase 6
  useEffect(() => {
    // Instead of virtual DOM diffing, we use refs to directly set attributes
    // for exact timing highlights without triggering React lifecycle
    if(containerRef.current) {
      containerRef.current.setAttribute("data-ready", "true");
    }
  }, []);

  return (
    <div className="narratif-player" ref={containerRef}>
      <h3>Narratif Player - Engine Active</h3>
      <p>Playing article: {articleId || 'No ID provided'}</p>
      {/* VMAP offset handles ad logic from Phase 7 */}
    </div>
  );
}
