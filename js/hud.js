import { CITY_EXTENT, CITY_GRID, bridgeCrossings, createRiver } from './data/cityGrid.js';
import { SECTOR_COUNT } from './sectors.js';

const pad2 = (n) => String(n).padStart(2, '0');

export function fmtTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--.--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

export function fmtCredits(value) {
  return Math.round(value || 0).toLocaleString('en-US');
}

export class HUD {
  constructor() {
    this.track = null;
    this.el = {
      root: document.getElementById('hud'),
      driver: document.getElementById('hudDriver'),
      mode: document.getElementById('hudMode'),
      lapNum: document.getElementById('lapNum'),
      lapDim: document.querySelector('.lap-line .dim'),
      lapTime: document.getElementById('lapTime'),
      bestTime: document.getElementById('bestTime'),
      sectorLine: document.getElementById('sectorLine'),
      sectorNum: document.getElementById('sectorNum'),
      sectorTime: document.getElementById('sectorTime'),
      sectorSplits: document.getElementById('sectorSplits'),
      position: document.getElementById('position'),
      positionOf: document.getElementById('positionOf'),
      speed: document.getElementById('speed'),
      gear: document.getElementById('gear'),
      speedArc: document.getElementById('speedArc'),
      gaugeTrack: document.getElementById('gaugeTrack'),
      needle: document.getElementById('needle'),
      rpmFill: document.getElementById('rpmFill'),
      tach: document.getElementById('tach'),
      rpmArc: document.getElementById('rpmArc'),
      rpmTrack: document.getElementById('rpmTrack'),
      rpmRedline: document.getElementById('rpmRedline'),
      rpmTicks: document.getElementById('rpmTicks'),
      rpmNumbers: document.getElementById('rpmNumbers'),
      rpmNeedle: document.getElementById('rpmNeedle'),
      rpmValue: document.getElementById('rpmValue'),
      shiftFlash: document.getElementById('shiftFlash'),
      boostFill: document.getElementById('nitroFill'),
      boostPct: document.getElementById('nitroPct'),
      score: document.getElementById('score'),
      liveDrift: document.getElementById('liveDrift'),
      combo: document.getElementById('combo'),
      driftPts: document.getElementById('driftPts'),
      countdown: document.getElementById('countdown'),
      toast: document.getElementById('toast'),
      wrongway: document.getElementById('wrongway'),
      minimap: document.getElementById('minimap'),
      rental: document.getElementById('hudRental'),
      rentalText: document.getElementById('hudRentalText'),
    };
    this.gaugeMax = 0;
    this.last = {};
    this.roam = false;
    this.toastTimer = null;
    this.map = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.buildTicks(240);
    this.buildTach();
  }

  /** Swap circuits without rebuilding the HUD DOM. */
  setTrack(track) {
    this.track = track;
    this.lastMapCircuit = null;
    this.buildMapBase();
  }

  /** City roam drops lap/position chrome and checkpoint markers. */
  setRoam(on) {
    this.roam = !!on;
    document.body.classList.toggle('roam-ui', this.roam);
    if (this.roam) {
      this.el.lapNum.textContent = '∞';
      this.el.lapDim.textContent = 'FREE ROAM';
    }
    // The roam map is a street grid, not the closed race circuit.
    this.buildMapBase();
  }

  /** Show or hide the practice rental badge (`{ circuit, fee }` or null). */
  setRental(rental) {
    if (!this.el.rental) return;
    this.el.rental.classList.toggle('hidden', !rental);
    if (rental) this.el.rentalText.textContent = `${rental.circuit} · ${fmtCredits(rental.fee)} CR`;
  }

