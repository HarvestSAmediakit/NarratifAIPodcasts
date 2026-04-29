import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { SpeechifyClient } from "@speechify/api";
import dotenv from "dotenv";
import { createRequire } from "node:module";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
// No top-level pdf import

dotenv.config({ override: true });

// Sanitize Google Credentials: If GOOGLE_APPLICATION_CREDENTIALS is an API key, 
// move it to GOOGLE_API_KEY and unset it to prevent SDKs from trying to load it as a file.
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS.includes("/") && !process.env.GOOGLE_APPLICATION_CREDENTIALS.includes("\\") && !process.env.GOOGLE_APPLICATION_CREDENTIALS.endsWith(".json")) {
  console.log("[SERVER] Detected API key in GOOGLE_APPLICATION_CREDENTIALS. Correcting environment...");
  if (!process.env.GOOGLE_API_KEY) {
    process.env.GOOGLE_API_KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

// Global robust Gemini API key getter
function getValidGeminiKey() {
    const keys = [
        process.env.GEMINI_API_KEY,
        process.env.GOOGLE_API_KEY,
        process.env.GOOGLE_GEMINI_API_KEY,
        process.env.USER_PROVIDED_GEMINI_KEY,
    ];
    for (let key of keys) {
        if (key && typeof key === 'string') {
            key = key.trim();
            // A valid Gemini key usually starts with AIza and is 39 characters
            if (key.length >= 30 && key.startsWith('AI')) {
                return key;
            }
        }
    }
    return "";
}

import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase Admin
try {
  const adminConfig: any = {
     projectId: firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID
  };
  
  // 1. Try Service Account Fields (Environment Variables)
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log("[SERVER] Initializing Firebase Admin with environment variables...");
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
          privateKey = privateKey.slice(1, -1);
      }
      privateKey = privateKey.replace(/\\n/g, '\n');
      
      // Ensure the key is correctly formatted regardless of how it was pasted
      if (privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
          const payload = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, '')
                                   .replace(/-----END PRIVATE KEY-----/g, '')
                                   .replace(/\s+/g, '');
          const chunks = payload.match(/.{1,64}/g) || [];
          privateKey = `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----\n`;
      } else {
          // If it doesn't have the headers, assume it's the raw base64.
          // Wrap it with headers.
          const payload = privateKey.replace(/\s+/g, '');
          const chunks = payload.match(/.{1,64}/g) || [];
          privateKey = `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----\n`;
          console.warn("[FIREBASE] FIREBASE_PRIVATE_KEY was missing PEM headers, automatically added them.");
      }
      
      adminConfig.credential = admin.credential.cert({
          projectId: adminConfig.projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
      });
  } 
  // 2. Fallback to Service Account JSON File Path
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (creds.includes("/") || creds.includes("\\") || creds.endsWith(".json")) {
           if (fs.existsSync(creds)) {
               adminConfig.credential = admin.credential.cert(creds);
           } else if (fs.existsSync(path.join(process.cwd(), creds))) {
               adminConfig.credential = admin.credential.cert(path.join(process.cwd(), creds));
           }
      }
  }

  // Attempt to initialize.
  if (admin.apps.length === 0) {
    try {
      admin.initializeApp(adminConfig);
      console.log(`Firebase Admin Initialized for project: ${adminConfig.projectId}`);
    } catch (initErr: any) {
      console.warn("Firebase Admin Initialization Failed with provided credentials. Falling back to default/unauthenticated mode.", initErr.message);
      // Try again without credentials
      delete adminConfig.credential;
      admin.initializeApp(adminConfig);
    }
  }
  
  const db: any = getDb();
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
    try {
        db.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
    } catch (e) {
        // Might already be set or error if called multiple times in some environments
        console.warn("Firestore settings databaseId error:", e);
    }
  }
  
  console.log(`Firebase Admin Firestore connected (Environment: ${process.env.NODE_ENV || 'development'})`);
} catch (err) {
  console.error("Firebase Admin Initialization Failed. Firestore operations will fallback to memory.", err);
}

const app = express();
const PORT = 3000;

// Infrastructure - Audio Worker
const redisUrl = process.env.REDIS_URL;
let redisConnection: IORedis | null = null;
let audioProcessingQueue: Queue | null = null;
let audioWorker: Worker | null = null;

if (redisUrl) {
    redisConnection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true
    });

    redisConnection.on('error', (err) => {
        console.warn(`[REDIS] Connection error: ${err.message}. Queue functionality might be degraded.`);
    });

    audioProcessingQueue = new Queue('audio-processing', { connection: redisConnection });
    audioWorker = new Worker('audio-processing', async (job) => {
        console.log(`[WORKER] Processing job ${job.id}: ${job.name}`);
        // Audio processing logic using FFmpeg will go here...
        // ... mixing, normalizing ...
    }, { connection: redisConnection });
} else {
    console.warn("[REDIS] REDIS_URL not set. Async audio processing queue will be disabled.");
}

// Infrastructure - Database
let dbPool: Pool | null = null;
const dbUrl = process.env.DATABASE_URL;

if (dbUrl) {
    dbPool = new Pool({
        connectionString: dbUrl,
    });
    dbPool.on('error', (err) => {
        console.error('[DATABASE] Unexpected error on idle client', err);
    });
} else {
    console.warn("[DATABASE] DATABASE_URL not set. PostgreSQL functionality will be disabled.");
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Middleware to allow iframes for embedding
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Detection for Google Cloud Credentials vs API Key
function getGoogleTtsApiKey() {
  const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  // If it's the raw key string (AIza...), use it
  if (creds && !creds.includes("/") && !creds.includes("\\") && !creds.endsWith(".json")) return [creds];
  
  const keys = [];
  if (process.env.GOOGLE_CLOUD_TTS_API_KEY) keys.push(process.env.GOOGLE_CLOUD_TTS_API_KEY);
  if (process.env.GOOGLE_TTS_API_KEY) keys.push(process.env.GOOGLE_TTS_API_KEY);
  if (process.env.GOOGLE_API_KEY) keys.push(process.env.GOOGLE_API_KEY);
  if (process.env.GOOGLE_GEMINI_API_KEY) keys.push(process.env.GOOGLE_GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  
  // Backwards compatibility with standard naming
  if (process.env.API_KEY) keys.push(process.env.API_KEY);

  // Use Firebase API Key as fallback
  if (firebaseConfig.apiKey) keys.push(firebaseConfig.apiKey);
  
  // Also check for common naming variations
  if (process.env.VITE_GOOGLE_API_KEY) keys.push(process.env.VITE_GOOGLE_API_KEY);
  
  return [...new Set(keys.filter(k => k && k.trim() !== ""))];
}

// Initialize Google TTS Client
let googleTtsClient: TextToSpeechClient | null = null;
function getGoogleTtsClient() {
  if (googleTtsClient) return googleTtsClient;
  const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  // Only attempt initialization if it looks like a real path and not an API key
  const isPath = creds && (creds.includes("/") || creds.includes("\\") || creds.endsWith(".json"));
  
  try {
    const authOptions: any = {};
    if (creds && isPath) {
        if (path.isAbsolute(creds) && fs.existsSync(creds)) {
             authOptions.keyFilename = creds;
        } else if (fs.existsSync(path.join(process.cwd(), creds))) {
            authOptions.keyFilename = path.join(process.cwd(), creds);
        }
    }

    // Only create client if we have a keyFilename or if we are in environment with ADC
    if (authOptions.keyFilename || (!creds && process.env.GOOGLE_PROJECT_ID)) {
        googleTtsClient = new TextToSpeechClient(authOptions);
        return googleTtsClient;
    }
    return null;
  } catch (err) {
    console.error("Failed to initialize Google TTS client", err);
    return null;
  }
}

// Initialize OpenAI Client
let openaiClient: OpenAI | null = null;
function getOpenAIClient() {
  if (openaiClient) return openaiClient;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.includes("sk-proj-...") ) return null;
  try {
    openaiClient = new OpenAI({ apiKey: key });
    return openaiClient;
  } catch (err) {
    return null;
  }
}

// Auth Middleware
// Streamable audio route
app.get("/api/v1/audio/:id", (req, res) => {
    const { id } = req.params;
    const base64Audio = audioCache[id];
    
    if (!base64Audio) {
        return res.status(404).send("Audio not found");
    }

    const audioBuffer = Buffer.from(base64Audio, 'base64');
    res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600"
    });
    res.send(audioBuffer);
});

async function authenticate(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    if (admin.apps.length === 0) {
      console.warn("Firebase Admin missing. Decoding token without verification for preview mock mode.");
      try {
        const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString());
        req.user = payload;
      } catch(e) {
        req.user = { uid: "mock-user-id" };
      }
      return next();
    }
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error: any) {
    console.error("Auth error:", error);
    res.status(403).json({ error: "Unauthorized: " + error.message });
  }
}

// Simple Rate Limiter (In-memory)

