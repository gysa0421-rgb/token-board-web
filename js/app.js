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
  lockRowHost: document.getElementById('lock-row-host'),
  buttonsWrap: document.getElementById('buttons-wrap'),
  buttonBlocker: document.getElementById('button-blocker'),
  unlockedActions: document.getElementById('unlocked-actions'),
  lockAgainBtn: document.getElementById('lock-again-btn'),
  resetBoardBtn: document.getElementById('reset-board-btn'),
  awardStarBtn: document.getElementById('award-star-btn'),
  deductStarBtn: document.getElementById('deduct-star-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsBody: document.getElementById('settings-body'),
  settingsClose: document.getElementById('settings-close'),
  rewardModal: document.getElementById('reward-modal'),
  rewardBody: document.getElementById('reward-body'),
  rewardBack: document.getElementById('reward-back'),
  rewardDone: document.getElementById('reward-done'),
  rewardTakePhoto: document.getElementById('reward-take-photo'),
  rewardChoosePhotos: document.getElementById('reward-choose-photos'),
  celebration: document.getElementById('celebration'),
  celebrationFx: document.getElementById('celebration-fx'),
  celebrationRewardImage: document.getElementById('celebration-reward-image'),
  celebrationRewardPlaceholder: document.getElementById('celebration-reward-placeholder'),
  photoInput: document.getElementById('photo-input'),
  libraryInput: document.getElementById('library-input'),
};

let previousEarnedCount = 0;
let holdInterval = null;
let holdStart = null;
let tapCount = 0;
let tapTimer = null;
let autoLockTimer = null;
let starActionInFlight = false;
let controlsInitialized = false;

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

function isAwardAllowed() {
  return (
    state.isControlsUnlocked &&
    state.earnedCount < state.settings.totalStars
  );
}

function isDeductAllowed() {
  return state.isControlsUnlocked && state.earnedCount > 0;
}

function setActionButtonState(button, allowed) {
  if (!button) {
    return;
  }

  button.classList.toggle('is-disabled', !allowed);
  button.setAttribute('aria-disabled', String(!allowed));
}

function updateStarButtons() {
  setActionButtonState(els.awardStarBtn, isAwardAllowed());
  setActionButtonState(els.deductStarBtn, isDeductAllowed());
}

function updateControlsLockState() {
  const { isControlsUnlocked } = state;

  els.buttonsWrap.classList.toggle('locked', !isControlsUnlocked);
  els.buttonBlocker.hidden = isControlsUnlocked;
  els.unlockedActions.hidden = !isControlsUnlocked;
  updateStarButtons();
}

function renderLockRow() {
  if (!els.lockRowHost) {
    return;
  }

  els.lockRowHost.innerHTML = '';
  const lockRow = document.createElement('div');
  lockRow.className = 'lock-row';

  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.className = `lock-btn${state.isControlsUnlocked ? ' unlocked' : ''}`;
  lockBtn.textContent = state.isControlsUnlocked ? '🔓' : '🔒';
  lockBtn.addEventListener('click', () => {
    if (state.isControlsUnlocked) {
      lockControls();
    } else {
      registerLockTap();
    }
  });
  lockRow.appendChild(lockBtn);

  if (!state.isControlsUnlocked) {
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
      if (state.isControlsUnlocked) {
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
      if (!state.isControlsUnlocked) {
        clearHoldTimer();
        fill.style.width = '0';
      }
    };
    lockRow.addEventListener('touchend', endHold);
    lockRow.addEventListener('touchcancel', endHold);
  }

  els.lockRowHost.appendChild(lockRow);
}

function setupControls() {
  if (controlsInitialized) {
    return;
  }

  els.lockAgainBtn?.addEventListener('click', lockControls);
  els.resetBoardBtn?.addEventListener('click', confirmResetBoard);
  els.awardStarBtn?.addEventListener('click', () => {
    if (!isAwardAllowed() || starActionInFlight) {
      return;
    }
    resetAutoLockTimer();
    awardStar();
  });
  els.deductStarBtn?.addEventListener('click', () => {
    if (!isDeductAllowed() || starActionInFlight) {
      return;
    }
    resetAutoLockTimer();
    deductStar();
  });

  controlsInitialized = true;
}

