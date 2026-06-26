import {
  buildIntervalPreview,
  DEFAULT_SETTINGS,
  getIntervalUnit,
  loadEarnedCount,
  loadSettings,
  saveEarnedCount,
  sanitizeSettings,
  saveSettings,
} from './settings.js';
import {
  addReinforcerFromFile,
  hydrateReinforcerUrl,
  loadReinforcerLibrary,
  removeReinforcer,
  selectReinforcer,
} from './reinforcer-library.js';
import { playSound, SOUNDS } from './sound.js';
import { createStarTimer } from './timer.js';

const STAR_PRESETS = [3, 5, 8, 10];
const UNLOCK_HOLD_MS = 2000;
const TRIPLE_TAP_WINDOW_MS = 600;
const AUTO_LOCK_MS = 60000;

const state = {
  settings: { ...DEFAULT_SETTINGS },
  earnedCount: 0,
  reinforcerLibrary: { items: [], selectedId: null },
  reinforcerUrl: null,
  isControlsUnlocked: false,
  showCelebration: false,
  settingsDraft: null,
  timerView: {
    activeStarIndex: 0,
    remainingLabel: '0:00',
    progress: 0,
    isStarReady: false,
    isTimerLoaded: false,
    isBoardComplete: false,
  },
};

const els = {
  loadingScreen: document.getElementById('loading-screen'),
  mainScreen: document.getElementById('main-screen'),
  settingsBtn: document.getElementById('settings-btn'),
  reinforcerImage: document.getElementById('reinforcer-image'),
  reinforcerPlaceholder: document.getElementById('reinforcer-placeholder'),
  starsRow: document.getElementById('stars-row'),
  controls: document.getElementById('controls'),
  settingsModal: document.getElementById('settings-modal'),
  settingsBody: document.getElementById('settings-body'),
  settingsClose: document.getElementById('settings-close'),
  celebration: document.getElementById('celebration'),
  celebrationFx: document.getElementById('celebration-fx'),
  photoInput: document.getElementById('photo-input'),
  libraryInput: document.getElementById('library-input'),
};

let previousEarnedCount = 0;
let holdInterval = null;
let holdStart = null;
let tapCount = 0;
let tapTimer = null;
let autoLockTimer = null;
let celebrationTimer = null;

const timer = createStarTimer({
  getSettings: () => state.settings,
  getEarnedCount: () => state.earnedCount,
  getTotalStars: () => state.settings.totalStars,
  onUpdate: (view) => {
    state.timerView = view;
    renderStars();
  },
});

function getStarBoxSize() {
  const totalStars = state.settings.totalStars;
  const gap = totalStars > 8 ? 8 : 10;
  const rowWidth = Math.min(window.innerWidth, document.documentElement.clientWidth) - 40;
  return Math.min((rowWidth - gap * (totalStars - 1)) / totalStars, 88);
}

function getStarGap() {
  return state.settings.totalStars > 8 ? 8 : 10;
}

async function bootstrap() {
  state.settings = loadSettings();
  state.earnedCount = Math.min(loadEarnedCount(), state.settings.totalStars);
  previousEarnedCount = state.earnedCount;

  state.reinforcerLibrary = await loadReinforcerLibrary();
  if (state.reinforcerLibrary.selectedId) {
    state.reinforcerUrl = await hydrateReinforcerUrl(state.reinforcerLibrary.selectedId);
  }

  await timer.initialize();
  timer.startTicking();

  els.loadingScreen.classList.add('hidden');
  els.mainScreen.classList.remove('hidden');
  renderAll();
}

function renderAll() {
  renderReinforcer();
  renderStars();
  renderControls();
}

function renderReinforcer() {
  if (state.reinforcerUrl) {
    els.reinforcerImage.src = state.reinforcerUrl;
    els.reinforcerImage.classList.remove('hidden');
    els.reinforcerPlaceholder.classList.add('hidden');
  } else {
    els.reinforcerImage.classList.add('hidden');
    els.reinforcerPlaceholder.classList.remove('hidden');
  }
}

