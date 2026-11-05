import {
  CARS, FINISHES, PAINTS, RIM_COLORS, RIM_STYLES, SPOILERS, STRIPES,
  STRIPE_COLORS, TINTS, UNDERGLOWS, STAT_LABELS, defaultLook, normalizeLook,
} from './data/cars.js';
import { fmtTime } from './hud.js';

const $ = (id) => document.getElementById(id);

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function statRows(car) {
  return STAT_LABELS.map(([key, label]) => `
    <div class="stat">
      <span class="stat-label">${label}</span>
      <span class="stat-track"><span class="stat-fill" style="width:${car.stats[key] * 10}%"></span></span>
      <span class="stat-val">${car.stats[key]}</span>
    </div>`).join('');
}

function stageStatRows(car) {
  return STAT_LABELS.map(([key, label]) => `
    <div class="stage-stat">
      <span>${label}</span>
      <i style="--v:${car.stats[key] * 10}%"></i>
      <b>${car.stats[key]}</b>
    </div>`).join('');
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
  constructor(track, callbacks) {
    this.track = track;
    this.cb = callbacks;
    this.touchCapable = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.currentCar = CARS[0];
    this.currentLook = defaultLook(CARS[0]);
    this.profile = null;
    this.screens = {
      profile: $('screen-profile'),
      garage: $('screen-garage'),
      results: $('screen-results'),
      pause: $('screen-pause'),
    };
    this.hud = $('hud');
    this.touch = $('touch');
    this.customRoot = $('customControls');

    this.bind();
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
      if (this.profile) {
        nameInput.value = this.profile.name;
        $('nameCount').textContent = `${this.profile.name.length}/14`;
      }
      this.cb.onEditDriver?.();
    });

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.tab-pane').forEach((pane) => {
          pane.classList.toggle('active', pane.id === `tab-${tab.dataset.tab}`);
        });
      });
    });

    $('carList').addEventListener('click', (e) => {
      const card = e.target.closest('[data-car]');
      if (card) this.cb.onSelectCar?.(card.dataset.car);
    });

    $('btnRace').addEventListener('click', () => this.cb.onRace?.());
    $('btnRandomize').addEventListener('click', () => {
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
    $('btnAgain').addEventListener('click', () => this.cb.onAgain?.());
    $('btnToGarage').addEventListener('click', () => this.cb.onQuit?.());
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
    if (!on) {
      this.setHudVisible(false);
      this.setTouchVisible(false);
    }
  }

  showProfile(profile) {
    this.profile = profile;
    if (profile) {
      $('nameInput').value = profile.name;
      $('nameCount').textContent = `${profile.name.length}/14`;
    } else {
      $('nameInput').value = '';
      $('nameCount').textContent = '0/14';
    }
    this.show('profile');
    setTimeout(() => $('nameInput').focus(), 60);
  }

  renderGarage(profile, bestLap = null) {
    this.profile = profile;
    this.setHudVisible(false);
    this.setTouchVisible(false);
    const car = CARS.find((c) => c.id === profile.carId) || CARS[0];
    this.currentCar = car;
    this.currentLook = normalizeLook(car, profile.looks?.[car.id] || {});
    $('driverName').textContent = profile.name;
    $('garageBest').textContent = bestLap ? fmtTime(bestLap) : '--:--.--';
    $('stageCarName').textContent = car.name;
    $('stageCarClass').textContent = car.klass;
    $('stageStats').innerHTML = stageStatRows(car);
    this.renderCarList(profile.carId);
    this.buildCustom(car, this.currentLook);
    this.show('garage');
  }

  renderCarList(selectedId) {
    $('carList').innerHTML = CARS.map((car) => {
      const selected = car.id === selectedId;
      const traits = [
        ...car.pros.map((p) => `<div class="trait pro">${esc(p)}</div>`),
        ...car.cons.map((c) => `<div class="trait con">${esc(c)}</div>`),
      ].join('');
      return `<article class="car-card ${selected ? 'selected' : ''}" data-car="${car.id}" role="button" tabindex="0">
        <div class="car-card-head">
          <div><h3>${esc(car.name)}</h3><span class="car-class">${car.klass}</span></div>
          <span class="car-badge">${selected ? 'EQUIPPED' : 'SELECT'}</span>
        </div>
        <p class="car-tagline">${esc(car.tagline)}</p>
        <div class="car-stats">${statRows(car)}</div>
        <div class="car-traits">${traits}</div>
      </article>`;
    }).join('');
  }

  buildCustom(car, look) {
    const paint = group(
      'PAINT',
      '',
      swatches(PAINTS, 'paint', look.paint),
    );
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
       <div class="custom-title" style="margin:16px 0 4px">NOTE</div>
       <p class="custom-note">Cosmetics only — your car's stats come from its chassis. Upgrades arrive in a future update.</p>`,
    );

    this.customRoot.innerHTML = paint + finish + rims + body + glass + details;

    this.customRoot.querySelectorAll('[data-key]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.key;
        const value = el.dataset.value;
        const next = { ...this.currentLook, [key]: value };
        this.cb.onLookChange?.(next);
      });
    });
    this.customRoot.querySelectorAll('[data-color]').forEach((el) => {
      el.addEventListener('input', () => {
        const key = el.dataset.color;
        const next = { ...this.currentLook, [key]: el.value };
        this.cb.onLookChange?.(next);
      });
    });
    const plate = $('plateInput');
    if (plate) {
      plate.addEventListener('input', () => {
        const value = plate.value.toUpperCase().replace(/[^A-Z0-9 \-_.]/g, '').slice(0, 9);
        plate.value = value;
        const next = { ...this.currentLook, plate: value || 'SUNSET' };
        this.cb.onLookChange?.(next);
      });
    }
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

  setStageCar(car, look) {
    this.currentCar = car;
    this.currentLook = look;
    $('stageCarName').textContent = car.name;
    $('stageCarClass').textContent = car.klass;
    $('stageStats').innerHTML = stageStatRows(car);
    this.buildCustom(car, look);
    this.renderCarList(car.id);
  }

  renderResults(data) {
    $('resultDriver').textContent = data.driver;
    $('resultTotal').textContent = fmtTime(data.total);
    $('resultBest').textContent = fmtTime(data.best);
    $('resultScore').textContent = Math.round(data.score).toLocaleString('en-US');
    $('resultCar').textContent = data.car;
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
}
