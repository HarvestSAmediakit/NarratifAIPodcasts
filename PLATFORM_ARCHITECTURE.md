# Narrative Protocol - Master API Roadmap & Platform Architecture

This document defines the architectural standard for the Narrative Protocol (Global Audio Intelligence Platform). All backend logic, AI generation, and scaling infrastructure must adhere to these endpoints and models.

## 1. Dynamic Persona Registry & Context
Instead of static prompts, the platform is driven by a `Brand Profile` (Publisher Context).

**Database Schema (Publisher Profile):**
```json
{
  "publisher_id": "aus_mining_mag_01",
  "brand_name": "Australia Mining Review",
  "industry_context": "Deep Mining, Resources, ESG, Heavy Machinery",
  "target_audience": "Site managers, mining engineers, investors",
  "host_personas": {
    "host_1_name": "Jack",
    "host_2_name": "Sarah",
    "accent_code": "en-AU"
  }
}
```

## Phase 1: The Core Generation Pipeline & Human-in-the-Loop
We cannot fully trust AI for final production in a professional setting. The pipeline must allow human intervention.

*   **`GET /api/v1/brand-config/:publisher_id`**
    *   Fetches the active brand configuration (colors, logo, typography) to dynamically style the player Embed.
*   **`POST /api/v1/script-generation`**
    *   **Logic:** Replaces direct audio generation.
    *   **RAG Injection:** Performs a RAG search ("Latest trends in [Industry Context]") before generating.
    *   **Output:** Returns a structured JSON *text* transcript, NOT audio.
*   **The "Human-in-the-Loop" Editor (Frontend)**
    *   A dashboard tab where the publisher reviews the generated script, fixes pronunciation of industry-specific terms, and rephrases before approval.
*   **`POST /api/v1/audio-generation`**
    *   Triggered *after* the editor approves the script. Maps the exact script segments to the correct Accent-Category Voice ID and synthesizes the MP3s.

## Phase 2: Analytics Reporting (Proving ROI)
To turn this from a tool into a business necessity, we track listener engagement.

*   **`POST /api/v1/analytics/events`**
    *   Listens to the embed player. Captures `play`, `pause`, `completion (rate)`, and `CTA_click`.
*   **`GET /api/v1/analytics/dashboard`**
    *   Aggregates data for the given publisher.
    *   KPIs: Listen-Through Rate, Total Article vs. Audio Engagement time.

## Phase 3: Audio Distribution (The RSS Bridge)
Embedded audio is only step one. Publishers need syndication to grow audiences.

*   **`GET /api/v1/feed/:publisher_id/rss.xml`**
    *   Automatically generates a highly compliant Podcast RSS Feed containing all approved + generated episodes for the publisher.
    *   One-click sync pipeline to Spotify and Apple Podcasts.

---
**Core Tenets:**
1. **Does it sound right?** Ensure the Master Prompt Factory uses regional accuracy and industry terminology.
2. **Can they trust it?** The Transcript Editor is the safety net.
3. **Does it grow their audience?** The RSS Feed scales their reach.
4. **Does it prove ROI?** The Analytics Dashboard justifies the cost.
