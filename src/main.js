import { GAME_NAME, PLACE } from './config.js';
import * as THREE from 'three';
import { installLighting } from './lighting.js';
import { Q, isMobile, setQuality } from './quality.js';
import { SkyDome } from './sky.js';
import { Post } from './post.js';
import { buildGrass } from './grass.js';
import { World } from './world.js';
import { Input } from './input.js';
import { UI, Minimap, BigMap } from './ui.js';
import { makeCharacter, makeBike, makeSkateboard } from './character.js';
import { Missions, resetProgress } from './missions.js';
import { Vehicles, VOLVO_GREY } from './vehicles.js';
import { Facades } from './facades.js';
import { buildStatues } from './beelden.js';
import { buildTuin38, volvoSpot38 } from './tuin38.js';
import { Pedestrians } from './pedestrians.js';
import { Effects, makeFluitje, makeFinishBanner } from './props.js';
import { statsStart, statsPageview, statsError, statsPerf } from './stats.js';
import { SixSense } from './sixsense.js';
import { startPenalty as startPenaltyGame } from './penalty.js';

// naam van het spel en plaatsnaam in het logo (instellen in config.js)
document.title = GAME_NAME;
{ const lp = document.getElementById('logo-place'); if (lp) lp.textContent = PLACE; document.querySelector('.logo')?.setAttribute('aria-label', GAME_NAME); }
import { Sound } from './audio.js';
import { Interiors } from './interiors.js';
import { startUpdateCheck } from './update.js';
import { setupSecret } from './secret.js';

const USE_POST = !Q.laag; // nabewerking in de standen 'hoog' en 'midden'
installLighting({ lamps: !Q.laag }); // randlicht, mist met zon en lantaarnlicht in alle materialen (lighting.js)

const SPEED = { walk: 4.0, run: 6.5, bike: 12.5, skate: 9.5, keg: 2.8 };

