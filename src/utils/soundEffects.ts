let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

function scheduleTone(
  ctx: AudioContext,
  frequency: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain: number
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + startOffsetSec);

  const startTime = ctx.currentTime + startOffsetSec;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.02);
}

/**
 * Plays a subtle, non-intrusive confirmation chime using the Web Audio API.
 * Safe no-op if audio playback is unavailable or blocked by the browser.
 */
export function playSuccessChime(variant: 'submit' | 'approve' = 'submit'): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const triggerNotes = () => {
      if (variant === 'approve') {
        // Warm solar triad confirmation for admin task approval
        scheduleTone(ctx, 587.33, 0, 0.16, 0.065); // D5
        scheduleTone(ctx, 739.99, 0.075, 0.18, 0.07); // F#5
        scheduleTone(ctx, 880.0, 0.15, 0.26, 0.075); // A5
      } else {
        // Light two-note chime for user task submission
        scheduleTone(ctx, 523.25, 0, 0.16, 0.065); // C5
        scheduleTone(ctx, 783.99, 0.08, 0.24, 0.075); // G5
      }
    };

    if (ctx.state === 'suspended') {
      void ctx.resume().then(triggerNotes).catch(() => {
        // Ignore autoplay restrictions
      });
    } else {
      triggerNotes();
    }
  } catch {
    // Gracefully ignore audio API errors
  }
}
