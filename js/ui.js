import {
  CARS, CATEGORIES, FINISHES, PAINTS, RANK_LABELS, RIM_COLORS, RIM_STYLES,
  SPOILERS, STRIPES, STRIPE_COLORS, TINTS, UNDERGLOWS, STAT_LABELS,
  defaultLook, formatCredits, getCar, normalizeLook,
} from './data/cars.js';
import { CIRCUITS, getCircuit } from './data/circuits.js';
import { CAREER_SERIES, CAREER_EVENTS, eventsForSeries } from './data/career.js';
import {
  DIFFICULTIES, MODES, basePurse, getDifficulty, getMode, nextRankProgress,
} from './economy.js';
import { fmtTime } from './hud.js';
import { seriesStandings } from './championship.js';
import { dailyChallenge, DAILY_TIERS } from './daily.js';
import { TIMES, WEATHERS } from './conditions.js';
import { ACHIEVEMENTS } from './achievements.js';
import { DRIVE_ACTIONS, keyLabel, resolveBindings } from './input.js';
import {
  UPGRADE_PARTS, MAX_UPGRADE_LEVEL, upgradeCost, upgradedStats,
} from './data/upgrades.js';

const $ = (id) => document.getElementById(id);

// Bump this id whenever the patch-notes modal should appear again.
const WHATS_NEW_KEY = 'sunset-drift-whats-new';
const WHATS_NEW_VERSION = '2026-11-mobile-handbrake-nitro';
const WHATS_NEW_LABEL = "WHAT'S NEW · NOV 2026";

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Circuits a mode may offer. Practice-only venues (the test runway) never show
 * up in a race, time trial or online lobby, and practice lists them first.
 */
function circuitsFor(modeId) {
  const list = CIRCUITS.filter((c) => modeId === 'practice' || !c.practiceOnly);
  if (modeId !== 'practice') return list;
  return [...list].sort((a, b) => Number(!!b.practiceOnly) - Number(!!a.practiceOnly));
}

function statRows(car) {
  return STAT_LABELS.map(([key, label]) => `
    <div class="stat">
      <span class="stat-label">${label}</span>
      <span class="stat-track"><span class="stat-fill" style="width:${car.stats[key] * 10}%"></span></span>
      <span class="stat-val">${car.stats[key]}</span>
    </div>`).join('');
}

function stageStatRows(car, stats = car.stats) {
  return STAT_LABELS.map(([key, label]) => {
    const tuned = stats[key] > car.stats[key];
    return `
    <div class="stage-stat ${tuned ? 'tuned' : ''}">
      <span>${label}</span>
      <i style="--v:${stats[key] * 10}%"></i>
      <b>${stats[key]}</b>
    </div>`;
  }).join('');
}

function group(title, hint, body) {
  return `<div class="custom-group">
    <div class="custom-title">${title}${hint ? `<span>${hint}</span>` : ''}</div>
    ${body}
  </div>`;
}

function swatches(items, key, current, kind = 'color') {
  const buttons = items.map((item) => {
    const value = item.hex || item.id;
    const isActive = String(current).toLowerCase() === String(value).toLowerCase();
    if (kind === 'underglow') {
      const style = item.hex
        ? `background:${item.hex};box-shadow:0 0 14px ${item.hex}88, inset 0 0 0 1px rgba(0,0,0,.3)`
        : 'background:rgba(255,255,255,.06)';
      return `<button class="swatch ${isActive ? 'active' : ''}" style="${style}" data-key="${key}" data-value="${value}" title="${item.label}" aria-label="${item.label}">${item.hex ? '' : '<span style="font-size:10px;color:#8b8594">✕</span>'}</button>`;
    }
    return `<button class="swatch ${isActive ? 'active' : ''}" style="background:${value}" data-key="${key}" data-value="${value}" title="${item.name || item.label}" aria-label="${item.name || item.label}"></button>`;
  }).join('');
  return `<div class="swatches">${buttons}${kind === 'color' ? `<input class="color-input" type="color" data-color="${key}" value="${current}" title="Custom colour" aria-label="Custom colour" />` : ''}</div>`;
}

function segmented(items, key, current) {
  return `<div class="segmented">${items.map((item) => `
    <button class="seg ${item.id === current ? 'active' : ''}" data-key="${key}" data-value="${item.id}">${item.label}</button>
  `).join('')}</div>`;
}

export class UI {
  constructor(callbacks) {
    this.cb = callbacks;
    this.touchCapable = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    document.body.classList.toggle('touch-ui', this.touchCapable);
    this.currentCar = CARS[0];
    this.currentLook = defaultLook(CARS[0]);
    this.store = null;
    this.auth = null;
    this.stageCarId = CARS[0].id;
    this.category = 'all';
    this.tab = 'cars';
    this.screens = {
      profile: $('screen-profile'),
      garage: $('screen-garage'),
      results: $('screen-results'),
      pause: $('screen-pause'),
      account: $('screen-account'),
    };
    this.rentalEl = $('screen-rental');
    this.pendingRental = null;
    this.hud = $('hud');
    this.touch = $('touch');
    this.customRoot = $('customControls');
    this.raceConfig = {
      mode: 'quick',
      circuitId: CIRCUITS[0].id,
      difficulty: 'normal',
      opponents: 3,
      time: 'day',
      weather: 'clear',
    };
    this.buildNotice();
    this.whatsNewShown = false;
    this.bind();
  }

  buildNotice() {
    const el = document.createElement('div');
    el.className = 'garage-notice';
    el.setAttribute('role', 'status');
    document.getElementById('app').appendChild(el);
    this.noticeEl = el;
    this.noticeTimer = null;
  }

