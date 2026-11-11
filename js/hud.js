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
    if (!this.map || !this.track) return;
    const size = 360;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
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

  setDriver(name, modeLabel = '') {
    if (this.el.driver) this.el.driver.textContent = name || 'DRIVER';
    if (this.el.mode) this.el.mode.textContent = modeLabel;
  }

  setLap(lap, total, freeDrive = false) {
    if (freeDrive) {
      this.el.lapNum.textContent = '∞';
      this.el.lapDim.textContent = 'FREE DRIVE';
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
   * Draw the minimap. `racers` is a list of `{ pos, isPlayer, color }`; the
   * player is always drawn last so they stay on top of the field.
   */
  drawMap(player, racers = [], nextGate, time) {
    if (!this.map || !this.track || !this.mapTransform) return;
    const ctx = this.map;
    const { scale, ox, oy } = this.mapTransform;
    ctx.clearRect(0, 0, 360, 360);
    if (this.mapBase) ctx.drawImage(this.mapBase, 0, 0);

    for (const gate of this.track.gates) {
      if (gate.index === 0) continue;
      const x = gate.point.x * scale + ox;
      const y = gate.point.z * scale + oy;
      const active = gate.index === nextGate;
      ctx.beginPath();
      ctx.arc(x, y, active ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#5ce1e6' : 'rgba(255,246,236,0.32)';
      ctx.shadowColor = active ? '#5ce1e6' : 'transparent';
      ctx.shadowBlur = active ? 10 : 0;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    for (const racer of racers) {
      if (!racer || racer.isPlayer || !racer.pos) continue;
      const x = racer.pos.x * scale + ox;
      const y = racer.pos.z * scale + oy;
      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = racer.color || '#ff3d7f';
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (!player) return;
    const px = player.pos.x * scale + ox;
    const py = player.pos.z * scale + oy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(player.forward.x, player.forward.z));
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#ffc46b';
    ctx.shadowColor = '#ff7a45';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();

    if (nextGate != null) {
      const gate = this.track.gates[nextGate];
      if (gate) {
        const gx = gate.point.x * scale + ox;
        const gy = gate.point.z * scale + oy;
        const pulse = 7 + (Math.sin((time || 0) * 5) * 0.5 + 0.5) * 6;
        ctx.beginPath();
        ctx.arc(gx, gy, pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(92,225,230,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }
}
