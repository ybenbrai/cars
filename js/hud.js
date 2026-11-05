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
      rpmFill: document.getElementById('rpmFill'),
      damageFill: document.getElementById('damageFill'),
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
    };
    this.arcLength = 2 * Math.PI * 78;
    if (this.el.speedArc) {
      this.el.speedArc.style.strokeDasharray = String(this.arcLength);
      this.el.speedArc.style.strokeDashoffset = String(this.arcLength);
    }
    this.last = {};
    this.toastTimer = null;
    this.map = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.buildTicks();
  }

  /** Swap circuits without rebuilding the HUD DOM. */
  setTrack(track) {
    this.track = track;
    this.lastMapCircuit = null;
    this.buildMapBase();
  }

  buildTicks() {
    const g = document.getElementById('gaugeTicks');
    if (!g) return;
    g.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const major = i % 3 === 0;
      const r1 = major ? 85 : 87;
      const r2 = 90;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(90 + Math.cos(a) * r1));
      line.setAttribute('y1', String(90 + Math.sin(a) * r1));
      line.setAttribute('x2', String(90 + Math.cos(a) * r2));
      line.setAttribute('y2', String(90 + Math.sin(a) * r2));
      if (major) line.classList.add('major');
      g.appendChild(line);
    }
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

  setSpeed(kmh, gear, maxKmh = 240) {
    const rounded = Math.round(kmh);
    if (rounded !== this.last.speed) {
      this.el.speed.textContent = String(rounded);
      const fraction = Math.min(1, rounded / Math.max(60, maxKmh));
      this.el.speedArc.style.strokeDashoffset = String(this.arcLength * (1 - fraction));
      this.last.speed = rounded;
    }
    if (gear !== this.last.gear) {
      this.el.gear.textContent = gear;
      this.last.gear = gear;
    }
  }

  /** 0–1 normalised engine speed, drawn as a thin bar under the gear. */
  setRpm(ratio) {
    const v = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
    if (v !== this.last.rpm) {
      this.el.rpmFill.style.width = `${v}%`;
      this.last.rpm = v;
    }
  }

  setDamage(value) {
    const v = Math.round(Math.max(0, Math.min(1, value)) * 100);
    if (v !== this.last.damage) {
      this.el.damageFill.style.width = `${v}%`;
      this.el.damageFill.classList.toggle('critical', v > 65);
      this.last.damage = v;
    }
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
