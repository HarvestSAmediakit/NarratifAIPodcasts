(function() {
  async function initNarrativePlayers() {
    const players = document.querySelectorAll('.narrative-player');
    
    players.forEach(async (container) => {
      // Don't initialize twice
      if (container.dataset.initialized) return;
      container.dataset.initialized = 'true';
      
      const publisherId = container.dataset.publisher;
      const episodeId = container.dataset.episode;
      
      if (!publisherId || !episodeId) {
        console.warn('Narrative Player: Missing data-publisher or data-episode attribute');
        return;
      }
      
      let baseHost = window.location.origin;
      const scriptTags = document.getElementsByTagName('script');
      for (let i = 0; i < scriptTags.length; i++) {
        const src = scriptTags[i].src;
        if (src && src.includes('loader.js')) {
          const url = new URL(src);
          baseHost = url.origin;
          break;
        }
      }

      // 1. Fetch Brand Config and Episode Meta from Intelligence API
      let configData = null;
      try {
        // We'll use the brand-config API as our "Intelligence" endpoint
        const response = await fetch(`${baseHost}/api/v1/brand-config/${publisherId}?episode=${episodeId}`);
        if (response.ok) {
          configData = await response.json();
        } else {
          throw new Error("Fetch failed");
        }
      } catch (e) {
        console.warn('Narrative: Failed to load intelligence logic.', e);
        // Fallback for Zero-State Integrity
        configData = {
          publisher_name: 'Narratif',
          brandColor: '#111827',
          primary_color: '#111827',
          font_family: 'system-ui, sans-serif',
          playerStyle: 'dark'
        };
      }

      // 2. SEO Bridge: Inject JSON-LD
      if (configData && configData.seo) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.text = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "PodcastEpisode",
          "name": configData.seo.title || "Audio Article",
          "description": configData.seo.description || "Listen to this article",
          "associatedMedia": { 
            "@type": "MediaObject", 
            "contentUrl": configData.seo.audioUrl || "" 
          }
        });
        document.head.appendChild(script);
      }
      
      // 3. Render the iFrame Window
      const iframe = document.createElement('iframe');
      
      const qs = new URLSearchParams();
      if (configData.publisher_name === 'Narratif') {
        qs.set('fb_name', configData.publisher_name);
        qs.set('fb_theme', configData.playerStyle);
        qs.set('fb_font', configData.font_family);
        qs.set('fb_color', configData.primary_color);
      }
      const qsString = qs.toString() ? `?${qs.toString()}` : '';
      
      iframe.src = `${baseHost}/embed/${publisherId}/${episodeId}${qsString}`;
      iframe.style.width = '100%';
      iframe.style.height = '160px'; // Initial height
      iframe.style.border = 'none';
      iframe.style.borderRadius = '16px';
      iframe.style.overflow = 'hidden';
      iframe.title = 'Narratif Audio Player';
      iframe.allow = 'autoplay';
      
      // 4. Handle Interactive Layer (Overlays & Capture CTA)
      window.addEventListener('message', (event) => {
        if (event.origin !== baseHost) return;
        
        if (event.data && event.data.episodeId === episodeId) {
          if (event.data.type === 'narrative-resize') {
            iframe.style.height = `${event.data.height}px`;
          }
          if (event.data.type === 'narrative-capture') {
            // Render Capture CTA locally on the publisher's site over the player
            renderCaptureCTA(container, event.data.configData || configData);
          }
          if (event.data.type === 'narrative-annotation') {
            renderAnnotation(container, event.data.annotation, event.data.configData || configData);
          }
        }
      });
      
      container.appendChild(iframe);
    });
  }

  function renderAnnotation(container, annotation, configData) {
    if (!annotation || !annotation.type) return;
    
    // Fallback brand color
    const brandColor = configData?.brandColor || configData?.primary_color || "#111827";

    if (annotation.type === 'highlight') {
      try {
        const data = annotation.data || {};
        const el = document.querySelector(data.selector || 'p:first-of-type');
        if (el) {
          const originalBg = el.style.backgroundColor;
          el.style.backgroundColor = data.color || 'rgba(59, 130, 246, 0.2)';
          el.style.transition = 'background-color 0.5s ease';
          
          // Smooth scroll to highlight
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });

          setTimeout(() => {
            el.style.backgroundColor = originalBg;
          }, 8000);
        }
      } catch (e) {
        console.warn('Narrative: highlight failed', e);
      }
    } else if (annotation.type === 'image_overlay') {
      try {
        const data = annotation.data || {};
        if (!data.url) return;

        // Create overlay modal
        const overlay = document.createElement('div');
        overlay.className = 'narrative-image-overlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
        overlay.style.zIndex = '99999';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.animation = 'fadeDown 0.3s ease';
        
        overlay.onclick = () => overlay.remove();

        overlay.innerHTML = `
          <button style="position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.1); border: none; color: white; cursor: pointer; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <img src="${data.url}" style="max-width: 90%; max-height: 80vh; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);" />
          ${data.caption ? `<div style="color: white; font-family: system-ui; margin-top: 16px; font-size: 16px; font-weight: 500;">${data.caption}</div>` : ''}
        `;
        document.body.appendChild(overlay);

        // Auto remove
        setTimeout(() => { if (document.body.contains(overlay)) overlay.remove(); }, 15000);
      } catch (e) {
        console.warn('Narrative: image_overlay failed', e);
      }
    } else if (annotation.type === 'cta_popup') {
      try {
        const data = annotation.data || {};
        
        // Remove existing CTA
        const existing = document.querySelector('.narrative-interactive-cta');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'narrative-interactive-cta';
        overlay.style.position = 'absolute';
        overlay.style.top = '10px';
        overlay.style.right = '10px';
        overlay.style.backgroundColor = '#ffffff';
        overlay.style.padding = '12px 16px';
        overlay.style.borderRadius = '8px';
        overlay.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        overlay.style.zIndex = '9998';
        overlay.style.fontFamily = 'system-ui, sans-serif';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.gap = '12px';
        overlay.style.animation = 'fadeDown 0.3s ease';

        overlay.innerHTML = `
          <div style="flex: 1;">
            <div style="font-size: 13px; font-weight: 600; color: #111827;">${data.text || 'Find out more'}</div>
          </div>
          ${data.url ? `<a href="${data.url}" target="_blank" style="padding: 6px 12px; background-color: ${brandColor}; color: white; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">Action</a>` : ''}
          <button class="narrative-close-cta" style="background: none; border: none; cursor: pointer; color: #9CA3AF; padding: 4px;">&times;</button>
        `;

        // Ensure style exists for animation
        if (!document.getElementById('narrative-styles')) {
          const style = document.createElement('style');
          style.id = 'narrative-styles';
          style.textContent = '@keyframes fadeDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }';
          document.head.appendChild(style);
        }

        container.style.position = 'relative';
        container.appendChild(overlay);

        overlay.querySelector('.narrative-close-cta').onclick = () => overlay.remove();
        setTimeout(() => { if (container.contains(overlay)) overlay.remove(); }, 12000);
      } catch (e) {
        console.warn('Narrative: cta_popup failed', e);
      }
    }
  }

  function renderCaptureCTA(container, configData) {
    // Avoid duplicate CTAs
    if (container.querySelector('.narrative-cta-overlay')) return;

    const publisherName = configData?.name || configData?.publisher_name || "us";
    const brandColor = configData?.brandColor || configData?.primary_color || "#000";

    const overlay = document.createElement('div');
    overlay.className = 'narrative-cta-overlay';
    overlay.style.position = 'absolute';
    overlay.style.bottom = '10px';
    overlay.style.left = '10px';
    overlay.style.right = '10px';
    overlay.style.backgroundColor = '#ffffff';
    overlay.style.padding = '16px';
    overlay.style.borderRadius = '12px';
    overlay.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    overlay.style.zIndex = '9999';
    overlay.style.fontFamily = 'system-ui, sans-serif';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.gap = '12px';

    overlay.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: #111827;">Want more insights?</h4>
        <button class="narrative-close-cta" style="background: none; border: none; cursor: pointer; color: #9CA3AF;">&times;</button>
      </div>
      <p style="margin: 0; font-size: 13px; color: #4B5563;">Join the ${publisherName} mailing list for exclusive content.</p>
      <form style="display: flex; gap: 8px;" onsubmit="event.preventDefault(); this.innerHTML = '<span style=\\'font-size: 13px; color: #10B981; font-weight: 600;\\'>Subscribed!</span>'; setTimeout(() => this.parentElement.remove(), 2000);">
        <input type="email" placeholder="Your email address" required style="flex: 1; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 13px;">
        <button type="submit" style="background-color: ${brandColor}; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Subscribe</button>
      </form>
    `;

    // Make parent relative to anchor absolute overlay
    container.style.position = 'relative';
    container.appendChild(overlay);

    overlay.querySelector('.narrative-close-cta').onclick = () => overlay.remove();
  }

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNarrativePlayers);
  } else {
    initNarrativePlayers();
  }
})();
