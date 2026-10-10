import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX, X, Send, Bot } from "lucide-react";
import { CATEGORIES, CATEGORY_DEPARTMENT, isOpen } from "../data/constants.js";

const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const has = (t, ...words) => words.some((w) => t.includes(w));

const CATEGORY_HINTS = {
  "Roads and Infrastructure": ["road", "pothole", "bridge", "footpath", "pavement", "traffic"],
  "Water Supply": ["water", "pipe", "leak", "tap", "drinking"],
  "Sanitation and Waste Management": ["garbage", "waste", "sanitation", "drain", "sewage", "toilet", "dustbin", "trash"],
  Streetlights: ["streetlight", "street light", "lamp", "light"],
  "Public Safety": ["safety", "crime", "theft", "harass", "unsafe", "fire", "accident"],
};

function suggestCategory(t) {
  return Object.entries(CATEGORY_HINTS).find(([, words]) => has(t, ...words))?.[0];
}

// Rule-based answers built from what the user said plus the signed-in role and their live complaint data.
function reply(raw, { role, user, complaints }) {
  const t = raw.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "I did not catch that. Please try again.";

  const idMatch = raw.match(/giq\s*-?\s*(\d{4,})/i);
  if (idMatch) {
    const c = complaints.find((x) => x.id.toLowerCase() === `giq-${idMatch[1]}`);
    if (!c) return `I could not find complaint GIQ-${idMatch[1]}${role === "citizen" ? " among your complaints" : ""}.`;
    const last = c.timeline[c.timeline.length - 1];
    return `Complaint ${c.id}, ${c.title}, is ${c.status}. It is assigned to ${c.department} with ${c.priority} priority. Latest update: ${last?.note ?? "none yet"}`;
  }

  if (has(t, "hello", "hi ", "hey", "namaste") || t === "hi")
    return `Hello${user ? ` ${user.name.split(" ")[0]}` : ""}! I am the GrievanceIQ voice assistant. You can ask how to file a complaint, track a complaint, or sign in. What do you need?`;
  if (has(t, "help", "what can you do", "options"))
    return "I can explain how to register, sign in, file a complaint, add a photo, track status, and tell you the department for an issue. Just say, for example, how do I file a complaint.";

  if (has(t, "how many", "count", "total", "pending", "resolved", "summary", "status of my", "my complaints", "track")) {
    if (!role) return "Please sign in first. After signing in I can read out your complaint status.";
    const open = complaints.filter(isOpen).length;
    const resolved = complaints.filter((c) => c.status === "Resolved").length;
    const high = complaints.filter((c) => c.priority === "High" && isOpen(c)).length;
    if (!complaints.length) return role === "citizen" ? "You have not filed any complaints yet. Say how do I file a complaint to get started." : "There are no complaints yet.";
    const who = role === "citizen" ? "You have" : "There are";
    return `${who} ${complaints.length} complaints in total: ${open} still open, ${resolved} resolved${role !== "citizen" ? `, and ${high} open high priority` : ""}.${
      role === "citizen" ? " Say a complaint number such as G I Q 1001 for details." : ""
    }`;
  }

  if (has(t, "central", "government portal")) return "The Central Government portal has a single authorised login with read-only access to all data. Choose Central Government Portal on the portal selection screen and sign in with the official email and password.";
  if (has(t, "admin", "administrator"))
    return "On the Administration Portal, sign in with your employee ID or official email. If your email is authorised and you have no account yet, choose Create an administrator account below the sign in button.";

  if (has(t, "photo", "camera", "picture", "image", "attach", "upload"))
    return "In the complaint form, under Attachment, choose a photo or document, or press Take photo to use your camera. Photos can be JPG or PNG, and files must be 2 megabytes or smaller.";

  if (has(t, "password", "forgot", "reset"))
    return "Online password reset is not available yet. Please contact the helpdesk to have your password reset.";

  if (has(t, "register", "sign up", "signup", "create account", "new account"))
    return "To register, choose Citizen Portal, press Create an account, then enter your full name, email, a 10 digit mobile number and a password of at least 8 characters.";

  if (has(t, "sign in", "signin", "log in", "login"))
    return "Choose your portal. Citizens sign in with email or mobile number and password. Administrators use their employee ID or official email.";

  if (has(t, "log out", "logout", "sign out")) return "Use the Logout button at the bottom of the left menu.";

  if (has(t, "file", "submit", "lodge", "raise", "register a complaint", "new complaint", "report", "complain")) {
    const cat = suggestCategory(t);
    const hint = cat ? ` For this issue, choose the category ${cat}; it goes to ${CATEGORY_DEPARTMENT[cat]}.` : "";
    return `To file a complaint, sign in to the Citizen Portal, open New Complaint, then enter a title, choose a category, add the location and date. The description and photo are optional. Press Submit Complaint.${hint}`;
  }

  const cat = suggestCategory(t);
  if (cat) return `That looks like ${cat}. It will be handled by ${CATEGORY_DEPARTMENT[cat]}. Choose this category when you file the complaint.`;
  if (has(t, "department", "category", "categories"))
    return `Categories are ${CATEGORIES.join(", ")}. Each goes to its own department, and an administrator can reassign it.`;
  if (has(t, "thank")) return "You are welcome. Let me know if you need anything else.";

  return "Sorry, I did not understand. You can ask how to file a complaint, how to track a complaint, how to add a photo, or say help.";
}

