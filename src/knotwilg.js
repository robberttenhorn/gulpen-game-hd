// Missie in de achtertuin van Ringweg 38: help de man met de handzaag de twee knotwilgen te knotten.
// Minispel: per tak eerst kiezen waar je zaagt (net boven de knot, niet erin), dan in een rustig ritme zagen.
// Te snel zagen en de zaag klemt; te hoog zagen laat een lelijke stomp. Na de missie zijn de wilgen in de tuin echt geknot.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { popText, flash, shake } from './minifx.js';

const G = (text, nl) => ({ text, nl });

// handzaag: blad met tandjes en een oranje greep
export function makeSaw() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.09, 0.42), new THREE.MeshStandardMaterial({ color: 0xdfe3e7, metalness: 0.5, roughness: 0.35, emissive: 0x222222 }));
  blade.position.set(0, -0.02, 0.26);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.1), new THREE.MeshStandardMaterial({ color: 0xe8701e, roughness: 0.6 }));
  grip.position.set(0, -0.01, 0.02);
  g.add(blade, grip);
  return g;
}

export function setupKnotwilg(m, g, add) {
  const t = g.tuin38;
  if (!t) return;
  const [x, z] = t.P(4.6, 36.9);
  const npc = add('snoeier', 'Man met de handzaag', [x, z], { shirt: 0x1f4e9a, sleeves: 'long', pants: 0x6d4c33, hair: 0x7a6a5a, hairStyle: 'bald', skin: 0xf0c8a0 });
  if (npc?.model) { try { g.attachToHand(npc.model, makeSaw()); } catch { /* geen hand */ } }
  // naar de eerste knotwilg kijken
  const [wx, wz] = t.P(t.willows[0].u, t.willows[0].v);
  if (npc) { npc.heading = Math.atan2(wx - x, wz - z); npc.group.rotation.y = npc.heading; }
  if (m.done.has('knotwilg')) t.prune();
}

export function knotwilgItems(n) {
  return [{ id: 'knotwilg', npc: n.snoeier, title: 'Knotwilgen knotten', place: 'Achtertuin van Ringweg 38', desc: 'Help de man met de handzaag de twee knotwilgen achter in de tuin te knotten. Zaag net boven de knot, en rustig, anders klemt de zaag.' }];
}

export const KNOTWILG_MISSION_OF = { snoeier: 'knotwilg' };

