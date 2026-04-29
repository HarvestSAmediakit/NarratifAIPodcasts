# Narrative Protocol: Technical Specification

## 1. Overview
The Narrative Protocol is a unified system that renders a branded, SEO-optimized, interactive audio player inside any digital publication. 

**Core Principle:** The `loader.js` script is the intelligence; the `iframe` is merely the display window.

## 2. Architecture: The "Loader" Pattern
Do not provide static `<iframe>` codes to publishers. Provide a single loader script.

### A. The Loader Script (`loader.js`)
*   **Responsibility:** 
    1.  Scans the page for specific `div` classes (e.g., `<div class="narrative-player" data-episode-id="..."></div>`).
    2.  Fetches the Brand Configuration from the Brand API.
    3.  Injects the `JSON-LD` (Schema.org) into the page `<head>` for SEO.
    4.  Renders the `iframe` dynamically, injecting the CSS variables for branding.

### B. The Brand API (`GET /api/v1/brand-config/:publisher_id`)
*   **Purpose:** Centralizes branding so publishers can update their look across 1,000+ articles in seconds.
*   **Expected JSON Response:**
    ```json
    {
      "publisher_name": "HARVEST SA",
      "logo_url": "https://assets.harvestsa.com/logo.png",
      "primary_color": "#2D6A4F",
      "font_family": "Lora, serif"
    }
    ```

## 3. Implementation Logic

### A. The Branded Player
Inside the `iframe`, use CSS variables to map dynamic styles:
```css
:root {
  --brand-color: #000000;
  --brand-font: sans-serif;
}
/* Apply to UI elements */
.play-button { background-color: var(--brand-color); }
.episode-title { font-family: var(--brand-font); }
```

### B. SEO Bridge (Dynamic Metadata)
The `loader.js` **must** inject schema to ensure Google recognizes the audio content.
*   **Logic:**
    ```javascript
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "PodcastEpisode",
      "name": episodeTitle,
      "associatedMedia": { "@type": "MediaObject", "contentUrl": audioUrl }
    });
    document.head.appendChild(script);
    ```

### C. Engagement Layer (The "Narrative" Features)
*   **Binge-Ready Queue:** At `0:00` (end of track) + 30s, the player must query `GET /api/v1/recommendations` and render a 5-second teaser overlay.
*   **Capture CTA:** Listeners at `70%` completion trigger a pop-up injected by `loader.js` (e.g., a newsletter sign-up form).

## 4. Development Standards
*   **Zero-State Integrity:** If the Brand API fails, the player **must** default to a clean, "Narrative-standard" dark theme rather than breaking or showing blank elements.
*   **Performance:** The `loader.js` must be asynchronous. It cannot block the loading of the publisher’s article.
*   **Responsive:** The `iframe` must resize dynamically. Use `postMessage` API to communicate height changes between the `iframe` and the parent page.

## 5. Success Metrics
*   **SEO:** Articles containing the `loader.js` must report `PodcastEpisode` schema in Google Search Console.
*   **Engagement:** The "Up Next" queue and "Capture CTA" must track interaction rates in the publisher's analytics dashboard.
*   **Consistency:** Every player on a domain **must** display the exact same `brand_color` and `logo_url` retrieved from the Brand API at runtime.

***

**Instruction to Team:** *"Do not deviate from the Loader Pattern. If you are tempted to provide a hard-coded iframe, stop. Everything—branding, SEO, and interactivity—must be controlled by `loader.js`."*