function renderControls() {
  setupControls();
  renderLockRow();
  updateControlsLockState();
}

async function awardStar() {
  if (!isAwardAllowed() || starActionInFlight) {
    return;
  }

  const totalStars = state.settings.totalStars;
  const nextCount = Math.min(state.earnedCount + 1, totalStars);
  if (nextCount === state.earnedCount) {
    return;
  }

  starActionInFlight = true;
  playSound(SOUNDS.starAdd);
  state.earnedCount = nextCount;
  saveEarnedCount(nextCount);
  updateStarButtons();
  handleEarnedCountChange();
  renderStars();

  try {
    await timer.initialize();
    renderStars();
  } finally {
    starActionInFlight = false;
    updateStarButtons();
  }
}

async function deductStar() {
  if (!isDeductAllowed() || starActionInFlight) {
    return;
  }

  const nextCount = Math.max(state.earnedCount - 1, 0);
  if (nextCount === state.earnedCount) {
    return;
  }

  starActionInFlight = true;
  playSound(SOUNDS.starRemove);
  state.earnedCount = nextCount;
  saveEarnedCount(nextCount);
  updateStarButtons();
  handleEarnedCountChange();
  renderStars();

  try {
    await timer.initialize();
    renderStars();
  } finally {
    starActionInFlight = false;
    updateStarButtons();
  }
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

function updateCelebrationRewardImage() {
  if (!els.celebrationRewardImage || !els.celebrationRewardPlaceholder) {
    return;
  }

  if (state.reinforcerUrl) {
    els.celebrationRewardImage.src = state.reinforcerUrl;
    els.celebrationRewardImage.classList.remove('hidden');
    els.celebrationRewardPlaceholder.classList.add('hidden');
  } else {
    els.celebrationRewardImage.classList.add('hidden');
    els.celebrationRewardPlaceholder.classList.remove('hidden');
  }
}

function showCelebration() {
  state.showCelebration = true;
  updateCelebrationRewardImage();
  els.celebration.classList.remove('hidden');
  spawnCelebrationFx();
  playSound(SOUNDS.success);
  playSound(SOUNDS.starAdd);
}

function hideCelebration() {
  state.showCelebration = false;
  els.celebration.classList.add('hidden');
  if (els.celebrationFx) {
    els.celebrationFx.innerHTML = '';
  }
}

function dismissCelebration() {
  if (!state.showCelebration) {
    return;
  }

  hideCelebration();
}

async function resetBoard() {
  hideCelebration();

  await timer.clearTimer();
  state.earnedCount = 0;
  saveEarnedCount(0);
  previousEarnedCount = 0;
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
  closeRewardPicker();
}

function openRewardPicker() {
  renderRewardPicker();
  els.rewardModal.classList.remove('hidden');
}

function closeRewardPicker() {
  els.rewardModal.classList.add('hidden');
  if (!els.settingsModal.classList.contains('hidden')) {
    renderSettings();
  }
}

function renderRewardPicker() {
  if (!els.rewardBody) {
    return;
  }

  els.rewardBody.innerHTML = '';

  const hero = document.createElement('div');
  hero.className = 'reward-hero';

  const heroLabel = document.createElement('div');
  heroLabel.className = 'reward-hero-label';
  heroLabel.textContent = "Today's Reward";
  hero.appendChild(heroLabel);

  const heroFrame = document.createElement('div');
  heroFrame.className = 'reward-hero-frame';

  const heroImg = document.createElement('img');
  heroImg.className = 'reward-hero-image';
  heroImg.alt = 'Selected reward image';
  if (state.reinforcerUrl) {
    heroImg.src = state.reinforcerUrl;
  } else {
    heroImg.src = 'assets/splash-icon.png';
  }
  heroFrame.appendChild(heroImg);
  hero.appendChild(heroFrame);

  const heroHint = document.createElement('div');
  heroHint.className = 'hint';
  heroHint.textContent = 'Tap a saved reward below, or add a new photo.';
  hero.appendChild(heroHint);

  els.rewardBody.appendChild(hero);

  const gridTitle = document.createElement('div');
  gridTitle.className = 'section-title';
  gridTitle.textContent = 'Saved Rewards';
  els.rewardBody.appendChild(gridTitle);

  if (state.reinforcerLibrary.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'reward-empty';
    empty.textContent = 'No saved rewards yet. Use the buttons below to add one.';
    els.rewardBody.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'reward-grid';

  state.reinforcerLibrary.items.forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'reward-grid-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `reward-grid-thumb${state.reinforcerLibrary.selectedId === item.id ? ' selected' : ''}`;

    const img = document.createElement('img');
    hydrateReinforcerUrl(item.id).then((url) => {
      if (url) {
        img.src = url;
      }
    });
    img.alt = 'Saved reward';
    button.appendChild(img);

    button.addEventListener('click', async () => {
      state.reinforcerLibrary = await selectReinforcer(item.id);
      state.reinforcerUrl = await hydrateReinforcerUrl(item.id);
      renderReinforcer();
      renderRewardPicker();
    });

    wrapper.appendChild(button);

    if (state.reinforcerLibrary.selectedId === item.id) {
      const badge = document.createElement('div');
      badge.className = 'reward-grid-badge';
      badge.textContent = '✓';
      wrapper.appendChild(badge);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'reward-grid-delete';
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
      renderRewardPicker();
    });
    wrapper.appendChild(del);
    grid.appendChild(wrapper);
  });

  els.rewardBody.appendChild(grid);
}