class Game {
  constructor() {
    this.updaters = new Set(); // losse onderdelen die elk beeld iets doen (flyers, bus)
    this.canvas = document.getElementById('scene');
    // met nabewerking wordt de wereld eerst in een eigen beeld getekend (met eigen kantverzachting): dan is die van het scherm zelf niet nodig
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !USE_POST, powerPreference: 'high-performance' });
    this.quality = Q;
    // resolutie: niet meer pixels dan nodig (een groot of scherp desktopscherm is anders miljoenen pixels per beeld)
    this.maxRatio = () => Math.max(Math.min(1, devicePixelRatio), Math.min(devicePixelRatio, Q.maxRatio, Math.sqrt(Q.maxPixels / (innerWidth * innerHeight))));
    this.resScale = 1; // zakt automatisch als het spel hapert
    this.renderer.setPixelRatio(this.maxRatio());
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // tone mapping: met nabewerking gebeurt dat in de laatste stap (post.js), anders door three.js zelf
    this.renderer.toneMapping = USE_POST ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.55;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 9000);
    if (!USE_POST) this.camera.layers.enable(1); // laag 1 = naambordjes (met nabewerking apart getekend, er bovenop)
    this.clock = new THREE.Clock();

    this.input = new Input(this.canvas);
    this.ui = new UI(this.input);
    // tot 10 s na 'Stoppen': gesprekken die niet bij een nieuw gesprek of een lopende missie horen, gaan niet open
    this.ui.isStale = () => !!this.unlockUntil && performance.now() < this.unlockUntil + 5000 && !this.missions?.talking && !this.missions?.active;
    this.sfx = new Sound();
    this.ui.sfx = this.sfx;
    this.npcs = [];
    this.collectibles = [];
    // de fiets heb je altijd bij je; het skateboard haal je bij het Sophianum
    this.vehicles = { bike: true, skate: false };
    this.bikeSpeed = SPEED.bike;
    this.mode = 'walk';
    this.timeOfDay = 15; // middag: lagere, warmere zon dan rond het middaguur, met langere schaduwen
    this.wobble = 0;
    this.shake = 0;
    this.time = 0;
    this.actGen = 0; // telt op bij elke 'Stoppen'

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.applyResolution();
      if (this.bigmap?.open) { this.bigmap.resize(); this.bigmap.draw(); }
    });
  }

  async init() {
    statsPageview(); // anonieme telling: game geopend
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    this.world = new World(this.scene, (p, t) => { bar.style.width = `${Math.round(p * 90)}%`; txt.textContent = t; });
    await this.world.load(isMobile);

    txt.textContent = 'Auto\'s parkeren en gevels schilderen...';
    this.setupSky();
    await this.skyDome.load(Q.texFijn, () => { if (this.sunDir) this.updateEnvironment(); });
    this.setupPlayer();
    try { this.grass = buildGrass(this.world, this.scene, Q); } catch (e) { console.warn('gras', e); }
    this.facades = new Facades(this);
    this.facades.build();
    try { buildStatues(this.facades); } catch (e) { console.warn('beelden', e); }
    // etalages geven 's avonds licht op de stoep; daarna de kaart met alle lichtbronnen maken
    try {
      for (const f of Object.values(this.facades.frames)) if (f && Number.isFinite(f.x)) this.world.addLightSource(f.x + f.nx * 1.6, f.z + f.nz * 1.6, 2.6, 0.6);
      this.world.bakeLamps();
    } catch (e) { console.warn('lantaarnlicht', e); }
    try { buildTuin38(this); } catch (e) { console.warn('tuin Ringweg 38', e); }
    this.cars = new Vehicles(this);
    this.spawnVolvo();
    this.farm = this.findFarm();
    this.cars.spawnParked(this.farm ? [{ type: 'tractor', x: this.farm.tx, z: this.farm.tz, heading: this.farm.heading, paint: 0xb71c1c, opts: { isTractor: true } }] : []);
    this.tractor = this.cars.cars.find((c) => c.isTractor);
    this.fishing = this.findFishingSpot();
    this.cars.spawnTraffic(isMobile ? 6 : 11);
    this.peds = new Pedestrians(this, isMobile ? 9 : 16);
    this.fx = new Effects(this.scene);
    this.interiors = new Interiors(this);
    this.minimap = new Minimap(this.world);
    this.bigmap = new BigMap(this);
    this.bigmap.secret = setupSecret(this.bigmap, this);
    this.missions = new Missions(this);
    this.missions.setup();
    this.sixsense = new SixSense(this);
    this.sixsense.setup();
    this.setupPoiLabels(); // na de missies: plekken met een missie krijgen een groot bord
    if (this.missions.done.has('fiets')) this.tuneBike();
    this.updateVehicleButton();
    this.setupPost();

    bar.style.width = '100%';
    txt.textContent = 'Gulpen staat klaar.';
    this.updateCamera(0, true);
    this.applyTime();
    this.renderer.compile(this.scene, this.camera);
    this.render();

    const btn = document.getElementById('start-btn');
    btn.hidden = false;
    document.getElementById('loading').classList.add('ready'); // laadbalk weg, op die plek staat nu de knop Speel
    // beeldkwaliteit kiezen: herlaadt de game in de gekozen stand
    const qb = document.getElementById('quality-pick');
    if (qb) {
      qb.hidden = false;
      for (const b of qb.querySelectorAll('button')) {
        b.classList.toggle('on', b.dataset.q === Q.name);
        b.addEventListener('click', () => { if (b.dataset.q !== Q.name) setQuality(b.dataset.q); });
      }
    }
    await new Promise((r) => btn.addEventListener('click', r, { once: true }));
    document.getElementById('loading').hidden = true;
    document.getElementById('hud').hidden = false;
    this.sfx.start();
    this.started = true; // vanaf nu wordt er echt gespeeld (voor dingen die niet op het startscherm mogen gebeuren)
    statsStart(); // anonieme telling (staat uit tot er een GoatCounter-code in stats.js staat)
    // stopknop: eerst bevestigen, dan stoppen
    // stopknoppen (op de opdrachtkaart en in het gesprekvenster): eerst bevestigen, dan stoppen
    const stopBtns = [document.getElementById('btn-stop'), document.getElementById('dialog-stop')];
    let confirming = false, confirmTimer = null;
    const setStopLabel = () => stopBtns.forEach((b) => {
      b.classList.toggle('confirm', confirming);
      b.textContent = confirming ? (this.input.isTouch ? 'Zeker? Tik nogmaals' : 'Zeker? Nogmaals (of Esc)') : 'Stoppen';
    });
    const askStop = () => {
      if (!this.missions.busy()) return;
      if (confirming) {
        clearTimeout(confirmTimer);
        confirming = false;
        setStopLabel();
        this.missions.stop();
        return;
      }
      confirming = true;
      setStopLabel();
      confirmTimer = setTimeout(() => { confirming = false; setStopLabel(); }, 3000);
    };
    stopBtns.forEach((b) => {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); askStop(); });
    });
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && !this.bigmap.open) askStop(); });
    // Instellingen: één tandwiel dat altijd in beeld is en altijd werkt (ook in een minispel, gesprek of tussenfilmpje,
    // en ook als er iets is vastgelopen). Daarachter: geluid aan of uit, terug naar het startpunt (na een bevestiging)
    // en de beeldkwaliteit (de game laadt dan opnieuw in de gekozen stand).
    {
      const $ = (id) => document.getElementById(id);
      const gb = $('btn-settings'), sp = $('settings-panel'), hc = $('set-home-confirm'), rc = $('set-reset-confirm'), sb = $('set-sound');
      for (const el of [gb, sp]) for (const ev of ['pointerdown', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
      const close = () => { sp.hidden = true; hc.hidden = true; rc.hidden = true; };
      const click = (el, fn) => el.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      click(gb, () => { if (sp.hidden) { sp.hidden = false; hc.hidden = true; rc.hidden = true; } else close(); });
      click($('settings-close'), close);
      const syncSound = () => { sb.textContent = this.sfx.muted ? 'Uit' : 'Aan'; sb.classList.toggle('on', !this.sfx.muted); sb.setAttribute('aria-label', this.sfx.muted ? 'Geluid aanzetten' : 'Geluid uitzetten'); };
      click(sb, () => { this.sfx.setMuted(!this.sfx.muted); syncSound(); });
      syncSound();
      click($('set-home'), () => { hc.hidden = !hc.hidden; rc.hidden = true; });
      click($('set-home-yes'), () => { close(); this.goHome(); });
      click($('set-home-no'), () => { hc.hidden = true; });
      // alle missies opnieuw: eerst bevestigen, dan de voortgang wissen en de game opnieuw laden
      click($('set-reset'), () => { rc.hidden = !rc.hidden; hc.hidden = true; });
      click($('set-reset-yes'), () => { resetProgress(); location.reload(); });
      click($('set-reset-no'), () => { rc.hidden = true; });
      for (const b of sp.querySelectorAll('.sp-row button')) {
        b.classList.toggle('on', b.dataset.q === Q.name);
        click(b, () => { if (b.dataset.q !== Q.name) setQuality(b.dataset.q); else close(); });
      }
    }
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.tick());

    // introductie: scherm gedimd en een duidelijke knop, zodat je weet dat je eerst moet doorklikken
    document.body.classList.add('intro');
    await this.ui.dialog('Gulpen, zaterdag', [
      { text: 'Welkom in Gullepe!', nl: 'Welkom in Gulpen!' },
      'Het hele dorp ligt voor je open: loop, fiets, skate of pak een auto. Of trek iemand uit zijn auto, als je durft.',
      'Overal zijn missies te doen. Tik op de minikaart rechtsboven om ze allemaal te zien, en kies zelf waar je begint.',
    ]);
    document.body.classList.remove('intro');
    this.ui.toast('Aan de slag!', 1400);
  }

  // ------------------------------------------------------------ lucht, licht en nabewerking

  setupSky() {
    // fotografische lucht (sky.js): koepel in beeld, en dezelfde koepel voor reflecties en hemellicht
    this.skyDome = new SkyDome();
    this.scene.add(this.skyDome.mesh);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(Q.schaduw, Q.schaduw);
    const c = this.sun.shadow.camera, R = Q.schaduwBereik;
    c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 700;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = Q.schaduw >= 4096 ? 0.28 : 0.5;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5c5a3a, 0.7);
    this.scene.add(this.hemi);
    // mist: fogFar regelt het luchtperspectief, fogNear de hoogtemist in het dal (zie lighting.js)
    this.scene.fog = new THREE.Fog(0xc9d8e6, 0.5, 7000);
  }

  setupPost() {
    if (!USE_POST) return;
    this.post = new Post(this.renderer, this.scene, this.camera, Q);
  }

  // pixelverhouding (en grootte) opnieuw instellen voor scherm en nabewerking
  applyResolution() {
    const r = Math.max(0.5, this.maxRatio() * this.resScale);
    this.renderer.setPixelRatio(r);
    this.renderer.setSize(innerWidth, innerHeight);
    this.post?.setSize();
  }

  // Automatische beeldkwaliteit: hapert het (minder dan ~48 beelden per seconde), dan minder pixels;
  // gaat het lange tijd soepel, dan weer wat scherper. Lukt het zelfs dan niet, dan gaat de gloed (bloom) uit.
  adaptQuality(realDt) {
    if (!(realDt > 0) || realDt > 0.5 || document.visibilityState !== 'visible') return; // tabwissel of laadpauze niet meetellen
    const q = (this.qual ||= { avg: 1 / 60, t: 0, good: 0 });
    q.avg += (realDt - q.avg) * 0.05;
    q.t += realDt;
    if (q.t < 2) return;
    q.t = 0;
    const fps = 1 / q.avg;
    // meting (anoniem): lang haperend, of na twee minuten soepel
    if (this.started && document.getElementById('hud') && !document.getElementById('hud').hidden) {
      q.play = (q.play || 0) + 2;
      q.low = fps < 40 ? (q.low || 0) + 2 : 0;
      const device = isMobile ? 'mobiel' : 'computer';
      if (q.low >= 10) statsPerf('haperend', device, fps);
      else if (q.play >= 120) statsPerf('soepel', device, fps);
    }
    // In de hoogste stand is 30 beelden per seconde goed genoeg; pas daaronder wordt er afgeschaald.
    const lowAt = Q.hoog ? 27 : Q.name === 'midden' ? 36 : 48, highAt = Q.hoog ? 45 : 57;
    if (fps < lowAt) {
      q.good = 0;
      // eerst de duurste effecten uit, dan minder pixels, en als laatste de hele nabewerking uit
      const on = this.post?.on;
      if (on?.dof || on?.rays) { on.dof = false; on.rays = false; }
      else if (this.resScale > 0.8) { this.resScale = Math.max(0.78, this.resScale - 0.12); this.applyResolution(); }
      else if (on?.ao) on.ao = false;
      else if (!q.light && (this.grass || Q.schaduw > 2048)) {
        // lichter: het verre gras weg en een kleinere schaduwkaart
        q.light = true;
        if (this.grass?.rings[1]) this.grass.rings[1].visible = false;
        if (Q.schaduw > 2048) { this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; Q.schaduw = 2048; }
      }
      else if (this.resScale > 0.62) { this.resScale = Math.max(0.6, this.resScale - 0.12); this.applyResolution(); }
      else if (this.post && !this.postOff) { this.postOff = true; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.camera.layers.enable(1); } // laatste stap: zonder nabewerking
    } else if (fps > highAt) {
      q.good += 2;
      if (q.good >= 10 && this.resScale < 1) { q.good = 0; this.resScale = Math.min(1, this.resScale + 0.08); this.applyResolution(); }
    } else q.good = 0;
  }

  render(dt) {
    if (this.post && !this.postOff) {
      this.post.render(dt);
      // naambordjes (laag 1) er scherp bovenop, zonder nabewerking
      const r = this.renderer, cam = this.camera, auto = r.autoClear, sh = r.shadowMap.autoUpdate;
      r.autoClear = false; r.shadowMap.autoUpdate = false;
      cam.layers.set(1);
      r.render(this.scene, cam);
      cam.layers.set(0);
      r.autoClear = auto; r.shadowMap.autoUpdate = sh;
    } else this.renderer.render(this.scene, this.camera);
  }

  applyTime() {
    const t = this.timeOfDay;
    const dayAngle = ((t - 6) / 12) * Math.PI;
    const elev = Math.sin(dayAngle) * 52; // om 9 en 15 uur staat de zon op 37 graden: laag en warm, met lange schaduwen
    const az = 100 + ((t - 6) / 12) * 160;
    const phi = THREE.MathUtils.degToRad(90 - Math.max(elev, -10));
    const theta = THREE.MathUtils.degToRad(az);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sunDir = sunDir;

    const day = THREE.MathUtils.smoothstep(elev, -6, 12);
    const night = 1 - day;
    this.night = night;
    const lightsOn = THREE.MathUtils.smoothstep(night, 0.4, 1);
    this.world.wet = lightsOn * 0.85; // 's avonds is de straat nat (na een bui): glans, plassen en spiegelende lantaarns
    this.world.setNight(lightsOn);
    this.facades?.setNight(lightsOn);
    this.cars?.setNight(lightsOn);

    const dusk = THREE.MathUtils.smoothstep(elev, -4, 6) * (1 - THREE.MathUtils.smoothstep(elev, 6, 22));
    // hoofdlicht: de zon, warmer naarmate hij lager staat; 's nachts koel maanlicht uit dezelfde hoek
    const low = 1 - THREE.MathUtils.smoothstep(elev, 10, 50);
    const nk = Q.laag ? 1.7 : 1; // op de telefoon geven de lantaarns geen licht: daar is het maanlicht sterker
    this.sun.intensity = 4.4 * day + 0.8 * nk * night;
    this.sun.color.setRGB(1, 0.94 - low * 0.07 - dusk * 0.3, 0.84 - low * 0.14 - dusk * 0.45);
    if (night > 0.5) this.sun.color.setRGB(0.5, 0.63, 1);
    // opvullicht: het meeste komt nu van de echte lucht (omgevingslicht); de hemisfeer vult alleen nog wat bij
    this.hemi.intensity = 0.3 * day + 0.5 * nk * night;
    this.hemi.color.setRGB(0.55 * day + 0.22 * night, 0.68 * day + 0.3 * night, 1 * day + 0.6 * night);
    this.hemi.groundColor.setRGB(0.3, 0.28, 0.22);
    this.renderer.toneMappingExposure = 0.68 * day + 1.05 * night;
    if (this.post) {
      const bl = this.post.bloom;
      bl.strength = 0.16 + night * 0.3; bl.threshold = 1.0 - night * 0.3; bl.radius = 0.75;
      this.post.sunDir.copy(sunDir);
      this.post.sunColor.copy(this.sun.color).multiplyScalar(1.4);
      this.post.raysAmount = day;
    }

    // lucht: koepel meedraaien met de zon, mistkleur = kleur van de horizon op de foto
    const sm = this.skyDome.meta;
    const hz = sm ? new THREE.Color(...sm.dag.horizon).multiplyScalar(0.78) : new THREE.Color(0x9fb4c8);
    const fogDay = hz.lerp(new THREE.Color(0xe8b98a), dusk * 0.6);
    const fogNight = new THREE.Color(0.012, 0.02, 0.04);
    this.scene.fog.color.copy(fogDay.lerp(fogNight, night));
    this.scene.fog.near = 0.5 + night * 0.4; // 's nachts wat meer mist in het dal
    this.skyDome.uniforms.uGround.value.copy(this.scene.fog.color);
    this.skyDome.uniforms.uGainDay.value = 0.78;
    this.skyDome.uniforms.uGainNight.value = 0.02;
    this.skyDome.setSun(sunDir, night);
    this.scene.background = null;
    this.updateEnvironment();
    this.missions?.refresh();
  }

  // Omgevingsreflecties en hemellicht uit de lucht zelf. Op telefoons 's nachts uit (dat gaf daar ooit
  // gekleurde spikkels op de grond); het maanlicht en het hemellicht doen het dan alleen.
  updateEnvironment() {
    const night = this.night ?? 0;
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    if (!Q.laag || night < 0.5) {
      this.envRT = this.pmrem.fromScene(this.skyDome.envScene, 0, 1, 1000);
      this.scene.environment = this.envRT.texture;
      this.envBase = 1.05 * (1 - night) + 0.9 * night;
      this.scene.environmentIntensity = this.interior ? 0.15 : this.envBase;
    } else this.scene.environment = null;
  }

  // Nacht duurt niet eindeloos: het wordt weer dag als je een andere missie begint, als je een nachtmissie
  // haalt, stopt of die mislukt, en anders na 3 minuten zonder missie. Nooit midden in een missie of gesprek.
  updateDayNight() {
    if (!(this.night > 0.5)) { this.nightSince = null; this.morningAsap = false; return; }
    const m = this.missions;
    if (!m || this.dawning) return;
    if (this.nightSince == null) {
      this.nightSince = this.time;
      if (m.active?.id !== 'finale') {
        const todo = [['nacht', 'De Nachtburgemeester'], ['nachtvangulpen', 'Nacht van Gulpen'], ['bierfeesten', 'de Gulpener Bierfeesten']].filter(([id]) => !m.done.has(id)).map(([, t]) => t);
        setTimeout(() => this.ui.toast(todo.length
          ? `Het is avond: tijd voor ${todo.length > 1 ? todo.slice(0, -1).join(', ') + ' en ' + todo[todo.length - 1] : todo[0]}. Over 3 minuten wordt het weer dag, of zodra je een andere missie begint.`
          : 'Het is avond. Even genieten van het donker, zo komt de zon weer op.', 5200), 600);
      }
    }
    if (m.active || this.ui.dialogOpen || this.interior || this.minigame || this.bigmap?.open) return;
    const elapsed = this.time - this.nightSince;
    const allDone = m.done.has('nacht') && m.done.has('nachtvangulpen') && m.done.has('bierfeesten');
    if (this.morningAsap || elapsed > 180 || (allDone && elapsed > 38)) this.dawn(); // de avond duurt 3 minuten (was 2)
  }

  async dawn() {
    this.dawning = true;
    this.morningAsap = false;
    try { await this.skipTime(9); } finally { this.dawning = false; }
    this.ui.toast('Goeiemorgen! De zon is weer op.', 2400);
  }

  async skipTime(to) {
    await this.fade(async () => {
      this.timeOfDay = to;
      this.applyTime();
    });
  }

  // Terug naar het startpunt: alles stoppen en opruimen wat er loopt, elke stap apart beveiligd,
  // zodat dit ook werkt als er ergens iets is vastgelopen.
  goHome() {
    const step = (name, fn) => { try { fn(); } catch (e) { console.warn('naar start: ' + name, e); } };
    step('kaart', () => { if (this.bigmap?.open) this.bigmap.hide(); });
    step('missie', () => { if (this.missions?.busy()) this.missions.stop(); });
    step('minispel', () => { this.minigame?.stop?.(); this.minigame = null; });
    step('gesprek', () => { this.ui.cancelDialogs?.(); this.ui.close(); if (this.missions) this.missions.talking = false; });
    step('binnen', () => {
      const room = this.interior;
      if (!room) return;
      room.group.visible = false; this.interior = null;
      document.body.classList.remove('inside');
      this.interiors.light.intensity = 0; this.hemi.groundColor.set(0x5c5a3a);
      room.onExit?.();
    });
    step('race', () => { if (this.race) this.endRace(false, true); });
    step('auto', () => { if (this.mode === 'car') { this.car.speed = 0; this.exitCar(); } });
    step('spullen', () => { this.dropProp?.(); this.dropKeg?.(); this.stopPolonaise?.(); this.fragile = null; this.drunk = 0; this.wobble = 0; });
    step('lopen', () => { if (this.mode !== 'walk') this.setMode('walk'); });
    step('scherm', () => {
      document.body.classList.remove('pov', 'cutscene', 'live', 'dialog-open', 'intro', 'inside');
      document.querySelectorAll('.mini-overlay, .fade-veil').forEach((e) => e.remove());
      const lb = document.getElementById('live-badge'); if (lb) lb.hidden = true;
      this.ui.timer?.(null);
    });
    step('speler', () => {
      const p = this.player, [x, z] = this.startPos;
      p.x = x; p.z = z; p.speed = 0; p.boost = 0; p.heading = Math.PI; p.pose = null; p.lockedFor = false;
      p.group.visible = true;
      this.pov = null; this.fading = false;
      this.actGen = (this.actGen || 0) + 1;
      this.unlockUntil = performance.now() + 3000;
      this.camYaw = 0.2; this.camPitch = 0.24; this.camDist = innerWidth < innerHeight ? 9 : 7;
      this.input.actionPressed = false;
      this.updateCamera(0, true);
      this.updateVehicleButton();
    });
    step('melding', () => this.ui.toast('Terug bij het startpunt', 1800));
  }

  async fade(mid) {
    this.fading = true;
    const el = document.createElement('div');
    el.className = 'fade-veil';
    Object.assign(el.style, { position: 'fixed', inset: 0, background: '#000', opacity: 0, transition: 'opacity 1s', zIndex: 15, pointerEvents: 'none' });
    document.body.appendChild(el);
    await wait(30);
    el.style.opacity = 1;
    await wait(1050);
    // ook als er tijdens de overgang iets misgaat, moet het zwarte scherm weer weg
    try { await mid(); } catch (e) { console.error('overgang', e); }
    finally {
      await wait(300);
      el.style.opacity = 0;
      await wait(1050);
      el.remove();
      this.fading = false;
    }
  }

  // ------------------------------------------------------------ speler

  setupPlayer() {
    const model = makeCharacter({ shirt: 0xe8a33d, pants: 0x2e3f5c, hair: 0x3b2a1a });
    const start = this.world.spotNear(5, 25);
    this.startPos = start;
    this.player = { group: new THREE.Group(), model, x: start[0], z: start[1], y: 0, heading: Math.PI, speed: 0, boost: 0, lockedFor: false };
    this.player.group.add(model);
    this.bike = makeBike(0xff9800);
    this.board = makeSkateboard();
    this.bike.visible = false;
    this.board.visible = false;
    this.player.group.add(this.bike, this.board);
    this.scene.add(this.player.group);
    this.camYaw = 0.2; // bij de start iets naar rechts: je kijkt de Dorpsstraat in
    this.camPitch = 0.24; // iets boven en achter de speler: vooruit kijken met overzicht
    this.camDist = innerWidth < innerHeight ? 9 : 7;
    this.lastManualLook = -10;
  }

  makeBikeModel(i) {
    const cols = [0x1e88e5, 0xe53935, 0x43a047, 0x212121, 0xfdd835, 0x8e24aa, 0xeeeeee, 0x00897b];
    return makeBike(cols[i % cols.length]);
  }

  unlockVehicle(v) { this.vehicles[v] = true; this.updateVehicleButton(); }

  // afgestelde fiets van Jef Abels: een stuk sneller
  tuneBike() { this.bikeSpeed = SPEED.bike * 1.3; }

  availableModes() {
    if (this.keg || this.interior || this.missions?.active?.noVehicles) return ['walk'];
    if (this.race) return ['skate'];
    const m = ['walk'];
    if (this.vehicles.bike) m.push('bike');
    if (this.vehicles.skate) m.push('skate');
    return m;
  }

  updateVehicleButton() {
    if (this.mode === 'car') { this.ui.setVehicleButton(null); return; }
    const options = this.availableModes();
    if (options.length <= 1) { this.ui.setVehicleButton(null); return; }
    const next = options[(options.indexOf(this.mode) + 1) % options.length];
    const label = { walk: 'Lopen', bike: 'Fiets', skate: 'Skate' }[next];
    this.ui.setVehicleButton(this.input.isTouch ? label : `${label} (F)`);
  }

  setMode(mode) {
    if (mode === 'bike' && this.mode !== 'bike') this.sfx?.play('bell');
    this.mode = mode;
    this.bike.visible = mode === 'bike';
    this.board.visible = mode === 'skate';
    this.player.model.position.y = mode === 'bike' ? 0.25 : mode === 'skate' ? 0.12 : 0;
    this.player.model.position.z = mode === 'bike' ? -0.25 : 0;
    this.player.group.visible = mode !== 'car';
    document.getElementById('speedo').hidden = mode === 'walk';
    this.updateVehicleButton();
  }

  enterCar(car) {
    if (this.keg) { this.ui.toast('Met een vat in je handen? Eerst afleveren!', 2000); return; }
    if (this.missions?.active?.noVehicles) { this.ui.toast('Je hebt gedronken. Laat die auto staan!', 2200); return; }
    if (car.locked) { this.ui.toast('Dat is niet jouw auto!', 1600); return; }
    this.cars.activate(car);
    this.car = car;
    car.speed = 0;
    this.sfx.play('door');
    this.sfx.engineOn(car.type === 'tractor');
    this.setMode('car');
    this.camYaw = car.heading + Math.PI;
    if (car.isVolvo && !this.volvoSeen) { this.volvoSeen = true; this.ui.toast('Grijze Volvo XC40', 2000); }
    if (car.isTractor) this.ui.toast('Tractor! Niet zo snel, wel overal doorheen.', 2200);
  }

  // Geheime snelreis (zie secret.js): direct naar een missie.
  async fastTravel(it) {
    this.bigmap.hide();
    if (this.minigame) this.missions.stop();
    if (this.interior) await this.exitInterior();
    if (this.mode === 'car') { this.car.speed = 0; this.exitCar(); }
    if (this.mode !== 'walk') this.setMode('walk');
    let [x, z] = it.free ? [it.x, it.z] : [it.x + 2, it.z + 2];
    // vrij gekozen punt: niet in het water of in een pand neerkomen
    if (it.free) {
      outer: for (let r = 0; r < 40; r += 2) {
        for (let k = 0; k < Math.max(1, r * 2); k++) {
          const a = (k / Math.max(1, r * 2)) * Math.PI * 2, px = it.x + Math.cos(a) * r, pz = it.z + Math.sin(a) * r;
          if (!this.world.blocked(px, pz) && !this.world.insideBuilding(px, pz)) { x = px; z = pz; break outer; }
        }
      }
    }
    [x, z] = this.world.resolve(x, z, 0.5);
    const p = this.player;
    p.x = x; p.z = z; p.speed = 0;
    p.heading = it.free ? p.heading : Math.atan2(it.x - x, it.z - z);
    this.camYaw = p.heading + Math.PI;
    this.fx.confetti(x, this.world.groundAt(x, z) + 2, z, 60);
    this.sfx.play('pop');
    this.ui.toast(it.title, 1400);
    this.updateCamera(0, true);
  }

  // Auto kapen: chauffeur eruit trekken, die valt op straat en rent scheldend weg.
  async hijackCar(c) {
    if (this.keg) { this.ui.toast('Met een vat in je handen? Eerst afleveren!', 2000); return; }
    if (this.missions?.active?.noVehicles) { this.ui.toast('Niet nu, je moet lopen!', 2000); return; }
    const p = this.player;
    const [dx, dz] = this.cars.driverDoor(c);
    c.speed = 0; c.cruise0 = c.cruise; c.cruise = 0;
    p.lockedFor = true;
    p.x = dx; p.z = dz;
    p.heading = Math.atan2(c.x - dx, c.z - dz);
    p.pose = 'drink'; // arm vooruit: aan de deur trekken
    this.sfx.play('door');
    await wait(450);
    // chauffeur verschijnt naast de auto en valt om
    const looks = [[0x8d6e63, 0x37474f, 0x9e9e9e], [0x1565c0, 0x263238, 0x3e2723], [0xad1457, 0x212121, 0xd7b56d, true]];
    const [shirt, pants, hair, female] = looks[Math.floor(Math.random() * looks.length)];
    const drv = makeCharacter({ shirt, pants, hair, female: !!female, glasses: Math.random() < 0.4 });
    const ox = dx + Math.cos(c.heading) * 0.9, oz = dz - Math.sin(c.heading) * 0.9;
    drv.position.set(ox, this.world.groundAt(ox, oz), oz);
    drv.rotation.y = c.heading + Math.PI / 2;
    this.scene.add(drv);
    this.sfx.play('crash');
    const shouts = [['Hé! Mijn auto!', null], ['Pliesie!', 'politie'], ['Onnut!', 'viezerik'], ['Dat is een lease-auto!', null], ['Mijn boodschappen liggen achterin!', null]];
    const [sh, nl] = shouts[Math.floor(Math.random() * shouts.length)];
    if (nl) this.ui.toastDialect(sh, nl, 1800); else this.ui.toast(sh, 1600);
    this.fleeing = this.fleeing || [];
    this.fleeing.push({ m: drv, x: ox, z: oz, h: drv.rotation.y, t: 0 });
    p.pose = null;
    p.lockedFor = false;
    this.cars.hijack(c);
    this.enterCar(c);
  }

  // weggeduwde chauffeurs: eerst op de grond, dan wegrennen en verdwijnen
  updateFleeing(dt) {
    if (!this.fleeing?.length) return;
    for (const f of this.fleeing) {
      f.t += dt;
      if (f.t < 0.9) {
        f.m.rotation.x = -Math.min(1.3, f.t * 4); // ligt op de grond
        f.m.userData.animate(dt, 0, 'idle');
      } else {
        f.m.rotation.x = Math.max(0, f.m.rotation.x - dt * 5);
        const [nx, nz] = this.world.resolve(f.x + Math.sin(f.h) * 5.5 * dt, f.z + Math.cos(f.h) * 5.5 * dt, 0.35);
        if (Math.hypot(nx - f.x, nz - f.z) < 5.5 * dt * 0.3) f.h += 0.8; // tegen een muur: draaien
        f.x = nx; f.z = nz;
        f.m.position.set(f.x, this.world.groundAt(f.x, f.z), f.z);
        f.m.rotation.y = f.h;
        f.m.userData.animate(dt, 5.5, 'walk');
      }
      if (f.t > 7) this.scene.remove(f.m);
    }
    this.fleeing = this.fleeing.filter((f) => f.t <= 7);
  }

  exitCar() {
    const car = this.car;
    if (!car) return;
    if (Math.abs(car.speed) > 3) { this.ui.toast('Eerst stoppen!', 1200); return; }
    const sx = Math.cos(car.heading), sz = -Math.sin(car.heading);
    for (const side of [-1, 1]) {
      const x = car.x + sx * side * 1.7, z = car.z + sz * side * 1.7;
      if (!this.world.blocked(x, z) && !this.world.insideBuilding(x, z)) {
        [this.player.x, this.player.z] = this.world.resolve(x, z, 0.4);
        break;
      }
    }
    this.player.heading = car.heading;
    this.car = null;
    this.sfx.play('door');
    this.sfx.engineOff();
    this.setMode('walk');
  }

  // Grijze Volvo XC40 op de oprit van Ringweg 38. Staat bewust niet op de kaart.
  spawnVolvo() {
    const p = this.world.meta.pois.find((q) => q.id === 'volvo');
    if (!p) return;
    // op de oprit (plek volgens de luchtfoto), met de neus naar de straat
    const { x, z, heading } = volvoSpot38();
    this.volvo = this.cars.addCar('xc40', x, z, heading, VOLVO_GREY, { isVolvo: true });
  }

  // Een boerenerf aan de rand van het dorp: weg met aan één kant akker of weiland.
  findFarm() {
    const w = this.world;
    const cands = [];
    for (const [, ax, az, bx, bz] of w.segments) {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const d = Math.hypot(mx, mz);
      if (d < 380 || d > 760) continue;
      if (w.classAt(mx, mz) !== 'rijbaan') continue;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const px = -(bz - az) / len, pz = (bx - ax) / len;
      for (const side of [1, -1]) {
        const fx = mx + px * side * 12, fz = mz + pz * side * 12;
        const c = w.classAt(fx, fz);
        if ((c === 'gras' || c === 'akker') && !w.insideBuilding(fx, fz) && !w.blocked(fx, fz) && w.classAt(mx + px * side * 22, mz + pz * side * 22) === c) {
          cands.push({ d, x: mx + px * side * 6, z: mz + pz * side * 6, tx: fx, tz: fz, heading: Math.atan2(-px * side, -pz * side) });
        }
      }
    }
    cands.sort((a, b) => Math.abs(a.d - 520) - Math.abs(b.d - 520));
    return cands[0] || null;
  }

  // Plekje aan de oever van de Gulp om te vissen.
  findFishingSpot() {
    const w = this.world;
    const cls = w.ground.classes;
    const pts = [];
    for (const [c, rings] of w.ground.polys) {
      if (cls[c] !== 'water') continue;
      const r = rings[0];
      for (let i = 0; i < r.length; i += 2) {
        const d = Math.hypot(r[i], r[i + 1]);
        if (d > 70 && d < 380) pts.push([r[i], r[i + 1], d]);
      }
    }
    pts.sort((a, b) => Math.abs(a[2] - 180) - Math.abs(b[2] - 180));
    for (const [x, z] of pts) {
      for (let a = 0; a < 16; a++) {
        const dx = Math.cos((a / 16) * Math.PI * 2), dz = Math.sin((a / 16) * Math.PI * 2);
        const sx = x + dx * 2.5, sz = z + dz * 2.5, wx = x - dx * 1.8, wz = z - dz * 1.8;
        if (!w.blocked(sx, sz) && !w.insideBuilding(sx, sz) && w.blocked(wx, wz) && w.classAt(sx, sz) !== 'rijbaan') {
          return { x: sx, z: sz, wx, wz };
        }
      }
    }
    return null;
  }

  carryKeg(keg) {
    if (this.mode === 'car') this.exitCar();
    this.keg = keg;
    keg.position.set(0, 1.25, 0.42);
    keg.rotation.x = 0.2;
    this.player.group.add(keg);
    this.setMode('walk');
  }

  dropKeg() {
    if (!this.keg) return;
    this.player.group.remove(this.keg);
    this.keg = null;
    this.updateVehicleButton();
  }

  // ------------------------------------------------------------ NPC's, labels, markeringen

  addNpc(name, [x, z], model) {
    const group = new THREE.Group();
    group.add(model);
    group.position.set(x, this.world.groundAt(x, z), z);
    this.scene.add(group);
    const label = makeLabel(name, { small: true });
    label.position.set(0, 2.55, 0);
    group.add(label);
    // gele missiemarkering boven het hoofd
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xe8a33d, emissiveIntensity: 0.9 }));
    marker.position.set(0, 3.2, 0);
    marker.scale.y = 1.5;
    group.add(marker);
    const npc = { name, group, model, marker, label, pos: group.position, x, z, active: false, enabled: true, heading: 0, lookAtPlayer: false };
    this.npcs.push(npc);
    return npc;
  }

  // Naambordjes boven de plekken: vóór de gevel, zodat ze niet half in het pand verdwijnen.
  // Alle plekken krijgen hetzelfde kleine bordje dat pas dichtbij verschijnt. De grote zwevende borden bij
  // plekken met een missie zijn weg: ze stonden er niet bij elke missie, en de missies vind je via de kaart.
  setupPoiLabels() {
    this.poiLabels = [];
    const spots = this.world.meta.pois.filter((p) => !(p.id === 'ringweg' || p.id === 'volvo' || p.cafe)).map((p) => {
      const f = this.facades.frames[p.id];
      return { p, f, x: f ? f.x + f.nx * 1.6 : p.pos[0], z: f ? f.z + f.nz * 1.6 : p.pos[1] };
    });
    for (const { p, f, x, z } of spots) {
      const label = makeLabel(p.name, { small: true });
      label.userData.near = true;
      label.position.set(x, f ? f.y + 4.6 : this.world.heightAt(x, z) + (p.id === 'mariabeeld' ? 14 : 3.2), z);
      label.material.depthTest = false; // altijd volledig leesbaar
      this.scene.add(label);
      this.poiLabels.push(label);
    }
  }

  // bordjes van ver weg vervagen, zodat het scherm niet vol staat:
  // grote borden (plekken met een missie) vanaf ~60 m, kleine bordjes en namen van personen pas van dichtbij
  updateLabels() {
    const c = this.camera.position, pl = this.player;
    for (const l of this.poiLabels || []) {
      const d = c.distanceTo(l.position);
      // grote borden ook weg als je er vlak voor staat (dan zie je de gevel zelf, en het bord vult anders je scherm)
      const dp = Math.hypot(l.position.x - pl.x, l.position.z - pl.z);
      const o = l.userData.near ? 1 - THREE.MathUtils.smoothstep(d, 10, 22) : THREE.MathUtils.smoothstep(dp, 12, 20) * (1 - THREE.MathUtils.smoothstep(d, 28, 48));
      l.material.opacity = o;
      l.visible = o > 0.02 && !this.pov; // bij een vast camerabeeld (podium, vizier) geen naamborden ervoor
    }
    const p = this.player;
    for (const n of this.npcs) {
      if (!n.label) continue;
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      const o = 1 - THREE.MathUtils.smoothstep(d, 9, 15);
      n.label.material.opacity = o;
      n.label.visible = o > 0.02 && !this.pov;
    }
  }

  // alles wat op de (grote) kaart staat
  mapItems() {
    const items = [];
    const colors = { open: '#f2c14e', klaar: '#7cc576', actief: '#ff6b5a' };
    const labels = { open: 'Open', klaar: 'Gedaan', actief: 'Bezig' };
    const night = this.night > 0.5;
    this.missions.list().forEach((m) => {
      if (m.nightOnly && !night && m.state !== 'actief') {
        items.push({ key: m.id, x: m.npc.pos.x, z: m.npc.pos.z, title: m.title, place: m.place, color: '#9aa4b0', glyph: 'z', state: '', stateLabel: 'Alleen \'s avonds' });
        return;
      }
      items.push({ key: m.id, x: m.npc.pos.x, z: m.npc.pos.z, title: m.title, place: m.best ? `${m.place} · beste: ${m.best}` : m.place, color: colors[m.state], glyph: m.state === 'klaar' ? '✓' : '!', state: m.state, stateLabel: labels[m.state] });
    });
    for (const f of this.sixsense?.markers() || []) items.push(f);
    if (this.tractor) items.push({ key: 'tractor', x: this.tractor.x, z: this.tractor.z, title: 'Tractor', place: 'Op het boerenland', color: '#64b5f6', glyph: 'T', state: '', stateLabel: 'Voertuig' });
    return items;
  }

  updateMarkers() {
    if (!this.minimap) return;
    // tijdens een missie alleen wat bij die missie hoort (de missiepunten zelf tekent de minikaart apart)
    const busy = this.missions.active;
    this.minimap.markers = this.mapItems().filter((i) => (busy ? i.state === 'actief' : i.state !== '' || i.key === 'tractor'));
    for (const m of this.missions.list()) {
      const night = this.night > 0.5;
      m.npc.marker.visible = m.state === 'open' && (!m.nightOnly || night) && !this.missions.active;
    }
    if (this.bigmap?.open) { this.bigmap.renderList(); this.bigmap.draw(); }
  }

  // Lichtbundel naar een doel: felle kern, brede gloed, pulserende ring op de grond en een zwevende pijl.
  // Goed zichtbaar van ver, ook overdag en vanuit de auto.
  makeBeam(x, z, color = 0xe8a33d) {
    const g = new THREE.Group();
    const y = this.world.heightAt(x, z);
    g.position.set(x, y, z);
    const add = (geo, opacity, extra = {}) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, ...extra }));
      g.add(m);
      return m;
    };
    const coreGeo = new THREE.CylinderGeometry(0.8, 0.8, 220, 16, 1, true); coreGeo.translate(0, 110, 0);
    const glowGeo = new THREE.CylinderGeometry(3.4, 2.0, 220, 24, 1, true); glowGeo.translate(0, 110, 0);
    const core = add(coreGeo, 0.9);
    const glow = add(glowGeo, 0.35);
    const ringGeo = new THREE.RingGeometry(2.2, 3.0, 40); ringGeo.rotateX(-Math.PI / 2);
    const ring = add(ringGeo, 0.8);
    ring.position.y = 0.25;
    // pijl die boven het doel op en neer zweeft en naar beneden wijst
    const arrowGeo = new THREE.ConeGeometry(1.1, 2.2, 4); arrowGeo.rotateX(Math.PI);
    const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color, fog: false }));
    g.add(arrow);
    g.userData.pulse = (t) => {
      // van ver breder, zodat de bundel altijd goed opvalt
      const d = this.camera ? Math.hypot(this.camera.position.x - g.position.x, this.camera.position.z - g.position.z) : 0;
      const sc = THREE.MathUtils.clamp(d / 45, 1, 7);
      core.scale.set(sc, 1, sc); glow.scale.set(sc, 1, sc);
      core.material.opacity = 0.75 + Math.sin(t * 4) * 0.15;
      glow.material.opacity = 0.28 + Math.sin(t * 2) * 0.08;
      const k = (t * 0.8) % 1;
      ring.scale.setScalar(0.6 + k * 1.4);
      ring.material.opacity = 0.9 * (1 - k);
      arrow.position.y = 7 + Math.sin(t * 3) * 0.6;
      arrow.rotation.y = t * 1.5;
    };
    g.userData.pulse(this.time || 0);
    this.scene.add(g);
    (this.beams ||= new Set()).add(g);
    return g;
  }

  setTarget(t) {
    if (this.targetBeam) { this.scene.remove(this.targetBeam); this.targetBeam = null; }
    this.target = t;
    if (t) this.targetBeam = this.makeBeam(t.pos.x, t.pos.z);
  }

  setWaypoint(it) {
    if (this.waypointBeam) this.scene.remove(this.waypointBeam);
    this.waypoint = { x: it.x, z: it.z };
    this.waypointBeam = this.makeBeam(it.x, it.z, 0x64b5f6);
    this.ui.toast(`Route naar ${it.title}`, 1600);
  }

  // willekeurig adres (deur van een huis) op afstand van de speler
  // afstand vanaf je positie buiten (binnen telt de deur)
  distOutside([x, z]) {
    const from = this.interior && this.outsidePos ? this.outsidePos : this.player;
    return Math.hypot(x - from.x, z - from.z);
  }

  randomAddress(minD, maxD) {
    const w = this.world;
    // binnen een gebouw tellen we vanaf de deur buiten
    const from = this.interior && this.outsidePos ? this.outsidePos : this.player;
    for (let i = 0; i < 300; i++) {
      const f = w.footprints[Math.floor(Math.random() * w.footprints.length)];
      if (f.extra) continue;
      const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
      const d = Math.hypot(cx - from.x, cz - from.z);
      if (d < minD || d > maxD) continue;
      const s = w.nearestStreet(cx, cz);
      if (!s || s.dist > 30) continue;
      let spot = w.spotNear(cx, cz);
      // in een rij panden kan het wegduwen uit het ene pand je in het volgende zetten: dan de straat zelf
      if (w.insideBuilding(...spot)) spot = w.resolve(s.x, s.z, 0.6);
      if (w.blocked(...spot) || w.insideBuilding(...spot)) continue;
      return spot;
    }
    return w.spotNear(100, 100);
  }

  // opts.require(): foutmelding als je nog niet mag aankomen (bijv. niet op de fiets)
  // opts.violate(): foutmelding als je de regels breekt, dan mislukt de klus meteen
  setDestination([x, z], limit, onArrive, onFail, opts = {}) {
    this.clearDestination();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.15, 8, 32), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, this.world.groundAt(x, z) + 0.3, z);
    this.scene.add(ring);
    this.destination = { x, z, left: limit, onArrive, onFail, ring, opts };
    this.setTarget({ pos: new THREE.Vector3(x, 0, z) });
  }

  clearDestination() {
    if (!this.destination) return;
    this.scene.remove(this.destination.ring);
    this.destination = null;
    this.ui.timer(null);
    this.setTarget(null);
  }

  updateDestination(dt) {
    const d = this.destination;
    if (!d) return;
    d.left -= dt;
    if (!d.opts.noTimer) this.ui.timer(Math.max(0, d.left).toFixed(0) + ' s');
    d.ring.rotation.z += dt;
    const bad = d.opts.violate?.();
    if (bad) {
      const cb = d.onFail;
      this.clearDestination();
      cb(bad);
      return;
    }
    if (Math.hypot(this.player.x - d.x, this.player.z - d.z) < 5) {
      const no = d.opts.require?.();
      if (no) { if (!d.warned) { this.ui.toast(no, 1800); d.warned = true; } return; }
      const cb = d.onArrive;
      this.clearDestination();
      cb();
    } else if (d.left <= 0) {
      const cb = d.onFail;
      this.clearDestination();
      cb();
    }
  }

  // ------------------------------------------------------------ minigames

  async startRace(path, rival, onDone) {
    if (!path || path.length < 2) return;
    if (this.mode === 'car') this.exitCar();
    const pts = [path[0]];
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      if (acc >= 45 || i === path.length - 1) { pts.push(path[i]); acc = 0; }
    }
    const total = path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0);
    const limit = Math.max(25, Math.round(total / 7.2));
    const [sx, sz] = this.world.resolve(pts[0][0], pts[0][1], 0.5);
    this.player.x = sx; this.player.z = sz;
    this.player.heading = Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    this.camYaw = this.player.heading + Math.PI;
    rival.home = rival.pos.clone();
    this.race = { pts, idx: 1, time: 0, limit, rival, path, total, rivalDist: 0, done: false, markers: [], onDone };
    this.setMode('skate');
    this.setTarget(null);
    const ringGeo = new THREE.TorusGeometry(3.2, 0.25, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xe8a33d, emissive: 0xe8a33d, emissiveIntensity: 0.8 });
    // finishboog over de weg bij het laatste checkpoint
    const [fx, fz] = pts.at(-1), [px, pz] = pts.at(-2);
    const banner = makeFinishBanner(9);
    banner.position.set(fx, this.world.groundAt(fx, fz), fz);
    banner.rotation.y = Math.atan2(fx - px, fz - pz);
    this.scene.add(banner);
    this.race.banner = banner;
    this.race.markers = pts.slice(1).map(([x, z], i) => {
      const m = new THREE.Mesh(ringGeo, ringMat);
      const next = pts[Math.min(i + 2, pts.length - 1)];
      m.position.set(x, this.world.groundAt(x, z) + 3, z);
      m.rotation.y = Math.atan2(next[0] - x, next[1] - z);
      m.visible = i < 2;
      this.scene.add(m);
      return m;
    });
    this.player.lockedFor = true;
    for (const c of ['3', '2', '1']) { this.ui.toast(c, 700); await wait(800); }
    this.ui.toast('GO!', 800);
    this.player.lockedFor = false;
    this.race.started = true;
    this.missions.progress(`Checkpoint 0 / ${pts.length - 1}`);
  }

  updateRace(dt) {
    const r = this.race;
    if (!r || !r.started || r.done) return;
    r.time += dt;
    this.ui.timer((r.limit - r.time).toFixed(1));
    r.rivalDist += dt * (r.total / (r.limit * 1.04));
    const rp = pointAlong(r.path, r.rivalDist);
    if (rp) {
      r.rival.pos.set(rp.x, this.world.groundAt(rp.x, rp.z), rp.z);
      r.rival.heading = rp.heading;
      r.rival.mode = 'skate';
    }
    const [cx, cz] = r.pts[r.idx];
    if (Math.hypot(this.player.x - cx, this.player.z - cz) < 6) {
      r.markers[r.idx - 1].visible = false;
      r.idx++;
      if (r.markers[r.idx]) r.markers[r.idx].visible = true;
      this.missions.progress(`Checkpoint ${r.idx - 1} / ${r.pts.length - 1}`);
      if (r.idx >= r.pts.length) return this.endRace(true);
    }
    if (r.time >= r.limit) this.endRace(false);
  }

  endRace(won, silent = false) {
    const r = this.race;
    if (!r) return;
    r.done = true;
    r.markers.forEach((m) => this.scene.remove(m));
    if (r.banner) this.scene.remove(r.banner);
    if (won) this.celebrate();
    r.rival.mode = null;
    if (r.rival.home) r.rival.pos.copy(r.rival.home);
    this.ui.timer(null);
    this.race = null;
    this.updateVehicleButton();
    if (!silent) r.onDone(won);
  }

  // Penalty's nemen bij FC Gulpen. Geeft het aantal goals terug.
  startPenalty() {
    return startPenaltyGame(this);
  }

  // Vissen in de Gulp: tik op het juiste moment als de dobber onder gaat.
  startFishing() {
    return new Promise((resolve) => {
      const f = this.fishing;
      if (!f) { resolve(0); return; }
      if (this.mode === 'car') this.exitCar();
      this.setMode('walk');
      const w = this.world;
      this.player.x = f.x; this.player.z = f.z;
      this.player.heading = Math.atan2(f.wx - f.x, f.wz - f.z);
      this.camYaw = this.player.heading + Math.PI + 0.5;
      this.camPitch = 0.3;
      const wy = w.heightAt(f.wx, f.wz) + 0.1;
      const bob = new THREE.Group();
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe53935, emissive: 0x5a0000 }));
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      bob.add(top, bottom);
      bob.position.set(f.wx, wy, f.wz);
      this.scene.add(bob);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xdddddd }));
      this.scene.add(line);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x3e2723 }));
      rod.position.set(0.3, 1.5, 0.9);
      rod.rotation.x = 1.0;
      this.player.group.add(rod);
      let phase = 'wait', t = 0, wait = 1.5 + Math.random() * 3, caught = 0, tries = 0;
      const fishNames = ['Ee visch!', 'Wat een joekel!', 'Een kleintje, maar telt!', 'Beet!'];
      this.ui.setActionLabel('Haal op');
      const finish = () => {
        this.scene.remove(bob, line);
        this.player.group.remove(rod);
        this.minigame = null;
        this.player.lockedFor = false;
        resolve(caught);
      };
      this.minigame = {
        actionLabel: 'Haal op',
        get phase() { return phase; },
        stop: finish,
        update: (dt) => {
          t += dt;
          this.player.lockedFor = true;
          const tip = new THREE.Vector3(0.3, 2.5, 1.9).applyMatrix4(this.player.group.matrixWorld);
          const pos = line.geometry.attributes.position;
          pos.setXYZ(0, tip.x, tip.y, tip.z);
          pos.setXYZ(1, bob.position.x, bob.position.y + 0.05, bob.position.z);
          pos.needsUpdate = true;
          const pressed = this.input.consumeAction() || this.input.spacePressed;
          this.input.spacePressed = false;
          if (phase === 'wait') {
            bob.position.y = wy + Math.sin(t * 2.2) * 0.015;
            if (pressed) { tries++; this.ui.toast('Te vroeg! De vis schrok weg.', 1400); t = 0; wait = 2 + Math.random() * 3; }
            else if (t > wait) { phase = 'bite'; t = 0; this.fx.splash(bob.position.x, wy, bob.position.z, 0.6); this.sfx.play('splash'); }
          } else if (phase === 'bite') {
            bob.position.y = wy - 0.13 + Math.sin(t * 30) * 0.02;
            if (pressed) {
              caught++; tries++;
              // de vis springt uit het water
              const fish = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.22, 4, 10), new THREE.MeshStandardMaterial({ color: 0x9fb3bf, metalness: 0.6, roughness: 0.3 }));
              fish.rotation.z = Math.PI / 2;
              this.scene.add(fish);
              this.fx.splash(bob.position.x, wy, bob.position.z, 1.2);
              const fx0 = bob.position.x, fz0 = bob.position.z, tip0 = tip.clone();
              let ft = 0;
              const leap = () => {
                ft += 0.016 / 0.9;
                const k = Math.min(1, ft);
                fish.position.set(fx0 + (tip0.x - fx0) * k, wy + Math.sin(k * Math.PI) * 1.6 + (tip0.y - 0.6 - wy) * k, fz0 + (tip0.z - fz0) * k);
                fish.rotation.y += 0.3;
                if (k < 1) requestAnimationFrame(leap); else setTimeout(() => this.scene.remove(fish), 600);
              };
              leap();
              this.ui.toast(fishNames[Math.floor(Math.random() * fishNames.length)], 1500);
              this.missions.progress(`${caught} / 3 vissen`);
              phase = 'pause'; t = 0;
            } else if (t > 0.9) { tries++; this.ui.toast('Te laat, hij is weg.', 1400); phase = 'pause'; t = 0; }
          } else if (phase === 'pause' && t > 1.2) {
            if (caught >= 3 || tries >= 8) finish();
            else { phase = 'wait'; t = 0; wait = 1.5 + Math.random() * 3.5; }
          }
        },
      };
    });
  }

  // Polonaise: feestgangers verzamelen die achter je aan lopen.
  // Verzamelen van dingen of mensen die daarna achter je aan komen (polonaise, winkelwagentjes).
  startPolonaise(n, { factory = null, minD = 50, maxD = 260, color = '#ff4fa3', glyph = '+', joinLines = null } = {}) {
    const w = this.world;
    const colors = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa, 0xff7043, 0x00acc1];
    this.followers = [];
    this.tempMarkers = [];
    this.joinLines = joinLines;
    for (let i = 0; i < n; i++) {
      const [x, z] = this.randomAddress(minD, maxD);
      const model = factory ? factory(i) : makeCharacter({ shirt: colors[i % colors.length], pants: colors[(i + 3) % colors.length], hair: 0x3b2a1a, hat: i % 2 ? 'cap' : 'chef', hatColor: colors[(i + 1) % colors.length] });
      model.position.set(x, w.groundAt(x, z), z);
      model.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(model);
      const m = { x, z, color, glyph, done: false };
      this.tempMarkers.push(m);
      this.followers.push({ model, x, z, heading: model.rotation.y, joined: false, marker: m });
    }
  }

  // alle punten waar je voor de lopende missie heen moet (mensen ophalen, munten, kroegen...)
  missionPoints() {
    const pts = (this.tempMarkers || []).filter((m) => !m.done);
    for (const c of this.collectibles || []) {
      if (!c.pos || pts.some((m) => Math.hypot(m.x - c.pos.x, m.z - c.pos.z) < 4)) continue;
      pts.push({ x: c.pos.x, z: c.pos.z, color: c.color || '#f2c14e', glyph: c.glyph || '€' });
    }
    return pts;
  }

  followersJoined() { return (this.followers || []).filter((f) => f.joined).length; }

  stopPolonaise() {
    (this.followers || []).forEach((f) => this.scene.remove(f.model));
    this.followers = [];
    this.tempMarkers = [];
  }

  updateFollowers(dt) {
    if (!this.followers?.length) return;
    const p = this.player;
    let leader = { x: p.x, z: p.z };
    for (const f of this.followers) {
      if (!f.joined) {
        f.model.userData.animate?.(dt, 0, 'wave');
        if (this.mode === 'walk' && Math.hypot(p.x - f.x, p.z - f.z) < 2.6) {
          f.joined = true;
          f.marker.done = true;
          const lines = this.joinLines || ['Alaaf!', 'Ik doe mee!', 'Klumpkes sjmiete!', 'Hup, achter je aan!'];
          this.ui.toast(lines[Math.floor(Math.random() * lines.length)], 1200);
          this.sfx?.play('pop');
          this.missions.progress(`${this.followersJoined()} / ${this.followers.length} ${this.missions.active?.followerWord || 'feestgangers'}`);
        }
        continue;
      }
    }
    // de rij volgt de speler, elk achter de vorige
    for (const f of this.followers.filter((q) => q.joined)) {
      const dx = leader.x - f.x, dz = leader.z - f.z;
      const d = Math.hypot(dx, dz);
      let speed = 0;
      if (d > 1.3 && this.mode === 'walk') {
        const step = Math.min(d - 1.3, 7 * dt);
        f.x += (dx / d) * step; f.z += (dz / d) * step;
        speed = step / dt;
        f.heading = Math.atan2(dx, dz);
      }
      f.model.position.set(f.x, this.world.groundAt(f.x, f.z), f.z);
      f.model.rotation.y = f.heading;
      if (f.model.userData.animate) {
        f.model.userData.animate(dt, speed, 'walk');
        // handen op de schouders van de voorganger
        f.model.userData.parts.armL.rotation.x = -1.3; f.model.userData.parts.armR.rotation.x = -1.3;
      }
      leader = f;
    }
  }

  // ------------------------------------------------------------ binnenruimtes

  // Naar binnen: verplaatst de speler naar de ruimte, met eigen licht en camera.
  async enterInterior(room, { triggers = [], onExit = null } = {}) {
    if (this.mode === 'car') this.exitCar();
    this.setMode('walk');
    this.player.lockedFor = true;
    this.sfx.play('door');
    await this.fade(async () => {
      this.outsidePos = { x: this.player.x, z: this.player.z, heading: this.player.heading, camDist: this.camDist };
      this.interior = room;
      room.group.visible = true;
      room.activeTriggers = triggers;
      room.onExit = onExit;
      const [dx, dz] = room.toWorld(room.door.x, room.door.z - Math.min(2.6, room.d * 0.2));
      this.player.x = dx; this.player.z = dz; this.player.y = 0;
      this.player.heading = Math.PI;
      this.camYaw = 0; this.camPitch = 0.14; this.camDist = 3.0;
      document.body.classList.add('inside');
      this.updateVehicleButton();
      this.lastManualLook = this.time;
      // binnenlicht: geen zon, warme lamp in het midden
      this.sun.intensity = 0;
      this.hemi.intensity = 0.9;
      this.hemi.color.set(0xfff0dc);
      this.hemi.groundColor.set(0x5a4030);
      this.interiors.light.position.set(room.ox, room.h - 0.5, room.oz);
      this.interiors.light.intensity = 30;
      this.interiors.light.distance = Math.max(room.w, room.d) * 1.6;
      this.scene.environmentIntensity = 0.15;
      this.renderer.toneMappingExposure = 0.75;
      this.player.group.position.set(this.player.x, 0, this.player.z);
      this.updateCamera(0, true);
    });
    this.player.lockedFor = false;
    // laten zien waar je iets kunt doen
    if (triggers.length) this.ui.toast('Loop naar de gele markering', 2500);
  }

  // Gele, zwevende markeringen boven de actieplekken in een binnenruimte.
  syncTriggerMarkers(room) {
    const active = new Set(room?.activeTriggers || []);
    for (const m of this.triggerMarkers || []) if (!active.has(m.t) || this.interior !== room) this.scene.remove(m.obj);
    this.triggerMarkers = (this.triggerMarkers || []).filter((m) => active.has(m.t) && this.interior === room);
    if (!room) return;
    for (const t of active) {
      if (this.triggerMarkers.some((m) => m.t === t)) continue;
      const obj = new THREE.Group();
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xe8a33d, emissiveIntensity: 0.8 }));
      gem.scale.y = 1.5;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      obj.add(gem, ring);
      const [x, z] = room.toWorld(t.x, t.z);
      obj.position.set(x, 0, z);
      obj.userData.gem = gem;
      this.scene.add(obj);
      this.triggerMarkers.push({ t, obj });
    }
    for (const m of this.triggerMarkers) {
      m.obj.userData.gem.position.y = 2.1 + Math.sin(this.time * 2.5) * 0.12;
      m.obj.userData.gem.rotation.y += 0.03;
    }
  }

  async exitInterior() {
    const room = this.interior;
    if (!room) return;
    this.player.lockedFor = true;
    this.sfx.play('door');
    await this.fade(async () => {
      room.group.visible = false;
      this.interior = null;
      document.body.classList.remove('inside');
      this.updateVehicleButton();
      this.interiors.light.intensity = 0;
      this.hemi.groundColor.set(0x5c5a3a);
      const o = this.outsidePos;
      if (o) { this.player.x = o.x; this.player.z = o.z; this.player.heading = o.heading + Math.PI; this.camDist = o.camDist; }
      this.camYaw = this.player.heading + Math.PI;
      this.applyTime();
      this.updateCamera(0, true);
    });
    this.player.lockedFor = false;
    room.onExit?.();
  }

  // Voorwerp in de rechterhand van een poppetje (speler of NPC).
  // voorwerp in de rechterhand; offset is t.o.v. de schouder (oude maat), dus de armlengte eraf
  attachToHand(model, prop, { offset = [0, -0.72, 0.07] } = {}) {
    this.detachFromHand(model);
    const parts = model.userData.parts;
    if (parts.handR) {
      const [hx, hy, hz] = model.userData.handOffset;
      prop.position.set(offset[0] + hx, hy + (offset[1] + 0.72) * 0.5, hz + (offset[2] - 0.07));
      parts.handR.add(prop);
    } else {
      prop.position.set(...offset);
      parts.armR.add(prop);
    }
    model.userData.handProp = prop;
    model.userData.holdR = true;
  }

  detachFromHand(model) {
    const prop = model.userData.handProp;
    if (prop) prop.parent?.remove(prop);
    model.userData.handProp = null;
    model.userData.holdR = false;
  }

  holdProp(prop) { this.attachToHand(this.player.model, prop); }
  dropProp() { this.detachFromHand(this.player.model); }

  // Even iets eten: het voorwerp gaat een paar keer naar de mond.
  // Na 'Stoppen' (missions.stop verhoogt actGen) mag eten of drinken niet verder lopen: anders gaat het
  // verhaal erna gewoon door met een nieuw gesprek, zonder stopknop. Dan blijft de belofte gewoon hangen.
  stopped(gen) {
    if (gen === this.actGen) return false;
    this.player.pose = null;
    this.dropProp();
    return true;
  }

  async eat(prop, seconds = 4) {
    if (this.mode === 'car') this.exitCar();
    const gen = this.actGen;
    this.holdProp(prop);
    this.player.lockedFor = true;
    this.player.pose = 'eat';
    await wait(seconds * 1000);
    if (this.stopped(gen)) return new Promise(() => {});
    this.player.pose = null;
    this.dropProp();
    this.player.lockedFor = false;
  }

  // Proost! Met een pils in de hand.
  async drinkPils() {
    if (this.mode === 'car') this.exitCar();
    const gen = this.actGen;
    const glass = makeFluitje();
    this.holdProp(glass);
    this.player.lockedFor = true;
    this.ui.toast('Proost!', 1200);
    this.sfx.play('clink');
    await wait(1300);
    if (this.stopped(gen)) return new Promise(() => {});
    this.player.pose = 'drink';
    this.sfx.play('gulp');
    await wait(1600);
    if (this.stopped(gen)) return new Promise(() => {});
    // glas leeg
    glass.userData.beer.scale.y = 0.2;
    glass.userData.beer.position.y = 0.035;
    glass.userData.foam.position.y = 0.06;
    glass.userData.foam.scale.y = 0.3;
    this.player.pose = null;
    await wait(900);
    if (this.stopped(gen)) return new Promise(() => {});
    this.dropProp();
    this.wobble = 25;
  }

  celebrate() {
    const p = this.player;
    this.fx.confetti(p.x, p.y + 2.2, p.z);
  }

  // ------------------------------------------------------------ hoofdlus

  // Hoofdlus met vangnet: een fout in één onderdeel mag het beeld nooit laten stilvallen.
  tick() {
    try {
      this.tickInner();
    } catch (e) {
      console.error('tick', e);
      statsError('tick', e?.message || e);
      try { this.render(); } catch { /* negeren */ }
    }
    this.guardState();
    this.checkBlack();
  }

  // ongeldige getallen (NaN) in speler of camera herstellen: die maken het hele beeld zwart
  guardState() {
    const p = this.player;
    const ok = (v) => Number.isFinite(v);
    if (ok(p.x) && ok(p.z) && ok(p.heading) && ok(p.y) && ok(p.speed)) {
      this.lastGood = { x: p.x, z: p.z, heading: p.heading };
    } else if (this.lastGood) {
      statsError('nan-speler', this.missions?.active?.id || this.lastDone || '');
      Object.assign(p, this.lastGood, { speed: 0, y: this.world.groundAt(this.lastGood.x, this.lastGood.z) });
    }
    // invoer en auto ook controleren (een ongeldige joystickwaarde was de bron van het zwarte beeld)
    const d = this.input.drive;
    if (!ok(d.x) || !ok(d.y)) { statsError('nan-invoer'); d.x = 0; d.y = 0; this.input.joy = null; }
    if (this.car && (!ok(this.car.heading) || !ok(this.car.speed) || !ok(this.car.x) || !ok(this.car.z) || !ok(this.car.steer))) {
      statsError('nan-auto', this.lastDone || '');
      Object.assign(this.car, { heading: ok(this.car.heading) ? this.car.heading : 0, speed: 0, steer: 0 });
      if (!ok(this.car.x) || !ok(this.car.z)) { this.car.x = p.x; this.car.z = p.z; }
    }
    if (!ok(this.camYaw)) { statsError('nan-camyaw'); this.camYaw = ok(p.heading) ? p.heading + Math.PI : 0; }
    if (!ok(this.camPitch)) this.camPitch = 0.24;
    const c = this.camera.position;
    if (!ok(c.x) || !ok(c.y) || !ok(c.z)) { statsError('nan-camera', this.missions?.active?.id || this.lastDone || ''); try { this.updateCamera(0, true); } catch { /* negeren */ } }
  }

  // Zwart beeld herkennen (een paar pixels, elke 10 s: uitlezen laat de videokaart even wachten en geeft dan een klein schokje). Eerst zelf herstellen, anders een herlaadknop tonen.
  checkBlack() {
    const now = performance.now();
    if (now - (this.blackCheckT || 0) < 10000 || document.visibilityState !== 'visible' || document.getElementById('hud').hidden) return;
    this.blackCheckT = now;
    const gl = this.renderer.getContext();
    if (gl.isContextLost()) { statsError('webgl-weg', this.lastDone || ''); showReloadBar('Het beeld is even weggevallen'); return; }
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4);
    let black = true;
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.75], [0.75, 0.75]]) {
      gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (px[0] || px[1] || px[2]) { black = false; break; }
    }
    if (!black) { this.blackCount = 0; return; }
    this.blackCount = (this.blackCount || 0) + 1;
    if (this.blackCount === 2) {
      statsError('zwart-beeld', `${this.lastDone || '-'} ${this.mode}${this.interior ? ' binnen' : ''}`);
      // herstelpoging: camera opnieuw achter de speler, en het beeld opnieuw opbouwen
      try {
        this.updateCamera(0, true);
        this.applyResolution();
      } catch { /* negeren */ }
    }
    if (this.blackCount === 5) { statsError('zwart-blijft', this.lastDone || ''); showReloadBar('Het beeld is zwart geworden'); }
  }

  tickInner() {
    const realDt = this.clock.getDelta();
    this.adaptQuality(realDt);
    const dt = Math.min(0.05, realDt);
    this.time += dt;
    this.input.update(dt);
    if (this.bigmap.open) { this.render(); return; }
    if (this.mode === 'car') this.updateCar(dt);
    else this.updatePlayer(dt);
    this.penalty?.update(dt);
    // een fout in een minispel mag nooit de hele game laten vastlopen
    try { this.minigame?.update(dt); } catch (e) { console.error('minispel', e); try { this.minigame?.stop?.(); } catch (e2) { /* negeren */ } this.minigame = null; this.player.lockedFor = false; }
    this.updateFollowers(dt);
    this.facades.fitness?.tick(dt, this);
    for (const u of this.updaters) u(dt);
    this.updateFleeing(dt);
    this.updateNpcs(dt);
    this.cars.updateTraffic(dt, this.mode === 'car' ? this.car : this.player);
    this.peds.update(dt, this.player, this.mode === 'car' ? Math.abs(this.car.speed) : this.player.speed);
    this.updateRace(dt);
    this.updateDestination(dt);
    this.updateDayNight();
    this.updateInteractions(dt);
    this.world.hardscape.update(dt);
    this.world.updateTrees(this.camera.position, this.time);
    this.world.updateVegetation(this.camera.position);
    this.fx.update(dt);
    this.interiors.update(dt);
    if (!this.interior) this.updateAmbience(dt); else if (this.amb) { this.amb.markt?.set(0); this.amb.water?.set(0); }
    this.updateCamera(dt);
    this.updateHud(dt);
    this.skyDome.update(this.camera, this.time);
    this.grass?.update(this.camera, this.time);
    this.updateDof();
    this.render(dt);
  }

  // Scherptediepte tijdens gesprekken: de achtergrond wordt zacht, zoals in een film. Niet in minispellen.
  updateDof() {
    if (!this.post) return;
    const talk = this.ui.dialogOpen && !this.minigame && !this.pov && !this.race && !this.penalty && this.started && !document.body.classList.contains('intro');
    const p = this.player;
    this.post.setDof(talk ? 1 : 0, talk ? Math.max(2.5, this.camera.position.distanceTo(this._dofV?.set(p.x, p.y + 1.5, p.z) || (this._dofV = new THREE.Vector3(p.x, p.y + 1.5, p.z)))) : 0);
  }

  // Omgevingsgeluid: geroezemoes op de Markt, kabbelend water bij de Gulp, meer vogels in het groen,
  // krekels 's avonds, glazen op de terrassen en de kerkklokken (bij de kerk en op elk heel uur).
  updateAmbience(dt) {
    const p = this.player, w = this.world, night = this.night > 0.5;
    if (this.sfx.ctx && !this.amb) this.amb = { markt: this.sfx.loop('markt'), water: this.sfx.loop('water'), t: 0, wob: 0 };
    // omgeving rond de speler, twee keer per seconde bekijken
    this.ambScan = (this.ambScan ?? 0) - dt;
    if (this.ambScan <= 0) {
      this.ambScan = 0.5;
      let water = 0, green = 0;
      for (let k = 0; k < 8; k++) for (const r of [8, 18]) {
        const a = (k / 8) * Math.PI * 2, c = w.classAt(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r);
        if (c === 'water') water++;
        if (c === 'gras' || c === 'bos' || c === 'struiken' || c === 'berm') green++;
      }
      this.ambWater = water; this.ambGreen = green;
      this.ambMarkt = this.marktSpot ? Math.hypot(p.x - this.marktSpot[0], p.z - this.marktSpot[1]) : 999;
    }
    if (!this.marktSpot) this.marktSpot = w.spotNear(20, 0);
    if (this.amb) {
      const busy = this.minigame || this.interior;
      this.amb.wob += (Math.random() - 0.5) * dt * 3; this.amb.wob = Math.max(-1, Math.min(1, this.amb.wob));
      const markt = busy ? 0 : (1 - THREE.MathUtils.smoothstep(this.ambMarkt ?? 999, 18, 70)) * (night ? 0.02 : 0.05);
      this.amb.markt?.set(markt, this.amb.wob);
      this.amb.water?.set(busy ? 0 : Math.min(1, (this.ambWater || 0) / 6) * 0.035);
      // glazen die klinken op de terrassen rond de Markt
      this.amb.t -= dt;
      if (markt > 0.02 && this.amb.t <= 0) { this.amb.t = 4 + Math.random() * 7; this.sfx.play('clink'); }
    }
    // vogels: vaker als er groen om je heen is; 's avonds krekels
    this.ambT = (this.ambT ?? 4) - dt;
    if (this.ambT <= 0) {
      const g = this.ambGreen || 0;
      this.ambT = g > 8 ? 1.2 + Math.random() * 2.5 : 3 + Math.random() * 6;
      if (this.mode !== 'car') this.sfx.play(night ? 'cricket' : 'chirp');
    }
    const ch = this.facades?.church;
    if (ch) {
      const d = Math.hypot(p.x - ch.x, p.z - ch.z);
      this.bellT = Math.max(0, (this.bellT || 0) - dt);
      if (d < 45 && this.bellT <= 0) { this.sfx.play('bells'); this.bellT = 120; }
      // op elk heel uur (volgens de klok van je apparaat) luiden de klokken, als je in het dorp bent
      const now = new Date();
      const hourKey = now.getHours();
      if (now.getMinutes() === 0 && this.lastHourBell !== hourKey && d < 400) {
        this.lastHourBell = hourKey;
        const n = (hourKey % 12) || 12;
        for (let i = 0; i < Math.min(n, 6); i++) setTimeout(() => this.sfx.play('bells'), i * 1600);
      }
    }
  }

  updateCar(dt) {
    const car = this.car, inp = this.input;
    const busy = this.ui.dialogOpen;
    const throttle = busy ? 0 : -inp.drive.y;
    const steer = busy ? 0 : inp.drive.x;
    this.cars.drive(car, dt, throttle, steer, inp.keys.has('Space'));
    this.sfx.engineUpdate(car.speed, throttle);
    const p = this.player;
    p.x = car.x; p.z = car.z; p.y = car.y; p.heading = car.heading; p.speed = Math.abs(car.speed);
    document.getElementById('speed-value').textContent = Math.round(Math.abs(car.speed) * 3.6);
  }

  updatePlayer(dt) {
    const p = this.player, inp = this.input;
    // vlak na 'Stoppen': niets mag je nog vastzetten, tenzij je zelf iets nieuws begint (gesprek, minispel)
    if (p.lockedFor && performance.now() < (this.unlockUntil || 0) && !this.ui.dialogOpen && !this.minigame && !this.race && !this.penalty && !this.missions?.talking && !this.dawning) p.lockedFor = false;
    // vangnet: sta je langer dan 3 s vast terwijl er niets gebeurt (geen gesprek, minispel, race, eten/drinken of overgang),
    // dan laat het spel je los. Zo kan een vergeten blokkade je nooit meer laten vastzitten.
    const idleLock = p.lockedFor && !this.ui.dialogOpen && !this.minigame && !this.race && !this.penalty && !this.missions?.talking && !this.dawning && !p.pose && !this.fading;
    this.lockIdle = idleLock ? (this.lockIdle || 0) + dt : 0;
    if (this.lockIdle > 3) { p.lockedFor = false; this.lockIdle = 0; statsError('vastgezet', this.missions?.active?.id || this.lastDone || ''); }
    const busy = this.ui.dialogOpen || p.lockedFor;
    if (inp.consumeVehicle() && !busy) {
      const opts = this.availableModes();
      if (opts.length > 1) this.setMode(opts[(opts.indexOf(this.mode) + 1) % opts.length]);
    }
    const mx = busy ? 0 : inp.move.x, my = busy ? 0 : inp.move.y;
    const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw), rightZ = -Math.sin(this.camYaw);
    const dx = fwdX * -my + rightX * mx, dz = fwdZ * -my + rightZ * mx;
    const mag = Math.hypot(dx, dz);

    if (p.boost > 0) p.boost -= dt;
    let maxSpeed = this.mode === 'bike' ? this.bikeSpeed : SPEED[this.mode];
    if (this.mode === 'walk' && (inp.sprint || p.boost > 0)) maxSpeed = SPEED.run;
    if (this.keg) maxSpeed = SPEED.keg;
    if (this.fragile) maxSpeed = Math.min(maxSpeed, SPEED.walk); // met vlaaien ren je niet
    // op de fiets en het skateboard gaat de joystick niet half: altijd volle snelheid
    if (this.mode === 'walk') {
      const want = mag > 0.05 ? maxSpeed * Math.min(1, mag * 1.2) : 0;
      p.speed += (want - p.speed) * Math.min(1, (want > p.speed ? 12 : 14) * dt);
      // na een paar pilsjes loop je niet meer helemaal recht
      if (this.drunk && mag > 0.05) p.heading += Math.sin(this.time * 1.7) * 0.012 * this.drunk;
      if (mag > 0.05) {
        let diff = Math.atan2(dx, dz) - p.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        p.heading += diff * Math.min(1, 12 * dt);
      }
    } else {
      // fiets en skateboard sturen zoals een voertuig: vooruit = trappen, links/rechts = sturen.
      // Zo stuurt de camera niet meer mee en slinger je niet meer heen en weer.
      const throttle = busy ? 0 : -inp.drive.y, steer = busy ? 0 : inp.drive.x;
      const want = throttle > 0 ? maxSpeed * throttle : 0;
      const rate = throttle < -0.2 ? 7 : want > p.speed ? (this.mode === 'bike' ? 3 : 2.6) : 1.6; // achteruit = remmen
      p.speed += (want - p.speed) * Math.min(1, rate * dt);
      const k = Math.min(1, p.speed / Math.max(1, maxSpeed));
      const turn = p.speed < 0.6 ? 1.4 : 2.5 - k * 1.2; // langzaam = scherp, hard = rustig
      p.heading -= steer * turn * dt;
      if (this.drunk) p.heading += Math.sin(this.time * 1.7) * 0.012 * this.drunk;
    }
    if (this.interior) {
      // binnen: muren en meubels, vlakke vloer
      const st = p.speed * dt;
      const [ix, iz, bumped] = this.interior.collide(p.x + Math.sin(p.heading) * st, p.z + Math.cos(p.heading) * st, 0.35);
      if (this.fragile && !busy && bumped && st > 0.01) {
        this.fragileCooldown = Math.max(0, (this.fragileCooldown || 0) - dt);
        if (this.fragileCooldown <= 0) { this.fragileCooldown = 1.6; this.fragile('bots'); }
      } else if (this.fragileCooldown) this.fragileCooldown = Math.max(0, this.fragileCooldown - dt);
      p.x = ix; p.z = iz; p.y = 0;
      if (p.speed > 0.5) { this.stepAcc = (this.stepAcc || 0) + p.speed * dt; if (this.stepAcc > 0.75) { this.stepAcc = 0; this.sfx.play('step'); } }
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.heading;
      p.model.userData.animate(dt, p.speed, p.pose || 'walk');
      return;
    }
    const here = this.world.heightAt(p.x, p.z);
    const ahead = this.world.heightAt(p.x + Math.sin(p.heading) * 1.5, p.z + Math.cos(p.heading) * 1.5);
    const slope = (ahead - here) / 1.5;
    const slopeFactor = THREE.MathUtils.clamp(1 - slope * (this.mode === 'walk' ? 1.2 : 2.2), 0.5, 1.35);
    const step = p.speed * slopeFactor * dt;
    let nx = p.x + Math.sin(p.heading) * step, nz = p.z + Math.cos(p.heading) * step;
    // water: niet doorheen, langs de rand glijden
    if (this.world.blocked(nx, nz)) {
      if (!this.world.blocked(nx, p.z)) nz = p.z;
      else if (!this.world.blocked(p.x, nz)) nx = p.x;
      else { nx = p.x; nz = p.z; p.speed *= 0.5; }
    }
    const [rx, rz] = this.world.resolve(nx, nz, this.mode === 'bike' ? 0.55 : 0.4);
    const wanted = Math.hypot(nx - p.x, nz - p.z), got = Math.hypot(rx - p.x, rz - p.z);
    if (wanted > 0.001 && got < wanted * 0.5 && this.mode !== 'walk') p.speed *= 0.85;
    // niet door geparkeerde auto's
    let fx = rx, fz = rz;
    // botsing met de echte vorm van de auto (een rechthoek), niet met een cirkel eromheen
    const pr = this.mode === 'bike' ? 0.5 : 0.35;
    for (const c of this.cars.cars) {
      if (c === this.car) continue;
      const dx0 = fx - c.x, dz0 = fz - c.z;
      if (dx0 * dx0 + dz0 * dz0 > 16) continue;
      const sn = Math.sin(c.heading), cs = Math.cos(c.heading);
      // naar de assen van de auto
      const lz = dx0 * sn + dz0 * cs, lx = dx0 * cs - dz0 * sn;
      const hl = c.t.L / 2 + pr, hw = c.t.W / 2 + pr;
      if (Math.abs(lz) < hl && Math.abs(lx) < hw) {
        // naar de dichtstbijzijnde zijkant duwen
        const pushZ = hl - Math.abs(lz), pushX = hw - Math.abs(lx);
        let nlx = lx, nlz = lz;
        if (pushX < pushZ) nlx = Math.sign(lx || 1) * hw; else nlz = Math.sign(lz || 1) * hl;
        fx = c.x + nlx * cs + nlz * sn;
        fz = c.z - nlx * sn + nlz * cs;
      }
    }
    // breekbare lading (vlaaien): rennen of ergens tegenaan lopen kost een vlaai
    if (this.fragile && !busy) {
      this.fragileCooldown = Math.max(0, (this.fragileCooldown || 0) - dt);
      const bumped = wanted > 0.02 && Math.hypot(fx - p.x, fz - p.z) < wanted * 0.4;
      if (this.fragileCooldown <= 0 && bumped) {
        this.fragileCooldown = 1.6;
        this.fragile('bots');
      }
    }
    p.x = fx; p.z = fz;
    p.y = this.world.groundAt(p.x, p.z);
    // voetstappen
    if (this.mode === 'walk' && p.speed > 0.5) {
      this.stepAcc = (this.stepAcc || 0) + p.speed * dt;
      if (this.stepAcc > (p.speed > 5 ? 1.0 : 0.75)) { this.stepAcc = 0; this.sfx.play('step'); }
    }
    p.group.position.set(p.x, p.y, p.z);
    p.group.rotation.y = p.heading;
    p.model.userData.animate(dt, p.speed, p.pose || (this.mode === 'walk' ? 'walk' : this.mode));
    if (this.mode !== 'walk') document.getElementById('speed-value').textContent = Math.round(p.speed * 3.6);
  }

  updateNpcs(dt) {
    const p = this.player;
    for (const n of this.npcs) {
      if (!n.group.visible) continue;
      if (n.marker.visible) { n.marker.rotation.y += dt * 2; n.marker.position.y = 3.2 + Math.sin(this.time * 2.5) * 0.12; }
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      if (d > 120) continue;
      if (n.mode === 'skate') {
        n.group.rotation.y = n.heading;
        n.model.userData.animate(dt, 6, 'skate');
        continue;
      }
      // vaste houding (zitten, filmen): niet naar de speler draaien
      if (n.pose) {
        n.group.rotation.y = n.heading;
        n.model.userData.animate(dt, 0, n.pose);
        continue;
      }
      if (d < 9 || n.lookAtPlayer) {
        let diff = Math.atan2(p.x - n.pos.x, p.z - n.pos.z) - n.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        n.heading += diff * Math.min(1, 5 * dt);
      }
      n.group.rotation.y = n.heading;
      n.model.userData.animate(dt, 0, n.marker.visible && d < 14 && d > 3 ? 'wave' : 'idle');
    }
  }

  updateInteractions(dt) {
    const p = this.player;
    for (const c of this.collectibles) {
      c.mesh.rotation.y += dt * 2.5;
      if (this.ui.dialogOpen || p.lockedFor) continue; // niet twee dingen tegelijk oppakken
      if (Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < (this.mode === 'car' ? 3.5 : 2.2)) { this.sfx.play('coin'); c.onCollect(); break; }
    }
    if (this.waypoint && Math.hypot(p.x - this.waypoint.x, p.z - this.waypoint.z) < 10) {
      this.scene.remove(this.waypointBeam);
      this.waypoint = null;
      this.ui.toast('Je bent er!', 1200);
    }
    this.syncTriggerMarkers(this.interior);
    // tijdens een minispel: geen 'Praat'-knop, alleen de knop die bij het spel hoort (of geen)
    if (this.minigame) {
      this.ui.prompt(null);
      const m = this.minigame;
      this.ui.setActionLabel(m.actionLabel !== undefined ? m.actionLabel : m.debug && 'label' in m.debug ? m.debug.label : null);
      return;
    }
    if (this.ui.dialogOpen || p.lockedFor || this.race || this.penalty) { if (!this.penalty) { this.ui.prompt(null); if (this.ui.dialogOpen) this.ui.setActionLabel(null); } return; }

    if (this.interior) {
      const room = this.interior;
      const exit = { ...room.door, r: 1.3, label: 'Naar buiten', action: () => this.exitInterior() };
      let best = null, bd = Infinity;
      for (const t of [...(room.activeTriggers || []), exit]) {
        const [tx, tz] = room.toWorld(t.x, t.z);
        const d = Math.hypot(p.x - tx, p.z - tz);
        if (d < (t.r || 1.6) && d < bd) { bd = d; best = t; }
      }
      this.ui.prompt(best ? best.label : null);
      this.ui.setActionLabel(best ? (best === exit ? 'Buiten' : 'Doe') : null);
      if (this.input.consumeAction() && best) best.action();
      return;
    }
    if (this.mode === 'car') {
      this.ui.prompt(Math.abs(this.car.speed) < 3 ? 'Uitstappen' : null);
      this.ui.setActionLabel('Uit');
      if (this.input.consumeAction()) this.exitCar();
      return;
    }
    // losse interactie (bijv. instappen in de SixSense-bus)
    const xi = this.extraInteract;
    if (xi && this.mode === 'walk' && Math.hypot(p.x - xi.x, p.z - xi.z) < xi.r) {
      this.ui.prompt(xi.label);
      this.ui.setActionLabel(xi.short);
      if (this.input.consumeAction()) xi.action();
      return;
    }
    // vlak na het sluiten van een gesprek: dezelfde tik/toets (of een ingedrukt gehouden E) start niet meteen weer een gesprek
    if (performance.now() - (this.ui.closedAt || 0) < 600 || performance.now() < (this.talkCooldownUntil || 0)) { this.input.consumeAction(); this.ui.prompt(null); this.ui.setActionLabel(null); return; }
    let near = null, nd = 4;
    for (const n of this.npcs) {
      if (!n.active || !n.enabled || !n.group.visible) continue;
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      if (d < nd) { near = n; nd = d; }
    }
    const car = !near ? this.cars.nearestCar(p.x, p.z, 1.8) : null;
    const jack = !near && !car && this.mode === 'walk' ? this.cars.nearestTraffic(p.x, p.z) : null;
    if (near) {
      // "De monteur" wordt "de monteur", maar een eigennaam als "De Razende Reporter" blijft staan
      const nm = near.name;
      const role = nm.startsWith('De ') && nm[3] === nm[3].toLowerCase();
      this.ui.prompt(`Praat met ${role ? 'de' + nm.slice(2) : nm}`);
      this.ui.setActionLabel('Praat');
    } else if (jack) {
      this.ui.prompt('Trek de chauffeur eruit!');
      this.ui.setActionLabel('Kapen');
    } else if (car) {
      this.ui.prompt(car.isTractor ? 'Instappen in de tractor' : car.isVolvo ? 'Instappen in de Volvo XC40' : car.isGolden ? 'Instappen in de gouden bolide' : 'Instappen');
      this.ui.setActionLabel('Auto');
    } else {
      this.ui.prompt(null);
      this.ui.setActionLabel(null);
    }
    if (this.input.consumeAction()) {
      if (near) { p.speed = 0; this.missions.talk(near); }
      else if (jack) this.hijackCar(jack);
      else if (car) this.enterCar(car);
    }
  }

  updateCamera(dt, instant = false) {
    const p = this.player;
    // POV-opname (TikTok bij Zheng): camera op een vaste plek in de keuken
    if (this.pov) {
      this.input.consumeLook();
      const k = instant || this.pov.snap ? 1 : Math.min(1, dt * 4);
      this.camera.position.lerp(this.pov.pos, k);
      this.povLook ||= this.pov.look.clone();
      this.povLook.lerp(this.pov.look, k);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.povLook);
      // een beetje handheld, en een schok bij een klap of plons
      if (!this.pov.steady) {
        this.camera.rotateZ(Math.sin(this.time * 1.7) * 0.008);
        this.camera.rotateX(Math.sin(this.time * 2.3) * 0.006);
      }
      if (this.pov.shake > 0) {
        const s = this.pov.shake;
        this.camera.rotateX((Math.random() - 0.5) * 0.06 * s);
        this.camera.rotateZ((Math.random() - 0.5) * 0.06 * s);
        this.pov.shake = Math.max(0, s - dt * 1.5);
      }
      return;
    }
    this.povLook = null;
    const look = this.input.consumeLook();
    if (look.x || look.y) {
      this.camYaw -= look.x * 0.006;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + look.y * 0.004, -0.1, 1.2);
      this.lastManualLook = this.time;
    }
    if (this.input.zoom) { // zoomen staat uit
      this.input.zoom = 0;
    }
    const inCar = this.mode === 'car';
    const followRate = inCar ? 3.5 : this.mode === 'walk' ? 1.2 : 2.4;
    if (!instant && p.speed > 1 && this.time - this.lastManualLook > (inCar ? 0.8 : 1.5) && !this.penalty) {
      const behind = p.heading + Math.PI;
      let diff = behind - this.camYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.camYaw += diff * Math.min(1, dt * followRate);
    }
    if (this.interior) return this.updateInteriorCamera(dt, instant);
    const dist = inCar ? this.camDist + 3.5 + Math.min(4, p.speed * 0.12) : this.camDist + (this.mode !== 'walk' ? 1.5 : 0);
    const pitch = inCar ? Math.max(0.12, this.camPitch * 0.7) : this.camPitch;
    const cx = p.x + Math.sin(this.camYaw) * Math.cos(pitch) * dist;
    const cz = p.z + Math.cos(this.camYaw) * Math.cos(pitch) * dist;
    let cy = p.y + (inCar ? 2.2 : 1.7) + Math.sin(pitch) * dist;
    cy = Math.max(cy, this.world.groundAt(cx, cz) + 0.6);
    // camera niet achter een muur: dichterbij komen als er een gebouw tussen zit
    const hy = p.y + 1.6;
    const occ = this.world.occlusion(p.x, hy, p.z, cx, cy, cz);
    let tx = cx, ty = cy, tz = cz;
    if (occ < 1) {
      const k = Math.max(inCar ? 0.45 : 0.15, occ - 0.08);
      tx = p.x + (cx - p.x) * k; ty = hy + (cy - hy) * k; tz = p.z + (cz - p.z) * k;
      // bij weinig ruimte de camera wat optillen, zoals in een racegame
      ty += (1 - k) * (inCar ? 4 : 1.5);
    }
    const targetPos = new THREE.Vector3(tx, ty, tz);
    if (instant) this.camera.position.copy(targetPos);
    else this.camera.position.lerp(targetPos, Math.min(1, dt * (occ < 1 ? 20 : inCar ? 8 : 10)));
    // sneller rijden = breder beeld
    const fov = 60 + (inCar ? Math.min(14, p.speed * 0.45) : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); }
    this.camera.up.set(0, 1, 0);
    // kijk een stukje voor de speler uit (in de kijkrichting van de camera), zodat je meer van de weg ziet
    const ahead = (inCar ? 6 + Math.min(6, p.speed * 0.2) : this.mode === 'walk' ? 3.5 : 5) * (occ < 1 ? 0.4 : 1);
    this.camera.lookAt(p.x - Math.sin(this.camYaw) * ahead, p.y + (inCar ? 1.3 : 1.6), p.z - Math.cos(this.camYaw) * ahead);
    if (this.wobble > 0) {
      this.wobble -= dt;
      this.camera.rotateZ(Math.sin(this.time * 1.3) * Math.min(1, this.wobble / 5) * 0.06 * (1 + (this.drunk || 0) * 0.6));
    }
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
    this.aimSun(p.x - Math.sin(this.camYaw) * Q.schaduwBereik * 0.45, p.y, p.z - Math.cos(this.camYaw) * Q.schaduwBereik * 0.45);
  }

  // De schaduwkaart ligt rond een punt een eind vóór de speler (in de kijkrichting), zodat het zichtbare deel
  // van de straat er helemaal in valt. Het middelpunt klikt vast op het raster van de schaduwkaart: dan
  // trillen de schaduwranden niet als je beweegt.
  aimSun(cx, cy, cz) {
    if (!this.sunDir) return;
    const d = this._sd || (this._sd = { z: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), c: new THREE.Vector3() });
    d.z.set(this.sunDir.x, Math.max(this.sunDir.y, 0.15), this.sunDir.z).normalize();
    d.x.set(0, 1, 0).cross(d.z).normalize();
    d.y.copy(d.z).cross(d.x);
    const texel = (Q.schaduwBereik * 2) / Q.schaduw;
    d.c.set(cx, cy, cz);
    const sx = d.c.dot(d.x), sy = d.c.dot(d.y);
    d.c.addScaledVector(d.x, Math.round(sx / texel) * texel - sx).addScaledVector(d.y, Math.round(sy / texel) * texel - sy);
    this.sun.target.position.copy(d.c);
    this.sun.position.copy(d.c).addScaledVector(d.z, 300);
  }

  // camera binnen: dichtbij en altijd binnen de muren
  updateInteriorCamera(dt, instant) {
    const p = this.player, r = this.interior;
    const dist = Math.min(this.camDist, 4);
    let cx = p.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    let cz = p.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    let cy = 1.6 + Math.sin(this.camPitch) * dist;
    cx = Math.max(r.ox - r.w / 2 + 0.3, Math.min(r.ox + r.w / 2 - 0.3, cx));
    cz = Math.max(r.oz - r.d / 2 + 0.3, Math.min(r.oz + r.d / 2 - 0.3, cz));
    cy = Math.min(r.h - 0.3, Math.max(0.6, cy));
    const t = new THREE.Vector3(cx, cy, cz);
    if (instant) this.camera.position.copy(t); else this.camera.position.lerp(t, Math.min(1, dt * 10));
    if (Math.abs(this.camera.fov - 60) > 0.05) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
    // kijk een stukje voor de speler uit, de ruimte in
    this.camera.lookAt(p.x - Math.sin(this.camYaw) * 2, 1.3, p.z - Math.cos(this.camYaw) * 2);
    if (this.wobble > 0) { this.wobble -= dt; this.camera.rotateZ(Math.sin(this.time * 1.3) * Math.min(1, this.wobble / 5) * 0.06 * (1 + (this.drunk || 0) * 0.6)); }
    this.sun.position.set(p.x + 50, 200, p.z + 50);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  updateHud(dt) {
    const p = this.player;
    this.hudTimer = (this.hudTimer || 0) - dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.4;
      if (this.interior) this.ui.setStreet(this.interior.name);
      else {
        const s = this.world.nearestStreet(p.x, p.z);
        this.ui.setStreet(s && s.dist < 40 ? s.name : '');
      }
    }
    this.updateLabels();
    const busy = this.missions.busy();
    document.getElementById('btn-stop').hidden = !busy;
    document.getElementById('dialog-stop').hidden = !busy;
    for (const b of this.beams || []) { if (b.parent) b.userData.pulse(this.time); else this.beams.delete(b); }
    const tgt = this.target ? { x: this.target.pos.x, z: this.target.pos.z } : this.waypoint;
    this.minimap.draw(p.x, p.z, p.heading, this.camYaw, tgt, this.missionPoints());
  }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function pointAlong(path, dist) {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (acc + seg >= dist) {
      const t = (dist - acc) / seg;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
    }
    acc += seg;
  }
  const [x, z] = path.at(-1);
  return { x, z, heading: 0 };
}