export const knotwilgHandlers = {
  async snoeier(npc, N, ui, g) {
    if (this.done.has('knotwilg')) {
      await ui.dialog(N, [G('Kiek ins hoe sjoen ze d\'r bij stoon! Over twee jaar moeten ze weer, dan bel ik je.', 'Kijk eens hoe mooi ze erbij staan! Over twee jaar moeten ze weer, dan bel ik je.')]);
      return;
    }
    const a = await ui.dialog(N, [
      G('Hoi! Die twee knotwilgen moeten nodig geknot worden. Kiek ins, het lijken wel bezems.', 'Hoi! Die twee knotwilgen moeten nodig geknot worden. Kijk eens, het lijken wel bezems.'),
      'Alle jonge takken eraf, vlak boven de knot. Niet in de knot zagen, dan gaat de boom kapot. En rustig zagen, anders klemt de zaag.',
      'Ik heb maar één zaag en mijn arm is al lam. Help jij even?',
    ], ['Geef die zaag maar', 'Ik ben geen hovenier']);
    if (a !== 0) { await ui.dialog(N, ['Dan wordt het weer een weekendje zagen voor mij. Nou ja, het houdt me van de bank.']); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    this.setActive('knotwilg', 'Knotwilgen knotten', 'Zaag alle jonge takken van de twee knotwilgen. Kies eerst waar je zaagt (net boven de knot), zaag dan in een rustig ritme.', '0 / 12 takken');
    const r = await startKnotten(g, { perTree: 6, trees: 2, limit: 110, maxKnot: 3 });
    if (!r || this.active?.id !== 'knotwilg') return;
    if (r.ok) {
      g.tuin38?.prune();
      await ui.dialog(N, [
        r.neat >= 10 ? 'Allemaal netjes vlak boven de knot! Jij hebt dit vaker gedaan, of niet?' : 'Ze zijn eraf! Hier en daar een stompje, maar dat groeit wel weer dicht.',
        'Die takken laat ik een jaartje drogen, en dan gaan ze in de haard. Lekker warm deze winter! Bedankt, hè!',
      ]);
      this.complete('knotwilg', 'Knotwilgen geknot!');
    } else {
      await ui.dialog(N, [r.knot >= 3 ? 'Ho ho, je zaagt telkens in de knot! Zo gaan ze dood. Laat mij maar even, kom straks nog eens terug.' : 'Het wordt al donker zo. De rest doen we een andere keer!']);
      this.fail(r.knot >= 3 ? 'Te vaak in de knot gezaagd.' : 'Niet op tijd klaar.');
    }
  },
};

// ------------------------------------------------------------ het minispel (3D, in de tuin zelf)

function runMini(g, update, cleanup, debug = null) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; g.minigame = null; cleanup?.(); resolve(r); };
    g.minigame = { stop: () => finish(null), update: (dt) => update(dt, finish), debug };
  });
}
function overlay(g, title, inner, hint) {
  const ov = document.createElement('div');
  ov.className = 'mini-overlay kn-overlay';
  ov.innerHTML = `<div class="mini-head"><b>${title}</b><span class="mini-score"></span><button class="mini-stop" type="button">Stoppen</button></div>${inner}<div class="mini-hint">${hint}</div>`;
  document.getElementById('hud').prepend(ov);
  document.body.classList.add('pov');
  ov.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
  return { ov, close: () => { ov.remove(); document.body.classList.remove('pov'); }, score: (t) => { ov.querySelector('.mini-score').textContent = t; } };
}

const SAYS = {
  netjes: ['Hiel good!', 'Precies goed.', 'Zo wil ik het zien!', 'Netjes, jong.'],
  hoog: ['Iets te hoog, maar goed.', 'Dat stompje zaag ik straks wel bij.'],
  knot: ['Au! Niet in de knot!', 'Ho! Dat is de knot!'],
  klem: ['Rustig! De zaag klemt.', 'Het is geen wedstrijd, hè.', 'Langzaam, langzaam...'],
  breek: ['Krak! Daar gaat hij.', 'Hout!', 'Weer een.', 'Kijk uit, hij valt!'],
};

