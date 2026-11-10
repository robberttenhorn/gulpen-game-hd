// Toetsenbord, muis en touch-besturing.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.drive = { x: 0, y: 0 }; // rustig gedoseerde besturing voor fiets, skateboard en auto
    this.lookDelta = { x: 0, y: 0 };
    this.actionPressed = false;
    this.vehiclePressed = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch');

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      // ingedrukt houden telt niet als nog een keer drukken (anders start je meteen weer een gesprek)
      if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) this.actionPressed = true;
      if (e.code === 'Space' && !e.repeat) this.spacePressed = true;
      if (e.code === 'KeyF') this.vehiclePressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Vrij rondkijken met de muis (computer): tijdens het rondlopen 'vangt' het spel de muis, zodat je alleen hoeft
    // te bewegen om te kijken en te richten, zonder te klikken of te slepen. Zodra je de muis nodig hebt (gesprek,
    // minispel, kaart, instellingen) laat het spel hem los; daarna pakt het hem vanzelf weer. Met Esc maak je de
    // muis zelf vrij; een klik in het beeld vangt hem dan weer. Lukt het vangen niet, dan werkt slepen nog gewoon.
    this.canLock = !this.isTouch && typeof canvas.requestPointerLock === 'function';
    this.locked = false; this.lockWanted = false; this.userFreed = false;
    const requestLock = () => {
      this.lockTryAt = performance.now();
      try { const pr = canvas.requestPointerLock(); pr?.catch?.(() => {}); } catch { /* niet toegestaan: slepen blijft werken */ }
    };
    this.setMouseLook = (want) => {
      this.lockWanted = want;
      if (!this.canLock) return;
      if (!want && this.locked) { this.selfExit = true; document.exitPointerLock(); return; }
      // vanzelf (opnieuw) vangen kan alleen vlak na een toets of klik; anders wacht het tot de volgende toets of klik
      if (want && !this.locked && !this.userFreed && performance.now() - (this.lockTryAt || 0) > 800 && navigator.userActivation?.isActive) requestLock();
    };
    if (this.canLock) {
      document.addEventListener('pointerlockchange', () => {
        const now = document.pointerLockElement === canvas;
        if (!now && this.locked && !this.selfExit) { this.userFreed = true; this.onMouseFreed?.(); } // met Esc vrijgemaakt
        if (now && !this.locked) this.onMouseLocked?.();
        this.locked = now; this.selfExit = false;
        document.body.classList.toggle('mouse-look', now);
      });
      document.addEventListener('mousemove', (e) => {
        if (!this.locked) return;
        // rustiger dan slepen: een handbeweging over het bureau is groter dan een sleepje over het scherm
        this.lookDelta.x += (e.movementX || 0) * 0.45;
        this.lookDelta.y += (e.movementY || 0) * 0.45;
      });
      addEventListener('keydown', () => { if (this.lockWanted && !this.locked && !this.userFreed && performance.now() - (this.lockTryAt || 0) > 800) requestLock(); });
    }

    // kijken met muis (slepen) of touch (rechterhelft)
    let dragId = null, lx = 0, ly = 0, lastMove = 0;
    canvas.addEventListener('pointerdown', (e) => {
      // een klik in het beeld vangt de muis (weer), ook nadat je hem met Esc had vrijgemaakt
      if (this.canLock && this.lockWanted && !this.locked && e.pointerType === 'mouse') { this.userFreed = false; requestLock(); }
      // een oude sleep die nooit netjes is losgelaten (bijv. doordat er een venster overheen kwam) niet laten blokkeren
      if (dragId !== null && performance.now() - lastMove < 400) return;
      // op touch alleen het joystickhoekje (linksonder) overslaan, de rest van het scherm kan slepen
      if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.55) return;
      dragId = e.pointerId; lx = e.clientX; ly = e.clientY; lastMove = performance.now();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* negeren */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== dragId) return;
      this.lookDelta.x += e.clientX - lx;
      this.lookDelta.y += e.clientY - ly;
      lx = e.clientX; ly = e.clientY; lastMove = performance.now();
    });
    const end = (e) => { if (e.pointerId === dragId) dragId = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    addEventListener('blur', () => { dragId = null; });
    document.addEventListener('visibilitychange', () => { dragId = null; });
    // niet zoomen: geen scrollwiel-zoom van de camera, en de pagina zelf ook niet laten zoomen
    // (iPhone negeert user-scalable=no, dus knijpen en dubbeltikken hier tegenhouden)
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !e.target.closest?.('#bigmap')) e.preventDefault(); }, { passive: false });
    let lastTap = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 320 && !e.target.closest?.('button, #bigmap, #dialog')) e.preventDefault();
      lastTap = now;
    }, { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault());

    // virtuele joystick
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    let joyId = null;
    const setJoy = (e) => {
      const r = joy.getBoundingClientRect();
      const max = r.width / 2;
      // verborgen joystick (tijdens een gesprek of minispel) heeft breedte 0: dan niets doen,
      // anders geeft delen door nul een ongeldig getal (NaN) en wordt het hele beeld zwart
      if (!(max > 1)) { this.joy = null; return; }
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy = { x: dx / max, y: dy / max };
    };
    joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); setJoy(e); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) setJoy(e); });
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null; this.joy = null; knob.style.transform = '';
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);
    joy.addEventListener('lostpointercapture', joyEnd); // bijv. als de stuurknop verdwijnt terwijl je hem vasthoudt

    document.getElementById('btn-action').addEventListener('pointerdown', (e) => { e.preventDefault(); this.actionPressed = true; });
    document.getElementById('btn-vehicle').addEventListener('pointerdown', (e) => { e.preventDefault(); this.vehiclePressed = true; });
  }

  // Voor voertuigen: joystick met dode zone en zachte curve (kleine uitslag = klein beetje sturen),
  // toetsen lopen geleidelijk op en veren terug bij loslaten.
  updateDrive(dt, kx, ky) {
    // nooit met een ongeldig getal verder: dat blijft anders voor altijd hangen
    if (!Number.isFinite(this.drive.x)) this.drive.x = 0;
    if (!Number.isFinite(this.drive.y)) this.drive.y = 0;
    if (this.joy && !(Number.isFinite(this.joy.x) && Number.isFinite(this.joy.y))) this.joy = null;
    const shape = (v, dead, pow) => { const a = Math.abs(v); if (a < dead) return 0; return Math.sign(v) * Math.pow((a - dead) / (1 - dead), pow); };
    if (this.joy) {
      const tx = shape(this.joy.x, 0.14, 1.7), ty = shape(this.joy.y, 0.16, 1.3);
      this.drive.x += (tx - this.drive.x) * Math.min(1, dt * 10);
      this.drive.y += (ty - this.drive.y) * Math.min(1, dt * 10);
      return;
    }
    const ramp = (cur, target, up, down) => {
      if (target === 0) return Math.abs(cur) < down * dt ? 0 : cur - Math.sign(cur) * down * dt;
      if (Math.sign(cur) !== Math.sign(target) && cur !== 0) return cur + Math.sign(target) * down * dt; // snel omkeren
      return Math.max(-1, Math.min(1, cur + Math.sign(target) * up * dt));
    };
    this.drive.x = ramp(this.drive.x, kx, 2.4, 6);
    this.drive.y = ramp(this.drive.y, ky, 2.8, 5);
  }

  update(dt = 0.016) {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp') || k.has('KeyZ')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft') || k.has('KeyQ')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    this.updateDrive(dt, x, y);
    if (this.joy) { x = this.joy.x; y = this.joy.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = Number.isFinite(x) ? x : 0; this.move.y = Number.isFinite(y) ? y : 0;
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || (this.joy && Math.hypot(this.joy.x, this.joy.y) > 0.95);
  }

  consumeLook() {
    const d = { ...this.lookDelta };
    this.lookDelta.x = 0; this.lookDelta.y = 0;
    return d;
  }
  consumeAction() { const a = this.actionPressed; this.actionPressed = false; return a; }
  consumeVehicle() { const a = this.vehiclePressed; this.vehiclePressed = false; return a; }
}