function renderStars() {
  const totalStars = state.settings.totalStars;
  const size = getStarBoxSize();
  const gap = getStarGap();
  els.starsRow.style.gap = `${gap}px`;
  els.starsRow.innerHTML = '';

  for (let index = 0; index < totalStars; index += 1) {
    const isFilled = index < state.earnedCount;
    const isActive =
      !state.timerView.isBoardComplete &&
      state.timerView.isTimerLoaded &&
      index === state.timerView.activeStarIndex;
    const isReady = isActive && state.timerView.isStarReady;
    const progressPct = Math.round(state.timerView.progress * 100);

    const slot = document.createElement('div');
    slot.className = 'star-slot';
    slot.style.width = `${size}px`;

    const box = document.createElement('div');
    box.className = 'star-box';
    box.style.width = `${size}px`;
    box.style.height = `${size}px`;
    if (isFilled) box.classList.add('filled');
    if (isActive) box.classList.add('active');
    if (isReady) box.classList.add('ready');

    const glyph = document.createElement('div');
    glyph.className = 'star-glyph';
    glyph.textContent = '★';
  glyph.style.fontSize = `${Math.round(size * 0.58)}px`;
    box.appendChild(glyph);
    slot.appendChild(box);

    if (isActive) {
      const timerSection = document.createElement('div');
      timerSection.className = 'star-timer';

      const track = document.createElement('div');
      track.className = 'progress-track';
      const fill = document.createElement('div');
      fill.className = `progress-fill${isReady ? ' ready' : ''}`;
      fill.style.width = isReady ? '100%' : `${progressPct}%`;
      track.appendChild(fill);

      const label = document.createElement('div');
      label.className = `timer-text${isReady ? ' ready' : ''}`;
      label.textContent = isReady ? 'Ready!' : state.timerView.remainingLabel;

      timerSection.appendChild(track);
      timerSection.appendChild(label);
      slot.appendChild(timerSection);
    } else {
      const spacer = document.createElement('div');
      spacer.className = 'star-timer-spacer';
      slot.appendChild(spacer);
    }

    els.starsRow.appendChild(slot);
  }
}

function clearHoldTimer() {
  if (holdInterval) {
    clearInterval(holdInterval);
    holdInterval = null;
  }
  holdStart = null;
}

function resetAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
  }
  if (!state.isControlsUnlocked) {
    return;
  }
  autoLockTimer = setTimeout(() => {
    state.isControlsUnlocked = false;
    renderControls();
  }, AUTO_LOCK_MS);
}

function unlockControls() {
  clearHoldTimer();
  tapCount = 0;
  state.isControlsUnlocked = true;
  renderControls();
  resetAutoLockTimer();
}

function lockControls() {
  state.isControlsUnlocked = false;
  renderControls();
}

function registerLockTap() {
  tapCount += 1;
  if (tapTimer) {
    clearTimeout(tapTimer);
  }
  if (tapCount >= 3) {
    unlockControls();
    return;
  }
  tapTimer = setTimeout(() => {
    tapCount = 0;
  }, TRIPLE_TAP_WINDOW_MS);
}

function renderControls() {
  const { earnedCount, isControlsUnlocked } = state;
  const totalStars = state.settings.totalStars;
  els.controls.innerHTML = '';

  const lockRow = document.createElement('div');
  lockRow.className = 'lock-row';

  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.className = `lock-btn${isControlsUnlocked ? ' unlocked' : ''}`;
  lockBtn.textContent = isControlsUnlocked ? '🔓' : '🔒';
  lockBtn.addEventListener('click', () => {
    if (isControlsUnlocked) {
      lockControls();
    } else {
      registerLockTap();
    }
  });
  lockRow.appendChild(lockBtn);

  if (!isControlsUnlocked) {
    const hint = document.createElement('div');
    hint.className = 'lock-hint';
    hint.textContent = 'Hold here with 2 fingers for 2 sec, or tap the lock 3 times';
    lockRow.appendChild(hint);

    const progress = document.createElement('div');
    progress.className = 'unlock-progress';
    const fill = document.createElement('div');
    fill.className = 'unlock-progress-fill';
    fill.id = 'unlock-progress-fill';
    progress.appendChild(fill);
    lockRow.appendChild(progress);

    lockRow.addEventListener('touchstart', (event) => {
      if (isControlsUnlocked) {
        return;
      }
      if (event.touches.length >= 2 && !holdStart) {
        holdStart = Date.now();
        holdInterval = setInterval(() => {
          const elapsed = Date.now() - holdStart;
          const progressValue = Math.min(elapsed / UNLOCK_HOLD_MS, 1);
          fill.style.width = `${progressValue * 100}%`;
          if (progressValue >= 1) {
            unlockControls();
          }
        }, 40);
      }
    }, { passive: true });

    const endHold = () => {
      if (!isControlsUnlocked) {
        clearHoldTimer();
        fill.style.width = '0';
      }
    };
    lockRow.addEventListener('touchend', endHold);
    lockRow.addEventListener('touchcancel', endHold);
  }

  els.controls.appendChild(lockRow);

  const buttonsWrap = document.createElement('div');
  buttonsWrap.className = `buttons-wrap${isControlsUnlocked ? '' : ' locked'}`;

  if (!isControlsUnlocked) {
    const blocker = document.createElement('div');
    blocker.className = 'button-blocker';
    buttonsWrap.appendChild(blocker);
  }

  if (isControlsUnlocked) {
    const lockAgain = document.createElement('button');
    lockAgain.type = 'button';
    lockAgain.className = 'text-btn';
    lockAgain.textContent = '🔒 Lock Again';
    lockAgain.addEventListener('click', lockControls);
    buttonsWrap.appendChild(lockAgain);

    const resetBoard = document.createElement('button');
    resetBoard.type = 'button';
    resetBoard.className = 'action-btn reset-board';
    resetBoard.textContent = 'Reset Board';
    resetBoard.addEventListener('click', confirmResetBoard);
    buttonsWrap.appendChild(resetBoard);
  }

  const awardBtn = document.createElement('button');
  awardBtn.type = 'button';
  awardBtn.className = 'action-btn award';
  awardBtn.textContent = '+1 Star';
  awardBtn.disabled = !isControlsUnlocked || earnedCount >= totalStars;
  awardBtn.addEventListener('click', () => {
    resetAutoLockTimer();
    awardStar();
  });
  buttonsWrap.appendChild(awardBtn);

  const deductBtn = document.createElement('button');
  deductBtn.type = 'button';
  deductBtn.className = 'action-btn deduct';
  deductBtn.textContent = '-1 Star';
  deductBtn.disabled = !isControlsUnlocked || earnedCount <= 0;
  deductBtn.addEventListener('click', () => {
    resetAutoLockTimer();
    deductStar();
  });
  buttonsWrap.appendChild(deductBtn);

  els.controls.appendChild(buttonsWrap);
}