export function startKnotten(g, { perTree = 6, trees = 2, limit = 120, maxKnot = 3 } = {}) {
  const T = g.tuin38, w = g.world;
  const total = perTree * Math.min(trees, T.willows.length);
  const ui = overlay(g, 'Knotwilgen knotten', '<div class="kn-cue"></div><div class="kn-meter"><i></i><span></span></div><div class="kn-say"><b>Snoeier</b><span></span></div>',
    g.input.isTouch ? 'Tik als de zaag in het groene stuk staat, net boven de knot. Tik dan rustig om te zagen: te snel en de zaag klemt.' : 'E of spatie als de zaag in het groene stuk staat (net boven de knot). Dan rustig E, spatie of ← → om te zagen.');
  const $ = (q) => ui.ov.querySelector(q);
  const up = new THREE.Vector3(0, 1, 0);
  const root = new THREE.Group();
  g.scene.add(root);
  const bark = new THREE.MeshStandardMaterial({ color: 0x7b6a48, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x8fa878, roughness: 0.8, side: THREE.DoubleSide });
  const cutMat = new THREE.MeshStandardMaterial({ color: 0xead7a6, roughness: 0.9 });
  const zoneGood = new THREE.MeshBasicMaterial({ color: 0x66bb6a, transparent: true, opacity: 0.5, depthWrite: false });
  const zoneBad = new THREE.MeshBasicMaterial({ color: 0xe53935, transparent: true, opacity: 0.55, depthWrite: false });
  const rnd = (() => { let x = 11; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const ZONE = [0.07, 0.16];
  const man = g.missions?.npcs?.snoeier;
  // ---- per wilg: kijkrichting en takken die in een waaier uit de knot komen (de echte kruin gaat zolang weg)
  const wills = T.willows.slice(0, trees).map((wl, ti) => {
    const [kx, kz] = T.P(wl.u - 0.05, wl.v + 0.1);
    const knot = new THREE.Vector3(kx, w.groundAt(kx, kz) + wl.h + 0.18, kz);
    const [lx, lz] = ti === 0 && man ? [man.pos.x, man.pos.z] : T.P(5.2, 34.5);
    const back = new THREE.Vector3(lx - kx, 0, lz - kz).normalize();
    const right = new THREE.Vector3().crossVectors(up, back).normalize();
    wl.crown.visible = false; wl.stubs.visible = false;
    const branches = [];
    for (let i = 0; i < perTree; i++) {
      const th = -0.95 + (i / (perTree - 1)) * 1.9 + (rnd() - 0.5) * 0.12;
      const dir = up.clone().multiplyScalar(Math.cos(th)).addScaledVector(right, Math.sin(th)).addScaledVector(back, (rnd() - 0.5) * 0.5).normalize();
      const L = 1.7 + rnd() * 0.8, r0 = 0.032 + rnd() * 0.014;
      const grp = new THREE.Group();
      grp.position.copy(knot).addScaledVector(dir, 0.22);
      grp.quaternion.setFromUnitVectors(up, dir);
      const mat = bark.clone();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, r0, L, 7).translate(0, L / 2, 0), mat);
      stem.castShadow = true;
      // smalle wilgenblaadjes in het bovenste deel van de tak
      const leaves = [];
      for (let k = 0; k < 34; k++) {
        const f = 0.6 + rnd() * 0.4, lg = new THREE.PlaneGeometry(0.13, 0.03);
        lg.rotateY(rnd() * Math.PI); lg.rotateX((rnd() - 0.5) * 1.2); lg.rotateZ(0.6 + rnd() * 0.5);
        lg.translate((rnd() - 0.5) * 0.12, f * L, (rnd() - 0.5) * 0.12);
        leaves.push(lg);
      }
      const leafGeo = mergeGeometries(leaves);
      const leafMesh = new THREE.Mesh(leafGeo, leafMat);
      const zg = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 1.9, r0 * 1.9, (ZONE[1] - ZONE[0]) * L, 10, 1, true).translate(0, ((ZONE[0] + ZONE[1]) / 2) * L, 0), zoneGood);
      const zb = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 2.0, r0 * 2.0, 0.04 * L, 10, 1, true).translate(0, 0.02 * L, 0), zoneBad);
      zg.visible = zb.visible = false;
      grp.add(stem, leafMesh, zg, zb);
      root.add(grp);
      branches.push({ grp, stem, leafMesh, leafGeo, zg, zb, mat, dir, L, r0, cut: null, need: 8 + Math.round(rnd() * 3), wig: 0, phase: rnd() * 6 });
    }
    return { wl, knot, back, right, branches };
  });
  // ---- de zaag
  const saw = makeSaw();
  saw.scale.setScalar(2.0);
  root.add(saw);
  // ---- zaagsel
  const NP = 160, pPos = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP);
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const dust = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xe8d2a0, size: 0.03, sizeAttenuation: true }));
  dust.frustumCulled = false;
  root.add(dust);
  let pNext = 0;
  const spawnDust = (at, n) => { for (let k = 0; k < n; k++) { const i = pNext++ % NP; pPos.set([at.x, at.y, at.z], i * 3); pVel.set([(Math.random() - 0.5) * 1.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2], i * 3); pLife[i] = 0.6 + Math.random() * 0.5; } };
  // ---- vallende takken
  const pieces = [];
  let tree = 0, idx = 0, cutCount = 0, neat = 0, knot = 0, t = 0, ok = null, end = 0;
  let phase = 'mik', s = 0.35, sDir = 1, cutS = 0, prog = 0, lastStroke = -9, jam = 0, stroke = 0, strokeAnim = 0, sayT = 0, travel = 0;
  const speak = (kind) => { const l = SAYS[kind]; $('.kn-say span').textContent = l[Math.floor(Math.random() * l.length)]; $('.kn-say').classList.add('on'); sayT = 2.4; };
  const cur = () => wills[tree]?.branches[idx];
  const setCam = () => {
    const W2 = wills[tree];
    const pos = W2.knot.clone().addScaledVector(W2.back, 3.7).addScaledVector(W2.right, 0.4); pos.y = W2.knot.y + 0.55;
    g.pov = { pos, look: W2.knot.clone().add(new THREE.Vector3(0, 0.75, 0)), snap: false };
  };
  g.player.group.visible = false;
  setCam();
  const screenPct = (v) => { const p = v.clone().project(g.camera); return [(p.x * 0.5 + 0.5) * 100, (-p.y * 0.5 + 0.5) * 100]; };
  const pointOn = (b, f) => b.grp.localToWorld(new THREE.Vector3(0, f * b.L, 0));
  const act = () => {
    if (ok !== null || travel > 0) return;
    const b = cur();
    if (!b) return;
    if (phase === 'mik') {
      const [x, y] = screenPct(pointOn(b, s));
      if (s < 0.04) {
        knot++; speak('knot'); flash(ui.ov, 'bad'); g.sfx?.play('fail');
        popText(ui.ov, 'In de knot!', x, y - 6, 'bad big');
        b.wig = 1;
        return;
      }
      cutS = s; phase = 'zaag'; prog = 0; lastStroke = -9;
      b.zg.visible = b.zb.visible = false;
      const inZone = s >= ZONE[0] && s <= ZONE[1];
      if (inZone) { neat++; speak('netjes'); popText(ui.ov, 'Netjes!', x, y - 6, 'gold'); } else { speak('hoog'); popText(ui.ov, 'Wat hoog...', x, y - 6, 'small'); }
      g.sfx?.play('pop');
    } else if (phase === 'zaag') {
      if (jam > 0) return;
      const dt = t - lastStroke;
      lastStroke = t; stroke++; strokeAnim = 1; b.wig = 0.6;
      const at = pointOn(b, cutS);
      if (dt < 0.2) { jam = 1.0; speak('klem'); shake(ui.ov.querySelector('.kn-meter')); g.sfx?.play('splat'); const [x, y] = screenPct(at); popText(ui.ov, 'Klem!', x, y - 8, 'bad'); return; }
      prog = Math.min(1, prog + (dt > 0.6 ? 0.4 : 1) / b.need);
      spawnDust(at, 7);
      g.sfx?.play('cart');
      if (prog >= 1) {
        // de tak breekt af: het stuk boven de zaagsnede valt met blad en al naar beneden
        b.cut = cutS;
        const piece = new THREE.Group();
        const rTop = 0.012, rCut = b.r0 + (rTop - b.r0) * cutS;
        piece.add(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rCut, b.L * (1 - cutS), 7).translate(0, (b.L * (1 - cutS)) / 2, 0), b.mat));
        const lm = new THREE.Mesh(b.leafGeo, leafMat); lm.position.y = -cutS * b.L; piece.add(lm);
        piece.position.copy(at); piece.quaternion.copy(b.grp.quaternion);
        piece.traverse((o) => { o.castShadow = true; });
        root.add(piece);
        const out = new THREE.Vector3(b.dir.x, 0, b.dir.z); if (out.lengthSq() < 0.01) out.copy(wills[tree].right); out.normalize();
        pieces.push({ obj: piece, v: out.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, 0.6, 0)), axis: new THREE.Vector3().crossVectors(up, out).normalize().negate(), av: 2.2 + Math.random(), rest: false, bounces: 0 });
        // wat blijft staan: een stompje met een lichte zaagsnede
        b.stem.geometry.dispose();
        b.stem.geometry = new THREE.CylinderGeometry(rCut, b.r0, b.L * cutS, 7).translate(0, (b.L * cutS) / 2, 0);
        const cap = new THREE.Mesh(new THREE.CircleGeometry(rCut, 10).rotateX(-Math.PI / 2).translate(0, b.L * cutS + 0.001, 0), cutMat);
        b.grp.add(cap);
        b.leafMesh.visible = false;
        b.mat.emissive.setRGB(0, 0, 0);
        cutCount++; speak('breek'); g.sfx?.play('kick');
        { const [x, y] = screenPct(at); popText(ui.ov, 'Krak!', x, y - 6, 'good big'); }
        idx++; phase = 'mik'; s = 0.35 + Math.random() * 0.15; sDir = Math.random() < 0.5 ? 1 : -1;
        if (idx >= wills[tree].branches.length && tree + 1 < wills.length) { tree++; idx = 0; travel = 1.6; setCam(); }
      }
    }
  };
  ui.ov.addEventListener('pointerdown', (e) => { if (!e.target.closest('.mini-stop') && !e.target.closest('#btn-settings, #settings-panel')) act(); });
  const onKey = (e) => { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { e.preventDefault(); act(); } };
  addEventListener('keydown', onKey);
  const pressed = () => { const p = g.input.consumeAction() || g.input.spacePressed; g.input.spacePressed = false; return p; };
  const tmpQ = new THREE.Quaternion();

  return runMini(g, (dt, finish) => {
    g.player.lockedFor = true;
    if (ok !== null) { end -= dt; if (end <= 0) { finish({ ok, cut: cutCount, neat, knot }); return; } }
    else t += dt;
    if (pressed()) act();
    jam = Math.max(0, jam - dt); strokeAnim = Math.max(0, strokeAnim - dt * 6); travel = Math.max(0, travel - dt);
    if ((sayT -= dt) <= 0) $('.kn-say').classList.remove('on');
    const b = cur();
    // zaag op en neer langs de tak, sneller bij latere takken
    if (phase === 'mik' && ok === null && travel === 0) {
      s += sDir * (0.55 + cutCount * 0.045) * dt;
      if (s > 0.62) { s = 0.62; sDir = -1; } else if (s < 0) { s = 0; sDir = 1; }
    }
    // takken wiegen in de wind en schudden bij het zagen; de actieve tak licht op
    for (const W2 of wills) for (const br of W2.branches) {
      br.wig = Math.max(0, br.wig - dt * 2.5);
      if (br.cut != null) continue;
      const sway = Math.sin(t * 1.6 + br.phase) * 0.02 + Math.sin(t * 22) * br.wig * 0.03 + (br === b && phase === 'zaag' ? prog * prog * 0.08 : 0);
      br.grp.quaternion.setFromUnitVectors(up, br.dir);
      tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), sway); br.grp.quaternion.multiply(tmpQ);
      const act2 = br === b && ok === null && travel === 0;
      br.mat.emissive.setRGB(act2 ? 0.25 + Math.sin(t * 6) * 0.1 : 0, act2 ? 0.2 + Math.sin(t * 6) * 0.08 : 0, 0);
      br.zg.visible = br.zb.visible = act2 && phase === 'mik';
    }
    // de zaag: dwars op de tak, het blad loodrecht op de tak, heen en weer bij elke haal
    if (b && ok === null) {
      saw.visible = travel === 0;
      const f = phase === 'zaag' ? cutS : s;
      const at = pointOn(b, f);
      const dirW = new THREE.Vector3(0, 1, 0).applyQuaternion(b.grp.quaternion).normalize();
      // het blad met de platte kant naar de camera, dwars over de tak (zo zie je goed waar je zaagt)
      const view = at.clone().sub(g.camera.position).normalize();
      const long = new THREE.Vector3().crossVectors(dirW, view).normalize();
      const face = view.clone().negate();
      const tooth = new THREE.Vector3().crossVectors(long, face).normalize();
      const m = new THREE.Matrix4().makeBasis(face, tooth, long);
      saw.quaternion.setFromRotationMatrix(m);
      const off = phase === 'zaag' ? Math.sin(strokeAnim * Math.PI) * (stroke % 2 ? 1 : -1) * 0.14 : 0;
      const depth = phase === 'zaag' ? prog * b.r0 * 1.5 : 0;
      saw.position.copy(at).addScaledVector(face, 0.4).addScaledVector(tooth, -0.02 + (tooth.dot(dirW) > 0 ? -depth : depth)).addScaledVector(long, -0.52 + off);
    } else saw.visible = false;
    // vallende takken: zwaartekracht, kantelen, stuiteren en gaan liggen
    for (const p of pieces) {
      if (p.rest) continue;
      p.v.y -= 9.8 * dt;
      p.obj.position.addScaledVector(p.v, dt);
      tmpQ.setFromAxisAngle(p.axis, p.av * dt); p.obj.quaternion.premultiply(tmpQ);
      const gy = w.groundAt(p.obj.position.x, p.obj.position.z) + 0.06;
      if (p.obj.position.y < gy) {
        p.obj.position.y = gy; p.v.y *= -0.25; p.v.x *= 0.5; p.v.z *= 0.5; p.av *= 0.35; p.bounces++;
        if (p.bounces >= 2) {
          p.rest = true;
          // plat op het gras leggen
          const yAx = new THREE.Vector3(0, 1, 0).applyQuaternion(p.obj.quaternion); yAx.y = 0;
          if (yAx.lengthSq() < 0.01) yAx.set(1, 0, 0);
          p.obj.quaternion.setFromUnitVectors(up, yAx.normalize());
        }
      }
    }
    // zaagsel
    for (let i = 0; i < NP; i++) {
      if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
      pLife[i] -= dt; pVel[i * 3 + 1] -= 4 * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    }
    pGeo.attributes.position.needsUpdate = true;
    // HUD: opdracht en ritme
    const meter = $('.kn-meter');
    if (phase === 'zaag' && ok === null) {
      const since = t - lastStroke;
      meter.classList.add('on');
      meter.classList.toggle('jam', jam > 0);
      meter.querySelector('i').style.width = Math.round(prog * 100) + '%';
      meter.querySelector('span').textContent = jam > 0 ? 'Zaag klemt... even wachten' : since < 0.2 ? 'Rustig!' : since > 0.6 ? 'Doorzagen!' : 'Mooi ritme';
      $('.kn-cue').textContent = '';
    } else {
      meter.classList.remove('on');
      $('.kn-cue').textContent = ok !== null ? '' : travel > 0 ? 'Op naar de tweede knotwilg...' : 'Kies waar je zaagt: in het groene stuk, net boven de knot';
    }
    ui.score(`🌿 ${cutCount} / ${total}  ·  ${'✗'.repeat(knot)}${'·'.repeat(Math.max(0, maxKnot - knot))}  ·  ${Math.max(0, Math.ceil(limit - t))} s`);
    if (ok === null) {
      if (cutCount >= total) { ok = true; end = 1.8; popText(ui.ov, 'Geknot!', 50, 30, 'gold big'); flash(ui.ov, 'gold'); g.sfx?.play('success'); }
      else if (knot >= maxKnot || t >= limit) { ok = false; end = 1.4; popText(ui.ov, knot >= maxKnot ? 'Te vaak in de knot!' : 'Tijd is om!', 50, 30, 'bad big'); }
    }
  }, () => {
    ui.close(); removeEventListener('keydown', onKey);
    g.scene.remove(root);
    root.traverse((o) => { if (o.geometry && o.geometry !== undefined) o.geometry.dispose?.(); });
    for (const W2 of wills) { W2.wl.crown.visible = true; W2.wl.stubs.visible = false; }
    g.pov = null; g.player.group.visible = true; g.player.lockedFor = false;
  }, {
    label: 'Zaag!', act, phase: () => (travel > 0 ? 'wissel' : phase), s: () => s, prog: () => prog, cut: () => cutCount, inZone: () => s >= ZONE[0] + 0.01 && s <= ZONE[1] - 0.01, time: () => t,
  });
}