  /**
   * Analog dial: a 270° sweep from bottom-left (0) to bottom-right (max),
   * numbered in 20 or 40 km/h steps. Rebuilt when the car's scale changes.
   */
  buildTicks(maxKmh) {
    const g = document.getElementById('gaugeTicks');
    if (!g) return;
    // Room for nitro (~25 km/h over top speed), rounded to a tidy number.
    const step = maxKmh * 1.15 > 220 ? 40 : 20;
    const max = Math.ceil((maxKmh * 1.15) / step) * step;
    if (max === this.gaugeMax) return;
    this.gaugeMax = max;
    g.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    const ang = (v) => ((135 + (v / max) * 270) * Math.PI) / 180;
    const at = (v, r) => [100 + Math.cos(ang(v)) * r, 100 + Math.sin(ang(v)) * r];
    const arc = (r) => {
      const [x0, y0] = at(0, r);
      const [x1, y1] = at(max, r);
      return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    };
    this.el.gaugeTrack?.setAttribute('d', arc(88));
    this.el.speedArc?.setAttribute('d', arc(88));
    const minor = step / 2;
    for (let v = 0; v <= max + 0.01; v += minor) {
      const major = Math.round(v / step) * step === Math.round(v);
      const [x1, y1] = at(v, major ? 72 : 76);
      const [x2, y2] = at(v, 82);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', x1.toFixed(2));
      line.setAttribute('y1', y1.toFixed(2));
      line.setAttribute('x2', x2.toFixed(2));
      line.setAttribute('y2', y2.toFixed(2));
      if (major) line.classList.add('major');
      if (v > maxKmh) line.classList.add('boost');
      g.appendChild(line);
      if (major) {
        const [tx, ty] = at(v, 59);
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', tx.toFixed(1));
        label.setAttribute('y', (ty + 4).toFixed(1));
        label.textContent = String(Math.round(v));
        if (v > maxKmh) label.classList.add('boost');
        g.appendChild(label);
      }
    }
    this.last.speed = null;
  }

  /**
   * Compact tachometer pod bolted to the right of the speed gauge. It is drawn
   * once; setRpm() only moves the arc and the digital readout.
   */
  buildTach() {
    if (!this.el.rpmArc) return;
    const ns = 'http://www.w3.org/2000/svg';
    const start = 150;
    const sweep = 240;
    const ang = (v) => ((start + v * sweep) * Math.PI) / 180;
    const at = (v, r) => [50 + Math.cos(ang(v)) * r, 50 + Math.sin(ang(v)) * r];
    const arc = (from, to, r) => {
      const [x0, y0] = at(from, r);
      const [x1, y1] = at(to, r);
      const large = (to - from) * sweep > 180 ? 1 : 0;
      return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    };
    this.el.rpmTrack?.setAttribute('d', arc(0, 1, 42));
    this.el.rpmRedline?.setAttribute('d', arc(0.86, 1, 42));
    this.el.rpmArc?.setAttribute('d', arc(0, 1, 42));

    if (this.el.rpmTicks) {
      this.el.rpmTicks.innerHTML = '';
      for (let i = 0; i <= 16; i++) {
        const v = i / 16;
        const major = i % 2 === 0;
        const [x1, y1] = at(v, major ? 32 : 35);
        const [x2, y2] = at(v, 38);
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', x1.toFixed(2));
        line.setAttribute('y1', y1.toFixed(2));
        line.setAttribute('x2', x2.toFixed(2));
        line.setAttribute('y2', y2.toFixed(2));
        if (major) line.classList.add('major');
        if (v >= 0.86) line.classList.add('red');
        this.el.rpmTicks.appendChild(line);
      }
    }

    if (this.el.rpmNumbers) {
      this.el.rpmNumbers.innerHTML = '';
      for (let i = 0; i <= 8; i++) {
        const v = i / 8;
        const [x, y] = at(v, 27.5);
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', x.toFixed(1));
        label.setAttribute('y', (y + 2).toFixed(1));
        label.textContent = String(i);
        if (i >= 7) label.classList.add('red');
        this.el.rpmNumbers.appendChild(label);
      }
    }
    this.el.rpmNeedle?.setAttribute('transform', 'rotate(150 50 50)');
    this.setRpm(0.06);
  }


  buildMapBase() {
    if (!this.map) return;
    const size = 360;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (this.roam) {
      this.buildRoamMapBase(ctx, size);
      this.mapBase = canvas;
      return;
    }
    if (!this.track) return;
    ctx.fillStyle = 'rgba(8, 5, 14, 0.55)';
    ctx.fillRect(0, 0, size, size);
    const pts = this.track.samples;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of pts) {
      minX = Math.min(minX, s.point.x);
      maxX = Math.max(maxX, s.point.x);
      minZ = Math.min(minZ, s.point.z);
      maxZ = Math.max(maxZ, s.point.z);
    }
    const span = Math.max(1, Math.max(maxX - minX, maxZ - minZ));
    const scale = (size * 0.8) / span;
    const ox = (size - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (size - (maxZ - minZ) * scale) / 2 - minZ * scale;
    this.mapTransform = { scale, ox, oy };

    const path = new Path2D();
    for (let i = 0; i <= pts.length; i++) {
      const s = pts[i % pts.length];
      const x = s.point.x * scale + ox;
      const y = s.point.z * scale + oy;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 18;
    ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,246,236,0.16)';
    ctx.lineWidth = 12;
    ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,246,236,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke(path);

    const st = pts[0];
    ctx.save();
    ctx.translate(st.point.x * scale + ox, st.point.z * scale + oy);
    ctx.rotate(Math.atan2(st.tangent.z, st.tangent.x));
    ctx.fillStyle = '#ff7a45';
    ctx.fillRect(-1.5, -8, 3, 16);
    ctx.restore();

    this.mapBase = canvas;
  }

