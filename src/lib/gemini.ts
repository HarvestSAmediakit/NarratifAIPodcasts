import { GoogleGenAI } from "@google/genai";
import { Podcast } from "../constants";

class ProxyGenAI {
  models = {
    generateContent: async (params: any) => {
      const res = await fetch("/api/v1/gemini-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      });
      if (!res.ok) {
        let msg = await res.text();
        try { msg = JSON.parse(msg).error; } catch(e){}
        throw new Error(msg || "Gemini proxy error");
      }
      return await res.json();
    }
  };
}

// Intercept AI Studio browser calls to use our server proxy
const ai = new ProxyGenAI() as any;

function parsePodcastScript(rawText: string, host1Name: string, host2Name: string) {
    const cleanText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    try {
        const data = JSON.parse(cleanText);
        if (data.transcript && Array.isArray(data.transcript)) {
            return data;
        }
        if (data.script && Array.isArray(data.script)) {
            return {
                title: "Generated Episode",
                teaser: "Narratif Audio Deep-Dive",
                takeaways: [],
                tags: [],
                transcript: data.script.map((s: any) => ({
                    speaker: s.speaker,
                    text: s.text,
                    ssml: s.ssml
                }))
            };
        }
    } catch (e) {
        console.warn("[PARSER] JSON parsing failed, attempting fallback line parsing.");
    }

    // Fallback: line-by-line parsing if Gemini doesn't return valid JSON
    const transcript: any[] = [];
    let title = "Generated Episode";
    
    // Improved regex to capture Speaker, Emotion (optional), and the Dialogue
    // Captures: Speaker [Emotion]: Text
    const pattern = /(?:\*\*)?([a-zA-Z0-9\s]+)(?:\*\*)?(?:\s*\[(.*?)\])?:\s*(.*?)(?=\n(?:\*\*)?[a-zA-Z0-9\s]+(?:\*\*)?(?:\s*\[.*?\])?:|$)/gs;
    
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
        const speaker = match[1].trim();
        const emotion = match[2] ? match[2].trim() : null;
        let text = match[3].trim();
        
        // If we have an emotion, prepend it to text for the TTS engine to find
        if (emotion) {
            text = `[${emotion}] ${text}`;
        }
        
        transcript.push({ speaker, text });
    }

    if (transcript.length === 0) {
        // Absolute fallback for simple lines
        const lines = rawText.split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const simpleMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
            if (simpleMatch) {
                transcript.push({ speaker: simpleMatch[1].trim(), text: simpleMatch[2].trim() });
            }
        }
    }

    if (transcript.length > 0) {
        return {
            title,
            teaser: "Conversational summary.",
            takeaways: ["Key insight from the article."],
            transcript,
            tags: ["fallback"],
        };
    }

    return null;
}

export async function analyzeMagazineIssue(pdfText: string): Promise<any> {
    const prompt = `You are an expert editorial assistant. 
    Analyze the following text extracted from a magazine PDF. 
    Identify the issue title, all major articles, and any prominent advertisers mentioned.
    
    RETURN JSON ONLY:
    {
      "title": "Main Magazine Title & Issue Focus",
      "issueNumber": "e.g. Vol 42",
      "month": "Month",
      "year": "Year",
      "articles": [
        {
          "title": "Article Title",
          "summary": "1-sentence hook",
          "content": "A detailed 4-5 paragraph summary based on the text",
          "category": "e.g. Finance, Tech, Lifestyle",
          "takeaways": ["Key point 1", "Key point 2"]
        }
      ],
      "advertisers": [
        {
          "name": "Brand Name",
          "context": "Short description of what they do or their ad offer mentioned in text"
        }
      ]
    }

    MAGAZINE TEXT:
    ${pdfText.substring(0, 30000)} // Limiting to prevent token overflow for now`;

    const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || "{}");
}

