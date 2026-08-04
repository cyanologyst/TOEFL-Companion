import type { VocabularySettings, WordEntry } from "../types/vocabulary";

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!("Notification" in window)) {
    return "unsupported";
  }
  return Notification.requestPermission();
}

export function showSystemWordNotification(word: WordEntry): void {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    const notification = new Notification("TOEFL vocabulary review", {
      body: [word.term, word.partOfSpeech, word.pronunciation, word.shortMeaning]
        .filter(Boolean)
        .join("\n"),
      tag: `vocabulary-${word.id}`,
      renotify: true,
    });
    notification.onclick = () => {
      window.focus();
      window.history.pushState(
        null,
        "",
        `#view=vocabulary&section=library&word=${encodeURIComponent(word.id)}`,
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
      notification.close();
    };
  } catch {
    // In-app reminders remain available when the browser blocks OS delivery.
  }
}

export function getSpeechVoices(): SpeechSynthesisVoice[] {
  return "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
}

export function speakVocabulary(
  text: string,
  settings: Pick<VocabularySettings, "voiceName" | "speechRate">,
): void {
  if (!("speechSynthesis" in window) || !text.trim()) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Math.min(2, Math.max(0.5, settings.speechRate));
  if (settings.voiceName) {
    const voice = getSpeechVoices().find(
      (candidate) =>
        candidate.name === settings.voiceName || candidate.voiceURI === settings.voiceName,
    );
    if (voice) {
      utterance.voice = voice;
    }
  }
  window.speechSynthesis.speak(utterance);
}

export function playVocabularyCue(
  enabled: boolean,
  cue: "reminder" | "known" | "later" | "complete",
): void {
  if (!enabled) {
    return;
  }

  try {
    const Context =
      window.AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!Context) {
      return;
    }
    const context = new Context();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequencies = {
      reminder: 560,
      known: 660,
      later: 440,
      complete: 740,
    } as const;
    oscillator.type = "sine";
    oscillator.frequency.value = frequencies[cue];
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Some browsers block sound before the user has interacted with the page.
  }
}