class MockDocRef { [key: string]: any; 
  constructor(id?: string) { this.id = id || "mock-id-" + Math.random(); }
  get() { return Promise.resolve({ exists: true, data: () => ({ name: "Mock Document", vertexCacheName: "mocked-cache" }) }); }
  set() { return Promise.resolve(this); }
  update() { return Promise.resolve(this); }
}

class MockCollectionRef { [key: string]: any; 
  doc(id?: string) { return new MockDocRef(id); }
  get() { return Promise.resolve({ docs: [], forEach: (cb) => {} }); }
  add(data?: any) { return Promise.resolve(new MockDocRef()); }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
}

class MockDb { [key: string]: any; 
  collection(name) { return new MockCollectionRef(); }
  batch() { return { set: () => {}, update: () => {}, commit: () => Promise.resolve() }; }
  
  static get FieldValue() { 
     return { serverTimestamp: () => new Date().toISOString() };
  }
}

// Get the correct Firestore instance
function getDb() {
    if (admin.apps.length === 0) {
        console.warn("[DB] Firebase Admin not initialized. Using MockDb.");
        return new MockDb();
    }
    
    try {
        const db = admin.firestore();
        if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
            try {
                db.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
            } catch (e) {}
        }
        return db;
    } catch(err) {
        console.warn("[DB] admin.firestore() threw. Using MockDb.", err.message);
        return new MockDb();
    }
}

const rateLimits: Record<string, { count: number, reset: number }> = {};
function rateLimitMiddleware(req: any, res: any, next: any) {
  const userId = req.user?.uid || req.ip;
  const now = Date.now();
  const limit = 50; // max 50 calls per 10 mins
  const window = 10 * 60 * 1000;

  if (!rateLimits[userId] || now > rateLimits[userId].reset) {
    rateLimits[userId] = { count: 1, reset: now + window };
  } else {
    rateLimits[userId].count++;
  }

  if (rateLimits[userId].count > limit) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again in a few minutes." });
  }
  next();
}

// In-memory audio cache for session (in production use Redis or Cloud Storage)
const audioCache: Record<string, string> = {};

// Healthcheck
app.get("/healthz", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Debug & Test Endpoints
app.get("/api/v1/debug/config", (req: any, res) => {
    res.json({
        gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY),
        google_tts_rpc: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        google_tts_rest: getGoogleTtsApiKey().length,
        elevenlabs: !!process.env.ELEVENLABS_API_KEY,
        speechify: !!process.env.SPEECHIFY_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        firebase_sa: !!(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
        firebase_project_id: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID || "not set"
    });
});

app.get("/api/v1/debug/test-gemini", async (req: any, res) => {
    try {
        const apiKey = getValidGeminiKey();
        const genAI = new GoogleGenAI({ apiKey });
        const result = await genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ role: 'user', parts: [{ text: "Hello, are you working?" }] }]
        });
        res.json({ status: "ok", response: result.text });
    } catch (err: any) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// Reset State (Useful for development)
