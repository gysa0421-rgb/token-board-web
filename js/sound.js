const soundCache = new Map();

function getAudio(path) {
  if (!soundCache.has(path)) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    soundCache.set(path, audio);
  }
  return soundCache.get(path).cloneNode();
}

export function playSound(path) {
  try {
    const audio = getAudio(path);
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {});
    }
  } catch (error) {
    console.warn('Failed to play sound:', error);
  }
}

export const SOUNDS = {
  starAdd: 'assets/star_add.wav',
  starRemove: 'assets/star_remove.wav',
  starReady: 'assets/star_ready.wav',
  success: 'assets/success.wav',
};