async function awardStar() {
  const totalStars = state.settings.totalStars;
  const nextCount = Math.min(state.earnedCount + 1, totalStars);
  if (nextCount === state.earnedCount) {
    return;
  }

  playSound(SOUNDS.starAdd);
  state.earnedCount = nextCount;
  saveEarnedCount(nextCount);
  handleEarnedCountChange();
  await timer.initialize();
  renderStars();
  renderControls();
}

async function deductStar() {
  const nextCount = Math.max(state.earnedCount - 1, 0);
  if (nextCount === state.earnedCount) {
    return;
  }

  playSound(SOUNDS.starRemove);
  state.earnedCount = nextCount;
  saveEarnedCount(nextCount);
  handleEarnedCountChange();
  await timer.initialize();
  renderStars();
  renderControls();
}

function handleEarnedCountChange() {
  if (
    state.earnedCount === state.settings.totalStars &&
    previousEarnedCount < state.settings.totalStars
  ) {
    showCelebration();
  }

  if (state.earnedCount < state.settings.totalStars && state.showCelebration) {
    hideCelebration();
  }

  previousEarnedCount = state.earnedCount;
}

const CONFETTI_COLORS = [
  '#E8C547', '#7FAF8A', '#8A9BA8', '#D4A5A5', '#A8C5E8', '#C9B8E0', '#F0C987',
];

function spawnCelebrationFx() {
  if (!els.celebrationFx) {
    return;
  }

  els.celebrationFx.innerHTML = '';
  for (let i = 0; i < 52; i += 1) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
    piece.style.animationDelay = `${Math.random() * 0.45}s`;
    piece.style.width = `${7 + Math.random() * 9}px`;
    piece.style.height = `${5 + Math.random() * 6}px`;
    els.celebrationFx.appendChild(piece);
  }
}

function showCelebration() {
  state.showCelebration = true;
  els.celebration.classList.remove('hidden');
  spawnCelebrationFx();
  playSound(SOUNDS.success);
  playSound(SOUNDS.starAdd);
  if (celebrationTimer) {
    clearTimeout(celebrationTimer);
  }
  celebrationTimer = setTimeout(hideCelebration, 5000);
}

function hideCelebration() {
  state.showCelebration = false;
  els.celebration.classList.add('hidden');
  if (els.celebrationFx) {
    els.celebrationFx.innerHTML = '';
  }
  if (celebrationTimer) {
    clearTimeout(celebrationTimer);
    celebrationTimer = null;
  }
}

async function resetBoard() {
  await timer.clearTimer();
  state.earnedCount = 0;
  saveEarnedCount(0);
  previousEarnedCount = 0;
  hideCelebration();
  lockControls();
  await timer.initialize();
  renderAll();
}

function confirmResetBoard() {
  if (window.confirm('Are you sure you want to reset the board? This will clear all progress.')) {
    resetBoard();
  }
}