export async function generateTranscript(
  body: string,
  fmt: string,
  nationality: string = "en-ZA",
  publisherName: string = "Harvest SA",
  industryContext: string = "General",
  targetAudience: string = "General readers",
  host1?: any,
  host2?: any,
  title?: string,
  narrativeStyle: string = "standard",
  advertisers: string = "Generic industry partners, or specific ones mentioned in the article"
): Promise<Partial<Podcast>> {
  const host1Name = host1?.name || "Host 1";
  const host2Name = host2?.name || "Host 2";
  const accent = nationality ? `${nationality} accent and cultural context` : "South African accent and local flavor";

  const prompt = `Act as a professional podcast script-writer for Narratif, an AI-powered podcast studio for media companies.

You are creating a premium, two-host podcast episode for a written media outlet called "${publisherName}".

Article context:
- Media outlet name: ${publisherName}
- Type: Magazine / Digital Outlet
- Section / topic: ${industryContext || 'General'}
- Article title: ${title || 'Untitled Article'}
- Main advertiser(s): ${advertisers}
- Target audience: ${targetAudience || 'General Readers'}

Hosts:
- Host 1 - ${host1Name} (The Guide):
  - Senior, authoritative, calm, and clear.
  - Explains the article, cites data, and frames the story.
- Host 2 - ${host2Name} (The Curious Co-Host):
  - Inquisitive, practical, and critical.
  - Asks "What does this mean for me?" and challenges assumptions.
  - Brings in real-world examples and wider context.

Your task:
Generate a **two-host, conversational podcast episode** script between ${host1Name} and ${host2Name} in the style of a Narrative-style deep-dive talk podcast. The episode should help listeners **understand a complex article** they might otherwise skip or struggle with, and it should naturally **promote the magazine and its advertisers**.

Output format:
- Return a JSON object with one field:
  - "script": an array of dialogue turns.
- Each turn is an object:
  - "speaker": "${host1Name}" or "${host2Name}"
  - "text": the spoken line (plain natural language, no markdown).
  - Optional: "ssml": string with SSML for pauses, emphasis, or speed (for TTS).

Rules:
- Length: Aim for roughly 1000-1500 words total (enough for a 6-10 minute episode).
- Tone:
  - Conversational, friendly, and engaging.
  - Use short sentences and contractions.
  - Allow slight interruptions, reactions, and back-and-forth.
- Style:
  - ${host1Name} often starts paragraphs and sets the context.
  - ${host2Name} asks questions, raises objections, and adds practical examples.
  - Keep the balance:
    - 60% expert insight and data.
    - 30% practical "what it means for the listener" takeaways.
    - 10% natural promotional mentions (magazine + advertiser).

Episode structure (guidelines, not strict headings):
1. Opening hooks (0:00-1:00)
   - ${host1Name} opens the episode:
     - Greets the listener.
     - States the episode title (article topic) and why it matters.
     - Mentions the media outlet: "You're listening to ${publisherName}, powered by Narratif."
   - ${host2Name} chimes in:
     - "I read this article and the first thing that stood out to me was..."

2. Deep-dive explanation (1:00-end)
   - ${host1Name} explains:
     - The core idea.
     - Key data points.
     - Any charts or trends (explain as if the listener is hearing, not seeing).
   - ${host2Name}:
     - Asks 2-4 natural questions, such as:
       - "How realistic is this for [target audience]?"
       - "What's the biggest risk or downside?"
       - "Are there better alternatives available?"
       - "What should I do differently after listening to this?"
   - They:
     - Interact with each other, sometimes disagreeing or joking lightly.
     - Keep the audience engaged by:
       - Using "real-life" language.
       - Avoiding robotic lecture style.

3. Promotional bridges (integrated throughout)
   - In a natural way, weave in:
     - Magazine promotion:
       - "If you want to see the full charts and case studies, grab the ${publisherName} print/digital issue or visit their website."
       - "This is just a snapshot; the full article runs over several pages and includes more detail."
     - Advertiser promotion:
       - "This episode is brought to you by ${advertisers}, which helps [target audience] with [specific value] and you can learn more at [website] or in the ad on page [X]."
       - "If you're already using [similar product], you might compare it with what [Advertiser] is doing here."
   - These mentions must feel:
     - Casual, not pushy.
     - Placed during a natural pause or transition, not crammed into the middle of a deep point.

4. Closing recap and call-to-action (last 1-2 minutes)
   - ${host1Name}:
     - Does a quick 3-5 item recap of the top takeaways in spoken-style bulleted form.
     - Example: "So, to recap: first, [idea 1]; second, [idea 2]; third, [idea 3]."
   - ${host2Name}:
     - Adds one final practical action: "If you're a reader, the one thing you should do differently is..."
   - They:
     - End with a short call-to-action:
       - "Subscribe to ${publisherName} to get every issue, including the next deep-dive on [teaser topic]."
       - "If you enjoyed this episode, share it with a friend who also reads ${publisherName}."
     - Note that the episode is "powered by Narratif" (one light branding mention).

Final output MUST BE valid JSON strictly matching:
{
  "script": [
    {
      "speaker": "${host1Name}",
      "text": "Welcome to Narratif Podcast. Today we're talking about...",
      "ssml": "<prosody rate='0.95'>Welcome to Narratif Podcast. Today we're talking about...</prosody>"
    },
    {
      "speaker": "${host2Name}",
      "text": "I read the article, and the first thing...",
      "ssml": "I read the article, and the first thing..."
    }
  ]
}

Do not:
- Add extra JSON fields.
- Use markdown (**bold**, lists, etc.) in the text.
- Use fictional or hallucinated advertisers; only use the ones provided in ${advertisers}.

---
ARTICLE TO TRANSFORM:
${body}`;

  try {
    // Attempt server-side generation first because it has all the keys (OpenAI, Anthropic, xAI)
    const res = await fetch("/api/v1/generate-transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    
    if (res.ok) {
       return await res.json();
    }
    console.warn("[CLIENT] Server-side generation failed, falling back to direct browser Gemini call.");
  } catch (e) {
    console.warn("[CLIENT] Error calling server-side generation:", e);
  }

  // Fallback to direct browser Gemini call (Free Tier)
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" }
  });

  const parsed = parsePodcastScript(response.text || "", host1Name, host2Name);
  if (!parsed) throw new Error("Failed to parse generating script");
  return parsed;
}

