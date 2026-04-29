import { useState, useRef } from 'react';
import { z } from 'zod';

// 1. Schema-First Development: Enforce strict AI outputs
export const PodcastSchema = z.object({
  title: z.string(),
  teaser: z.string(),
  duration: z.string(),
  transcript: z.array(z.object({
    speaker: z.string(),
    text: z.string()
  })),
  takeaways: z.array(z.string()),
  tags: z.array(z.string())
});

export type PodcastData = z.infer<typeof PodcastSchema>;

interface GenerationParams {
  articleBody: string;
  title: string;
  category: string;
  format: string;
  host1Name: string;
  host2Name?: string;
}

export const usePodcastGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PodcastData | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // 2. High-Quality Fallback Script Template
  const generateFallback = (params: GenerationParams): PodcastData => ({
    title: params.title || "Industry Insights: Deep Dive",
    teaser: "We unpack the critical details of this topic and what it means for the future.",
    duration: "3:45",
    transcript: [
        { speaker: params.host1Name, text: "Welcome to this episode." },
        { speaker: params.host2Name || "Njabulo", text: "Today we are looking at something very interesting." }
    ],
    takeaways: [
      "Early adoption provides a measurable competitive advantage.",
      "Operational strategies must shift to accommodate new data.",
      "Continuous monitoring of this sector is highly recommended."
    ],
    tags: [params.category.toLowerCase(), "insights", "deep-dive"]
  });

  const generate = async (params: GenerationParams) => {
    setLoading(true);
    setError(null);
    setProgress(10);
    setStage('Analyzing article structure...');

    abortControllerRef.current = new AbortController();

    const prompt = `You are producing a high-quality podcast episode.
    TITLE: ${params.title}
    CATEGORY: ${params.category}
    FORMAT: ${params.format === "two-host"? `${params.host1Name} and ${params.host2Name}` : `Solo by ${params.host1Name}`}
    ARTICLE: ${params.articleBody.substring(0, 3000)}
    
    REQUIREMENTS:
    - 10-14 exchanges. Conversational style.
    - Return ONLY valid JSON matching this exact schema:
    { 
      "title": "string", 
      "teaser": "string", 
      "duration": "string", 
      "transcript": [{ "speaker": "string", "text": "string" }], 
      "takeaways": ["string"], 
      "tags": ["string"] 
    }`;

    const maxRetries = 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        if (attempt > 0) {
            setStage(`Network issue. Retrying (Attempt ${attempt}/${maxRetries})...`);
        }

        // Using our server API instead of direct Anthropic for safety and credential management
        const res = await fetch("/api/v1/generate-transcript", {
          method: "POST",
          signal: abortControllerRef.current.signal,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ prompt }),
        });

        // 3. Transient vs Permanent Error Handling
        if (!res.ok) {
          if (res.status === 429 || res.status >= 500) {
            throw new Error(`Transient Error: ${res.status}`);
          }
          throw new Error(`Permanent Error: ${res.status}`);
        }

        setProgress(60);
        setStage('Writing conversational script...');

        const json = await res.json();
        // The server API returns { segments: [...] } or { text: "..." }
        // Our server endpoint /api/v1/generate-transcript is designed to return JSON.
        
        let validatedData;
        try {
            // We expect the server to return the JSON structure directly since it's using Gemini with responseMimeType: "application/json"
            validatedData = PodcastSchema.parse(json);
        } catch (parseError) {
            console.error("Zod Parse Error:", parseError);
            // Try to recover if it's in a slightly different format (e.g. wrapped in a field)
            if (json.segments) {
                // Adapt existing server format to expected Studio format
                validatedData = PodcastSchema.parse({
                    title: params.title,
                    teaser: params.title,
                    duration: "4:00",
                    transcript: json.segments,
                    takeaways: ["Extracted from transcript"],
                    tags: [params.category]
                });
            } else {
                throw parseError;
            }
        }

        setProgress(95);
        setStage('Finalizing audio parameters...');

        setTimeout(() => {
          setData(validatedData);
          setProgress(100);
          setLoading(false);
        }, 600);

        return; // Success, exit the loop

      } catch (err: any) {
        if (err.name === 'AbortError') return;

        attempt++;
        
        if (attempt > maxRetries || err.message.includes('Permanent')) {
          console.error("API failed permanently. Using fallback.", err);
          setData(generateFallback(params));
          setProgress(100);
          setLoading(false);
          setError("Generated using fallback due to network constraints.");
          return;
        }

        // 5. Exponential Backoff with Jitter
        const baseDelay = Math.min(1000 * (2 ** attempt), 10000);
        const jitter = Math.random() * 300; 
        await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
      }
    }
  };

  const cancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      setStage('Cancelled');
    }
  };

  return { generate, cancel, data, loading, progress, stage, error };
};
