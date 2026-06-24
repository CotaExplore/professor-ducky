import axios from 'axios';

const ttsApi = axios.create({ baseURL: '/duck' });

export function getAvailableVoices() {
  const voices = window.speechSynthesis?.getVoices() || [];
  return voices
    .filter(v => v.lang.startsWith('en'))
    .sort((a, b) => {
      if (a.localService !== b.localService) return a.localService ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

const VOICE_KEY = 'pd_duck_voice';

export function getSavedVoiceName() {
  return localStorage.getItem(VOICE_KEY) || '';
}

export function saveVoiceName(name) {
  localStorage.setItem(VOICE_KEY, name);
}

let elevenLabsAvailable = null;

export async function speakText(text, { onStart, onEnd, onMouth, voiceName } = {}) {
  if (!text) return;
  window.speechSynthesis?.cancel();

  if (elevenLabsAvailable !== false) {
    try {
      const { data: blob, status } = await ttsApi.post('/tts', { text }, { responseType: 'blob' });
      if (status === 200) {
        elevenLabsAvailable = true;
        const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'audio/mpeg' }));
        const audio = new Audio(url);
        let mouthInterval = null;
        audio.onplay = () => {
          onStart?.();
          let open = true;
          mouthInterval = setInterval(() => { open = !open; onMouth?.(open); }, 110);
        };
        audio.onended = () => { clearInterval(mouthInterval); onMouth?.(false); URL.revokeObjectURL(url); onEnd?.(); };
        audio.onerror = () => { clearInterval(mouthInterval); onMouth?.(false); URL.revokeObjectURL(url); onEnd?.(); };
        await audio.play();
        return;
      }
    } catch (err) {
      if (err.response?.status === 503 || err.response?.status === 502) elevenLabsAvailable = false;
    }
  }

  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.pitch = 1.05;

  let mouthInterval = null;
  u.onstart = () => {
    onStart?.();
    if (onMouth) { let open = true; mouthInterval = setInterval(() => { open = !open; onMouth(open); }, 105); }
  };
  u.onboundary = () => { if (onMouth) { onMouth(true); setTimeout(() => onMouth(false), 65); } };
  u.onend = () => { clearInterval(mouthInterval); onMouth?.(false); onEnd?.(); };
  u.onerror = () => { clearInterval(mouthInterval); onMouth?.(false); onEnd?.(); };

  function go() {
    const voices = window.speechSynthesis.getVoices();
    let voice = voiceName ? voices.find(v => v.name === voiceName) : null;
    if (!voice) {
      voice = voices.find(v =>
        v.name.includes('Samantha') || v.name.includes('Google UK English Female') ||
        v.name.includes('Microsoft Libby') || v.name.includes('Karen') ||
        (v.lang === 'en-GB' && !v.name.includes('Male'))
      ) || voices.find(v => v.lang.startsWith('en'));
    }
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  }

  if (window.speechSynthesis.getVoices().length > 0) go();
  else window.speechSynthesis.addEventListener('voiceschanged', go, { once: true });
}
