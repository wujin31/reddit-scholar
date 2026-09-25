// Kitchen timers that survive reloads (stored as end times), a done chime, and screen wake lock.

import { loadLocal, saveLocal, getSettings } from "./store.js";

let timers = loadLocal("timers", []); // { id, label, seconds, endsAt, done }
const listeners = new Set();
let audio = null;

export const onTimersChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getTimers = () => timers;

function emit() {
  saveLocal("timers", timers);
  listeners.forEach((fn) => fn(timers));
}

export function formatDuration(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function shortDuration(seconds) {
  if (seconds % 3600 === 0) return `${seconds / 3600} hr`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} hr ${Math.round((seconds % 3600) / 60)} min`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} sec`;
}

// Start a timer. With the "clock" setting, hand off to the iOS Clock through a Shortcut so it
// rings even when the app is closed.
export function startTimer(label, seconds) {
  const s = getSettings();
  // A double tap (or the chip and the big button) shouldn't start the same timer twice.
  const now = Date.now();
  if (timers.some((t) => !t.done && t.label === label && t.seconds === seconds && now - (t.endsAt - t.seconds * 1000) < 3000)) return;
  if (s.timerMode === "clock") {
    const url = `shortcuts://run-shortcut?name=${encodeURIComponent(s.clockShortcut)}&input=text&text=${seconds}`;
    location.href = url;
    return;
  }
  unlockAudio();
  timers = [...timers, { id: crypto.randomUUID?.() ?? String(Date.now()), label, seconds, endsAt: Date.now() + seconds * 1000, done: false }];
  emit();
}

export function cancelTimer(id) {
  timers = timers.filter((t) => t.id !== id);
  emit();
}

export function addTime(id, seconds) {
  timers = timers.map((t) => (t.id === id ? { ...t, endsAt: Math.max(Date.now(), t.endsAt) + seconds * 1000, done: false } : t));
  emit();
}

// Audio must be unlocked by a tap on iOS; starting a timer is that tap.
function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch { audio = null; }
}

// Timers restored after a reload need audio too: unlock it on the first tap anywhere.
document.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });

function chime() {
  if (!audio) unlockAudio();
  if (!audio) return;
  const t0 = audio.currentTime;
  [0, 0.35, 0.7, 1.4, 1.75, 2.1].forEach((offset, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = i % 3 === 2 ? 1175 : 880;
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.3);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.32);
  });
  navigator.vibrate?.([300, 150, 300]);
}

setInterval(() => {
  let changed = false;
  timers = timers.map((t) => {
    if (!t.done && Date.now() >= t.endsAt) { changed = true; chime(); return { ...t, done: true }; }
    return t;
  });
  if (changed) emit();
  else listeners.forEach((fn) => fn(timers));
}, 1000);

// ---------- wake lock ----------

let lock = null;
let wanted = false;

export async function keepAwake(on) {
  wanted = on;
  try {
    if (on && !lock && "wakeLock" in navigator) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch { lock = null; }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wanted) keepAwake(true);
});
