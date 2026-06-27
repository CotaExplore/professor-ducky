import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';
import Duck3D from '../components/companion/Duck3D';
import WaterScene from '../components/companion/WaterScene';
import { speakText, getAvailableVoices, getSavedVoiceName, saveVoiceName } from '../hooks/useVoice';

const GREETING = "Quack! I am Professor Ducky. What are we working on today?";

const DUCK_MODES = [
  { key: 'socratic',  label: 'Socratic',          icon: 'fa-circle-question',  desc: 'Guides you with questions — never gives answers',        colour: '#f59e0b' },
  { key: 'teacher',   label: 'Teacher',            icon: 'fa-chalkboard-user',  desc: 'Explains concepts clearly with examples',                colour: '#10b981' },
  { key: 'rubber',    label: 'Rubber Duck',        icon: 'fa-ear-listen',       desc: 'Just listens while you explain your thinking out loud',  colour: '#8b5cf6' },
  { key: 'devil',     label: "Devil's Advocate",   icon: 'fa-fire',             desc: 'Challenges your ideas to strengthen your argument',      colour: '#ef4444' },
];

export default function DuckRoom() {
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }]);
  const [displayText, setDisplayText] = useState(GREETING);
  const [input, setInput] = useState('');
  const [brief, setBrief] = useState('');
  const [charState, setCharState] = useState('speaking');
  const [mouthOpen, setMouthOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [showBrief, setShowBrief] = useState(false);

  const [duckMode, setDuckMode] = useState('teacher');
  const [interactionMode, setInteractionMode] = useState('voice-to-voice');

  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState(getSavedVoiceName());
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);

  const [concepts, setConcepts] = useState([]);
  const [loadingConcepts, setLoadingConcepts] = useState(false);

  const [blackboard, setBlackboard] = useState('');

  const [wavesOn, setWavesOn] = useState(true);
  const waveAudioCtxRef = useRef(null);
  const waveNodesRef = useRef([]);

  const recognitionRef = useRef(null);
  const pendingRef = useRef('');
  const inputRef = useRef(null);

  const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechInputSupported = !!SRClass;

  useEffect(() => {
    function loadVoices() {
      const v = getAvailableVoices();
      if (v.length) setVoices(v);
    }
    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
  }, []);

  useEffect(() => {
    speakText(GREETING, {
      voiceName,
      onMouth: setMouthOpen,
      onEnd: () => { setCharState('idle'); setMouthOpen(false); },
    });
    return () => window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    function startWaves() {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      waveAudioCtxRef.current = ctx;
      const nodes = [];
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.18;
      masterGain.connect(ctx.destination);

      for (let i = 0; i < 3; i++) {
        const bufferSize = ctx.sampleRate * 4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let j = 0; j < bufferSize; j++) data[j] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 200 + i * 80;
        bp.Q.value = 0.4;

        const swellGain = ctx.createGain();
        const period = 4.5 + i * 1.8;
        const offset = i * 1.4;

        function swell(t) {
          const v = 0.5 + 0.5 * Math.sin((t - offset) * (2 * Math.PI / period));
          swellGain.gain.setValueAtTime(v * (0.5 + i * 0.15), ctx.currentTime + (t - ctx.currentTime));
          if (waveAudioCtxRef.current) setTimeout(() => swell(ctx.currentTime + 0.1), 100);
        }
        swell(ctx.currentTime);

        src.connect(bp);
        bp.connect(swellGain);
        swellGain.connect(masterGain);
        src.start();
        nodes.push(src, bp, swellGain, masterGain);
      }
      waveNodesRef.current = nodes;
    }

    function stopWaves() {
      try { waveAudioCtxRef.current?.close(); } catch { /* ignore */ }
      waveAudioCtxRef.current = null;
      waveNodesRef.current = [];
    }

    if (wavesOn) startWaves(); else stopWaves();
    return stopWaves;
  }, [wavesOn]);

  async function extractConcepts(briefText) {
    if (!briefText?.trim()) return;
    setLoadingConcepts(true);
    try {
      const { data } = await api.post('/chat', {
        messages: [{
          role: 'user',
          content: `Extract 6-8 key academic or technical concepts from this assignment brief that a student might want explained. Return ONLY a valid JSON array of short concept names (2-5 words each). Example: ["Binary Search Trees","Time Complexity","Recursion"]\n\nBrief:\n${briefText}`,
        }],
      });
      const raw = data.reply?.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
      const match = raw?.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) setConcepts(parsed.slice(0, 8));
      }
    } catch (err) { console.warn('[concepts] failed:', err?.message); }
    finally { setLoadingConcepts(false); }
  }

  const startListening = useCallback(() => {
    if (!SRClass || isListening || isLoading) return;
    window.speechSynthesis?.cancel();
    setMouthOpen(false);

    const rec = new SRClass();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-GB';

    rec.onstart = () => { setIsListening(true); setCharState('listening'); setLiveTranscript(''); pendingRef.current = ''; };
    rec.onresult = e => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('').trim();
      pendingRef.current = transcript;
      setLiveTranscript(transcript);
    };
    rec.onend = () => {
      setIsListening(false); setLiveTranscript('');
      const text = pendingRef.current.trim();
      pendingRef.current = '';
      if (text) send(text); else setCharState('idle');
    };
    rec.onerror = () => { setIsListening(false); setLiveTranscript(''); pendingRef.current = ''; setCharState('idle'); };

    recognitionRef.current = rec;
    try { rec.start(); } catch { /* already running */ }
  }, [isListening, isLoading, SRClass]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  function getModeSystem() {
    const blackboardInstruction = `

BLACKBOARD — when a visual would genuinely help understanding, include:
[BLACKBOARD]
ASCII diagram, table, or concept map here. Under 20 lines.
[/BLACKBOARD]
The text outside is spoken. Inside is drawn on screen separately.`;

    const base = {
      socratic: `You are Professor Ducky in Socratic mode. Ask one well-chosen question per response. Never give assignment answers or write student work. Acknowledge what the student said, then ask a question that nudges them forward. 3-5 sentences. Warm and curious.${blackboardInstruction}`,
      teacher:  `You are Professor Ducky in Teacher mode. Explain concepts clearly using analogies and real examples. Help students genuinely understand. Do NOT write their assignment or answer their specific brief questions, but freely explain underlying concepts and techniques. Up to 6 sentences. Encouraging. Use the blackboard when a visual helps.${blackboardInstruction}`,
      rubber:   `You are Professor Ducky in Rubber Duck mode. Mostly listen and encourage the student to explain their thinking out loud. Reflect back what they say ("So you're saying that..."), spot when they've answered their own question, occasionally ask one clarifying question. Do NOT give answers. 2-3 sentences max. Very patient.`,
      devil:    `You are Professor Ducky in Devil's Advocate mode. When the student shares an idea, respectfully challenge it: "But what about...", "Have you considered...", "That assumes X, but...". Push them to strengthen their argument. Never write their work. 3-5 sentences, intellectually playful. Never use this mode aggressively or with a visibly struggling student.`,
    };
    return base[duckMode] || base.teacher;
  }

  function parseBlackboard(reply) {
    const match = reply.match(/\[BLACKBOARD\]([\s\S]*?)\[\/BLACKBOARD\]/i);
    if (!match) return { text: reply, diagram: null };
    const diagram = match[1].trim();
    const text = reply.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim();
    return { text, diagram };
  }

  async function send(content) {
    const text = (content || input).trim();
    if (!text || isLoading) return;
    if (!content) setInput('');

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setIsLoading(true);
    setCharState('thinking');
    setDisplayText('');

    try {
      const { data } = await api.post('/chat', {
        messages: newMessages.map(({ role, content: c }) => ({ role, content: c })),
        brief: brief.trim() || undefined,
        modeSystem: getModeSystem(),
      });
      const { text: reply, diagram } = parseBlackboard(data.reply);
      if (diagram) setBlackboard(diagram);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      setDisplayText(reply);
      setIsLoading(false);
      if (interactionMode === 'voice-to-voice') {
        setCharState('speaking');
        speakText(reply, {
          voiceName,
          onMouth: setMouthOpen,
          onEnd: () => { setCharState('idle'); setMouthOpen(false); },
        });
      } else {
        setCharState('idle');
      }
    } catch {
      const err = 'Quack… something went quiet. Try again?';
      setDisplayText(err);
      setMessages(prev => [...prev, { role: 'assistant', content: err }]);
      setIsLoading(false);
      setCharState('idle');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function selectVoice(name) {
    setVoiceName(name);
    saveVoiceName(name);
    setShowVoiceMenu(false);
    speakText('Quack!', { voiceName: name });
  }

  const currentMode = DUCK_MODES.find(m => m.key === duckMode);
  const micActive = isListening;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes cloud-drift { 0% { transform: translateX(0); } 100% { transform: translateX(6px); } }
        @keyframes mic-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); } 50% { box-shadow: 0 0 0 14px rgba(239,68,68,0); } }
        @keyframes dot-rise { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-7px); opacity: 1; } }
        @keyframes caption-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes chip-in { from { opacity: 0; transform: translateY(8px) scale(0.92); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      {/* Sky */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0,
        background: 'linear-gradient(180deg, #0b1f3a 0%, #0e2d52 8%, #1a4a7a 18%, #2d6fa8 30%, #4a8fc0 40%, #6aaed4 48%, #8ec8e0 50%, #0077be 50%)' }} />

      {/* Water */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', zIndex: 1, pointerEvents: 'none' }}>
        <WaterScene />
      </div>

      {/* Sun */}
      <div style={{ position: 'absolute', zIndex: 0, top: '6%', left: '14%', width: 64, height: 64, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,245,180,1) 0%, rgba(255,220,80,0.85) 45%, rgba(255,200,40,0) 75%)',
        filter: 'blur(2px)', pointerEvents: 'none' }} />

      {/* Clouds */}
      {[{ left: '8%', top: '9%', w: 120, h: 36, dur: 7 }, { left: '38%', top: '5%', w: 160, h: 42, dur: 9 }, { left: '68%', top: '11%', w: 100, h: 30, dur: 6 }].map((c, i) => (
        <div key={i} style={{ position: 'absolute', zIndex: 0, left: c.left, top: c.top, width: c.w, height: c.h,
          borderRadius: 40, background: 'rgba(255,255,255,0.82)', filter: 'blur(6px)',
          animation: `cloud-drift ${c.dur}s ease-in-out infinite alternate`, pointerEvents: 'none' }} />
      ))}

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 20, background: 'rgba(30,80,110,0.82)',
        backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', gap: 12, padding: '0.6rem 1rem', flexShrink: 0, flexWrap: 'wrap' }}>

        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fbbf24', letterSpacing: '0.02em' }}>
          🦆 Professor Ducky
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap' }}>Mode:</span>
          <select value={duckMode} onChange={e => setDuckMode(e.target.value)}
            style={{ background: '#1a4a62', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, color: currentMode.colour, fontSize: '0.82rem', fontWeight: 700, padding: '0.3rem 0.5rem', cursor: 'pointer', outline: 'none' }}>
            {DUCK_MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap' }}>Chat by:</span>
          <select value={interactionMode} onChange={e => setInteractionMode(e.target.value)}
            style={{ background: '#1a4a62', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, color: '#fbbf24', fontSize: '0.82rem', fontWeight: 700, padding: '0.3rem 0.5rem', cursor: 'pointer', outline: 'none' }}>
            <option value="text">⌨️ Typing</option>
            <option value="voice-to-text">🎤 Speaking (read reply)</option>
            <option value="voice-to-voice">🎤 Speaking (hear reply)</option>
          </select>
        </div>

        {interactionMode === 'voice-to-voice' && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowVoiceMenu(v => !v)}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: '0.3rem 0.6rem', borderRadius: 8, fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fa-solid fa-volume-high" style={{ fontSize: 10 }} /> Fallback voice
            </button>
            {showVoiceMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: 'rgba(20,60,85,0.98)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '0.5rem', minWidth: 220, maxHeight: 260, overflowY: 'auto', zIndex: 100 }}
                onMouseLeave={() => setShowVoiceMenu(false)}>
                <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', padding: '0.2rem 0.6rem', margin: '0 0 2px' }}>ElevenLabs voices (auto)</p>
                {['Nicole', 'Rachel', 'Bella', 'Elli', 'Antoni', 'Adam'].map(name => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0.3rem 0.6rem', borderRadius: 7 }}>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{name}</span>
                    <span style={{ fontSize: '0.62rem', color: 'rgba(99,202,183,0.6)' }}>ElevenLabs</span>
                  </div>
                ))}
                <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', padding: '0.2rem 0.6rem', margin: '4px 0 2px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.4rem' }}>Browser fallback</p>
                {voices.map(v => (
                  <button key={v.name} onClick={() => selectVoice(v.name)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0.35rem 0.6rem', borderRadius: 7, border: 'none', background: voiceName === v.name ? 'rgba(251,191,36,0.12)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.75rem', color: voiceName === v.name ? '#fbbf24' : 'rgba(255,255,255,0.6)' }}>{v.name}</span>
                    <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)' }}>{v.lang}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={() => setWavesOn(w => !w)} title={wavesOn ? 'Mute waves' : 'Play waves'}
          style={{ background: wavesOn ? 'rgba(135,206,235,0.18)' : 'rgba(255,255,255,0.06)', border: `1px solid ${wavesOn ? 'rgba(135,206,235,0.4)' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', color: wavesOn ? '#87ceeb' : 'rgba(255,255,255,0.4)', padding: '0.3rem 0.7rem', borderRadius: 8, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className={`fa-solid ${wavesOn ? 'fa-water' : 'fa-volume-xmark'}`} />
        </button>

        <button onClick={() => setShowBrief(b => !b)}
          style={{ background: showBrief ? 'rgba(251,191,36,0.14)' : 'rgba(255,255,255,0.06)', border: `1px solid ${showBrief ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', color: showBrief ? '#fbbf24' : 'rgba(255,255,255,0.5)', padding: '0.3rem 0.7rem', borderRadius: 8, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className="fa-solid fa-file-lines" /> Brief{brief.trim() ? ' ✓' : ''}
        </button>
      </div>

      {/* 4-column stage */}
      <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'grid',
        gridTemplateColumns: '160px 1fr 320px 300px', minHeight: 0, overflow: 'hidden' }}>

        {/* Col 1 — concept chips */}
        <div style={{ position: 'relative', zIndex: 5, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '1rem 0.5rem 1rem 1rem', gap: 7, overflowY: 'auto', overflowX: 'hidden' }}>
          {(concepts.length > 0 || loadingConcepts) && (
            <>
              <p style={{ fontSize: '0.6rem', color: 'rgba(20,60,90,0.6)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', textAlign: 'center', fontWeight: 600 }}>Ask about</p>
              {concepts.map((c, i) => (
                <button key={i} onClick={() => send(`Can you explain "${c}"?`)}
                  style={{ padding: '0.38rem 0.7rem', borderRadius: 20, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)', color: 'rgba(20,60,90,0.85)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left', lineHeight: 1.35, animation: `chip-in 0.3s ease ${i * 0.07}s both`, transition: 'all 0.15s', backdropFilter: 'blur(4px)', fontWeight: 500 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.8)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.55)'; }}>
                  {c}
                </button>
              ))}
              {loadingConcepts && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(20,80,110,0.4)', animation: `dot-rise 1s ease-in-out infinite ${i*0.2}s` }} />)}
                </div>
              )}
            </>
          )}
        </div>

        {/* Col 2 — Duck */}
        <div style={{ position: 'relative', overflow: 'visible', background: 'transparent' }}>
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 5, padding: '3px 12px', borderRadius: 20,
            background: `${currentMode.colour}dd`, border: `1px solid ${currentMode.colour}`,
            zIndex: 8, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            <i className={`fa-solid ${currentMode.icon}`} style={{ color: 'white', fontSize: 10 }} />
            <span style={{ fontSize: '0.68rem', color: 'white', fontWeight: 600 }}>{currentMode.label} mode</span>
          </div>
          <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
            <Duck3D state={charState} mouthOpen={mouthOpen} />
          </div>
        </div>

        {/* Col 3 — Speech bubble */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1rem 0.5rem' }}>
          {(isLoading || displayText || isListening) && (
            <div style={{ background: 'rgba(255,255,255,0.90)', backdropFilter: 'blur(12px)', borderRadius: 18,
              padding: '0.85rem 1.15rem', boxShadow: '0 6px 28px rgba(0,80,120,0.18)',
              animation: 'caption-in 0.35s ease forwards', position: 'relative', maxHeight: '70vh', overflowY: 'auto' }}>
              {isLoading ? (
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'center', padding: '0.15rem 0' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(30,100,140,0.4)', animation: `dot-rise 1s ease-in-out infinite ${i*0.18}s` }} />)}
                </div>
              ) : isListening ? (
                <p style={{ color: 'rgba(30,80,110,0.65)', fontSize: 13, fontStyle: 'italic', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
                  {liveTranscript ? `"${liveTranscript}"` : 'Listening…'}
                </p>
              ) : (
                <p style={{ color: 'rgba(15,50,80,0.92)', fontSize: 14, lineHeight: 1.68, margin: 0 }}>{displayText}</p>
              )}
              <div style={{ position: 'absolute', top: '50%', left: -11, transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '11px solid transparent', borderBottom: '11px solid transparent', borderRight: '13px solid rgba(255,255,255,0.90)' }} />
            </div>
          )}
        </div>

        {/* Col 4 — Blackboard */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '1rem 1rem 1rem 0.5rem', gap: 8, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <i className="fa-solid fa-chalkboard" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Blackboard</span>
          </div>
          <div style={{ flex: 1, background: 'rgba(10,40,20,0.82)', backdropFilter: 'blur(8px)', border: '1px solid rgba(80,180,100,0.25)', borderRadius: 14, padding: '0.85rem', overflowY: 'auto', overflowX: 'auto', display: 'flex', alignItems: blackboard ? 'flex-start' : 'center', justifyContent: blackboard ? 'flex-start' : 'center' }}>
            {blackboard ? (
              <pre style={{ fontFamily: '"Courier New","Consolas",monospace', fontSize: '0.75rem', color: 'rgba(160,255,180,0.9)', margin: 0, lineHeight: 1.65, whiteSpace: 'pre' }}>
                {blackboard}
              </pre>
            ) : (
              <p style={{ fontSize: '0.72rem', color: 'rgba(160,255,180,0.3)', margin: 0, textAlign: 'center', lineHeight: 1.6 }}>
                Professor Ducky will draw diagrams,<br/>timelines and comparisons here
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Brief panel */}
      {showBrief && (
        <div style={{ position: 'relative', zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,45,62,0.94)', backdropFilter: 'blur(20px)', flexShrink: 0 }}>
          <div style={{ padding: '0.75rem 1.25rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3}
              placeholder="Paste your assignment brief — Professor Ducky will use it as context."
              style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '0.6rem 0.85rem', color: 'rgba(255,255,255,0.88)', fontSize: 13, resize: 'none', outline: 'none', lineHeight: 1.5 }} />
            {brief.trim() && (
              <button onClick={() => extractConcepts(brief)}
                style={{ flexShrink: 0, padding: '0.4rem 0.75rem', borderRadius: 12, border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.12)', color: '#fbbf24', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight: 5 }} />Extract concepts
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div style={{ position: 'relative', zIndex: 20, background: 'rgba(10,45,62,0.94)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '0.7rem 1.25rem 1.1rem', flexShrink: 0 }}>
        {interactionMode !== 'text' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {speechInputSupported ? (
              <button onClick={micActive ? stopListening : startListening} disabled={isLoading}
                style={{ width: 64, height: 64, borderRadius: '50%', border: micActive ? '2px solid #f87171' : '2px solid #fbbf24', cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: micActive ? 'rgba(239,68,68,0.25)' : 'rgba(251,191,36,0.2)', color: micActive ? '#f87171' : '#fbbf24', fontSize: 22, opacity: isLoading ? 0.4 : 1, animation: micActive ? 'mic-pulse 1.2s ease-in-out infinite' : 'none', transition: 'all 0.2s ease' }}>
                <i className={`fa-solid ${micActive ? 'fa-stop' : 'fa-microphone'}`} />
              </button>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', margin: 0 }}>
                <i className="fa-solid fa-microphone-slash" style={{ marginRight: 5 }} />
                Microphone not available in Firefox — use Chrome or Edge
              </p>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, maxWidth: 560, margin: '0 auto' }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={interactionMode === 'text' ? 'Talk to Professor Ducky… (Enter to send)' : 'Or type here…'}
            rows={1}
            style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, padding: '0.6rem 1rem', color: 'rgba(255,255,255,0.9)', fontSize: 13, resize: 'none', outline: 'none', lineHeight: 1.55, maxHeight: 96 }} />
          <button onClick={() => send()} disabled={!input.trim() || isLoading}
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', alignSelf: 'flex-end', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(251,191,36,0.25)', color: '#fbbf24', fontSize: 14, opacity: !input.trim() || isLoading ? 0.3 : 1, transition: 'opacity 0.2s' }}>
            <i className="fa-solid fa-paper-plane" />
          </button>
        </div>
      </div>
    </div>
  );
}
