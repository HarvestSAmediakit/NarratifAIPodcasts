export interface Host {
  id: string;
  name: string;
  lang: string;
  tts: string;
  role: string;
  avatar: string;
  hue: string;
  bio: string;
  tone: string[];
  style: string;
}

export interface TranscriptLine {
  speaker: string;
  text: string;
}

export interface Annotation {
  timestamp_sec: number;
  type: string;
  data: any;
}

export interface Podcast {
  id?: string;
  title: string;
  teaser: string;
  duration: string;
  transcript: TranscriptLine[];
  segments?: TranscriptLine[];
  takeaways: string[];
  annotations?: Annotation[];
  tags: string[];
  host1: Host;
  host2: Host | null;
  fmt: string;
  cat: string;
}

export const T = {
  bg: "#09090b",
  panel: "#18181b",
  card: "#27272a",
  border: "rgba(255,255,255,0.08)",
  borderHi: "rgba(255,255,255,0.15)",
  accent: "#6366f1",
  accentRgb: "99, 102, 241",
  accentDim: "rgba(99, 102, 241, 0.08)",
  accentMid: "rgba(99, 102, 241, 0.18)",
  text: "#fafafa",
  sub: "#a1a1aa",
  muted: "#52525b",
  danger: "#ef4444",
} as const;

export const NATIONALITIES = [
  { id: "en-ZA", label: "South Africa", flag: "🇿🇦" },
];

export const VOICES: Host[] = [
  // --- SOUTH AFRICA (en-ZA) ---
  { 
    id: "za-1", name: "Daniel Johnson", lang: "en-ZA", tts: "en-ZA-Standard-C", 
    role: "The Calm Analyst", avatar: "D", hue: "#10b981",
    bio: "A sharp, composed host with a calm delivery and a talent for turning complex ideas into simple, clear explanations.",
    tone: ["measured", "intelligent", "dry"],
    style: "Logical and precise, simplifies complexity with calm authority."
  },
  { 
    id: "za-2", name: "Michelle Richardson", lang: "en-ZA", tts: "en-ZA-Standard-D", 
    role: "The Curious Co-Host", avatar: "M", hue: "#3b82f6",
    bio: "Bright, quick-witted, and easy to listen to, she keeps the conversation moving with smart questions and playful reactions.",
    tone: ["warm", "witty", "engaging"],
    style: "Conversational and light-hearted, focuses on the human element."
  },
  { 
    id: "za-3", name: "Thandi Moleke", lang: "en-ZA", tts: "en-ZA-Standard-A", 
    role: "The South African Storyteller", avatar: "T", hue: "#ec4899",
    bio: "A confident South African host with local insight, natural charisma, and a knack for making difficult topics easy to understand.",
    tone: ["authentic", "expressive", "relatable"],
    style: "Vibrant and charismatic, uses local context to ground the story."
  },
  { 
    id: "za-4", name: "Thabo Moloi", lang: "en-ZA", tts: "en-ZA-Standard-B", 
    role: "The Veteran Anchor", avatar: "T", hue: "#8b5cf6",
    bio: "A former newsroom voice with dry humor, strong opinions, and the ability to anchor deep conversations without losing the audience.",
    tone: ["authoritative", "dry-humored", "smart"],
    style: "Grounded and professional, uses sharp wit to navigate complex topics."
  }
];

export const CATS = ["Agriculture", "Mining", "Construction", "Business", "Lifestyle", "Health", "Technology", "Finance", "Energy"];

export const BRAND_THEMES = [
  { id: "premium", label: "Editorial Gold", color: "#eab308", bg: "#0c0a09", surface: "#1c1917", card: "#292524", desc: "Stone and amber tones for high-end editorial magazines." },
];

export const STAGES = [
  { pct: 0, label: "Reading article structure" },
  { pct: 18, label: "Extracting key insights" },
  { pct: 36, label: "Scripting conversation" },
  { pct: 58, label: "Crafting host voices" },
  { pct: 76, label: "Adding audio polish" },
  { pct: 90, label: "Finalising episode" },
];