function openSettings() {
  state.settingsDraft = { ...state.settings };
  els.settingsBtn.classList.add('active');
  renderSettings();
  els.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  els.settingsBtn.classList.remove('active');
  els.settingsModal.classList.add('hidden');
}

function renderSettings() {
  const draft = state.settingsDraft;
  const intervalUnitLabel = getIntervalUnit(draft) === 'sec' ? 'seconds' : 'minutes';
  els.settingsBody.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Reward Image';
  els.settingsBody.appendChild(title);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Pick a saved reward, or add a new one with camera / photos.';
  els.settingsBody.appendChild(hint);

  if (state.reinforcerLibrary.items.length > 0) {
    const rewards = document.createElement('div');
    rewards.className = 'saved-rewards';

    state.reinforcerLibrary.items.forEach((item) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'saved-item';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `saved-thumb${state.reinforcerLibrary.selectedId === item.id ? ' selected' : ''}`;

      const img = document.createElement('img');
      hydrateReinforcerUrl(item.id).then((url) => {
        if (url) {
          img.src = url;
        }
      });
      button.appendChild(img);

      button.addEventListener('click', async () => {
        state.reinforcerLibrary = await selectReinforcer(item.id);
        state.reinforcerUrl = await hydrateReinforcerUrl(item.id);
        renderReinforcer();
        renderSettings();
      });

      if (state.reinforcerLibrary.selectedId === item.id) {
        const badge = document.createElement('div');
        badge.className = 'saved-badge';
        badge.textContent = '✓';
        wrapper.appendChild(button);
        wrapper.appendChild(badge);
      } else {
        wrapper.appendChild(button);
      }

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'saved-delete';
      del.textContent = '×';
      del.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!window.confirm('Remove this image from your saved rewards?')) {
          return;
        }
        state.reinforcerLibrary = await removeReinforcer(item.id);
        state.reinforcerUrl = state.reinforcerLibrary.selectedId
          ? await hydrateReinforcerUrl(state.reinforcerLibrary.selectedId)
          : null;
        renderReinforcer();
        renderSettings();
      });
      wrapper.appendChild(del);
      rewards.appendChild(wrapper);
    });

    els.settingsBody.appendChild(rewards);
  } else {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.style.fontStyle = 'italic';
    empty.textContent = 'No saved rewards yet. Take a photo or choose from photos to add one.';
    els.settingsBody.appendChild(empty);
  }

  const row = document.createElement('div');
  row.className = 'row';

  const takePhoto = document.createElement('button');
  takePhoto.type = 'button';
  takePhoto.className = 'config-btn';
  takePhoto.textContent = 'Take Photo';
  takePhoto.addEventListener('click', () => els.photoInput.click());

  const choosePhotos = document.createElement('button');
  choosePhotos.type = 'button';
  choosePhotos.className = 'config-btn';
  choosePhotos.textContent = 'Choose from Photos';
  choosePhotos.addEventListener('click', () => els.libraryInput.click());

  row.appendChild(takePhoto);
  row.appendChild(choosePhotos);
  els.settingsBody.appendChild(row);

  appendStarCountSettings(draft);
  appendThinningSettings(draft, intervalUnitLabel);
  appendPreview(draft);
  appendSaveResetDev(draft);
}