function appendRewardSettingsSummary() {
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Reward Image';
  els.settingsBody.appendChild(title);

  const summary = document.createElement('button');
  summary.type = 'button';
  summary.className = 'reward-settings-card';

  const preview = document.createElement('div');
  preview.className = 'reward-settings-preview';
  const img = document.createElement('img');
  img.alt = 'Current reward';
  img.src = state.reinforcerUrl || 'assets/splash-icon.png';
  preview.appendChild(img);

  const copy = document.createElement('div');
  copy.className = 'reward-settings-copy';
  copy.innerHTML = `
    <div class="reward-settings-title">Choose Reward Image</div>
    <div class="hint">Open full-screen library to pick or add photos</div>
  `;

  const arrow = document.createElement('div');
  arrow.className = 'reward-settings-arrow';
  arrow.textContent = '›';

  summary.appendChild(preview);
  summary.appendChild(copy);
  summary.appendChild(arrow);
  summary.addEventListener('click', openRewardPicker);
  els.settingsBody.appendChild(summary);
}

function renderSettings() {
  const draft = state.settingsDraft;
  const intervalUnitLabel = getIntervalUnit(draft) === 'sec' ? 'seconds' : 'minutes';
  els.settingsBody.innerHTML = '';

  appendRewardSettingsSummary();

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
  if (!els.rewardModal.classList.contains('hidden')) {
    renderRewardPicker();
  } else if (!els.settingsModal.classList.contains('hidden')) {
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
els.rewardBack.addEventListener('click', closeRewardPicker);
els.rewardDone.addEventListener('click', closeRewardPicker);
els.rewardModal.addEventListener('click', (event) => {
  if (event.target === els.rewardModal) {
    closeRewardPicker();
  }
});
els.rewardTakePhoto.addEventListener('click', () => els.photoInput.click());
els.rewardChoosePhotos.addEventListener('click', () => els.libraryInput.click());
let celebrationDismissLock = false;

function handleCelebrationDismiss(event) {
  if (!state.showCelebration || celebrationDismissLock) {
    return;
  }

  event.preventDefault();
  celebrationDismissLock = true;
  dismissCelebration();
  celebrationDismissLock = false;
}

els.celebration.addEventListener('touchend', handleCelebrationDismiss, { passive: false });
els.celebration.addEventListener('click', handleCelebrationDismiss);

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