export default function VoiceAssistant({ role, user, complaints }) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [text, setText] = useState("");
  const [log, setLog] = useState([{ from: "bot", text: "Hi! Tap the microphone and ask me anything, for example: how do I file a complaint?" }]);
  const recRef = useRef(null);
  const endRef = useRef(null);
  const ctx = useRef({});
  ctx.current = { role, user, complaints };
  const speakRef = useRef(speak);
  speakRef.current = speak;

  const say = useCallback((message) => {
    if (!speakRef.current || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(message);
    u.lang = "en-IN";
    window.speechSynthesis.speak(u);
  }, []);

  const ask = useCallback(
    (question) => {
      const answer = reply(question, ctx.current);
      setLog((l) => [...l, { from: "user", text: question }, { from: "bot", text: answer }]);
      say(answer);
    },
    [say]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [log, open]);
  useEffect(
    () => () => {
      recRef.current?.abort();
      window.speechSynthesis?.cancel();
    },
    []
  );

  function toggleListen() {
    if (listening) return recRef.current?.stop();
    window.speechSynthesis?.cancel();
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => ask(e.results[0][0].transcript);
    rec.onerror = (e) => {
      const msg = e.error === "not-allowed" ? "Microphone permission was denied. Allow microphone access and try again." : e.error === "no-speech" ? "I did not hear anything. Please try again." : "Voice input failed. You can type your question instead.";
      setLog((l) => [...l, { from: "bot", text: msg }]);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function submitText(e) {
    e.preventDefault();
    if (!text.trim()) return;
    ask(text.trim());
    setText("");
  }

  return (
    <div className="fixed bottom-4 right-4 z-[55]">
      {open && (
        <section role="dialog" aria-label="Voice assistant" className="mb-3 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
          <header className="flex items-center justify-between bg-navy px-4 py-3 text-white">
            <span className="flex items-center gap-2 text-sm font-semibold"><Bot size={18} className="text-gold" aria-hidden="true" /> Voice Assistant</span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => { setSpeak((s) => !s); window.speechSynthesis?.cancel(); }} aria-pressed={speak} aria-label={speak ? "Mute spoken replies" : "Turn on spoken replies"} className="rounded-lg p-1.5 hover:bg-white/10">
                {speak ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button type="button" onClick={() => { recRef.current?.abort(); setOpen(false); }} aria-label="Close voice assistant" className="rounded-lg p-1.5 hover:bg-white/10"><X size={16} /></button>
            </span>
          </header>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm" aria-live="polite">
            {log.map((m, i) => (
              <p key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.from === "bot" ? "bg-slate-100 text-ink" : "ml-auto bg-brand text-white"}`}>{m.text}</p>
            ))}
            {listening && <p className="text-xs font-semibold text-brand">Listening…</p>}
            <div ref={endRef} />
          </div>
          <form onSubmit={submitText} className="flex items-center gap-2 border-t border-line p-2">
            {SR && (
              <button type="button" onClick={toggleListen} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Start listening"} className={`rounded-full p-2.5 text-white ${listening ? "animate-pulse bg-rose-600" : "bg-brand hover:bg-brand-dark"}`}>
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}
            <input aria-label="Type a question" value={text} onChange={(e) => setText(e.target.value)} placeholder={SR ? "Or type your question" : "Type your question"} className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            <button type="submit" aria-label="Send" className="rounded-full p-2.5 text-brand hover:bg-teal-50"><Send size={18} /></button>
          </form>
        </section>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Open voice assistant" className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand-dark focus-visible:outline-offset-4">
        <Mic size={24} aria-hidden="true" />
      </button>
    </div>
  );
}
