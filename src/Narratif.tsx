import { useState, useRef, useEffect } from "react";
// We will modify this to use Firebase and the TTS / Gemini API later

/* ─── DESIGN TOKENS ─── */
const C = {
  bg:       "#F7F8FA",
  surface:  "#FFFFFF",
  card:     "#FFFFFF",
  border:   "#E4E7ED",
  borderDk: "#CDD2DB",
  text:     "#0F1623",
  sub:      "#5C6478",
  muted:    "#9BA3B4",
  danger:   "#E53935",
  success:  "#16A34A",
};

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500&display=swap');`;

/* ─── PUBLISHER WORKSPACES (multi-tenant) ─── */
// We will map this to Firebase 'publisher' document.
const WORKSPACES = [
  {
    id: "harvest",
    name: "Harvest SA",
    industry: "Agriculture",
    logo: "H",
    color: "#16A34A",
    plan: "Growth",
    episodes: 6,
    limit: 10,
    resets: "1 Jul",
  }
];

const VOICES = [
  { id: "thandi",  name: "Thandi",  role: "SA English · Female", avatar: "T" },
  { id: "njabulo", name: "Njabulo", role: "SA English · Male",   avatar: "N" },
  { id: "liesl",   name: "Liesl",   role: "Afrikaans · Female",  avatar: "L" },
  { id: "alex",    name: "Alex",    role: "Neutral EN · Male",   avatar: "A" },
];

const CATS = ["Agriculture","Mining","Construction","Business","Lifestyle","Health","Technology","Finance","Energy"];
const TEAM_MEMBERS = [];
const EPISODES_DATA = [];

const PLAN_FEATURES = {
  Starter:   { color:"#64748B", episodes:10,  voices:2, branded:false, whiteLabel:false, api:false, price:"R2,500/mo" },
  Growth:    { color:"#0369A1", episodes:35,  voices:4, branded:true,  whiteLabel:false, api:false, price:"R6,500/mo" },
  Publisher: { color:"#B45309", episodes:999, voices:4, branded:true,  whiteLabel:true,  api:true,  price:"R15,000/mo" },
};

const ROLE_COLORS = { Admin:"#7C3AED", Editor:"#0369A1", Creator:"#16A34A", Viewer:"#64748B" };

const STAGES = [
  "Reading article structure…",
  "Extracting key insights…",
  "Scripting conversation…",
  "Synthesising voices…",
  "Adding audio polish…",
  "Finalising episode…",
];

const SAMPLE_TEXT = `South Africa's agricultural sector is experiencing a historic shift. Following years of drought, new precision irrigation technologies are transforming how farmers in the Western Cape and Northern Cape manage water scarcity.`;

function Badge({ children, color = "#64748B" }: any) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center",
      padding:"2px 8px", borderRadius:4,
      background:`${color}14`, border:`1px solid ${color}30`,
      fontSize:11, fontWeight:700, color,
      fontFamily:"Geist, sans-serif", letterSpacing:"0.04em",
      textTransform:"uppercase",
    }}>{children}</span>
  );
}

function Avatar({ char, color, size = 32, square = false }: any) {
  return (
    <div style={{
      width:size, height:size, flexShrink:0,
      borderRadius: square ? size * 0.25 : "50%",
      background:`${color}18`, border:`1.5px solid ${color}35`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.38, fontWeight:700, color,
      fontFamily:"Geist, sans-serif",
    }}>{char}</div>
  );
}

function StatCard({ label, value, sub, color }: any) {
  return (
    <div style={{
      padding:"20px 22px", borderRadius:12,
      background:C.card, border:`1px solid ${C.border}`,
    }}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.07em",marginBottom:10,fontFamily:"Geist,sans-serif"}}>{label.toUpperCase()}</div>
      <div style={{fontSize:28,fontWeight:800,color:C.text,fontFamily:"Geist,sans-serif",lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:12,color:color||C.success,marginTop:6,fontFamily:"Geist,sans-serif"}}>{sub}</div>}
    </div>
  );
}

function SectionHead({ title, action, onAction }: any) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:"Geist,sans-serif"}}>{title}</h2>
      {action && (
        <button onClick={onAction} style={{
          padding:"7px 16px", borderRadius:7, border:"none",
          fontSize:12, fontWeight:700, cursor:"pointer",
          fontFamily:"Geist,sans-serif", letterSpacing:"0.02em",
        }}>{action}</button>
      )}
    </div>
  );
}

function Waveform({ active, bars = 36, color = "#16A34A" }: any) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t+1), 80);
    return () => clearInterval(id);
  }, [active]);
  return (
    <div style={{display:"flex",alignItems:"center",gap:2,height:22}}>
      {Array.from({length:bars},(_,i) => {
        const h = active ? 4+Math.abs(Math.sin(tick*0.25+i*0.7))*14 : 4+Math.sin(i*1.1)*2;
        return (
          <div key={i} style={{
            width:2, borderRadius:2, background:active?color:"#D1D5DB",
            height:`${Math.max(3,h)}px`, transition:active?"height 0.08s":"height 0.4s",
          }}/>
        );
      })}
    </div>
  );
}