function makeLabel(text, { small = false } = {}) {
  const c = document.createElement('canvas');
  const fs = 56;
  const ctx = c.getContext('2d');
  ctx.font = `800 ${fs}px "Baloo 2", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 60;
  c.width = w; c.height = fs + 40;
  ctx.font = `800 ${fs}px "Baloo 2", sans-serif`;
  ctx.fillStyle = small ? 'rgba(27,36,48,0.78)' : 'rgba(255,250,240,0.95)';
  roundRect(ctx, 4, 4, w - 8, c.height - 8, 22);
  ctx.fill();
  if (!small) { ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 6; ctx.stroke(); }
  ctx.fillStyle = small ? '#ffffff' : '#1b2430';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 30, c.height / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true }));
  const h = small ? 0.45 : 2.6;
  s.scale.set((h * w) / c.height, h, 1);
  s.renderOrder = 10;
  s.layers.set(1); // naambordjes worden na de nabewerking getekend: altijd scherp en niet meegekleurd
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Raakt de telefoon de 3D-weergave kwijt (te weinig geheugen), dan wordt het beeld zwart.
// Laat dan een duidelijke melding zien; de voortgang is bewaard.
// Melding met herlaadknop (bijv. als de telefoon de 3D-weergave kwijtraakt). De voortgang is bewaard.
function showReloadBar(title) {
  if (document.querySelector('[data-id="ctx-lost"]')) return;
  const b = document.createElement('button');
  b.id = 'update-bar'; b.type = 'button';
  b.innerHTML = `<b>${title}</b><span>Tik om ${GAME_NAME} opnieuw te laden. Je missies blijven bewaard.</span>`;
  b.addEventListener('click', () => location.reload());
  b.dataset.id = 'ctx-lost';
  document.body.appendChild(b);
}

// Raakt de telefoon de 3D-weergave kwijt (te weinig geheugen), dan wordt het beeld zwart.
document.getElementById('scene').addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  statsError('webgl-weg-event', window.game?.lastDone || '');
  showReloadBar('Het beeld is even weggevallen');
});
// overige fouten ook anoniem meetellen
addEventListener('error', (e) => statsError('js', `${e.message} ${(e.filename || '').split('/').pop()}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => statsError('promise', e.reason?.message || e.reason));

const game = new Game();
document.fonts.ready.then(() => game.init()).catch((e) => {
  console.error(e);
  document.getElementById('loading-text').textContent = 'Er ging iets mis bij het laden: ' + e.message;
});
window.game = game;
startUpdateCheck();