function appendStarCountSettings(draft) {
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Target Star Count';
  els.settingsBody.appendChild(title);

  const chips = document.createElement('div');
  chips.className = 'chip-row';
  STAR_PRESETS.forEach((count) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${Number(draft.totalStars) === count ? ' active' : ''}`;
    chip.textContent = String(count);
    chip.addEventListener('click', () => {
      state.settingsDraft.totalStars = count;
      renderSettings();
    });
    chips.appendChild(chip);
  });
  els.settingsBody.appendChild(chips);

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = 'Custom count (1-12)';
  els.settingsBody.appendChild(label);

  const input = document.createElement('input');
  input.className = 'input';
  input.type = 'number';
  input.min = '1';
  input.max = '12';
  input.value = String(draft.totalStars);
  input.addEventListener('input', () => {
    state.settingsDraft.totalStars = input.value;
  });
  els.settingsBody.appendChild(input);
}

function appendThinningSettings(draft, intervalUnitLabel) {
  const switchRow = document.createElement('div');
  switchRow.className = 'switch-row';

  const copy = document.createElement('div');
  copy.className = 'switch-copy';
  copy.innerHTML = '<div class="section-title">Time Thinning Mode</div><div class="hint">Increase wait time for each star when enabled</div>';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = draft.timeThinningEnabled;
  toggle.addEventListener('change', () => {
    state.settingsDraft.timeThinningEnabled = toggle.checked;
    renderSettings();
  });

  switchRow.appendChild(copy);
  switchRow.appendChild(toggle);
  els.settingsBody.appendChild(switchRow);

  if (!draft.timeThinningEnabled) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `${intervalUnitLabel} per star`;
    els.settingsBody.appendChild(label);

    const input = document.createElement('input');
    input.className = 'input';
    input.type = 'number';
    input.min = '1';
    input.value = String(draft.standardIntervalMinutes);
    input.addEventListener('input', () => {
      state.settingsDraft.standardIntervalMinutes = input.value;
    });
    els.settingsBody.appendChild(input);
    return;
  }

  const modeRow = document.createElement('div');
  modeRow.className = 'mode-row';

  ['multiplier', 'sequence'].forEach((mode) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `mode-chip green${draft.thinningMode === mode ? ' active' : ''}`;
    chip.textContent = mode === 'multiplier' ? 'Multiplier' : 'Custom Sequence';
    chip.addEventListener('click', () => {
      state.settingsDraft.thinningMode = mode;
      renderSettings();
    });
    modeRow.appendChild(chip);
  });
  els.settingsBody.appendChild(modeRow);

  if (draft.thinningMode === 'multiplier') {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `Base ${intervalUnitLabel} (Star n = base × n)`;
    els.settingsBody.appendChild(label);

    const input = document.createElement('input');
    input.className = 'input';
    input.type = 'number';
    input.min = '1';
    input.value = String(draft.baseMinutes);
    input.addEventListener('input', () => {
      state.settingsDraft.baseMinutes = input.value;
    });
    els.settingsBody.appendChild(input);
  } else {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `Comma-separated ${intervalUnitLabel}`;
    els.settingsBody.appendChild(label);

    const input = document.createElement('input');
    input.className = 'input';
    input.value = draft.intervalSequence;
    input.addEventListener('input', () => {
      state.settingsDraft.intervalSequence = input.value;
    });
    els.settingsBody.appendChild(input);
  }
}

function appendPreview(draft) {
  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.textContent = buildIntervalPreview(draft);
  els.settingsBody.appendChild(preview);
}

function appendSaveResetDev(draft) {
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'save-btn';
  save.textContent = 'Save Settings';
  save.addEventListener('click', async () => {
    const sanitized = sanitizeSettings(state.settingsDraft);
    saveSettings(sanitized);
    state.settings = sanitized;
    state.earnedCount = Math.min(state.earnedCount, sanitized.totalStars);
    saveEarnedCount(state.earnedCount);
    await timer.initialize();
    renderAll();
    closeSettings();
  });
  els.settingsBody.appendChild(save);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset-btn';
  reset.textContent = 'Reset Board';
  reset.addEventListener('click', confirmResetBoard);
  els.settingsBody.appendChild(reset);

  const devRow = document.createElement('div');
  devRow.className = 'dev-row';
  devRow.innerHTML = '<div class="switch-copy"><div class="section-title">Dev Mode (Test in Seconds)</div><div class="hint">Treats all interval values as seconds instead of minutes</div></div>';

  const devToggle = document.createElement('input');
  devToggle.type = 'checkbox';
  devToggle.checked = draft.devModeSeconds;
  devToggle.addEventListener('change', () => {
    state.settingsDraft.devModeSeconds = devToggle.checked;
    renderSettings();
  });
  devRow.appendChild(devToggle);
  els.settingsBody.appendChild(devRow);
}

async function handleImageFile(file) {
  if (!file) {
    return;
  }
  const { state: library, url } = await addReinforcerFromFile(file);
  state.reinforcerLibrary = library;
  state.reinforcerUrl = url;
  renderReinforcer();
  if (!els.settingsModal.classList.contains('hidden')) {
    renderSettings();
  }
}

els.settingsBtn.addEventListener('click', openSettings);
els.settingsClose.addEventListener('click', closeSettings);
els.settingsModal.addEventListener('click', (event) => {
  if (event.target === els.settingsModal) {
    closeSettings();
  }
});
els.celebration.addEventListener('click', hideCelebration);

els.photoInput.addEventListener('change', async () => {
  const file = els.photoInput.files?.[0];
  els.photoInput.value = '';
  await handleImageFile(file);
});

els.libraryInput.addEventListener('change', async () => {
  const file = els.libraryInput.files?.[0];
  els.libraryInput.value = '';
  await handleImageFile(file);
});

window.addEventListener('resize', () => {
  renderStars();
});

bootstrap();