export async function analyzeArticle(articleText: string): Promise<any> {
    const prompt = `Act as a senior media strategist for Narratif. 
    Analyze the provided article content and determine the optimal podcast brand parameters.
    
    GUIDELINES:
    1. Identify the core industry (e.g., Mining, ESG, Agriculture).
    2. Define the exact target audience (e.g., Commercial farmers in Free State, Mining engineers).
    3. Select the best matching regional accent (from: en-ZA, en-US, en-GB, en-NG, en-AU, en-IN).
    4. Select two specific voice IDs that have compatible tones for this topic.
    
    AVAILABLE VOICES (ID: NAME):
    SOUTH AFRICA: za-1: Daniel, za-2: Michelle, za-3: Thandi, za-4: Thabo
    US: us-1: James, us-2: Sophia, us-3: Becca, us-4: Marcus
    UK: gb-1: Alistair, gb-2: Emma, gb-3: Miles, gb-4: Chloe
    NIGERIA: ng-1: Chidi, ng-2: Amara, ng-3: Tunde, ng-4: Ife
    AUSTRALIA: au-1: Lachlan, au-2: Kylie, au-3: Heath, au-4: Maya
    INDIA: in-1: Arjun, in-2: Priya, in-3: Dev, in-4: Ananya

    RETURN JSON ONLY:
    {
      "industryContext": "string",
      "targetAudience": "string",
      "accent": "string (language code)",
      "voice1": "string (id)",
      "voice2": "string (id)"
    }

    ARTICLE CONTENT:
    ${articleText}`;

    const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || "{}");
}

export async function refineScriptLine(currentText: string, instruction: string, speaker: string, hostInfo?: any): Promise<string> {
    const hostContext = hostInfo ? `Host Profile: ${hostInfo.name}, ${hostInfo.role}. Style: ${hostInfo.style}` : "A podcast host";
    const prompt = `Refine this podcast transcript segment for speaker "${speaker}".
    ${hostContext}
    Current Segment: "${currentText}"
    Instruction: "${instruction}"
    Guidelines: MAXIMUM 3 sentences. No quotes unless part of the speech.`;

    const result = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return result.text?.trim() || currentText;
}

export async function generateVideoScript(
    articleText: string, 
    videoType: "highlight" | "explainer",
    magazineName: string = "Narratif"
): Promise<any> {
    const prompt = `You are a video producer for ${magazineName}. From this article, create JSON for a ${videoType} video.

Video Types:
- "highlight": 15-60s clip, TikTok/Reels style. Punchy hook. One speaker.
- "explainer": 1-5min deep dive, YouTube/LinkedIn style. Two-host narration or detailed single host.

Return JSON ONLY in this format:
{
  "title": "A short engaging title for the video",
  "scenes": [
    {
      "duration": 5,
      "script": {"speaker": "Host Name", "text": "Spoken text..."},
      "visual": "Visual instruction (e.g. b-roll of maize fields, split-screen)",
      "caption": "On-screen text or key stat",
      "transition": "fade or cut"
    }
  ],
  "voice": "en-ZA-professional",
  "music": "upbeat-corporate"
}

Article: ${articleText.substring(0, 5000)}`;

    const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || "{}");
}