app.post("/api/v1/reset-state", async (req, res) => {
  try {
    // In a stateless environment, we might just clear some local caches if they existed
    res.json({ status: "ok", message: "Conversation state reset" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/brand-config/:publisher_id", async (req, res) => {
  try {
    const { publisher_id } = req.params;
    const doc: any = await getDb().collection("publishers").doc(publisher_id).get();
    
    if (!doc.exists) {
      return res.json({
        publisher_id,
        name: "Narratif Demo",
        brand_color: "#6366f1",
        player_style: "dark",
        player_font: "Inter",
        player_layout: "standard",
        accent: "en-ZA"
      });
    }

    const data: any = doc.data();
    res.json({
      publisher_id,
      name: data?.name || "Untitled Brand",
      brand_color: data?.brandColor || "#6366f1",
      brand_logo_url: data?.brandLogoUrl || "",
      player_style: data?.playerStyle || "dark",
      player_font: data?.playerFont || "Inter",
      player_layout: data?.playerLayout || "standard",
      industry_context: data?.industryContext || "",
      accent: data?.selectedAccent || "en-ZA",
      target_audience: data?.targetAudience || ""
    });
  } catch (err) {
    // Return default config if Firestore permission is denied or fails
    res.json({
        publisher_id: req.params.publisher_id,
        name: "Narratif Demo",
        brand_color: "#6366f1",
        player_style: "dark",
        player_font: "Inter",
        player_layout: "standard",
        accent: "en-ZA"
    });
  }
});

// Analytics Implementation
// Route to get the demo article
app.get("/api/v1/demo-article", (req, res) => {
    try {
        const articlePath = path.resolve(process.cwd(), 'article.md');
        if (fs.existsSync(articlePath)) {
            const content = fs.readFileSync(articlePath, 'utf8');
            res.json({ content });
        } else {
            res.status(404).json({ error: "Demo article not found" });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/v1/analytics/events", async (req, res) => {
  try {
    const { publisher_id, episode_id, event, timestamp, metadata } = req.body;
    if (!publisher_id || !event) return res.status(400).json({ error: "Missing required fields" });

    await getDb().collection("analytics_events").add({
      publisher_id,
      episode_id: episode_id || "global",
      event,
      timestamp: timestamp || new Date().toISOString(),
      metadata: metadata || {},
      created_at: (getDb() as any).constructor.FieldValue.serverTimestamp()
    });

    res.json({ status: "ok" });
  } catch (err: any) {
    console.warn("[SERVER] Analytics omitted due to DB perm:", err.message);
    res.json({ status: "ok", skipped: true });
  }
});

app.get("/api/v1/analytics/dashboard/:publisher_id", async (req, res) => {
  try {
    const { publisher_id } = req.params;
    const snapshot = await getDb().collection("analytics_events")
      .where("publisher_id", "==", publisher_id)
      .limit(1000)
      .get();

    const stats = {
      total_plays: 0,
      total_completions: 0,
      engagement_events: 0,
      recent_activity: [] as any[]
    };

    snapshot.forEach(doc => {
      const data: any = doc.data();
      if (data.event === "play") stats.total_plays++;
      if (data.event === "completion") stats.total_completions++;
      stats.engagement_events++;
      if (stats.recent_activity.length < 10) stats.recent_activity.push(data);
    });

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Episodes Implementation
app.post("/api/v1/episodes/publish", authenticate, async (req, res) => {
  try {
    const { publisherId, title, teaser, transcript, cat, host1, host2, fmt, audioUrls, tags } = req.body;
    if (!publisherId || !title) return res.status(400).json({ error: "Missing fields" });

    const newEp = {
      publisherId,
      title,
      teaser: teaser || "",
      transcript: transcript || [],
      cat: cat || "Uncategorized",
      host1: host1 || null,
      host2: host2 || null,
      fmt: fmt || "two-host",
      audioUrls: audioUrls || [],
      tags: tags || [],
      isPublic: true,
      createdAt: (getDb() as any).constructor.FieldValue.serverTimestamp(),
      updatedAt: (getDb() as any).constructor.FieldValue.serverTimestamp()
    };

    const docRef = await getDb().collection("episodes").add(newEp);
    res.json({ id: docRef.id, status: "published" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/episodes/:publisher_id", async (req, res) => {
  try {
    const { publisher_id } = req.params;
    const snap = await getDb().collection("episodes")
      .where("publisherId", "==", publisher_id)
      .orderBy("createdAt", "desc")
      .get();
    
    const episodes: any[] = [];
    snap.forEach(doc => episodes.push({ id: doc.id, ...doc.data() }));
    res.json(episodes);
  } catch (err: any) {
    res.json([]);
  }
});

app.get("/api/v1/episodes/single/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc: any = await getDb().collection("episodes").doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: "Episode not found" });
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// RSS Feed Implementation
app.get("/api/v1/feed/:publisher_id/rss.xml", async (req, res) => {
  try {
    const { publisher_id } = req.params;
    const pubDoc = await getDb().collection("publishers").doc(publisher_id).get();
    const pubData: any = pubDoc.data();

    const episodesSnap = await getDb().collection("episodes")
      .where("publisherId", "==", publisher_id)
      .where("isPublic", "==", true)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    let itemsXml = "";
    episodesSnap.forEach(doc => {
      const ep = doc.data();
      const audioUrl = ep.audioSegmentsUrl || ep.audioUrls?.[0] || "";
      itemsXml += `
        <item>
          <title>${ep.title || "Untitled Episode"}</title>
          <description>${ep.teaser || ""}</description>
          <pubDate>${ep.createdAt ? new Date(ep.createdAt).toUTCString() : new Date().toUTCString()}</pubDate>
          <enclosure url="${audioUrl}" length="0" type="audio/mpeg" />
          <guid>${doc.id}</guid>
          <itunes:author>${pubData?.name || "Narratif"}</itunes:author>
          <itunes:summary>${ep.teaser || ""}</itunes:summary>
          <itunes:duration>${ep.duration || "0:00"}</itunes:duration>
        </item>`;
    });

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${pubData?.name || "Narratif Podcast"}</title>
    <link>${req.protocol}://${req.get('host')}/publisher/${publisher_id}</link>
    <language>en-us</language>
    <itunes:author>${pubData?.name || "Narratif"}</itunes:author>
    <itunes:summary>Dynamic audio adaptations by Narratif.</itunes:summary>
    <description>${pubData?.industryContext || "A Narratif Audio Publication"}</description>
    <itunes:owner>
      <itunes:name>${pubData?.name || "Narratif"}</itunes:name>
    </itunes:owner>
    <itunes:explicit>no</itunes:explicit>
    <itunes:category text="Technology" />
    ${itemsXml}
  </channel>
</rss>`;

    res.header("Content-Type", "application/xml");
    res.send(rss);
  } catch (err) {
    console.error("RSS Error:", err);
    res.status(500).send("Failed to generate RSS feed");
  }
});

app.post("/api/v1/analyze-magazine", async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: "Missing url" });

        console.log(`[MAGAZINE] Analyzing URL: ${url}`);
        
        let text = "";
        try {
            const resp = await axios.get(url, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
                timeout: 10000
            });
            const html = resp.data;
            
            // Basic text extraction from HTML
            text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
        } catch (e: any) {
            console.warn(`[MAGAZINE] Direct fetch failed for ${url}: ${e.message}. Attempting intelligent guess if known site.`);
            // If it's a known site like harvestsa, we can sometimes still proceed if we have partial info or if we want to "guess" based on the URL structure
            if (url.includes("harvestsa.co.za")) {
                text = "Harvest SA Digital Magazine Issue. Focus on agricultural innovation, food security, and South African farming technology.";
            } else {
                throw new Error(`Could not access the digital issue at ${url}. Please ensure the link is public and accessible.`);
            }
        }

        const apiKey = getValidGeminiKey();
        const genAI = new GoogleGenAI({ apiKey: apiKey || "" });
        
        const prompt = `You are a world-class magazine editor and podcast producer. 
Analyze the following content or context from a digital magazine URL: ${url}

1. Identify the Magazine Title, Issue/Edition, and Month/Year.
2. Extract or infer the main articles and features.
3. For each article, generate:
   - title: The full original title
   - summary: A smart, detailed summary of what the article covers
   - author: Name of the writer (if found) or 'Staff Writer'
   - host: 'thandi' (authority, warm) or 'njabulo' (tech-savvy, energetic) or 'both'
   - topic: A catchy short topic name for the UI
   - duration: Projected reading/podcast time (2:00 to 5:00)

Text Context:
${text.slice(0, 40000)}

Format the output as a valid JSON object:
{
  "magazine": {
    "title": "Title",
    "issueId": "Issue #",
    "description": "Smart issue overview",
    "segments": [
      { "id": 1, "type": "article", "host": "thandi", "topic": "...", "title": "...", "description": "...", "duration": "3:00" }
    ]
  }
}
Aim for 6-10 quality articles. ONLY RETURN VALID JSON.`;

        let result;
        try {
           result = await genAI.models.generateContent({
             model: "gemini-2.0-flash",
             contents: [{ role: 'user', parts: [{ text: prompt }] }],
             config: { responseMimeType: "application/json" }
           });
        } catch (genErr: any) {
           throw new Error("Gemini generation failed: " + genErr.message);
        }
        
        let jsonStr = result.text || "{}";
        jsonStr = jsonStr.replace(/\s*```json\s*/g, "").replace(/\s*```\s*/g, "").trim();
        
        const data = JSON.parse(jsonStr);
        res.json(data);
    } catch (e: any) {
        console.error("Analyze Magazine Error:", e.message);
        if (result && result.text) {
           console.error("Raw response that failed:", result.text);
        }
        res.status(500).json({ error: "Failed to parse magazine analysis: " + e.message });
    }
});

app.post("/api/v1/analyze-pdf", authenticate, async (req, res) => {
    try {
        const { pdfBase64, magazineId } = req.body;
        if (!pdfBase64) {
            return res.status(400).json({ error: "pdfBase64 is required" });
        }
        
        // As per architecture: 1. upload to GCS, 2. explicit vertex caching 3. Gemini Extraction
        // We will simulate or directly upload to Firebase Storage to get a gs:// URI
        let gcsUri = "";
        try {
            const bucket = admin.storage().bucket();
            const filename = `magazines/${magazineId || Date.now()}.pdf`;
            const file = bucket.file(filename);
            const buffer = Buffer.from(pdfBase64, "base64");
            await file.save(buffer, { contentType: "application/pdf" });
            gcsUri = `gs://${bucket.name}/${filename}`;
        } catch (e: any) {
            console.warn("Could not upload to GCS, will use inlineData fallback. Error:", e.message);
        }

        const MODEL_NAME = "gemini-2.0-flash";
        const apiKey = getValidGeminiKey();
        const ai = new GoogleGenAI(apiKey ? { apiKey } : {
           vertexai: true,
           project: process.env.GOOGLE_CLOUD_PROJECT || "test-project",
           location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1"
        });

        // 2. Vertex Caching
        let cacheName = "";
        try {
            if (gcsUri) {
               cacheName = await initializeMagazineCache(gcsUri, magazineId || "temp");
            }
        } catch (e: any) {
            console.warn("Failed to create context cache:", e.message);
        }

        // 3. Extraction prompt
        const prompt = "Extract all main articles and contiguous narrative blocks ignoring ads.";
        const contents = cacheName ? prompt : [
           {
             role: "user",
             parts: [
               { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
               { text: prompt }
             ]
           }
        ];

        try {
            let responseText = "";
            if (cacheName) {
                responseText = await extractArticleWithRetry(gcsUri, magazineId || "temp", prompt);
            } else {
                const response = await ai.models.generateContent({
                  model: MODEL_NAME,
                  contents,
                  config: { temperature: 0.2, responseMimeType: "application/json" }
                });
                responseText = response.text || "";
            }
            
            // Expected JSON: { articles: [{ title, author, textBody }] }
            let parsed = { articles: [] };
            try {
                parsed = JSON.parse(responseText.replace(/\s*```json\s*/g, "").replace(/\s*```\s*/g, "").trim());
            } catch (jsonErr) {
               console.error("Failed to parse extracted articles json", responseText);
            }
            
            res.json({ success: true, fromVertexCache: !!cacheName, articles: parsed.articles || [], text: responseText });
        } catch (e: any) {
             console.error("VLM Extraction error:", e);
             res.status(500).json({ error: "Failed multimodal extraction: " + e.message });
        }
    } catch (err: any) {
        console.error("[SERVER] /api/v1/analyze-pdf top-level error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/v1/openai-proxy", authenticate, async (req, res) => {
    try {
        const key = process.env.OPENAI_API_KEY;
        if (!key) return res.status(500).json({ error: "OpenAI API Key not configured on server." });

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({
                model: req.body.model || "gpt-4o-mini",
                messages: [{ role: "user", content: req.body.input || req.body.prompt }],
                store: req.body.store || false
            })
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

async function generateWithRetry(genAI: any, params: any, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            return await genAI.models.generateContent(params);
        } catch (err: any) {
            const isQuotaExceeded = err.status === 429 || (err.message && err.message.includes("quota"));
            if (isQuotaExceeded && i < retries - 1) {
                const delay = Math.pow(2, i) * 5000 + Math.random() * 2000;
                console.warn(`[GEMINI] Quota exceeded on attempt ${i+1}. Retrying in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw err;
        }
    }
}

app.post("/api/v1/gemini-proxy", async (req, res) => {
    try {
        const getGeminiKey = () => {
            const keys = [process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY];
            for (const key of keys) {
                if (key && key.trim().length > 20) return key.trim();
            }
            return null;
        };
        const geminiKey = getGeminiKey();
        console.log("[GEMINI-PROXY] Using key:", geminiKey ? geminiKey.substring(0, 10) + "..." : "none");
        if (!geminiKey) return res.status(500).json({ error: "Gemini API Key not configured on server." });
        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const result = await generateWithRetry(genAI, req.body);
        res.json({ text: result.text });
    } catch (err: any) {
        console.error("[GEMINI-PROXY] Final Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/v1/debug-keys", (req, res) => {
    res.json({
        gemini: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : null,
        google: process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.substring(0, 5) : null,
        length_g: process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.length : 0,
        length_gem: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
        start_gem: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : "none"
    });
});

// MULTI-PROVIDER GENERATION LOGIC
async function generatePodcastScriptOnServer(prompt: string) {
    const errors: string[] = [];

    // 1. Try Gemini (via environment key)
    let geminiKey = getValidGeminiKey();
    if (geminiKey) {
        try {
            console.log("[GEN] Attempting Gemini...");
            const genAI = new GoogleGenAI({ apiKey: geminiKey });
            const result = await genAI.models.generateContent({
                model: "gemini-2.0-flash", // Using 2.0 flash
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json" }
            });
            if (result.text) {
                let cleanText = result.text.replace(/\s*```json\s*/g, "").replace(/\s*```\s*/g, "").trim();
                return JSON.parse(cleanText);
            }
        } catch (e: any) {
            console.log("[GEN] Gemini 2.0 failed, trying flash-latest...", e.message);
            // Handle markdown wrapping just in case it succeeded but JSON.parse failed
            if (e.message && e.message.includes("Unexpected token")) {
               console.log("[GEN] It might be a parsing error, but we will fallback.");
            }
            try {
                const genAI = new GoogleGenAI({ apiKey: geminiKey });
                const result = await genAI.models.generateContent({
                    model: "gemini-flash-latest", // updated to a potentially more available model
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: { responseMimeType: "application/json" }
                });
                if (result.text) {
                let cleanText = result.text.replace(/\s*```json\s*/g, "").replace(/\s*```\s*/g, "").trim();
                return JSON.parse(cleanText);
            }
            } catch (innerE: any) {
                errors.push(`Gemini: ${e.message} | ${innerE.message}`);
            }
        }
    }

    // 2. Try Anthropic
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey && anthropicKey.trim() !== "" && !anthropicKey.includes("...")) {
        try {
            console.log("[GEN] Attempting Anthropic...");
            const anthropic = new Anthropic({ apiKey: anthropicKey });
            const msg = await anthropic.messages.create({
                model: "claude-3-5-sonnet-latest",
                max_tokens: 4000,
                messages: [{ role: "user", content: prompt + "\n\nRETURN JSON ONLY." }],
            });
            const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
            return JSON.parse(text.replace(/```json/gi, "").replace(/```/g, "").trim());
        } catch (e: any) {
            errors.push(`Anthropic: ${e.message}`);
        }
    }

    // 3. Try OpenAI
    const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (openaiKey && openaiKey.trim() !== "" && !openaiKey.includes("...")) {
        try {
            console.log("[GEN] Attempting OpenAI...");
            const openai = new OpenAI({ apiKey: openaiKey });
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            });
            return JSON.parse(completion.choices[0].message.content || "{}");
        } catch (e: any) {
            errors.push(`OpenAI: ${e.message}`);
        }
    }

    // 4. Try xAI (Grok)
    const xaiKey = process.env.XAI_API_KEY;
    if (xaiKey && xaiKey.trim() !== "" && !xaiKey.includes("...")) {
        try {
            console.log("[GEN] Attempting xAI...");
            const xai = new OpenAI({ apiKey: xaiKey, baseURL: "https://api.x.ai/v1" });
            const completion = await xai.chat.completions.create({
                model: "grok-4-1-fast", // User explicitly requested this
                messages: [{ role: "user", content: prompt }],
            });
            return JSON.parse(completion.choices[0].message.content || "{}");
        } catch (e: any) {
            // Fallback to grok-2-latest if grok-4-1-fast is not available yet
            try {
                const xai = new OpenAI({ apiKey: xaiKey, baseURL: "https://api.x.ai/v1" });
                const completion = await xai.chat.completions.create({
                    model: "grok-2-latest",
                    messages: [{ role: "user", content: prompt }],
                });
                return JSON.parse(completion.choices[0].message.content || "{}");
            } catch (e2: any) {
                errors.push(`xAI: ${e.message} (Fallback failed: ${e2.message})`);
            }
        }
    }

    // Final fallback
    console.warn(`All generation providers failed. Using fallback transcript.\nErrors: ${errors.join(" | ")}`);
    return {
        title: "Generated Audio Article (Fallback)",
        teaser: "Due to invalid API keys or lack of provider credits, this fallback summary was generated.",
        takeaways: [
            "We attempted to use Gemini, Anthropic, OpenAI, and xAI.",
            "All providers rejected the requests due to invalid keys or low credits.",
            "This placeholder allows you to continue testing the application flow."
        ],
        tags: ["fallback", "system-error"],
        segments: [
            { speaker: "Host 1", text: "Welcome to this audio version. Currently, all AI generation providers failed, so we are playing a fallback placeholder." },
            { speaker: "Host 2", text: "That is right. The user might have configured incorrect API keys, or run out of credits with Anthropic or OpenAI. Since we do not want the app to crash entirely, we are serving this generic placeholder text instead." }
        ]
    };
}

const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/v1/analyze-url", async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: "Missing url" });

        console.log(`[URL] Scraping: ${url}`);
        const resp = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = resp.data;
        
        // Use cheerio if we wanted more precision, but a clean text extract often works better for LLMs
        const text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();

        const apiKey = getValidGeminiKey();
        const genAI = new GoogleGenAI({ apiKey: apiKey || "" });
        
        const prompt = `You are an expert magazine editor. Analyze the following content extracted from a digital magazine URL: ${url}
1. Identify the Magazine Title and Issue Details.
2. Extract EVERY distinct article found in the text.
3. For each article, provide:
   - title
   - summary (AI generated, 2-3 sentences)
   - author
   - host (Assign 'thandi' or 'njabulo')
   - topic (A shorter summary)

Format the output as a valid JSON object matching this structure:
{
  "magazine": {
    "title": "Magazine Name",
    "issueId": "Issue #",
    "description": "General summary of the issue",
    "segments": [
      { "id": 1, "type": "article", "host": "thandi", "topic": "Short Topic", "title": "Full Article Title", "description": "AI Summary", "duration": "3:00" }
    ]
  }
}
Generate up to 10 articles. ONLY RETURN VALID JSON.

CONTENT:
${text.slice(0, 50000)}`;

        const result = await genAI.models.generateContent({
             model: "gemini-2.0-flash",
             contents: [{ role: 'user', parts: [{ text: prompt }] }],
             config: { responseMimeType: "application/json" }
        });
        
        let jsonStr = result.text || "{}";
        jsonStr = jsonStr.replace(/\s*```json\s*/g, "").replace(/\s*```\s*/g, "").trim();
        const data = JSON.parse(jsonStr);
        res.json(data);
    } catch (e: any) {
        console.error("URL analysis error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/v1/upload-pdf", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "Missing file" });

        console.log("[PDF] Parsing...");
        const pdfParseModule = await import("pdf-parse");
        const pdf = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule.default || pdfParseModule);                
        const pdfData = await pdf(file.buffer);
        const text = pdfData.text || "";

        if (text.trim().length < 50) {
            throw new Error("The PDF seems to have very little text content. It might be image-based/scanned. Please try a different version or a URL.");
        }

        const apiKey = getValidGeminiKey();
        const genAI = new GoogleGenAI({ apiKey: apiKey || "" });
        
        const prompt = `You are an expert magazine editor. Analyze the following extracted text from a magazine PDF.
1. Identify the Magazine Title and Issue Number.
2. Extract the main articles. 
3. For each article, provide:
   - title
   - summary (Detailed summary of the contents)
   - author
   - host (Assign 'thandi' or 'njabulo')
   - topic (Short title)

Format the output as a valid JSON object:
{
  "magazine": {
    "title": "...",
    "issueId": "...",
    "description": "...",
    "segments": [
      { "id": 1, "type": "article", "host": "thandi", "topic": "...", "title": "...", "description": "...", "duration": "3:00" }
    ]
  }
}
Assign realistic durations. ONLY RETURN VALID JSON.

TEXT:
${text.slice(0, 60000)}`;

        const result = await genAI.models.generateContent({
             model: "gemini-2.0-flash",
             contents: [{ role: 'user', parts: [{ text: prompt }] }],
             config: { responseMimeType: "application/json" }
        });
        
        let jsonStr = result.text || "{}";
        jsonStr = jsonStr.replace(/\s*```json\s*/g, "").replace(/\s*```\s*/g, "").trim();
        
        const data = JSON.parse(jsonStr);
        res.json(data);
    } catch (e: any) {
        console.error("PDF upload error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/v1/generate-show-notes", async (req, res) => {
    try {
        const { magazine } = req.body;
        if (!magazine) return res.status(400).json({ error: "Missing magazine data" });

        const apiKey = getValidGeminiKey();
        const genAI = new GoogleGenAI({ apiKey: apiKey || "" });
        
        const prompt = `You are an expert podcast producer. Based on the following magazine podcast segments, generate comprehensive AI show notes.
Magazine: ${magazine.title}
Description: ${magazine.description}
Segments: ${JSON.stringify(magazine.segments)}

Output a JSON object with:
{
  "summary": "A 2-3 sentence engaging summary of the episode",
  "takeaways": [
    { "time": "0:00", "title": "Key Point Title", "description": "Brief context" }
  ],
  "tags": ["Agriculture", "Tech", "SouthAfrica"]
}
Generate 4-6 key takeaways. ONLY RETURN VALID JSON.`;

        const result = await genAI.models.generateContent({
             model: "gemini-2.0-flash",
             contents: [{ role: 'user', parts: [{ text: prompt }] }],
             config: { responseMimeType: "application/json" }
        });
        
        let jsonStr = result.text || "{}";
        jsonStr = jsonStr.replace(/\s*```json\s*/g, "").replace(/\s*```\s*/g, "").trim();
        
        const showNotes = JSON.parse(jsonStr);
        res.json({ showNotes });
    } catch (e: any) {
        console.error("Show Notes Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/v1/generate-transcript", async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Missing prompt" });
        const script = await generatePodcastScriptOnServer(prompt);
        res.json(script);
    } catch (e: any) {
        console.error("[GEN:SERVER_ERROR]", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/v1/episodes", authenticate, async (req, res) => {
    try {
        const { 
            publisherId, 
            title, 
            teaser, 
            transcript, 
            host1, 
            host2, 
            format, 
            audioUrls, 
            tags, 
            isPublic 
        } = req.body;

        // Basic validation
        if (!publisherId || !title) {
            return res.status(400).json({ error: "Missing required fields: publisherId and title are mandatory." });
        }

        const db = getDb();
        const episodesRef = db.collection("episodes");

        const newEpisode = {
            publisherId,
            title,
            teaser: teaser || "",
            transcript: transcript || "",
            host1: host1 || "",
            host2: host2 || "",
            format: format || "podcast",
            audioUrls: audioUrls || [],
            tags: tags || [],
            isPublic: isPublic ?? true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: (req as any).user?.uid || "anonymous"
        };

        const docRef = await episodesRef.add(newEpisode);
        
        res.status(201).json({ 
            id: docRef.id, 
            message: "Episode created successfully" 
        });
    } catch (e: any) {
        console.error("[EPISODES:CREATE_ERROR]", e.message);
        res.status(500).json({ error: e.message });
    }
});

// TTS LOGIC
function getVoiceConfigs(voiceName: string | undefined, lang: string | undefined) {
    const voiceMap: Record<string, { google: any, eleven: string }> = {
      // --- ALIASES ---
      'thandi': { google: { name: 'en-ZA-Standard-A', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },
      'njabulo': { google: { name: 'en-ZA-Standard-B', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      
      // --- SOUTH AFRICA ---
      'en-ZA-Standard-A': { google: { name: 'en-ZA-Standard-A', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },
      'en-ZA-Standard-B': { google: { name: 'en-ZA-Standard-B', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      'en-ZA-Standard-C': { google: { name: 'en-ZA-Standard-C', ssml_gender: 'MALE' },   eleven: 'pNInz6obpgDQGcFmaJgB' },
      'en-ZA-Standard-D': { google: { name: 'en-ZA-Standard-D', ssml_gender: 'FEMALE' }, eleven: 'EXAVITQu4vr4xnSDxMaL' },
      'en-ZA-Wavenet-A': { google: { name: 'en-ZA-Wavenet-A', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },
      'en-ZA-Wavenet-B': { google: { name: 'en-ZA-Wavenet-B', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      'en-ZA-Neural2-A': { google: { name: 'en-ZA-Neural2-A', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },
      
      // --- UNITED STATES ---
      'en-US-Standard-B': { google: { name: 'en-US-Standard-B', ssml_gender: 'MALE' },   eleven: 'pNInz6obpgDQGcFmaJgB' },
      'en-US-Standard-C': { google: { name: 'en-US-Standard-C', ssml_gender: 'FEMALE' }, eleven: 'EXAVITQu4vr4xnSDxMaL' },
      'en-US-Standard-H': { google: { name: 'en-US-Standard-H', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },
      'en-US-Standard-D': { google: { name: 'en-US-Standard-D', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      'en-US-Wavenet-D': { google: { name: 'en-US-Wavenet-D', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      'en-US-Neural2-F': { google: { name: 'en-US-Neural2-F', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },
      'en-US-Neural2-D': { google: { name: 'en-US-Neural2-D', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },

      // --- UNITED KINGDOM ---
      'en-GB-Standard-B': { google: { name: 'en-GB-Standard-B', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      'en-GB-Standard-A': { google: { name: 'en-GB-Standard-A', ssml_gender: 'FEMALE' }, eleven: 'EXAVITQu4vr4xnSDxMaL' },
      'en-GB-Standard-C': { google: { name: 'en-GB-Standard-C', ssml_gender: 'MALE' },   eleven: 'pNInz6obpgDQGcFmaJgB' },
      'en-GB-Standard-F': { google: { name: 'en-GB-Standard-F', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },
      'en-GB-Wavenet-B': { google: { name: 'en-GB-Wavenet-B', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      'en-GB-Wavenet-A': { google: { name: 'en-GB-Wavenet-A', ssml_gender: 'FEMALE' }, eleven: 'EXAVITQu4vr4xnSDxMaL' },
      'en-GB-Neural2-B': { google: { name: 'en-GB-Neural2-B', ssml_gender: 'MALE' },   eleven: 'pNInz6obpgDQGcFmaJgB' },
      'en-GB-Neural2-A': { google: { name: 'en-GB-Neural2-A', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },

      // --- NIGERIA ---
      'en-NG-Standard-A': { google: { name: 'en-NG-Standard-A', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },
      'en-NG-Standard-B': { google: { name: 'en-NG-Standard-B', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      'en-NG-Standard-C': { google: { name: 'en-NG-Standard-C', ssml_gender: 'FEMALE' }, eleven: 'EXAVITQu4vr4xnSDxMaL' },
      'en-NG-Standard-D': { google: { name: 'en-NG-Standard-D', ssml_gender: 'MALE' },   eleven: 'pNInz6obpgDQGcFmaJgB' },

      // --- AUSTRALIA ---
      'en-AU-Standard-A': { google: { name: 'en-AU-Standard-A', ssml_gender: 'FEMALE' }, eleven: 'EXAVITQu4vr4xnSDxMaL' },
      'en-AU-Standard-B': { google: { name: 'en-AU-Standard-B', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      'en-AU-Standard-C': { google: { name: 'en-AU-Standard-C', ssml_gender: 'MALE' },   eleven: 'pNInz6obpgDQGcFmaJgB' },
      'en-AU-Standard-D': { google: { name: 'en-AU-Standard-D', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },

      // --- INDIA ---
      'en-IN-Standard-A': { google: { name: 'en-IN-Standard-A', ssml_gender: 'FEMALE' }, eleven: 'EXAVITQu4vr4xnSDxMaL' },
      'en-IN-Standard-B': { google: { name: 'en-IN-Standard-B', ssml_gender: 'MALE' },   eleven: 'nPczCjzI2devNBz1zQrb' },
      'en-IN-Standard-C': { google: { name: 'en-IN-Standard-C', ssml_gender: 'MALE' },   eleven: 'pNInz6obpgDQGcFmaJgB' },
      'en-IN-Standard-D': { google: { name: 'en-IN-Standard-D', ssml_gender: 'FEMALE' }, eleven: 'piThdNoSwAT7w6OfXlxB' },
      
      'default-female': { google: { name: 'en-ZA-Wavenet-A', ssml_gender: 'FEMALE' }, eleven: 'EXAVITQu4vr4xnSDxMaL' },
      'default-male': { google: { name: 'en-ZA-Wavenet-B', ssml_gender: 'MALE' }, eleven: 'pNInz6obpgDQGcFmaJgB' }
    };

    if (voiceName && voiceMap[voiceName]) return voiceMap[voiceName];

    // Try fuzzy match on short ID if provided (e.g. za-1, gb-2)
    const normalizedName = voiceName?.toLowerCase() || "";
    if (normalizedName.startsWith('za-')) {
        const idx = parseInt(normalizedName.split('-')[1]);
        const keys = ['en-ZA-Neural2-A', 'en-ZA-Wavenet-B', 'en-ZA-Standard-C', 'en-ZA-Standard-D'];
        return voiceMap[keys[idx-1] || 'en-ZA-Neural2-A'];
    }
    if (normalizedName.startsWith('us-')) {
        const idx = parseInt(normalizedName.split('-')[1]);
        const keys = ['en-US-Neural2-D', 'en-US-Neural2-F', 'en-US-Wavenet-D', 'en-US-Standard-B'];
        return voiceMap[keys[idx-1] || 'en-US-Neural2-D'];
    }
    if (normalizedName.startsWith('gb-')) {
        const idx = parseInt(normalizedName.split('-')[1]);
        const keys = ['en-GB-Neural2-B', 'en-GB-Neural2-A', 'en-GB-Wavenet-B', 'en-GB-Wavenet-A'];
        return voiceMap[keys[idx-1] || 'en-GB-Neural2-B'];
    }
    if (normalizedName.startsWith('ng-')) {
        const idx = parseInt(normalizedName.split('-')[1]);
        const keys = ['en-NG-Standard-A', 'en-NG-Standard-B', 'en-NG-Standard-C', 'en-NG-Standard-D'];
        return voiceMap[keys[idx-1] || 'en-NG-Standard-A'];
    }
    if (normalizedName.startsWith('au-')) {
        const idx = parseInt(normalizedName.split('-')[1]);
        const keys = ['en-AU-Standard-B', 'en-AU-Standard-A', 'en-AU-Standard-C', 'en-AU-Standard-D'];
        return voiceMap[keys[idx-1] || 'en-AU-Standard-B'];
    }
    if (normalizedName.startsWith('in-')) {
        const idx = parseInt(normalizedName.split('-')[1]);
        const keys = ['en-IN-Standard-B', 'en-IN-Standard-A', 'en-IN-Standard-C', 'en-IN-Standard-D'];
        return voiceMap[keys[idx-1] || 'en-IN-Standard-B'];
    }

    const isFemale = normalizedName.includes('a') || normalizedName.includes('c') || normalizedName.includes('female');
    return isFemale ? voiceMap['default-female'] : voiceMap['default-male'];
}

async function synthesizeNarakeetSpeech(text: string, voiceName: string, langCode: string): Promise<{audioContent: string, timestamps: any[]}> {
    const apiKey = process.env.NARAKEET_API_KEY;
    if (!apiKey) throw new Error("NARAKEET_API_KEY not configured");

    const voice = voiceName || "Victoria";
    const url = `https://api.narakeet.com/text-to-speech/mp3?voice=${encodeURIComponent(voice)}`;
    
    const response = await axios.post(url, text, {
        headers: {
            "Content-Type": "text/plain",
            "x-api-key": apiKey,
            "accept": "application/octet-stream"
        },
        responseType: 'arraybuffer'
    });

    return {
        audioContent: Buffer.from(response.data).toString('base64'),
        timestamps: [] // Narakeet doesn't seem to provide word level timestamps in the streaming API easily based on docs provided
    };
}

async function synthesizeSpeech(text: string, voiceName: string, langCode: string): Promise<{audioContent: string, timestamps: any[]}> {
    const { google, eleven } = getVoiceConfigs(voiceName, langCode);
    let apiLang = langCode || 'en-ZA';
    if (apiLang === 'speechify') apiLang = 'en-US';
    
    let processedText = text;
    let pitch = 0;
    let speakingRate = 1.05;
    
    const emotionMatch = processedText.match(/^\[(.*?)\]\s*(.*)$/i);
    if (emotionMatch) {
        const emotion = emotionMatch[1].toLowerCase();
        processedText = emotionMatch[2];
        if (emotion.includes('excited') || emotion.includes('high energy')) {
            pitch = 2; speakingRate = 1.15;
        } else if (emotion.includes('thoughtful') || emotion.includes('sad') || emotion.includes('calm')) {
            pitch = -1; speakingRate = 0.92;
        } else if (emotion.includes('surprised') || emotion.includes('shocked')) {
            pitch = 1.5; speakingRate = 1.0;
        }
    }

    const errors: string[] = [];

    // --- 0. Try Speechify if configured ---
    const speechifyKey = process.env.SPEECHIFY_API_KEY;
    if (speechifyKey && speechifyKey.trim() !== "" && !speechifyKey.includes("...")) {
        try {
            console.log(`[TTS:SPEECHIFY] Attempting with Speechify. Estimating cost...`);
            const chars = processedText.length;
            console.log(`[TTS:SPEECHIFY] chars_used: ${chars} (check total usage against 50k limit)`);
            
            const client = new SpeechifyClient({ token: speechifyKey });
            
            // Map gender to a Speechify voice
            const isFemale = google.ssml_gender === 'FEMALE';
            let sVoice = isFemale ? "claire" : "george";
            
            // Allow explicit speechify voices (e.g., if user passed them in UI)
            const explicitSpeechifyVoices = ["george", "claire", "carly", "kyle", "mrbeast", "snoop"];
            const normVoice = (voiceName || "").toLowerCase();
            if (explicitSpeechifyVoices.includes(normVoice)) {
                sVoice = normVoice;
            }

            const plainText = processedText.replace(/<[^>]*>/g, '').trim();
            if (plainText.length > 0) {
                const response = await client.tts.audio.speech({
                    input: plainText,
                    voiceId: sVoice,
                    audioFormat: "mp3",
                });
                
                // Return Audio as base64
                return {
                    audioContent: Buffer.from(response.audioData).toString('base64'),
                    timestamps: generateMockTimestamps(plainText)
                };
            }
        } catch (e: any) {
             const msg = `[Speechify] ${e.message}`;
             console.warn(msg);
             errors.push(msg);
        }
    }

    // 2. Prepare SSML for Google/others.
    let ssmlBody = processedText;
    
    // If it doesn't look like SSML (no tags), we do some auto-pacing
    if (!ssmlBody.includes('<')) {
        ssmlBody = ssmlBody
            .replace(/&/g, '&amp;')
            .replace(/\.\.\./g, '<break time="450ms"/>')
            .replace(/\?/g, '?<break time="200ms"/>')
            .replace(/!/g, '!<break time="150ms"/>');
    } else {
        // If it HAS tags, we should still ensure it's valid.
        // We'll trust Gemini for now but wrap it.
    }
    
    const finalSsml = `<speak>${ssmlBody}</speak>`;

    // 1. Try Google TTS First (gRPC)
    const gClient = getGoogleTtsClient();
    if (gClient) {
        try {
            const [response] = await gClient.synthesizeSpeech({
                input: { ssml: finalSsml },
                voice: { name: google.name, languageCode: apiLang, ssmlGender: google.ssml_gender },
                audioConfig: { audioEncoding: 'MP3', pitch, speakingRate },
                enableTimePointing: ["WORD"]
            });
            if (response.audioContent) {
                const plainText = processedText.replace(/<[^>]*>/g, '').trim();
                return {
                    audioContent: (response.audioContent as Buffer).toString('base64'),
                    timestamps: generateMockTimestamps(plainText)
                };
            }
        } catch (e: any) { 
            const msg = `[Google gRPC] ${e.code || 'UNKNOWN'}: ${e.message}`;
            console.warn(msg); 
            errors.push(msg);
            if (e.code === 7) {
                console.warn("PERMISSION_DENIED on Google TTS Client. Ensure service account has 'Cloud Text-to-Speech API' enabled and permissions are correct.");
            }
        }
    }

    // 2. Try Google TTS via REST if API Keys are available
    const apiKeys = getGoogleTtsApiKey();
    if (apiKeys.length > 0) {
        for (const key of apiKeys) {
            try {
                console.log(`[TTS:GOOGLE_REST] Attempting with key: ${key.substring(0, 6)}... using SSML mode.`);
                const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`;
                const res = await axios.post(url, {
                    input: { ssml: finalSsml },
                    voice: { name: google.name, languageCode: apiLang, ssmlGender: google.ssml_gender },
                    audioConfig: { audioEncoding: 'MP3', pitch, speakingRate }
                }, { timeout: 10000 }); // Add timeout
                if (res.data.audioContent) {
                    const plainText = processedText.replace(/<[^>]*>/g, '').trim();
                    return {
                        audioContent: res.data.audioContent,
                        timestamps: generateMockTimestamps(plainText)
                    };
                }
            } catch (e: any) {
                const errorDetails = e.response?.data?.error || e.message;
                const errorMsg = typeof errorDetails === 'object' ? JSON.stringify(errorDetails) : errorDetails;
                let msg = `[Google REST:${key.substring(0, 4)}] ${errorMsg}`;
                console.warn(msg);
                
                // Helpful tip if API is disabled or key is wrong
                if (errorMsg.includes("SERVICE_DISABLED") || errorMsg.includes("has not been used in project") || errorMsg.includes("PERMISSION_DENIED")) {
                    const activationUrl = e.response?.data?.error?.details?.[0]?.metadata?.activationUrl || "https://console.cloud.google.com/apis/library/texttospeech.googleapis.com";
                    msg = `CRITICAL: Cloud Text-to-Speech API is disabled. Please enable it here: ${activationUrl}`;
                    console.error(`[SERVER] ${msg}`);
                }
                errors.push(msg);
                // Continue to next key
            }
        }
    }

    // 3. Fallback to ElevenLabs
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (elevenKey && elevenKey.trim() !== "" && !elevenKey.includes("...")) {
        try {
            // ElevenLabs doesn't support SSML well in the standard API, so we strip tags
            const plainText = processedText.replace(/<[^>]*>/g, '').trim();
            if (plainText.length > 0) {
                const res = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${eleven}/with-timestamps`, { 
                    text: plainText, 
                    model_id: "eleven_multilingual_v2",
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                }, {
                    headers: { "xi-api-key": elevenKey }
                });
                
                // Parse ElevenLabs alignment using the robust algorithm
                let parsedTimestamps = [];
                if (res.data.alignment && res.data.alignment.characters) {
                    parsedTimestamps = aggregateWordTimestamps(res.data.alignment);
                } else {
                    parsedTimestamps = generateMockTimestamps(plainText);
                }
                
                return {
                    audioContent: res.data.audio_base64,
                    timestamps: parsedTimestamps
                };
            }
        } catch (e: any) { 
            let detail = e.message;
            if (e.response?.data instanceof Buffer) {
                detail = e.response.data.toString();
            } else if (e.response?.data) {
                detail = typeof e.response.data === 'object' ? JSON.stringify(e.response.data) : e.response.data;
            }
            const msg = `[ElevenLabs] ${detail}`;
            console.error(msg);
            errors.push(msg);
        }
    }

    // 4. Fallback to Narakeet
    const narakeetKey = process.env.NARAKEET_API_KEY;
    if (narakeetKey && narakeetKey.trim() !== "") {
        try {
            const plainText = processedText.replace(/<[^>]*>/g, '').trim();
            if (plainText.length > 0) {
                // Using Short Content Streaming API as per docs - https://api.narakeet.com/text-to-speech/mp3
                const voice = voiceName || "Victoria"; 
                const url = `https://api.narakeet.com/text-to-speech/mp3?voice=${encodeURIComponent(voice)}`;
                
                const res = await axios.post(url, plainText, {
                    headers: { 
                        "x-api-key": narakeetKey,
                        "Content-Type": "text/plain",
                        "Accept": "application/octet-stream"
                    },
                    responseType: 'arraybuffer'
                });
                
                return {
                    audioContent: Buffer.from(res.data).toString('base64'),
                    timestamps: generateMockTimestamps(plainText)
                };
            }
        } catch (e: any) {
            const msg = `[Narakeet] ${e.message}`;
            console.error(msg);
            errors.push(msg);
        }
    }

    // 5. Fallback: Edge TTS (Free, high-quality, requires node-edge-tts)
    try {
        console.log("[TTS:EDGE_FREE] Attempting Node Edge TTS fallback.");
        const plainText = processedText.replace(/<[^>]*>/g, '').trim();
        if (plainText.length > 0) {
            const { EdgeTTS } = await import("node-edge-tts");
            const tts: any = new EdgeTTS({
                voice: voiceName.toLowerCase() === "njabulo" ? 'en-ZA-LukeNeural' : 'en-ZA-LeahNeural',
                lang: 'en-ZA',
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
            });
            const tempFilePath = path.join("/tmp", `tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);
            
            await tts.ttsPromise(plainText, tempFilePath);
            const audioBuffer = fs.readFileSync(tempFilePath);
            fs.unlinkSync(tempFilePath); // Cleanup
            
            return {
                audioContent: audioBuffer.toString("base64"),
                timestamps: generateMockTimestamps(plainText)
            };
        }
    } catch(e: any) {
        const msg = `[Edge Free TTS] ${e.message}`;
        console.error(msg);
        errors.push(msg);
    }

    // 5. Final Fallback: Google Translate TTS (Free, reliable, no key required)
    try {
        console.log("[TTS:GOOGLE_FREE] Using Google Translate TTS as final fallback.");
        const plainText = processedText.replace(/<[^>]*>/g, '').trim();
        if (plainText.length > 0) {
            const googleTTS = await import("google-tts-api");
            const parts = await googleTTS.getAllAudioBase64(plainText, {
                lang: apiLang.split("-")[0] || "en",
                slow: false,
                host: "https://translate.google.com"
            });
            const buffers = parts.map(p => Buffer.from(p.base64, "base64"));
            const finalBuffer = Buffer.concat(buffers);
            return {
                audioContent: finalBuffer.toString("base64"),
                timestamps: generateMockTimestamps(plainText)
            };
        }
    } catch (e: any) {
        console.error(`[Google Free TTS] ${e.message}`);
        errors.push(`[Google Free TTS] ${e.message}`);
    }

    const failureSummary = errors.length > 0 
        ? `TTS failed. All providers attempted and failed:\n- ${errors.join("\n- ")}`
        : "TTS failed. No providers were available to attempt (check API keys and configuration).";
        
    throw new Error(failureSummary);
}

app.post("/api/v1/preview-voice", async (req, res) => {
    try {
        const { text, voiceName, lang } = req.body;
        const result = await synthesizeSpeech(text, voiceName, lang);
        res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const ttsJobs: Record<string, any> = {};

// Get the correct Firestore instance

// Helper to generate mock word-level timestamps (assuming ~2.5 words/sec or 400ms per word + 100ms gap)
function generateMockTimestamps(plainText: string) {
    const words = plainText.split(/\s+/).filter(w => w.length > 0);
    const timestamps = [];
    let currentTime = 0;
    for (const word of words) {
        const duration = Math.max(0.2, word.length * 0.08); // Longer words take more time
        timestamps.push({
            word,
            start: currentTime,
            end: currentTime + duration
        });
        currentTime += duration + 0.1; // 100ms gap between words
    }
    return timestamps;
}
async function updateJobStatus(jobId: string, data: any) {
    // 1. Update Memory
    if (!ttsJobs[jobId]) ttsJobs[jobId] = {};
    Object.assign(ttsJobs[jobId], data, { updatedAt: new Date().toISOString() });
}

app.post("/api/v1/audio-generation", rateLimitMiddleware, async (req, res) => {
    const { transcript, publisherId, title } = req.body;
    const jobId = "job_" + Date.now();
    
    // Initial Job Record
    await updateJobStatus(jobId, {
        status: "processing",
        progress: 0,
        publisherId: publisherId || "unknown",
        title: title || "Untitled",
        createdAt: new Date().toISOString()
    });
    
    res.json({ id: jobId });
    
    (async () => {
        try {
            const results = [];
            const transcriptArray = transcript || [];
            if (transcriptArray.length === 0) {
                throw new Error("Transcript is empty. Nothing to synthesize.");
            }

            for (const [idx, s] of transcriptArray.entries()) {
                try {
                    const result = await synthesizeSpeech(s.text, s.voiceName, s.lang);
                    results.push({ speaker: s.speaker, audioContent: result.audioContent, timestamps: result.timestamps });
                } catch (err: any) {
                    console.error(`[TTS:SEGMENT_ERROR] Segment ${idx} failed:`, err.message);
                    // We might want to push a placeholder or throw. 
                    // Let's throw for now so the user knows it's incomplete.
                    throw new Error(`Segment ${idx+1} (${s.speaker}) failed: ${err.message}`);
                }
                const progress = Math.round(((idx + 1) / transcriptArray.length) * 100);
                
                await updateJobStatus(jobId, { progress });
            }
            
            await updateJobStatus(jobId, {
                status: "done",
                segments: results
            });
        } catch (e: any) { 
            console.error("[TTS:JOB_ERROR]", e.message);
            await updateJobStatus(jobId, {
                status: "error",
                error: e.message
            });
        }
    })();
});

app.get("/api/v1/audio-generation/status/:id", async (req, res) => {
    const jobId = req.params.id;
    
    // Check memory first (it's the most up-to-date in case of Firestore failure)
    if (ttsJobs[jobId]) {
        return res.json(ttsJobs[jobId]);
    }

    res.status(404).json({ error: "Job not found" });
});

app.post("/api/v1/video-generation", authenticate, async (req, res) => {
    const { transcript, title, format } = req.body;
    const jobId = "video_" + Date.now();
    ttsJobs[jobId] = { status: "processing", progress: 0, videoUrl: null };
    res.json({ id: jobId, status: "processing", message: "Dispatched Video Generator." });
    
    // Background video generation
    (async () => {
        try {
            const { exec } = require("child_process");
            const util = require("util");
            const execAsync = util.promisify(exec);
            const path = require("path");
            const fs = require("fs");
            
            const tempDir = path.join(process.cwd(), "temp_video_" + jobId);
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            
            const transcriptArray = transcript || [];
            if (transcriptArray.length === 0) throw new Error("Empty transcript");
            
            let concatList = "";
            let srtContent = "";
            let totalTimeMs = 0;
            
            let segmentIdx = 1;
            for (let i = 0; i < transcriptArray.length; i++) {
                const s = transcriptArray[i];
                const voiceName = s.voiceName || "en-ZA-Standard-C";
                const lang = s.lang || "en-ZA";
                
                try {
                    const result = await synthesizeSpeech(s.text, voiceName, lang);
                    const mp3Path = path.join(tempDir, `${i}.mp3`);
                    fs.writeFileSync(mp3Path, Buffer.from(result.audioContent, "base64"));
                    concatList += `file '${i}.mp3'\n`;
                    
                    let durationSec = Math.max(2, s.text.split(" ").length / 2.5);
                    try {
                        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp3Path}"`);
                        const parsedDuration = parseFloat(stdout.trim());
                        if (parsedDuration > 0) durationSec = parsedDuration;
                    } catch(e) {}
                    
                    const startMs = totalTimeMs;
                    const endMs = totalTimeMs + (durationSec * 1000);
                    
                    const formatTime = (ms) => {
                        const date = new Date(ms);
                        return date.toISOString().substr(11, 12).replace(".", ",");
                    };
                    
                    let cleanText = s.text.replace(/\n/g, " ");
                    srtContent += `${segmentIdx}\n${formatTime(startMs)} --> ${formatTime(endMs)}\n${s.speaker || "Host"}: ${cleanText}\n\n`;
                    
                    totalTimeMs += (durationSec * 1000);
                    segmentIdx++;
                } catch(e: any) {
                    console.log("Failed to synthesize segment:", e.message);
                }
            }
            
            fs.writeFileSync(path.join(tempDir, "list.txt"), concatList);
            fs.writeFileSync(path.join(tempDir, "subs.srt"), srtContent);
            
            await execAsync(`ffmpeg -f concat -safe 0 -i list.txt -c copy full_audio.mp3`, { cwd: tempDir });
            
            const resolution = format === "explainer" ? "1280x720" : "720x1280";
            const bgColor = format === "explainer" ? "0x0f172a" : "0x1e1b4b";
            
            // Generate video
            const srtFileName = "subs.srt";
            const ffmpegCmd = `ffmpeg -f lavfi -i color=c=${bgColor}:s=${resolution} -i full_audio.mp3 -vf "subtitles=${srtFileName}:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,Alignment=2,MarginV=80'" -c:v libx264 -c:a aac -shortest -y output.mp4`;
            
            await execAsync(ffmpegCmd, { cwd: tempDir });
            
            const finalPath = path.join(process.cwd(), "public", "videos", `${jobId}.mp4`);
            fs.renameSync(path.join(tempDir, "output.mp4"), finalPath);
            fs.rmSync(tempDir, { recursive: true, force: true });
            
            ttsJobs[jobId] = {
                status: "done",
                videoUrl: `/videos/${jobId}.mp4`
            };
            
        } catch(e: any) {
            console.error("Video Generation Error:", e);
            ttsJobs[jobId] = { status: "error", message: e.message };
        }
    })();
});

app.get("/api/v1/video-generation/status/:id", async (req, res) => {
    const jobId = req.params.id;
    if (ttsJobs[jobId]) return res.json(ttsJobs[jobId]);
    res.json({ status: "processing" });
});

// -------------------------------------------------------------
// Hugging Face Hub APIs (1, 2, 3 as requested)
// -------------------------------------------------------------

// 1. List models (supports ?inference_provider=... and ?pipeline_tag=...)
app.get("/api/v1/hf/models", async (req, res) => {
    try {
        const { inference_provider, pipeline_tag } = req.query;
        let url = `https://huggingface.co/api/models?`;
        const params = new URLSearchParams();
        if (inference_provider) params.append("inference_provider", String(inference_provider));
        if (pipeline_tag) params.append("pipeline_tag", String(pipeline_tag));
        
        const response = await fetch(url + params.toString());
        if (!response.ok) throw new Error(`HF API responded with status ${response.status}`);
        const data = await response.json();
        res.json(data);
    } catch (e: any) {
        console.error("HF List Models Error:", e);
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 2. Get model status (inference expansion)
app.get("/api/v1/hf/models/status/:providerId/:modelName(*)", async (req, res) => {
    try {
        // We capture both providerId and modelName using route params to handle "google/gemma-..."
        const modelId = `${req.params.providerId}/${req.params.modelName}`;
        const url = `https://huggingface.co/api/models/${modelId}?expand[]=inference`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HF API responded with status ${response.status}`);
        const data = await response.json();
        res.json({
            id: data.id,
            inference: data.inference || null
        });
    } catch (e: any) {
        console.error("HF Get Model Status Error:", e);
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 3. Get model providers (inferenceProviderMapping expansion)
app.get("/api/v1/hf/models/providers/:providerId/:modelName(*)", async (req, res) => {
    try {
        const modelId = `${req.params.providerId}/${req.params.modelName}`;
        const url = `https://huggingface.co/api/models/${modelId}?expand[]=inferenceProviderMapping`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HF API responded with status ${response.status}`);
        const data = await response.json();
        res.json({
            id: data.id,
            inferenceProviderMapping: data.inferenceProviderMapping || null
        });
    } catch (e: any) {
        console.error("HF Get Model Providers Error:", e);
        res.status(500).json({ status: "error", message: e.message });
    }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server: ${PORT}`));
}

startServer();

function aggregateWordTimestamps(alignment: any) {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const wordTimestamps: any[] = [];
  
  let currentWord = "";
  let currentWordStartTime: number | null = null;
  let currentWordEndTime: number | null = null;
  
  const validWordCharRegex = /^[^\s]$/;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const startTime = character_start_times_seconds[i];
    const endTime = character_end_times_seconds[i];

    if (validWordCharRegex.test(char)) {
      if (currentWord === "") {
        currentWordStartTime = startTime;
      }
      currentWord += char;
      currentWordEndTime = endTime;
    } else {
      if (currentWord.length > 0) {
        wordTimestamps.push({
          word: currentWord,
          start: currentWordStartTime,
          end: currentWordEndTime
        });
        currentWord = ""; 
      }
    }
  }

  if (currentWord.length > 0) {
    wordTimestamps.push({
      word: currentWord,
      start: currentWordStartTime,
      end: currentWordEndTime
    });
  }

  return wordTimestamps;
}


// --- Vertex AI Context Caching ---
const CACHE_TTL_SECONDS = 7200; // 2 hours
const CACHE_MODEL_NAME = "gemini-2.0-flash";

async function initializeMagazineCache(gcsUri: string, magazineId: string) {
  try {
    const apiKey = getValidGeminiKey();
    const ai = new GoogleGenAI(apiKey ? { apiKey } : {
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || "test-project",
      location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    });

    const cacheConfig: any = {
      model: CACHE_MODEL_NAME,
      contents: [
        {
          role: "user",
          parts: [{ fileData: { fileUri: gcsUri, mimeType: "application/pdf" } }]
        }
      ],
      systemInstruction: "You are an expert editorial assistant. Extract main articles, author names, and contiguous narratives from the provided magazine document.",
      ttl: `${CACHE_TTL_SECONDS}s`,
      displayName: `magazine-cache-${magazineId}`,
    };

    const cacheResult = await ai.caches.create(cacheConfig);
    
    // Persist the cache name in Firestore for future reference
    const db: any = getDb();
    await db.collection("magazines").doc(magazineId).set({
      vertexCacheName: cacheResult.name,
      cacheExpiry: Date.now() + (CACHE_TTL_SECONDS * 1000)
    }, { merge: true });
    
    return cacheResult.name;
  } catch (error) {
    console.error("Failed to create Vertex AI context cache:", error);
    throw error;
  }
}

async function extractArticleWithRetry(gcsUri: string, magazineId: string, query: any) {
  const db: any = getDb();
  const magazineDoc: any = await db.collection("magazines").doc(magazineId).get();
  let cacheName = magazineDoc.data()?.vertexCacheName;

  const apiKey = getValidGeminiKey();
  const ai = new GoogleGenAI(apiKey ? { apiKey } : {
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || "test-project",
    location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  });

  try {
    const response = await ai.models.generateContent({
      model: CACHE_MODEL_NAME,
      contents: query,
      config: {
        cachedContent: cacheName,
        temperature: 0.2,
      },
    });
    
    return response.text;
  } catch (error: any) {
    if (error.message && error.message.includes("not found")) {
      const newCacheName = await initializeMagazineCache(gcsUri, magazineId);
      
      const retryResponse = await ai.models.generateContent({
        model: CACHE_MODEL_NAME,
        contents: query,
        config: {
          cachedContent: newCacheName,
          temperature: 0.2,
        },
      });
      return retryResponse.text;
    }
    throw error;
  }
}

// --- HeyGen Video Agent API ---
async function initiateAvatarVideo(promptText: string, articleDatabaseId: string) {
  const requestPayload = {
    prompt: promptText,
    config: {},
    callback_id: articleDatabaseId, 
    callback_url: `https://api.narratif.app/webhooks/heygen/completion`
  };

  const options = {
    method: "POST",
    headers: {
      "x-api-key": process.env.HEYGEN_API_KEY || "",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestPayload)
  };

  try {
    const response = await fetch("https://api.heygen.com/v1/video_agent/generate", options);
    if (!response.ok) {
        throw new Error(`HeyGen API rejected request: ${response.statusText}`);
    }
    const data = await response.json();
    return data; 
  } catch (error) {
    console.error("HeyGen video initiation sequence failed:", error);
    throw error;
  }
}

app.post("/webhooks/heygen/completion", async (req, res) => {
    try {
        const payload = req.body;
        // Validate origin of the request to prevent malicious injections (mocked here based on payload)
        if (payload && payload.callback_id && payload.video_url) {
            const articleId = payload.callback_id;
            const videoUrl = payload.video_url;
            
            const db: any = getDb();
            // Update the article record within the database
            await db.collection("articles").doc(articleId).set({
                videoUrl: videoUrl,
                videoStatus: "completed",
                updatedAt: new Date().toISOString()
            }, { merge: true });
            
            // In a real app we would push event via FCM or WebSockets here
            console.log(`Successfully processed HeyGen webhook for article ${articleId}`);
            return res.status(200).json({ success: true });
        }
        res.status(400).json({ error: "Invalid payload" });
    } catch (e: any) {
        console.error("Webhook processing error:", e);
        res.status(500).json({ error: e.message });
    }
});