  notice(text, kind = '', ms = kind === 'error' ? 6000 : 2800) {
    const el = this.noticeEl;
    el.textContent = text;
    el.className = `garage-notice show ${kind}`;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  /**
   * One short patch-notes card for the first launch after an update. The
   * version id lives in localStorage, separate from cloud saves, so every
   * browser sees the new notes once even when progress is synced elsewhere.
   */
  maybeShowWhatsNew() {
    if (this.whatsNewShown) return;
    let seen = '';
    try {
      seen = localStorage.getItem(WHATS_NEW_KEY) || '';
    } catch {
      // Private mode without storage: still show the notes this session.
    }
    if (seen === WHATS_NEW_VERSION) return;
    this.whatsNewShown = true;
    const versionEl = $('whatsNewVersion');
    if (versionEl) versionEl.textContent = WHATS_NEW_LABEL;
    $('screen-whatsnew')?.classList.remove('hidden');
  }

  dismissWhatsNew() {
    try {
      localStorage.setItem(WHATS_NEW_KEY, WHATS_NEW_VERSION);
    } catch {
      // Ignore unavailable storage.
    }
    $('screen-whatsnew')?.classList.add('hidden');
  }

  bind() {
    const nameInput = $('nameInput');
    nameInput.addEventListener('input', () => {
      $('nameCount').textContent = `${nameInput.value.length}/14`;
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitProfile();
    });
    $('btnProfile').addEventListener('click', () => this.submitProfile());

    $('btnDriver').addEventListener('click', () => {
      if (this.store?.profile) {
        nameInput.value = this.store.profile.name;
        $('nameCount').textContent = `${this.store.profile.name.length}/14`;
      }
      this.cb.onEditDriver?.();
    });

    $('btnAccount').addEventListener('click', () => this.cb.onOpenAccount?.());
    $('btnCloseAccount').addEventListener('click', () => this.closeAccount());
    document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
      tab.addEventListener('click', () => this.setAuthTab(tab.dataset.authTab));
    });
    $('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitAuth('login');
    });
    $('registerForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitAuth('register');
    });

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => this.setTab(tab.dataset.tab));
    });

    $('carFilters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-category]');
      if (!chip) return;
      this.category = chip.dataset.category;
      this.renderFilters();
      this.renderCarList();
    });

    $('carList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-car]');
      if (!card || !this.store) return;
      const id = card.dataset.car;
      if (this.store.owns(id)) this.cb.onSelectCar?.(id);
      else this.cb.onPreviewCar?.(id);
    });
    $('carList').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('[data-car]');
      if (!card) return;
      e.preventDefault();
      card.click();
    });

    $('btnStageAction').addEventListener('click', () => {
      const action = $('btnStageAction').dataset.action;
      if (action === 'buy') this.cb.onBuyCar?.(this.stageCarId);
      else if (action === 'equip') this.cb.onSelectCar?.(this.stageCarId);
    });
    // From any other tab this opens race setup; on the RACE tab it starts the
    // race (it used to only re-open the tab, so pressing it did nothing).
    $('btnRace').addEventListener('click', () => {
      if (this.tab === 'race') this.requestRace({ ...this.raceConfig });
      else this.setTab('race');
    });

    $('modeList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-mode]');
      if (!card) return;
      // Career races are events with fixed rules: send the player to the ladder.
      if (card.dataset.mode === 'career') {
        this.setTab('career');
        return;
      }
      this.raceConfig.mode = card.dataset.mode;
      // Leaving practice: a rented circuit may be locked in the new mode (and
      // the practice runway is not a race venue), so fall back to a circuit
      // the player actually owns.
      const allowed = circuitsFor(this.raceConfig.mode);
      if (!allowed.some((c) => c.id === this.raceConfig.circuitId)
        || !this.store?.circuitUnlocked(this.raceConfig.circuitId)) {
        const first = allowed.find((c) => this.store?.circuitUnlocked(c.id)) || allowed[0];
        this.raceConfig.circuitId = first.id;
      }
      this.renderRaceSetup();
    });
    $('circuitList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-circuit]');
      if (!card || card.classList.contains('locked')) return;
      this.raceConfig.circuitId = card.dataset.circuit;
      this.renderRaceSetup();
    });
    $('timeList').addEventListener('click', (e) => {
      const button = e.target.closest('[data-time]');
      if (!button) return;
      this.raceConfig.time = button.dataset.time;
      this.renderRaceSetup();
    });
    $('weatherList').addEventListener('click', (e) => {
      const button = e.target.closest('[data-weather]');
      if (!button) return;
      this.raceConfig.weather = button.dataset.weather;
      this.renderRaceSetup();
    });
    $('difficultyList').addEventListener('click', (e) => {
      const button = e.target.closest('[data-difficulty]');
      if (!button) return;
      this.raceConfig.difficulty = button.dataset.difficulty;
      this.renderRaceSetup();
    });
    $('opponentRange').addEventListener('input', (e) => {
      this.raceConfig.opponents = Number(e.target.value);
      $('opponentCount').textContent = String(this.raceConfig.opponents);
      this.renderSummary();
    });
    $('btnStartRace').addEventListener('click', () => this.requestRace({ ...this.raceConfig }));

    $('careerList').addEventListener('click', (e) => {
      if (e.target.closest('[data-daily]')) {
        this.cb.onRace?.({ mode: 'time-trial', daily: true });
        return;
      }
      const button = e.target.closest('[data-event]');
      if (!button || button.disabled) return;
      const event = CAREER_EVENTS.find((item) => item.id === button.dataset.event);
      if (!event) return;
      this.cb.onRace?.({
        mode: 'career',
        circuitId: event.circuitId,
        difficulty: event.difficulty,
        opponents: event.opponents,
        laps: event.laps,
        eventId: event.id,
      });
    });

    $('btnRandomize').addEventListener('click', () => {
      if (!this.store?.owns(this.stageCarId)) return;
      const look = {
        ...this.currentLook,
        paint: PAINTS[Math.floor(Math.random() * PAINTS.length)].hex,
        finish: FINISHES[Math.floor(Math.random() * FINISHES.length)].id,
        rim: RIM_COLORS[Math.floor(Math.random() * RIM_COLORS.length)].hex,
        rimStyle: RIM_STYLES[Math.floor(Math.random() * RIM_STYLES.length)].id,
        spoiler: SPOILERS[Math.floor(Math.random() * SPOILERS.length)].id,
        stripe: STRIPES[Math.floor(Math.random() * STRIPES.length)].id,
        stripeColor: STRIPE_COLORS[Math.floor(Math.random() * STRIPE_COLORS.length)].hex,
        tint: TINTS[Math.floor(Math.random() * TINTS.length)].id,
        underglow: UNDERGLOWS[Math.floor(Math.random() * UNDERGLOWS.length)].id,
      };
      this.cb.onLookChange?.(look);
    });
    $('btnResetLook').addEventListener('click', () => {
      if (!this.store?.owns(this.stageCarId)) return;
      const look = { ...defaultLook(this.currentCar), plate: this.currentLook.plate };
      this.cb.onLookChange?.(look);
    });

    $('btnSoundGarage').addEventListener('click', () => this.cb.onSound?.());
    $('btnSoundHud').addEventListener('click', () => this.cb.onSound?.());
    $('btnPauseHud').addEventListener('click', () => this.cb.onPause?.());
    $('btnCam').addEventListener('click', () => this.cb.onCamera?.());
    $('btnResume').addEventListener('click', () => this.cb.onResume?.());
    $('btnRestart').addEventListener('click', () => this.cb.onRestart?.());
    $('btnQuit').addEventListener('click', () => this.cb.onQuit?.());
    $('btnEndSession').addEventListener('click', () => this.cb.onEndSession?.());
    $('btnPhoto').addEventListener('click', () => this.cb.onPhoto?.());
    $('btnPhotoSave').addEventListener('click', () => this.cb.onPhotoSave?.());
    $('btnPhotoExit').addEventListener('click', () => this.cb.onPhotoExit?.());
    $('pauseSettings').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-setting]');
      if (!btn) return;
      this.cb.onSetting?.(btn.dataset.setting, btn.dataset.value);
    });
    $('btnAgain').addEventListener('click', () => this.cb.onAgain?.());
    $('btnConfirmRental').addEventListener('click', () => {
      const config = this.pendingRental;
      this.closeRental();
      if (config) this.cb.onRace?.(config);
    });
    $('btnCancelRental').addEventListener('click', () => this.closeRental());
    this.rentalEl.addEventListener('click', (e) => {
      if (e.target === this.rentalEl) this.closeRental();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.rentalEl.classList.contains('hidden')) this.closeRental();
    });

    $('onlinePanel').addEventListener('click', (e) => {
      const button = e.target.closest('[data-online]');
      if (!button || button.disabled) return;
      const action = button.dataset.online;
      if (action === 'signin') {
        this.cb.onOpenAccount?.();
      } else if (action === 'join') {
        const code = $('onlineCode')?.value.trim().toUpperCase() || '';
        if (!/^[A-Z0-9]{5}$/.test(code)) {
          this.notice('Room codes are 5 letters or numbers.', 'error');
          return;
        }
        this.cb.onOnline?.('join', { code });
      } else if (action === 'create') {
        const onlineCircuits = circuitsFor('online');
        const first = onlineCircuits.find((c) => this.store?.circuitUnlocked(c.id)) || onlineCircuits[0];
        this.cb.onOnline?.('create', { circuitId: first.id });
      } else if (action === 'ready') {
        this.cb.onOnline?.('ready', { ready: button.dataset.value === '1' });
      } else if (action === 'laps') {
        this.cb.onOnline?.('config', { laps: Number(button.dataset.value) });
      } else if (action === 'circuit') {
        this.cb.onOnline?.('config', { circuitId: button.dataset.value });
      } else if (action === 'visibility') {
        this.cb.onOnline?.('config', { public: button.dataset.value === '1' });
      } else if (action === 'copy') {
        navigator.clipboard?.writeText(button.dataset.value).then(
          () => this.notice('Room code copied', 'ok'),
          () => {},
        );
      } else {
        this.cb.onOnline?.(action);
      }
    });
    $('onlinePanel').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'onlineCode') {
        e.preventDefault();
        $('onlinePanel').querySelector('[data-online="join"]')?.click();
      }
    });
    $('btnToGarage').addEventListener('click', () => this.cb.onQuit?.());
    $('btnCloseWhatsNew').addEventListener('click', () => this.dismissWhatsNew());
    $('btnDismissWhatsNew').addEventListener('click', () => this.dismissWhatsNew());
  }

  submitProfile() {
    const input = $('nameInput');
    const name = input.value.trim().replace(/[<>]/g, '').slice(0, 14) || 'DRIVER';
    input.value = name;
    $('nameCount').textContent = `${name.length}/14`;
    this.cb.onProfile?.(name);
  }

  show(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      el.classList.toggle('hidden', key !== name);
    }
    if (name !== 'account') this.screens.account?.classList.add('hidden');
  }

  /**
   * Start a race, asking first when Practice would rent a locked circuit.
   * The fee itself is charged by the game when the session actually starts.
   */
  requestRace(config) {
    if (!this.store) return;
    const circuit = getCircuit(config.circuitId);
    if (!circuit) return;
    const fee = config.mode === 'practice' ? this.store.practiceFee(circuit.id) : 0;
    if (!fee) {
      this.cb.onRace?.(config);
      return;
    }
    const gap = Math.max(1, (circuit.unlockRank || 0) - this.store.rank);
    const enough = this.store.wallet >= fee;
    $('rentalCircuit').textContent = circuit.name;
    $('rentalFee').textContent = `${formatCredits(fee)} CR`;
    $('btnRentalFee').textContent = `${formatCredits(fee)} CR`;
    const confirm = $('btnConfirmRental');
    confirm.disabled = !enough;
    const note = $('rentalNote');
    note.className = `rental-note${enough ? '' : ' warn'}`;
    note.textContent = enough
      ? `One session · ${gap} rank${gap === 1 ? '' : 's'} ahead · wallet ${formatCredits(this.store.wallet)} CR`
      : `Needs ${formatCredits(fee - this.store.wallet)} more CR. Quit and earn some first.`;
    this.pendingRental = config;
    this.rentalEl.classList.remove('hidden');
    setTimeout(() => confirm.focus(), 40);
  }

  closeRental() {
    this.pendingRental = null;
    this.rentalEl?.classList.add('hidden');
  }

  setTab(name) {
    this.tab = name;
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `tab-${name}`);
    });
    $('btnRace').innerHTML = name === 'race' ? 'START <span>→</span>' : 'RACE <span>→</span>';
    if (name === 'race') this.renderRaceSetup();
    if (name === 'career') this.renderCareer();
    if (name === 'cars') this.renderCarList();
    if (name === 'profile') this.renderProfile();
    if (name === 'online') this.cb.onOnline?.('connect');
  }

  setHudVisible(visible) {
    this.hud.classList.toggle('hidden', !visible);
  }

  setTouchVisible(visible) {
    this.touch.classList.toggle('hidden', !(visible && this.touchCapable));
  }

  setRaceMode(on) {
    document.body.classList.toggle('racing', on);
    this.setHudVisible(on);
    this.setTouchVisible(on);
    if (on) this.closeRental();
    if (!on) {
      this.setHudVisible(false);
      this.setTouchVisible(false);
    }
  }

  showProfile(profile) {
    if (profile) {
      $('nameInput').value = profile.name;
      $('nameCount').textContent = `${profile.name.length}/14`;
    } else {
      $('nameInput').value = '';
      $('nameCount').textContent = '0/14';
    }
    this.show('profile');
    setTimeout(() => $('nameInput').focus(), 80);
  }

  /* ───────────────────────── garage ───────────────────────── */

  renderGarage(store, auth) {
    this.store = store;
    this.auth = auth || this.auth;
    this.closeRental();
    this.setHudVisible(false);
    this.setTouchVisible(false);

    const name = store.profile?.name || 'DRIVER';
    $('driverName').textContent = name;
    $('garageCredits').textContent = `${formatCredits(store.wallet)} CR`;
    $('garageRank').textContent = (RANK_LABELS[store.rank] || 'ROOKIE').toUpperCase();
    this.setAuthState(this.auth, store);

    this.stageCarId = store.selectedCarId;
    this.renderFilters();
    this.renderCarList();
    this.renderStage(this.stageCarId);
    this.renderRaceSetup();
    this.renderCareer();
    this.renderProfile();
    this.show('garage');
    this.maybeShowWhatsNew();
  }

  renderFilters() {
    $('carFilters').innerHTML = CATEGORIES.map((cat) => `
      <button class="filter ${cat.id === this.category ? 'active' : ''}" data-category="${cat.id}">${cat.label}</button>
    `).join('');
  }

  renderCarList() {
    if (!this.store) return;
    const store = this.store;
    const list = CARS.filter((car) => this.category === 'all' || car.category === this.category);
    $('carList').innerHTML = list.map((car) => {
      const owned = store.owns(car.id);
      const equipped = store.selectedCarId === car.id;
      const preview = this.stageCarId === car.id;
      const rankOk = store.rank >= (car.unlockRank || 0);
      const badge = equipped ? 'EQUIPPED' : owned ? 'OWNED' : rankOk ? 'AVAILABLE' : `RANK ${String(RANK_LABELS[car.unlockRank]).toUpperCase()}`;
      const traits = [
        ...car.pros.map((p) => `<div class="trait pro">${esc(p)}</div>`),
        ...car.cons.map((c) => `<div class="trait con">${esc(c)}</div>`),
      ].join('');
      return `<article class="car-card ${equipped ? 'selected' : ''} ${owned ? '' : 'locked'} ${preview && !equipped ? 'preview' : ''}" data-car="${car.id}" role="button" tabindex="0">
        <div class="car-card-head">
          <div><h3>${esc(car.name)}</h3><span class="car-class">${esc(car.klass)}</span></div>
          <span class="car-badge ${owned ? 'owned' : 'locked'}">${badge}</span>
        </div>
        <div class="car-card-meta">
          <p class="car-tagline" style="margin:0">${esc(car.tagline)}</p>
          <span class="car-price ${store.wallet < car.price ? 'unaffordable' : ''}">${owned ? 'IN GARAGE' : `${formatCredits(car.price)} CR`}</span>
        </div>
        <div class="car-stats">${statRows(car)}</div>
        <div class="car-traits">${traits}</div>
      </article>`;
    }).join('');
  }

  renderStage(carId) {
    if (!this.store) return;
    this.stageCarId = carId || this.store.selectedCarId;
    const car = getCar(this.stageCarId);
    this.currentCar = car;
    const owned = this.store.owns(car.id);
    this.currentLook = owned ? this.store.lookFor(car.id) : normalizeLook(car, { plate: this.store.name.toUpperCase().slice(0, 9) });

    $('stageCarName').textContent = car.name;
    $('stageCarClass').textContent = car.klass;
    $('stageStats').innerHTML = owned
      ? stageStatRows(car, upgradedStats(car, this.store.upgradesFor(car.id)))
      : stageStatRows(car);

    const priceEl = $('stageCarPrice');
    if (this.store.selectedCarId === car.id) {
      priceEl.textContent = 'EQUIPPED · ' + car.klass;
      priceEl.className = 'stage-price owned';
    } else if (owned) {
      priceEl.textContent = 'OWNED · READY TO EQUIP';
      priceEl.className = 'stage-price owned';
    } else {
      priceEl.textContent = `${formatCredits(car.price)} CR · ${car.category.toUpperCase()}`;
      priceEl.className = 'stage-price';
    }

    this.renderStageAction(car, owned);
    this.buildCustom(car, this.currentLook, owned);
    this.renderCarList();
  }

  renderStageAction(car, owned) {
    const button = $('btnStageAction');
    const equipped = this.store.selectedCarId === car.id;
    const rankOk = this.store.rank >= (car.unlockRank || 0);
    const deficit = Math.max(0, car.price - this.store.wallet);
    let label = 'EQUIP';
    let action = 'equip';
    let disabled = false;

    if (equipped) {
      label = 'EQUIPPED';
      action = 'none';
      disabled = true;
    } else if (owned) {
      label = 'EQUIP';
    } else if (!rankOk) {
      label = `RANK ${(RANK_LABELS[car.unlockRank] || 'LOCKED').toUpperCase()}`;
      action = 'none';
      disabled = true;
    } else if (deficit > 0) {
      label = `NEED ${formatCredits(deficit)} CR`;
      action = 'none';
      disabled = true;
    } else {
      label = `BUY · ${formatCredits(car.price)} CR`;
      action = 'buy';
    }
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.car = car.id;
    button.disabled = disabled;
  }

  /* ───────────────────────── customization ───────────────────────── */

  buildCustom(car, look, owned = true) {
    if (!owned) {
      this.customRoot.innerHTML = `<div class="upgrade-locked">
        <span class="lock-big">◈</span>
        <div class="eyebrow">LOCKED</div>
        <h2>BUY IT<br /><em>FIRST.</em></h2>
        <p>Paint, wheels, wings and plates unlock when this car is in your garage. Take it for a spin on the stage, then make an offer.</p>
      </div>`;
      return;
    }

    const paint = group('PAINT', '', swatches(PAINTS, 'paint', look.paint));
    const finish = group('FINISH', 'material', segmented(FINISHES, 'finish', look.finish));
    const rims = group(
      'WHEELS',
      'colour + style',
      `${swatches(RIM_COLORS, 'rim', look.rim)}<div style="height:8px"></div>${segmented(RIM_STYLES, 'rimStyle', look.rimStyle)}`,
    );
    const body = group(
      'BODY',
      '',
      `${segmented(SPOILERS, 'spoiler', look.spoiler)}<div style="height:8px"></div>${segmented(STRIPES, 'stripe', look.stripe)}<div style="height:10px"></div>${swatches(STRIPE_COLORS, 'stripeColor', look.stripeColor)}`,
    );
    const glass = group('WINDOW TINT', '', segmented(TINTS, 'tint', look.tint));
    const details = group(
      'DETAILS',
      '',
      `<div class="custom-title" style="margin:2px 0 9px">UNDERGLOW</div>${swatches(UNDERGLOWS, 'underglow', look.underglow, 'underglow')}
       <div class="custom-title" style="margin:16px 0 8px">LICENSE PLATE</div>
       <input class="plate-field" id="plateInput" maxlength="9" value="${esc(look.plate)}" placeholder="SUNSET" aria-label="License plate" />
`,
    );
    const performance = `<div class="custom-group" id="perfGroup">${this.performanceBody(car)}</div>`;

    const resale = this.store.resaleValue(car.id);
    const sell = car.starter ? '' : `<div class="custom-group sell-group">
      <button class="btn ghost wide" id="btnSellCar" data-car="${car.id}">SELL THIS CAR · ${formatCredits(resale)} CR</button>
      <p class="custom-note">60% of the price back, plus half of what you spent on upgrades.</p>
    </div>`;
    this.customRoot.innerHTML = performance + paint + finish + rims + body + glass + details + sell;
    const sellBtn = $('btnSellCar');
    if (sellBtn) {
      // Two taps: the first arms the button, the second sells.
      sellBtn.addEventListener('click', () => {
        if (sellBtn.dataset.armed) {
          this.cb.onSellCar?.(car.id);
          return;
        }
        sellBtn.dataset.armed = '1';
        sellBtn.classList.add('danger');
        sellBtn.textContent = `TAP AGAIN TO SELL · ${formatCredits(resale)} CR`;
        setTimeout(() => {
          if (!sellBtn.isConnected) return;
          delete sellBtn.dataset.armed;
          sellBtn.classList.remove('danger');
          sellBtn.textContent = `SELL THIS CAR · ${formatCredits(resale)} CR`;
        }, 3500);
      });
    }
    this.bindPerformance();

    this.customRoot.querySelectorAll('[data-key]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.key;
        const value = el.dataset.value;
        this.cb.onLookChange?.({ ...this.currentLook, [key]: value });
      });
    });
    this.customRoot.querySelectorAll('[data-color]').forEach((el) => {
      el.addEventListener('input', () => {
        const key = el.dataset.color;
        this.cb.onLookChange?.({ ...this.currentLook, [key]: el.value });
      });
    });
    const plate = $('plateInput');
    if (plate) {
      plate.addEventListener('input', () => {
        const value = plate.value.toUpperCase().replace(/[^A-Z0-9 \-_.]/g, '').slice(0, 9);
        plate.value = value;
        this.cb.onLookChange?.({ ...this.currentLook, plate: value || 'SUNSET' });
      });
    }
  }

  performanceBody(car) {
    const levels = this.store.upgradesFor(car.id);
    const rows = UPGRADE_PARTS.map((part) => {
      const level = levels[part.id];
      const maxed = level >= MAX_UPGRADE_LEVEL;
      const cost = maxed ? 0 : upgradeCost(car, level + 1);
      const short = !maxed && this.store.wallet < cost;
      const pips = Array.from({ length: MAX_UPGRADE_LEVEL }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      return `<div class="upgrade-row">
        <div class="upgrade-info">
          <strong>${part.name}</strong>
          <span>${esc(part.levels[level])} · ${esc(part.blurb)}</span>
          <div class="upgrade-pips" aria-label="Level ${level} of ${MAX_UPGRADE_LEVEL}">${pips}</div>
        </div>
        <button class="upgrade-buy" data-upgrade="${part.id}" ${maxed || short ? 'disabled' : ''}
          title="${maxed ? 'Fully upgraded' : esc(part.levels[level + 1])}">
          ${maxed ? 'MAX' : `${formatCredits(cost)} CR`}
        </button>
      </div>`;
    }).join('');
    return `<div class="custom-title">PERFORMANCE<span>solo races · online is stock</span></div>${rows}`;
  }

  bindPerformance() {
    this.customRoot.querySelectorAll('[data-upgrade]').forEach((el) => {
      el.addEventListener('click', () => this.cb.onBuyUpgrade?.(this.stageCarId, el.dataset.upgrade));
    });
  }

  /** Refresh only the tuning panel, stats and wallet after an upgrade. */
  refreshPerformance() {
    const car = getCar(this.stageCarId);
    const group = $('perfGroup');
    if (!car || !group) return;
    group.innerHTML = this.performanceBody(car);
    this.bindPerformance();
    $('stageStats').innerHTML = stageStatRows(car, upgradedStats(car, this.store.upgradesFor(car.id)));
    $('garageCredits').textContent = `${formatCredits(this.store.wallet)} CR`;
  }

  syncCustom(look) {
    this.currentLook = look;
    this.customRoot.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.dataset.key;
      const value = el.dataset.value;
      el.classList.toggle('active', String(look[key]).toLowerCase() === String(value).toLowerCase());
    });
    this.customRoot.querySelectorAll('[data-color]').forEach((el) => {
      const key = el.dataset.color;
      if (document.activeElement !== el) el.value = look[key];
    });
    const plate = $('plateInput');
    if (plate && document.activeElement !== plate) plate.value = look.plate;
  }

  /* ───────────────────────── race setup ───────────────────────── */

  renderRaceSetup() {
    if (!this.store) return;
    const mode = getMode(this.raceConfig.mode);
    $('modeList').innerHTML = MODES.map((item) => `
      <button class="mode-card ${item.id === mode.id ? 'active' : ''}" data-mode="${item.id}">
        <strong>${item.label}</strong>
        <span>${item.blurb}</span>
      </button>
    `).join('');

    const circuits = circuitsFor(mode.id);
    // A stale selection (e.g. the runway, then switching to Quick Race) must
    // never leave the setup pointing at a venue the mode cannot use.
    if (!circuits.some((c) => c.id === this.raceConfig.circuitId)) {
      const first = circuits.find((c) => this.store.circuitUnlocked(c.id)) || circuits[0];
      this.raceConfig.circuitId = first.id;
    }

    $('circuitList').innerHTML = circuits.map((circuit) => {
      const practice = mode.id === 'practice';
      const unlocked = this.store.circuitUnlocked(circuit.id);
      const open = unlocked || practice;
      const fee = practice ? this.store.practiceFee(circuit.id) : 0;
      const active = circuit.id === this.raceConfig.circuitId;
      const best = this.store.bestLapFor(circuit.id);
      let detail;
      if (circuit.practiceOnly) detail = `TEST TRACK · ${circuit.lengthKm} KM`;
      else if (fee) detail = `RENT ${formatCredits(fee)} CR · ${circuit.lengthKm} KM`;
      else if (unlocked) detail = best ? `BEST ${fmtTime(best)}` : `${circuit.lengthKm} KM · ${circuit.difficultyLabel}`;
      else detail = `RANK ${(RANK_LABELS[circuit.unlockRank] || 'LOCKED').toUpperCase()}`;
      const classes = ['circuit-card', active ? 'active' : '', open ? '' : 'locked', fee ? 'rental' : '']
        .filter(Boolean).join(' ');
      return `<button class="${classes}" data-circuit="${circuit.id}" ${open ? '' : 'aria-disabled="true"'}>
        <strong>${circuit.name}</strong>
        <small>${circuit.location} · ${detail}</small>
        <div class="circuit-tags">${circuit.features.map((f) => `<span>${f}</span>`).join('')}</div>
      </button>`;
    }).join('');

    $('difficultyList').innerHTML = DIFFICULTIES.map((diff) => `
      <button class="seg ${diff.id === this.raceConfig.difficulty ? 'active' : ''}" data-difficulty="${diff.id}">${diff.label}</button>
    `).join('');

    $('timeList').innerHTML = TIMES.map((t) => `
      <button class="seg ${t.id === this.raceConfig.time ? 'active' : ''}" data-time="${t.id}">${t.label}</button>`).join('');
    $('weatherList').innerHTML = WEATHERS.map((w) => `
      <button class="seg ${w.id === this.raceConfig.weather ? 'active' : ''}" data-weather="${w.id}">${w.label}</button>`).join('');

    const aiMode = mode.id === 'quick' || mode.id === 'career';
    const range = $('opponentRange');
    range.disabled = !aiMode;
    range.value = String(this.raceConfig.opponents);
    $('opponentCount').textContent = aiMode ? String(this.raceConfig.opponents) : '—';
    this.renderSummary();
  }

  renderSummary() {
    if (!this.store) return;
    const mode = getMode(this.raceConfig.mode);
    const circuit = getCircuit(this.raceConfig.circuitId);
    const diff = getDifficulty(this.raceConfig.difficulty);
    const car = this.store.selectedCar;
    const aiMode = mode.id === 'quick' || mode.id === 'career';
    const laps = mode.id === 'practice' ? 'Free drive' : `${circuit.laps} laps`;
    const opponents = aiMode ? `${this.raceConfig.opponents} AI` : 'Solo';
    const rental = mode.id === 'practice' ? this.store.practiceFee(circuit.id) : 0;
    $('setupSummary').innerHTML = `
      <div class="summary-row"><span>MODE</span><strong>${mode.label}</strong></div>
      <div class="summary-row"><span>CIRCUIT</span><strong>${circuit.name} · ${circuit.lengthKm} km</strong></div>
      ${rental ? `<div class="summary-row"><span>TRACK RENTAL</span><strong>${formatCredits(rental)} CR · per session</strong></div>` : ''}
      <div class="summary-row"><span>CAR</span><strong>${car.name}</strong></div>
      <div class="summary-row"><span>RACE</span><strong>${laps} · ${opponents} · ${aiMode ? diff.label : 'No rivals'}</strong></div>
      <div class="summary-row"><span>PAYOUT</span><strong>${mode.id === 'practice' ? 'Drift score only' : `Base ${formatCredits(basePurse({ mode: mode.id, circuit, laps: mode.id === 'time-trial' ? 3 : circuit.laps }))} CR`}</strong></div>`;
  }

  /* ───────────────────────── career ───────────────────────── */

  renderCareer() {
    if (!this.store) return;
    const store = this.store;
    const daily = dailyChallenge();
    const progress = store.dailyFor(daily);
    const dailyCar = getCar(daily.carId);
    const dailyCircuit = getCircuit(daily.circuitId);
    const dailyCard = `<section class="series-block daily-block">
      <div class="series-head"><strong>DAILY CHALLENGE</strong><span>${daily.date} · same for every driver</span></div>
      <article class="event-card daily-card">
        <div class="event-copy">
          <strong>${esc(dailyCircuit.name)} · ${esc(dailyCar.name)}</strong>
          <p>Loan car, stock tune. Set your best lap in a three-lap time trial.</p>
          <div class="daily-tiers">${daily.targets.map((t, i) => `
            <span class="tier ${t.id} ${progress.tier >= i ? 'won' : ''}">${t.label} ${fmtTime(t.time)} · ${formatCredits(t.reward)} CR</span>`).join('')}
          </div>
          <div class="event-meta">${progress.bestLap ? `<span>YOUR BEST ${fmtTime(progress.bestLap)}</span>` : '<span>NOT ATTEMPTED</span>'}
            ${progress.tier >= 0 ? `<span class="done">${DAILY_TIERS[progress.tier].label} EARNED</span>` : ''}</div>
        </div>
        <button class="btn ${progress.tier === 2 ? 'ghost' : 'primary'}" data-daily="1">${progress.bestLap ? 'RETRY' : 'START'}</button>
      </article>
    </section>`;
    $('careerList').innerHTML = dailyCard + CAREER_SERIES.map((series) => {
      const events = eventsForSeries(series.id);
      const table = seriesStandings(series.id, store.data.career.bestPositions, store.name.toUpperCase());
      const trophy = table.trophy
        ? `<span class="trophy ${table.trophy}">${table.trophy.toUpperCase()} TROPHY</span>`
        : `<span class="series-progress">${table.raced}/${table.total} RACED</span>`;
      const standings = table.raced ? `<ol class="standings">${table.rows.map((row, i) => `
          <li class="${row.player ? 'me' : ''}"><b>P${i + 1}</b><span>${esc(row.name)}</span><em>${row.points} PTS</em></li>`).join('')}
        </ol>` : '';
      return `<section class="series-block">
        <div class="series-head"><strong>${series.name}</strong><span>${series.subtitle}</span>${trophy}</div>
        ${standings}
        ${events.map((event) => {
          const state = store.careerEventState(event);
          const circuit = getCircuit(event.circuitId);
          return `<article class="event-card ${state.completed ? 'completed' : ''} ${state.locked ? 'locked' : ''}">
            <div class="event-copy">
              <strong>${event.name}</strong>
              <p>${event.subtitle}</p>
              <div class="event-meta">
                <span>${circuit.name}</span>
                <span>${event.laps} LAPS</span>
                <span>${getDifficulty(event.difficulty).label.toUpperCase()}</span>
                <span>${event.objective}</span>
                <span class="reward">${formatCredits(event.reward)} CR</span>
                ${state.completed ? '<span class="done">CLEARED</span>' : ''}
                ${state.bestPosition ? `<span>BEST P${state.bestPosition}</span>` : ''}
              </div>
            </div>
            ${state.locked
              ? `<div class="event-lock">${state.reason}</div>`
              : `<button class="btn ${state.completed ? 'ghost' : 'primary'}" data-event="${event.id}">${state.completed ? 'REPLAY' : 'START'}</button>`}
          </article>`;
        }).join('')}
      </section>`;
    }).join('');
  }

  /* ───────────────────────── account ───────────────────────── */

  setAuthState(auth, store = this.store) {
    this.auth = auth;
    if (!auth) return;
    const chip = $('btnAccount');
    const account = auth.isAccount;
    const offline = !auth.available;
    chip.dataset.mode = account ? 'account' : offline ? 'offline' : 'guest';
    $('accountMode').textContent = account ? 'CLOUD ACCOUNT' : offline ? 'LOCAL · STATIC' : 'LOCAL GUEST';
    $('accountName').textContent = account ? auth.user.username : (store?.name || 'PLAYER');
    if (!$('screen-account').classList.contains('hidden')) this.renderAccount(auth, store);
  }

  openAccount(auth, store) {
    this.auth = auth;
    this.store = store;
    this.renderAccount(auth, store);
    // Account is an overlay: keep whatever screen is behind it visible.
    $('screen-account').classList.remove('hidden');
    setTimeout(() => $('loginEmail').focus(), 50);
  }

  closeAccount() {
    $('screen-account').classList.add('hidden');
    this.setAuthStatus('', '');
  }

  renderAccount(auth, store) {
    const account = auth?.isAccount;
    const available = auth?.available;
    $('authBackendNote').textContent = available
      ? 'Cloud backend online. Your garage syncs to this account and follows you to any browser.'
      : 'No cloud backend detected on this host. The game is fully playable as a local guest — accounts need the included Node server.';
    $('authTabs').classList.toggle('hidden', account);
    $('loginForm').classList.toggle('hidden', account);
    $('registerForm').classList.toggle('hidden', account);
    $('accountSession').innerHTML = account ? `
      <div class="session-row">
        <div><strong>${esc(auth.user.username)}</strong><small>${esc(auth.user.email || '')}</small></div>
        <button class="btn ghost" id="btnLogout" type="button">SIGN OUT</button>
      </div>
      <div class="session-row"><div><strong>${formatCredits(store?.wallet || 0)} CR</strong><small>Saved to ${esc(auth.user.username)}'s cloud garage</small></div></div>
    ` : '';
    const logout = $('btnLogout');
    if (logout) logout.addEventListener('click', () => this.cb.onLogout?.());
    if (!account) this.setAuthTab('login');
  }

  setAuthTab(tab) {
    this.authTab = tab;
    document.querySelectorAll('[data-auth-tab]').forEach((el) => el.classList.toggle('active', el.dataset.authTab === tab));
    $('loginForm').classList.toggle('hidden', tab !== 'login');
    $('registerForm').classList.toggle('hidden', tab !== 'register');
    this.setAuthStatus('', '');
  }

  setAuthStatus(message, kind = '') {
    const el = $('authStatus');
    el.textContent = message || '';
    el.className = `auth-status ${kind}`;
  }

  async submitAuth(kind) {
    const button = kind === 'login' ? $('btnLogin') : $('btnRegister');
    const payload = kind === 'login'
      ? { email: $('loginEmail').value.trim(), password: $('loginPassword').value }
      : {
        username: $('registerUsername').value.trim(),
        email: $('registerEmail').value.trim(),
        password: $('registerPassword').value,
      };
    button.disabled = true;
    this.setAuthStatus('Contacting the cloud garage…');
    const result = kind === 'login'
      ? await this.cb.onLogin?.(payload)
      : await this.cb.onRegister?.(payload);
    button.disabled = false;
    if (!result?.ok) {
      this.setAuthStatus(result?.error || 'Something went wrong.', 'error');
      return;
    }
    this.setAuthStatus('Signed in. Syncing your garage…', 'ok');
    if (kind === 'login') $('loginPassword').value = '';
    else $('registerPassword').value = '';
    setTimeout(() => this.closeAccount(), 420);
  }

  /* ───────────────────────── results / chrome ───────────────────────── */

  renderResults(data) {
    const titles = {
      practice: ['SESSION COMPLETE', 'FREE<br /><em>DRIVE.</em>'],
      'time-trial': ['TIME TRIAL COMPLETE', 'AGAINST THE<br /><em>CLOCK.</em>'],
      online: ['ONLINE RACE', 'CHEQUERED<br /><em>FLAG.</em>'],
    };
    let [eyebrow, title] = titles[data.mode] || ['RACE COMPLETE', 'CHEQUERED<br /><em>FLAG.</em>'];
    if (data.event) {
      eyebrow = `${data.event.name} · ${data.event.cleared ? 'OBJECTIVE MET' : 'OBJECTIVE MISSED'}`;
      title = data.event.cleared ? 'EVENT<br /><em>CLEARED.</em>' : 'TRY<br /><em>AGAIN.</em>';
    }
    $('resultEyebrow').textContent = eyebrow;
    $('resultTitle').innerHTML = title;
    const unlocks = data.unlocks || [];
    $('resultUnlocks').classList.toggle('hidden', !unlocks.length);
    $('resultUnlocks').innerHTML = unlocks.map((u) => `<span class="unlock ${u.kind}"><small>${
      u.kind === 'car' ? 'CAR AVAILABLE' : u.kind === 'circuit' ? 'CIRCUIT UNLOCKED' : u.kind === 'achievement' ? 'ACHIEVEMENT' : u.kind === 'daily' ? 'DAILY CHALLENGE' : 'PROMOTED'
    }</small>${esc(u.name)}</span>`).join('');
    if (data.mode === 'online') {
      $('resultEyebrow').textContent = data.pending ? 'ONLINE RACE · WAITING FOR RIVALS' : 'ONLINE RACE · FINAL';
      if (!data.pending && !data.position) $('resultTitle').innerHTML = 'DID NOT<br /><em>FINISH.</em>';
    }
    $('btnAgain').innerHTML = data.mode === 'practice' ? 'DRIVE AGAIN <span>↻</span>'
      : data.mode === 'online' ? 'BACK TO LOBBY <span>↻</span>' : 'RACE AGAIN <span>↻</span>';
    $('resultDriver').textContent = data.driver;
    $('resultTotal').textContent = fmtTime(data.total);
    $('resultBest').textContent = fmtTime(data.best);
    $('resultScore').textContent = Math.round(data.score).toLocaleString('en-US');
    $('resultCar').textContent = data.car;
    $('resultWallet').textContent = `${formatCredits(data.wallet)} CR`;

    const standings = data.standings || [];
    $('resultStandings').innerHTML = standings.map((row) => `
      <div class="standing ${row.isPlayer ? 'player' : ''}">
        <span class="pos">P${row.position}</span>
        <span class="who"><i style="background:${row.color || '#ffc46b'}"></i><b>${esc(row.name)}</b></span>
        <time>${row.finished ? fmtTime(row.time) : '—'}</time>
      </div>
    `).join('');

    const lines = data.rewards?.lines || [];
    const rental = data.rental;
    $('resultRewards').innerHTML = [
      ...lines.map((line) => `<div class="reward-line ${line.value < 0 ? 'minus' : ''}"><span>${esc(line.label)}</span><b>${line.value < 0 ? '−' : '+'}${formatCredits(Math.abs(line.value))}</b></div>`),
      `<div class="reward-line total"><span>TOTAL PAYOUT</span><b>+${formatCredits(data.rewards?.total || 0)}</b></div>`,
      ...(rental ? [`<div class="reward-line minus rental"><span>TRACK RENTAL · ${esc(rental.circuit)}</span><b>−${formatCredits(rental.fee)}</b></div>`] : []),
    ].join('');

    this.show('results');
    this.setHudVisible(false);
    this.setTouchVisible(false);
  }

  setMuted(muted) {
    const icon = muted ? '✕' : '♪';
    $('btnSoundGarage').textContent = icon;
    $('btnSoundHud').textContent = icon;
    $('btnSoundGarage').title = muted ? 'Unmute' : 'Mute';
    $('btnSoundHud').title = muted ? 'Unmute' : 'Mute';
  }

  setGarageBest(seconds) {
    $('garageBest').textContent = seconds ? fmtTime(seconds) : '--:--.--';
  }

  /** First-race coaching tip on the HUD. */
  showCoach(text, step, total) {
    $('coachStep').textContent = `TIP ${step}/${total}`;
    $('coachText').textContent = text;
    $('coach').classList.remove('hidden');
  }

  hideCoach() {
    $('coach').classList.add('hidden');
  }

  setPhotoBar(visible) {
    $('photoBar').classList.toggle('hidden', !visible);
  }

  /** Graphics quality and turn-signal toggles shown in the pause menu. */
  renderSettings() {
    const settings = this.store?.data.settings || {};
    const row = (label, key, current, options) => `
      <div class="pause-setting">
        <span>${label}</span>
        <div class="segmented">${options.map(([value, text]) => `
          <button class="seg ${String(current) === value ? 'active' : ''}" data-setting="${key}" data-value="${value}">${text}</button>`).join('')}
        </div>
      </div>`;
    $('pauseSettings').innerHTML = row('GRAPHICS', 'quality', settings.quality || 'auto', [
      ['auto', 'AUTO'], ['high', 'HIGH'], ['medium', 'MED'], ['low', 'LOW'],
    ]) + row('TURN SIGNALS', 'signals', settings.signals === false ? 'off' : 'on', [['on', 'ON'], ['off', 'OFF']])
      + row('SOUND', 'volume', String(Math.round((settings.volume ?? 1) * 100)), [['0', 'OFF'], ['35', 'LOW'], ['70', 'MED'], ['100', 'MAX']])
      + row('MUSIC', 'musicVolume', String(Math.round((settings.musicVolume ?? 1) * 100)), [['0', 'OFF'], ['35', 'LOW'], ['70', 'MED'], ['100', 'MAX']]);
  }

  setPauseMode(mode) {
    const isOnline = mode === 'online';
    $('btnEndSession').classList.toggle('hidden', mode !== 'practice');
    this.renderSettings();
    $('btnRestart').classList.toggle('hidden', isOnline);
    $('btnRestart').textContent = mode === 'practice' ? 'RESTART SESSION' : 'RESTART RACE';
    $('btnQuit').textContent = isOnline ? 'FORFEIT · BACK TO GARAGE' : 'QUIT TO GARAGE';
    $('pauseCopy').textContent = isOnline
      ? 'This is a live race: your car is stopped while your rivals keep driving.'
      : "The sun isn't going anywhere.";
  }

  /* ───────────────────────── online ───────────────────────── */

  renderOnline(client, auth, store = this.store) {
    const root = $('onlinePanel');
    if (!root) return;
    if (this.tab !== 'online') return;
    const intro = `<p class="online-intro">Race other drivers in real time. Rooms hold up to six cars; everyone races the car they have equipped.</p>`;

    if (!auth?.available) {
      root.innerHTML = `${intro}<div class="online-card notice-card">
        <strong>ONLINE NEEDS THE GAME SERVER</strong>
        <span>This copy is running on a static host. Run <code>npm start</code> and open the local server to race online.</span>
      </div>`;
      return;
    }
    if (!auth.isAccount) {
      root.innerHTML = `${intro}<div class="online-card notice-card">
        <strong>SIGN IN TO RACE ONLINE</strong>
        <span>Your username is shown to other drivers, so online races need an account.</span>
        <button class="btn primary" data-online="signin">SIGN IN / REGISTER</button>
      </div>`;
      return;
    }
    if (client.status === 'connecting') {
      root.innerHTML = `${intro}<div class="online-card"><strong>CONNECTING…</strong><span>Reaching the online lobby.</span></div>`;
      return;
    }
    if (!client.connected) {
      root.innerHTML = `${intro}<div class="online-card notice-card">
        <strong>OFFLINE</strong>
        <span>${esc(client.lastError || 'Not connected to the online lobby.')}</span>
        <button class="btn primary" data-online="connect">CONNECT</button>
      </div>`;
      return;
    }

    const room = client.room;
    if (!room) {
      root.innerHTML = `${intro}
        <div class="online-actions">
          <button class="online-choice" data-online="quick">
            <strong>QUICK MATCH</strong><span>Join an open public room, or open one for others to join.</span>
          </button>
          <button class="online-choice" data-online="create">
            <strong>PRIVATE ROOM</strong><span>Get a code to share with friends.</span>
          </button>
        </div>
        <div class="online-join">
          <label class="section-head" for="onlineCode"><span>JOIN WITH A CODE</span></label>
          <div class="online-join-row">
            <input id="onlineCode" class="text-input" maxlength="5" autocomplete="off" spellcheck="false" placeholder="ABCDE" aria-label="Room code" />
            <button class="btn ghost" data-online="join">JOIN</button>
          </div>
        </div>
        <div class="online-foot">Signed in as <b>${esc(auth.displayName)}</b> · racing the <b>${esc(store?.selectedCar.name || '')}</b></div>`;
      return;
    }

    const isHost = room.hostId === client.id;
    const me = room.players.find((p) => p.id === client.id);
    const circuit = getCircuit(room.circuitId);
    const racing = room.state !== 'lobby';
    const players = room.players.map((p) => `
      <div class="online-player ${p.id === client.id ? 'me' : ''}">
        <i style="background:${esc(p.look?.paint || '#ffc46b')}"></i>
        <span class="who"><b>${esc(p.name)}</b><small>${esc(getCar(p.carId).name)}</small></span>
        <span class="tag ${p.host ? 'host' : p.ready ? 'ready' : 'waiting'}">${p.host ? 'HOST' : p.ready ? 'READY' : 'NOT READY'}</span>
      </div>`).join('');
    const empty = Array.from({ length: Math.max(0, room.size - room.players.length) }, () => `
      <div class="online-player empty"><i></i><span class="who"><small>Open slot</small></span></div>`).join('');

    const circuits = CIRCUITS.filter((c) => !c.practiceOnly).map((c) => {
      const allowed = this.store?.circuitUnlocked(c.id);
      return `<button class="seg ${c.id === room.circuitId ? 'active' : ''}" data-online="circuit" data-value="${c.id}" ${allowed ? '' : 'disabled title="Locked in your career"'}>${esc(c.name)}</button>`;
    }).join('');
    const laps = [2, 3, 4, 5].map((n) => `<button class="seg ${n === room.laps ? 'active' : ''}" data-online="laps" data-value="${n}">${n}</button>`).join('');

    const hostControls = isHost && !racing ? `
      <section class="setup-section">
        <div class="section-head"><span>CIRCUIT</span><span>Host picks</span></div>
        <div class="segmented wrap">${circuits}</div>
      </section>
      <section class="setup-section setup-row">
        <div><div class="section-head"><span>LAPS</span></div><div class="segmented">${laps}</div></div>
        <div><div class="section-head"><span>ROOM</span></div><div class="segmented">
          <button class="seg ${room.public ? '' : 'active'}" data-online="visibility" data-value="0">Private</button>
          <button class="seg ${room.public ? 'active' : ''}" data-online="visibility" data-value="1">Public</button>
        </div></div>
      </section>` : `
      <div class="setup-summary">
        <div class="summary-row"><span>CIRCUIT</span><strong>${esc(circuit.name)} · ${circuit.lengthKm} km</strong></div>
        <div class="summary-row"><span>RACE</span><strong>${room.laps} laps · ${room.public ? 'Public' : 'Private'} room</strong></div>
      </div>`;

    let primary;
    if (racing) {
      primary = `<button class="btn primary wide" disabled>RACE IN PROGRESS</button>`;
    } else if (isHost) {
      const hint = room.players.length < 2 ? 'WAITING FOR DRIVERS' : room.canStart ? 'START RACE' : 'WAITING FOR READY';
      primary = `<button class="btn primary wide" data-online="start" ${room.canStart ? '' : 'disabled'}>${hint} <span>→</span></button>`;
    } else {
      primary = me?.ready
        ? `<button class="btn ghost wide" data-online="ready" data-value="0">NOT READY</button>`
        : `<button class="btn primary wide" data-online="ready" data-value="1">READY <span>✓</span></button>`;
    }

    root.innerHTML = `
      <div class="online-room-head">
        <div><small>${room.public ? 'PUBLIC ROOM' : 'PRIVATE ROOM'} · ${room.players.length}/${room.size}</small>
          <button class="room-code" data-online="copy" data-value="${esc(room.code)}" title="Copy code">${esc(room.code)}</button></div>
        <button class="btn ghost" data-online="leave">LEAVE</button>
      </div>
      <div class="online-players">${players}${empty}</div>
      ${hostControls}
      ${primary}
      <div class="online-foot">Change your car in the CARS tab before the race starts.</div>`;
  }

  /* ───────────────────────── profile / stats ───────────────────────── */

  renderProfile() {
    if (!this.store) return;
    if (!this.profileBound) {
      this.profileBound = true;
      $('profileStats').addEventListener('click', (e) => {
        const remap = e.target.closest('[data-remap]');
        if (remap) {
          remap.textContent = 'PRESS A KEY…';
          remap.classList.add('waiting');
          this.cb.onRemap?.(remap.dataset.remap);
          return;
        }
        if (e.target.closest('[data-reset-keys]')) this.cb.onResetKeys?.();
      });
    }
    const data = this.store.data;
    const stats = data.stats;
    const rank = this.store.rank;
    const progress = nextRankProgress(stats);
    const winRate = stats.races ? Math.round((stats.wins / stats.races) * 100) : 0;
    const tiles = [
      ['RACES', stats.races],
      ['WINS', stats.wins],
      ['PODIUMS', stats.podiums],
      ['WIN RATE', `${winRate}%`],
      ['LAPS', stats.laps],
      ['EARNED', `${formatCredits(stats.creditsEarned)} CR`],
      ['SPENT', `${formatCredits(stats.creditsSpent)} CR`],
      ['CARS OWNED', `${data.ownedCars.length}/${CARS.length}`],
      ['EVENTS CLEARED', `${data.career.completed.length}/${CAREER_EVENTS.length}`],
      ['DRIFT TOTAL', formatCredits(stats.driftScore)],
      ['PRACTICE', `${stats.sessions || 0} sessions`],
      ['DISTANCE', `${(stats.distanceKm || 0).toFixed(1)} km`],
    ];
    const records = CIRCUITS.filter((c) => !c.practiceOnly).map((circuit) => {
      const rec = data.records[circuit.id];
      const unlocked = this.store.circuitUnlocked(circuit.id);
      return `<div class="record-row ${unlocked ? '' : 'locked'}">
        <span>${circuit.name}</span>
        <b>${rec?.bestLap ? fmtTime(rec.bestLap) : unlocked ? '—' : 'LOCKED'}</b>
        <small>${rec?.bestTotal ? `3 LAPS ${fmtTime(rec.bestTotal)}` : ''}</small>
      </div>`;
    }).join('');
    const history = (data.history || []).slice(0, 8).map((row) => {
      const circuit = getCircuit(row.circuitId);
      const when = new Date(row.at);
      const place = row.mode === 'practice' || row.mode === 'time-trial'
        ? getMode(row.mode).label
        : row.position
          ? `${row.mode === 'online' ? 'ONLINE · ' : ''}P${row.position}/${row.totalRacers}`
          : 'DNF';
      return `<div class="history-row">
        <span class="pos">${place}</span>
        <span>${circuit.name}<small>${when.toLocaleDateString()} · ${getDifficulty(row.difficulty).label}</small></span>
        <b>+${formatCredits(row.reward || 0)}</b>
      </div>`;
    }).join('') || '<p class="empty-note">No races yet. Your history will appear here.</p>';

    $('profileStats').innerHTML = `
      <section class="setup-section">
        <div class="section-head"><span>RANK</span><span>${RANK_LABELS[rank].toUpperCase()}</span></div>
        <div class="rank-meter"><i style="width:${Math.round(progress.progress * 100)}%"></i></div>
        <p class="rank-note">${progress.next == null
          ? 'Legend status reached. Every car and circuit is open to you.'
          : `${progress.next - progress.score} rank points to ${RANK_LABELS[rank + 1].toUpperCase()}. A win is worth 2, any finished race or time trial 1.`}</p>
      </section>
      <section class="setup-section">
        <div class="section-head"><span>CAREER STATS</span></div>
        <div class="stat-tiles">${tiles.map(([label, value]) => `<div class="stat-tile"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>
      </section>
      <section class="setup-section">
        <div class="section-head"><span>CONTROLS</span><button class="link-btn" data-reset-keys="1">RESET</button></div>
        <div class="key-list">${(() => {
          const binds = resolveBindings(data.settings.keys);
          return DRIVE_ACTIONS.map((a) => `<div class="key-row">
            <span>${a.label}</span>
            <b>${binds[a.id].map(keyLabel).join(' / ')}</b>
            <button class="btn ghost" data-remap="${a.id}">CHANGE</button>
          </div>`).join('');
        })()}</div>
        <p class="custom-note">C camera · R reset car · ESC pause · M mute. Gamepads and touch work too.</p>
      </section>
      <section class="setup-section">
        <div class="section-head"><span>ACHIEVEMENTS</span><span>${(data.achievements || []).length}/${ACHIEVEMENTS.length}</span></div>
        <div class="achievement-grid">${ACHIEVEMENTS.map((a) => {
          const got = (data.achievements || []).includes(a.id);
          return `<div class="achievement ${got ? 'got' : ''}">
            <strong>${got ? '★' : '☆'} ${a.name}</strong>
            <small>${esc(a.desc)}</small>
            <em>${formatCredits(a.reward)} CR</em>
          </div>`;
        }).join('')}</div>
      </section>
      <section class="setup-section">
        <div class="section-head"><span>PERSONAL RECORDS</span><span>BEST LAP</span></div>
        <div class="record-list">${records}</div>
      </section>
      <section class="setup-section">
        <div class="section-head"><span>RECENT RACES</span></div>
        <div class="history-list">${history}</div>
      </section>`;
  }

  setPaused(paused) {
    $('pauseTitle').textContent = paused ? 'PAUSED' : 'PAUSED';
    $('pauseCopy').textContent = paused ? "The sun isn't going anywhere." : '';
  }
}