  /** Static roam minimap: the whole downtown street grid, not the race loop. */
  buildRoamMapBase(ctx, size) {
    const extent = CITY_EXTENT;
    const scale = (size * 0.94) / (extent * 2);
    const ox = size / 2;
    const oy = size / 2;
    this.mapTransform = { scale, ox, oy };

    ctx.fillStyle = 'rgba(9, 12, 20, 0.94)';
    ctx.fillRect(0, 0, size, size);

    const lines = CITY_GRID.vertical.map((s) => s.pos);
    for (let i = 0; i < lines.length - 1; i++) {
      const x0 = lines[i] * scale + ox + 0.7;
      const x1 = lines[i + 1] * scale + ox - 0.7;
      for (let j = 0; j < lines.length - 1; j++) {
        const y0 = lines[j] * scale + oy + 0.7;
        const y1 = lines[j + 1] * scale + oy - 0.7;
        ctx.fillStyle = (i + j) % 2 ? 'rgba(42, 47, 62, 0.55)' : 'rgba(32, 37, 50, 0.55)';
        ctx.fillRect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
      }
    }

    // The canal runs between two street lines, so no road is submerged. The
    // north-south streets over it are re-drawn as bridges below.
    const river = createRiver();
    ctx.fillStyle = 'rgba(46, 112, 148, 0.9)';
    ctx.fillRect(ox - extent * scale, river.min * scale + oy,
      extent * 2 * scale, (river.max - river.min) * scale);

    ctx.lineCap = 'butt';
    for (const s of CITY_GRID.streets) {
      const w = Math.max(1.2, s.width * scale);
      ctx.beginPath();
      if (s.axis === 0) {
        const x = s.pos * scale + ox;
        ctx.moveTo(x, oy - extent * scale);
        ctx.lineTo(x, oy + extent * scale);
      } else {
        const y = s.pos * scale + oy;
        ctx.moveTo(ox - extent * scale, y);
        ctx.lineTo(ox + extent * scale, y);
      }
      ctx.strokeStyle = 'rgba(3, 5, 11, 0.9)';
      ctx.lineWidth = w + 1.6;
      ctx.stroke();
      ctx.strokeStyle = s.boulevard ? 'rgba(150, 158, 180, 0.78)' : 'rgba(101, 110, 132, 0.68)';
      ctx.lineWidth = w;
      ctx.stroke();
      if (s.boulevard) {
        ctx.strokeStyle = 'rgba(226, 214, 184, 0.32)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Bridge decks: brighter spans where each boulevard crosses the canal.
    ctx.fillStyle = 'rgba(196, 202, 216, 0.92)';
    for (const crossing of bridgeCrossings()) {
      const width = Math.max(4.5, crossing.width * scale);
      ctx.fillRect(crossing.pos * scale + ox - width / 2,
        river.min * scale + oy - 3, width, (river.max - river.min) * scale + 6);
    }
  }

  setDriver(name, modeLabel = '') {
    if (this.el.driver) this.el.driver.textContent = name || 'DRIVER';
    if (this.el.mode) this.el.mode.textContent = modeLabel;
  }

  setLap(lap, total, freeDrive = false) {
    if (freeDrive) {
      this.el.lapNum.textContent = '∞';
      this.el.lapDim.textContent = this.roam ? 'FREE ROAM' : 'FREE DRIVE';
      return;
    }
    this.el.lapNum.textContent = String(lap);
    this.el.lapDim.textContent = `/ ${total}`;
  }

  setPosition(position, total) {
    const text = position ? `P${position}` : 'P—';
    if (text !== this.last.position) {
      this.el.position.textContent = text;
      this.last.position = text;
    }
    const of = total ? `/${total}` : '';
    if (of !== this.last.positionOf) {
      this.el.positionOf.textContent = of;
      this.last.positionOf = of;
    }
  }

  setLapTime(seconds) {
    const text = fmtTime(seconds);
    if (text !== this.last.lapTime) {
      this.el.lapTime.textContent = text;
      this.last.lapTime = text;
    }
  }

  setBest(seconds) {
    this.el.bestTime.textContent = fmtTime(seconds);
  }

  /**
   * Show the live sector, its running time and the three splits. A completed
   * split is gold when it beats the stored best; a pending cell previews that
   * sector's personal best as a dim target. Only changed text is written, so
   * this is cheap to call every frame.
   */
  setSectors(timer, time, show = !!timer) {
    const el = this.el;
    if (!el.sectorLine) return;
    const visible = !!show && !!timer;
    if (visible !== this.last.sectorVisible) {
      el.sectorLine.classList.toggle('hidden', !visible);
      this.last.sectorVisible = visible;
    }
    if (!visible) return;

    const num = `S${Math.min(timer.sector + 1, SECTOR_COUNT)}/${SECTOR_COUNT}`;
    if (num !== this.last.sectorNum) {
      el.sectorNum.textContent = num;
      this.last.sectorNum = num;
    }
    const running = fmtTime(timer.elapsed(time));
    if (running !== this.last.sectorRunning) {
      el.sectorTime.textContent = running;
      this.last.sectorRunning = running;
    }
    let html = '';
    for (let i = 0; i < SECTOR_COUNT; i++) {
      const split = timer.current[i];
      const best = split != null && timer.isBest(i);
      const shown = split != null ? split : timer.best[i];
      html += `<span class="sector-cell${best ? ' best' : split == null ? ' dim' : ''}">${fmtTime(shown)}</span>`;
    }
    if (html !== this.last.sectorSplits) {
      el.sectorSplits.innerHTML = html;
      this.last.sectorSplits = html;
    }
  }

  /** Show speeds in miles per hour instead of km/h. */
  setUnits(mph) {
    this.mph = !!mph;
    this.gaugeMax = null; // rebuild the dial ticks in the new unit
    const unit = document.getElementById('speedUnit');
    if (unit) unit.textContent = this.mph ? 'MPH' : 'KM/H';
    this.last.speed = null;
  }

  setSpeed(kmh, gear, maxKmh = 240) {
    if (this.mph) {
      kmh *= 0.621371;
      maxKmh *= 0.621371;
    }
    this.buildTicks(maxKmh);
    const rounded = Math.round(kmh);
    if (rounded !== this.last.speed) {
      this.el.speed.textContent = String(rounded);
      const fraction = Math.min(1, Math.max(0, kmh / this.gaugeMax));
      this.el.speedArc.style.strokeDashoffset = String(100 * (1 - fraction));
      this.el.needle?.setAttribute('transform', `rotate(${(135 + fraction * 270).toFixed(2)} 100 100)`);
      this.last.speed = rounded;
    }
    if (gear !== this.last.gear) {
      this.el.gear.textContent = gear;
      this.last.gear = gear;
    }
  }

  /** 0–1 normalised engine speed, drawn on the tach dial and the thin bar. */
  setRpm(ratio, limiter = false) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const v = Math.round(clamped * 100);
    if (v !== this.last.rpm) {
      if (this.el.rpmFill) this.el.rpmFill.style.width = `${v}%`;
      if (this.el.rpmArc) this.el.rpmArc.style.strokeDashoffset = String(100 * (1 - clamped));
      if (this.el.rpmValue) this.el.rpmValue.textContent = (clamped * 8).toFixed(1);
      this.el.rpmNeedle?.setAttribute('transform', `rotate(${(150 + clamped * 240).toFixed(2)} 50 50)`);
      this.last.rpm = v;
    }
    this.el.tach?.classList.toggle('redline', clamped > 0.86);
    this.el.tach?.classList.toggle('limiter', !!limiter);
  }

  /** Brief mechanical flash whenever the gearbox selects a new gear. */
  flashShift(gear) {
    const tach = this.el.tach;
    if (!tach) return;
    if (this.el.shiftFlash) this.el.shiftFlash.textContent = gear && gear !== 'N' && gear !== 'R' ? `▲ ${gear}` : 'SHIFT';
    tach.classList.remove('shift');
    this.el.gear?.classList.remove('shift');
    // Force a style flush so the animation can restart on back-to-back shifts.
    void tach.offsetWidth;
    tach.classList.add('shift');
    this.el.gear?.classList.add('shift');
    clearTimeout(this.shiftTimer);
    this.shiftTimer = setTimeout(() => {
      tach.classList.remove('shift');
      this.el.gear?.classList.remove('shift');
    }, 360);
  }

  setBoost(value) {
    const v = Math.round(Math.max(0, Math.min(100, value)));
    if (v !== this.last.boost) {
      this.el.boostFill.style.width = `${v}%`;
      this.el.boostPct.textContent = `${v}%`;
      this.last.boost = v;
    }
  }

  setScore(value) {
    const v = Math.round(value);
    if (v !== this.last.score) {
      this.el.score.textContent = v.toLocaleString('en-US');
      this.last.score = v;
    }
  }

  setDrift(active, combo = 1, points = 0) {
    if (active) {
      this.el.liveDrift.classList.remove('hidden');
      this.el.combo.textContent = `×${combo.toFixed(1)}`;
      this.el.driftPts.textContent = `+${Math.round(points).toLocaleString('en-US')}`;
    } else {
      this.el.liveDrift.classList.add('hidden');
    }
  }

  countdown(text, go = false) {
    const el = this.el.countdown;
    el.textContent = text;
    el.classList.remove('show', 'go');
    void el.offsetWidth;
    if (go) el.classList.add('go');
    el.classList.add('show');
  }

  clearCountdown() {
    this.el.countdown.classList.remove('show', 'go');
    this.el.countdown.textContent = '';
  }

  toast(text, sub = '') {
    const el = this.el.toast;
    el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2700);
  }

  setWrongWay(on) {
    if (this.last.wrongway === on) return;
    this.last.wrongway = on;
    this.el.wrongway.classList.toggle('hidden', !on);
  }

  /**
   * Draw the minimap. `racers` is a list of
   * `{ pos, isPlayer, color, position, finished }`. Rivals are numbered discs,
   * the player is a large arrow drawn last so it always sits on top.
   */
  drawMap(player, racers = [], nextGate, time, traffic = null) {
    if (!this.map || !this.track || !this.mapTransform) return;
    const ctx = this.map;
    const { scale, ox, oy } = this.mapTransform;
    ctx.clearRect(0, 0, 360, 360);
    if (this.mapBase) ctx.drawImage(this.mapBase, 0, 0);

    // Checkpoints: a pulsing cyan diamond for the next one, small dots after.
    // Free roam has no checkpoints, so only cars are drawn there.
    if (!this.roam) {
      for (const gate of this.track.gates) {
        if (gate.index === 0) continue;
        const x = gate.point.x * scale + ox;
        const y = gate.point.z * scale + oy;
        if (gate.index === nextGate) {
          const pulse = 14 + (Math.sin((time || 0) * 5) * 0.5 + 0.5) * 8;
          ctx.beginPath();
          ctx.arc(x, y, pulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(92,225,230,0.5)';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#5ce1e6';
          ctx.shadowColor = '#5ce1e6';
          ctx.shadowBlur = 14;
          ctx.fillRect(-6, -6, 12, 12);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,246,236,0.42)';
          ctx.fill();
        }
      }
    }

    // Free roam: tiny traffic dots make the street grid feel alive.
    if (this.roam && traffic) {
      ctx.fillStyle = 'rgba(126, 205, 255, 0.8)';
      for (const t of traffic) {
        ctx.fillRect(t.x * scale + ox - 1.5, t.z * scale + oy - 1.5, 3, 3);
      }
    }

    // Rivals: paint-coloured discs with their race position, outlined so they
    // read against both tarmac and scenery. Finished cars fade into the background.
    for (const racer of racers) {
      if (!racer || racer.isPlayer || !racer.pos) continue;
      const x = racer.pos.x * scale + ox;
      const y = racer.pos.z * scale + oy;
      ctx.save();
      ctx.globalAlpha = racer.finished ? 0.45 : 1;
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(4,5,12,0.9)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 11.5, 0, Math.PI * 2);
      ctx.fillStyle = racer.color || '#ff3d7f';
      ctx.fill();
      if (racer.position) {
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(String(racer.position), x, y + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(String(racer.position), x, y + 1);
      }
      ctx.restore();
    }

    if (!player) return;
    const px = player.pos.x * scale + ox;
    const py = player.pos.z * scale + oy;
    // The arrow points along local +X, so atan2(z, x) maps it to world forward
    // (canvas Y is world Z). The old atan2(x, z) made it point backwards.
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(player.forward.z, player.forward.x));
    ctx.beginPath();
    ctx.moveTo(21, 0);
    ctx.lineTo(-15, 13);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-15, -13);
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(3,4,10,0.9)';
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#ff7a45';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();
  }
}
