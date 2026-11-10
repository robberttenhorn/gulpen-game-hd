// Missies en interacties. Alles staat tegelijk open: kies zelf wat je wanneer doet.
//
// Echte personen laten we weg: in de zaken staan verzonnen rollen ("de monteur", "de kok").
// De Nachtburgemeester en de man bij het Mariabeeld zijn verzonnen figuren.

import { STORE } from './config.js';
import * as THREE from 'three';
import { makeCharacter, makeKeg, makeBike } from './character.js';
import { runTikTok, ORDERS, formatViews } from './tiktok.js';
import { startSlalom, startCatch, startGoat, startParking, startVogelschieten } from './skills.js';
import { setupMore, moreItems, moreHandlers, MORE_MISSION_OF } from './missions2.js';
import { statsMissions } from './stats.js';
import { inviteFinale } from './finale.js';
import { setupWest, setupGroeneweg, setupFitness, setupVerbouwing, setupPloegen, westItems, westHandlers, WEST_MISSION_OF } from './missions3.js';
import { setupMarkt, marktItems, marktHandlers, MARKT_MISSION_OF } from './missions4.js';
import { setupGeschiedenis, geschiedenisItems, geschiedenisHandlers, GESCHIEDENIS_MISSION_OF } from './missions5.js';
import { setupKnotwilg, knotwilgItems, knotwilgHandlers, KNOTWILG_MISSION_OF } from './knotwilg.js';
import { makeSuitcase, makeBankStatement, makeCart, makeVlaaiStack, makeBorrelplank, makeMeatPackage, makeFrikandel, makePuntzak, makeBroodje, makePackage, makeShadyPackage, makeVlaai, makeSnuifdoos, makeDeliveryBag, makeTvCamera, makePitchfork, makeWrench, makeRod, makeFluitje, makeStampPost, makeLantern } from './props.js';

const SAVE_KEY = STORE + 'missies-v2';

// Gulpense zin met Nederlandse vertaling. De Gulpense woorden komen uit de woordenlijst Gulpens
// van mijnwoordenboek.nl (door bezoekers samengesteld). Laat ze nakijken door een Gulpenaar.
const G = (text, nl) => ({ text, nl });

// Alle voortgang wissen: afgeronde missies en records. Daarna moet de game opnieuw laden, want veel in de wereld
// hangt af van wat er gedaan is (het skateboard, de afgestelde fiets, de geknotte wilgen).
export function resetProgress() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(STORE + 'records'); } catch { /* negeren */ }
}

export class Missions {
  constructor(game) {
    this.g = game;
    this.npcs = {};
    this.active = null;
    this.done = new Set();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) JSON.parse(raw).forEach((id) => this.done.add(id));
    } catch { /* geen opslag beschikbaar */ }
    // beste tijd of score per missie: { id: { v, unit, high } }
    this.best = {};
    try { this.best = JSON.parse(localStorage.getItem(STORE + 'records')) || {}; } catch { /* geen opslag */ }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify([...this.done])); } catch { /* negeren */ }
    try { localStorage.setItem(STORE + 'records', JSON.stringify(this.best)); } catch { /* negeren */ }
  }

  // record bijwerken; geeft 'nieuw' (eerste keer), 'record' (verbeterd) of null terug
  record(id, score) {
    let rec = score;
    if (!rec) {
      if (this.runStart?.id !== id) return null;
      rec = { v: Math.round((performance.now() - this.runStart.t) / 100) / 10, unit: 'tijd', high: false };
    }
    const old = this.best[id];
    if (old && old.unit === rec.unit && (rec.high ? rec.v <= old.v : rec.v >= old.v)) return null;
    this.best[id] = rec;
    return old && old.unit === rec.unit ? 'record' : 'nieuw';
  }

  bestLabel(id) {
    const b = this.best[id];
    if (!b) return '';
    if (b.unit === 'tijd') { const m = Math.floor(b.v / 60), sec = Math.round(b.v % 60); return m ? `${m}:${String(sec).padStart(2, '0')} min` : `${Math.round(b.v)} s`; }
    return `${b.v.toLocaleString('nl-NL')} ${b.unit}`;
  }

  // ------------------------------------------------------------ opzet

  setup() {
    const g = this.g;
    const poi = (id) => g.world.meta.pois.find((p) => p.id === id);
    const spotFor = (id, out = 2.4) => {
      const f = g.facades.frames[id];
      if (f) {
        const x = f.x + f.nx * out, z = f.z + f.nz * out;
        return g.world.resolve(x, z, 0.5);
      }
      return g.world.spotNear(...poi(id).pos);
    };

    const add = (key, name, spot, look) => { const npc = (this.npcs[key] = g.addNpc(name, spot, makeCharacter(look))); npc.look = look; return npc; };
    add('monteur', 'De monteur', spotFor('jefabels'), { shirt: 0x2b2b2b, pants: 0x2b3a4a, apron: 0x5a3b22, hair: 0x2a2a2a, hat: 'cap', hatColor: 0xff9800 });
    add('frituur', 'Mevrouw achter de toonbank', spotFor('anpiet'), { shirt: 0xffffff, pants: 0x333333, apron: 0xd32f2f, hair: 0x7a5230, hairStyle: 'long', female: true });
    add('salma', 'De kok van Salma', spotFor('salma'), { shirt: 0xffffff, pants: 0x222222, apron: 0x2e7d32, hair: 0x1a1a1a });
    add('zheng', 'Achter de toonbank', spotFor('zheng'), { shirt: 0xffffff, pants: 0x222222, apron: 0xb71c1c, hair: 0x111111 });
    // stagiair van Zheng met telefoon en ringlamp (TikTok-missie, verzonnen figuur)
    {
      const f = g.facades.frames.zheng;
      const sp = f ? g.world.resolve(f.x + f.nx * 2.8 + f.nz * 3.2, f.z + f.nz * 2.8 - f.nx * 3.2, 0.5) : spotFor('zheng', 4);
      add('stagiair', 'De stagiair van Zheng', sp, { shirt: 0x263238, pants: 0x1b1b1b, hair: 0x3e2723, hat: 'cap', hatColor: 0xc62828, sleeves: 'long' });
    }
    add('concierge', 'De conciërge', spotFor('sophianum'), { shirt: 0x546e7a, pants: 0x37474f, hair: 0x9e9e9e });
    add('brouwer', 'De brouwer', spotFor('brouwerij'), { shirt: 0x0f5132, pants: 0x2e2e2e, apron: 0x8d6e63, hair: 0x5d4037 });
    add('waard', 'De waard', spotFor('zwarteruiter'), { shirt: 0x111111, pants: 0x222222, apron: 0xf5f5f5, hair: 0x3e2723 });

    // trainer bij het voetbalveld
    const pitch = g.facades.pitch;
    const [tx, tz] = pitch ? g.facades.pitchToWorld(pitch.W / 2 + 2, pitch.L / 2 - 18) : poi('fcgulpen').pos;
    add('trainer', 'De trainer van FC Gulpen', g.world.resolve(tx, tz, 0.5), { shirt: 0x1a237e, pants: 0x1a237e, hair: 0x6d4c41, hat: 'cap', hatColor: 0xc62828 });

    // man in lange jas bij het Mariabeeld
    const [mx, mz] = poi('mariabeeld').pos;
    add('jas', 'Man in lange jas', g.world.resolve(mx + 5, mz + 4, 0.5), { shirt: 0x2a2a2a, pants: 0x1a1a1a, hair: 0x111111, hat: 'cap', hatColor: 0x111111, coat: 0x3a3226 });

    // skater bij de Ringweg
    this.racePath = g.world.streetPath('Ringweg');
    if (this.racePath.length) {
      const r = poi('ringweg').pos;
      const d0 = Math.hypot(this.racePath[0][0] - r[0], this.racePath[0][1] - r[1]);
      const d1 = Math.hypot(this.racePath.at(-1)[0] - r[0], this.racePath.at(-1)[1] - r[1]);
      if (d1 < d0) this.racePath.reverse();
      add('skater', 'Skater', g.world.resolve(this.racePath[0][0] + 3, this.racePath[0][1] + 3, 0.5),
        { shirt: 0x8e24aa, pants: 0x1a1a1a, hair: 0xffca28, hat: 'cap', hatColor: 0x111111 });
    }

    // Nachtburgemeester: alleen 's avonds bij de Markt
    add('nacht', 'De Nachtburgemeester', g.world.spotNear(14, 18),
      { shirt: 0x1a1a40, pants: 0x101020, hair: 0xdddddd, hat: 'tophat', sash: 0xc62828 });
    // ambtsketen los, zodat hij pas weer zichtbaar is als je hem hebt teruggebracht
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.95, roughness: 0.2, emissive: 0x3a2a00, emissiveIntensity: 0.3 });
    const keten = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 24, Math.PI), gold);
    arc.position.set(0, 1.47, 0.07); arc.rotation.set(0.35, 0, Math.PI);
    const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 16), gold);
    medal.rotation.x = Math.PI / 2 - 0.25; medal.position.set(0, 1.35, 0.14);
    keten.add(arc, medal);
    this.npcs.nacht.model.userData.parts.body.add(keten);
    keten.visible = this.done.has('nacht');
    this.keten = keten;

    // wielrenner onderaan de Gulperberg
    const climb = g.world.streetPath('Gulperbergweg');
    if (climb.length > 1) {
      const h0 = g.world.heightAt(...climb[0]), h1 = g.world.heightAt(...climb.at(-1));
      const foot = h0 < h1 ? climb[0] : climb.at(-1);
      add('wielrenner', 'Wielrenner', g.world.resolve(foot[0] + 3, foot[1] + 2, 0.5),
        { shirt: 0xfdd835, pants: 0x111111, hair: 0x5d4037, hat: 'helmet', hatColor: 0xe53935 });
    }
    // boer bij de tractor
    if (g.farm) add('boer', 'De boer', g.world.resolve(g.farm.x, g.farm.z, 0.5), { shirt: 0x2e5d8a, pants: 0x2b3a4a, hair: 0x8d6e63, hat: 'cap', hatColor: 0x2e7d32, shoes: 0x3e2723 });
    // visser aan de Gulp
    if (g.fishing) add('visser', 'Visser', g.world.resolve(g.fishing.x + 1.4, g.fishing.z + 1.4, 0.4), { shirt: 0x556b2f, pants: 0x3e3e30, hair: 0xbdbdbd, hat: 'cap', hatColor: 0x556b2f });
    // Prins Carnaval op de Markt, met witte hoed en pauwenveer
    add('carnaval', 'Prins Carnaval', g.world.spotNear(28, -6), { shirt: 0xe53935, pants: 0xfdd835, hair: 0x3b2a1a, hat: 'prins', sash: 0x43a047, coat: 0xe53935, chain: true });
    // organisator van de Nacht van Gulpen (alleen 's avonds)
    add('organisator', 'Organisator Nacht van Gulpen', g.world.spotNear(-14, 34), { shirt: 0xff9800, pants: 0x263238, hair: 0x4e342e, coat: 0xff9800 });

    // opa op een bankje bij de Markt
    // het (netjes geplaatste) bankje het dichtst bij de Markt
    const spots = (g.world.benchSpots || []).map((b) => ({ ...b, d: Math.hypot(b.x, b.z) })).filter((b) => b.d < 160).sort((a, b) => a.d - b.d);
    const benchSpot = spots[0] || null;
    const bench = benchSpot ? [benchSpot.x, benchSpot.z] : [10, 10];
    add('opa', 'Opa op het benkske', g.world.resolve(bench[0] + 1.2, bench[1] + 0.6, 0.4), { shirt: 0x6d5c4b, pants: 0x4a4a4a, hair: 0xe0e0e0, hat: 'cap', hatColor: 0x3e3e3e });

    // De Razende Reporter op de Markt, met microfoon
    const rep = add('reporter', 'De Razende Reporter', g.world.spotNear(-6, 14), { shirt: 0x263238, pants: 0x37474f, apron: 0xfdd835, hair: 0x5d4037, hat: 'cap', hatColor: 0xd32f2f });
    const mic = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9e9e9e, metalness: 0.6 }));
    head.position.y = 0.15;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.09), new THREE.MeshStandardMaterial({ color: 0xd32f2f }));
    flag.position.y = 0.07;
    mic.add(stick, head, flag);
    mic.position.set(0, -0.1, 0.03);
    rep.model.userData.parts.handR.add(mic);
    rep.model.userData.handProp = mic; // rechtop houden, arm naar voren
    rep.model.userData.holdR = true;

    // nieuwe winkels en Donny's
    const sp = (id, out = 2.4) => (g.facades.frames[id] ? spotFor(id, out) : null);
    if (sp('donnys')) add('donnys', "Gastheer van Donny's", sp('donnys', 3.2), { shirt: 0x2f3a2b, pants: 0x212121, apron: 0x6d4c41, hair: 0x3e2723 });
    if (sp('plus')) add('plus', 'Bedrijfsleider PLUS', sp('plus', 3), { shirt: 0x1b6e3a, pants: 0x263238, hair: 0x5d4037, apron: 0x1b6e3a });
    // klant met boodschappen op de parkeerplaats van de PLUS (inparkeren)
    {
      // de parkeerplaats van de PLUS: het parkeervlak met genoeg vakken dat het dichtst bij de winkel ligt
      const f = g.facades.frames.plus;
      const pp = f ? [f.x + f.nx * 3, f.z + f.nz * 3] : poi('plus').pos;
      const lots = new Map();
      for (const q of g.world.parkingSpots || []) { if (!lots.has(q.lot)) lots.set(q.lot, []); lots.get(q.lot).push(q); }
      let best = null;
      for (const [id, qs] of lots) {
        if (qs.length < 6) continue;
        const d = Math.min(...qs.map((q) => Math.hypot(q.x - pp[0], q.z - pp[1])));
        if (d < 120 && (!best || d < best.d)) best = { id, qs, d };
      }
      this.plusLot = best?.id ?? null;
      // de klant staat op de parkeerplaats zelf, bij het vak dat het dichtst bij de winkel ligt
      const edge = best ? best.qs.reduce((a, q) => (Math.hypot(q.x - pp[0], q.z - pp[1]) < Math.hypot(a.x - pp[0], a.z - pp[1]) ? q : a)) : null;
      const spot = edge ? g.world.resolve(edge.x + Math.cos(edge.heading) * 2.6, edge.z - Math.sin(edge.heading) * 2.6, 0.5) : g.world.spotNear(pp[0] + 10, pp[1] + 10);
      add('klant', 'Klant met boodschappen', spot, { shirt: 0x8e24aa, pants: 0x37474f, hair: 0x9e9e9e, female: true, hairStyle: 'bun', glasses: true, coat: 0x5d4037 });
    }
    // schutter bij het sportpark (vogelschieten); de vogelpaal staat op een open plek in de buurt
    {
      const fc = poi('fcgulpen').pos;
      let spotS = null, pole = null;
      for (let r = 40; r <= 90 && !pole; r += 10) for (let k = 0; k < 12 && !pole; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = fc[0] + Math.sin(a) * r, z = fc[1] + Math.cos(a) * r;
        if (g.world.insideBuilding(x, z) || g.world.blocked(x, z)) continue;
        const cls = g.world.classAt(x, z);
        if (cls !== 'gras' && cls !== 'berm' && cls !== 'onverhard') continue;
        pole = [x, z];
        spotS = g.world.resolve(x + 6, z + 6, 0.5);
      }
      if (pole) {
        add('schutter', 'De schutter', spotS, { shirt: 0x1b5e20, pants: 0x1b1b1b, hair: 0x5d4037, hat: 'tophat', sash: 0xfdd835, chain: true, sleeves: 'long', beard: true });
        this.polePos = pole;
      }
    }
    if (sp('paulissen')) add('bakker', 'De bakker', sp('paulissen'), { shirt: 0xffffff, pants: 0x9e9e9e, apron: 0xf3e6c8, hair: 0x8d6e63, hat: 'chef' });
    if (sp('meertens')) add('slager', 'De slager', sp('meertens'), { shirt: 0xffffff, pants: 0x37474f, apron: 0xb71c1c, hair: 0x424242 });

    // koster bij de Sint-Petruskerk
    if (sp('kerk')) add('koster', 'De koster', sp('kerk', 3), { shirt: 0x263238, pants: 0x212121, hair: 0xbdbdbd, coat: 0x212121 });

    // voorwerpen en houdingen die bij de mensen horen
    g.attachToHand(this.npcs.waard.model, makeFluitje());
    g.attachToHand(this.npcs.brouwer.model, makeFluitje());
    g.attachToHand(this.npcs.monteur.model, makeWrench(), { offset: [0, -0.7, 0.05] });
    if (this.npcs.boer) g.attachToHand(this.npcs.boer.model, makePitchfork(), { offset: [0, -0.7, 0.08] });
    if (this.npcs.visser) {
      g.attachToHand(this.npcs.visser.model, makeRod(), { offset: [0, -0.7, 0.05] });
      this.npcs.visser.model.userData.handProp.rotation.set(0.9, 0, 0);
      this.npcs.visser.model.userData.handProp = null; // hengel schuin houden, niet rechtop zetten
      if (g.fishing) this.npcs.visser.heading = Math.atan2(g.fishing.wx - g.fishing.x, g.fishing.wz - g.fishing.z);
    }
    if (this.npcs.organisator) g.attachToHand(this.npcs.organisator.model, makeLantern(true), { offset: [0, -0.75, 0.05] });
    // opa zit op het bankje
    if (this.npcs.opa) {
      const o = this.npcs.opa;
      // midden op de zitting, met de rug naar de leuning
      const yaw = benchSpot ? benchSpot.yaw : 0;
      const bx = bench[0] + Math.sin(yaw) * 0.05, bz = bench[1] + Math.cos(yaw) * 0.05;
      o.pos.set(bx, g.world.groundAt(bx, bz), bz);
      o.heading = benchSpot ? yaw : (() => { const st = g.world.nearestStreet(bench[0], bench[1]); return st ? Math.atan2(st.x - bench[0], st.z - bench[1]) : 0; })();
      o.pose = 'sit';
      o.model.position.y = 0.19; // op de zitting van het bankje, niet erdoorheen
    }
    // geen dorpsbewoner op het bankje van opa
    if (g.peds?.sitters && this.npcs.opa) g.peds.sitters = g.peds.sitters.filter((q) => { if (Math.hypot(q.x - this.npcs.opa.pos.x, q.z - this.npcs.opa.pos.z) > 1.6) return true; g.scene.remove(q.model); return false; });
    // cameraman naast De Razende Reporter
    const r = this.npcs.reporter;
    const cam = g.addNpc('Cameraman', g.world.resolve(r.pos.x + 3.4, r.pos.z + 1.6, 0.4), makeCharacter({ shirt: 0x424242, pants: 0x212121, hair: 0x111111, hat: 'cap', hatColor: 0x424242 }));
    cam.group.children.forEach((c) => { if (c.isSprite) c.visible = false; }); // geen naambordje
    const tv = makeTvCamera();
    tv.position.set(0.2, 1.6, 0.1);
    cam.model.userData.parts.body.add(tv);
    cam.pose = 'camera';
    cam.heading = Math.atan2(r.pos.x - cam.pos.x, r.pos.z - cam.pos.z);
    cam.marker.visible = false;
    this.cameraman = cam;

    // nieuwe missies (missions2.js)
    setupMore(this, g, add);
    Object.assign(this.extra, moreHandlers);
    // bloemenwijk (missions3.js)
    setupWest(this, g, add);
    setupGroeneweg(this, g, add);
    setupFitness(this, g, add);
    setupVerbouwing(this, g, add);
    setupPloegen(this, g, add);
    Object.assign(this.extra, westHandlers);
    // rond de Markt (missions4.js)
    setupMarkt(this, g, add);
    Object.assign(this.extra, marktHandlers);
    // geschiedenis en feesten (missions5.js)
    setupGeschiedenis(this, g, add);
    Object.assign(this.extra, geschiedenisHandlers);
    // achtertuin van Ringweg 38: knotwilgen knotten (knotwilg.js)
    setupKnotwilg(this, g, add);
    Object.assign(this.extra, knotwilgHandlers);

    Object.values(this.npcs).forEach((n) => { n.active = true; });
    this.refresh();
  }

  // Lijst voor de grote kaart en de markeringen.
  list() {
    const g = this.g;
    const n = this.npcs;
    const items = [
      { id: 'fiets', npc: n.monteur, title: 'Fiets afstellen', place: 'Jef Abels Bikes', desc: 'Laat Jef Abels je fiets afstellen en rij een slalom tussen de pionnen.' },
      { id: 'frikandel', npc: n.frituur, title: 'Frikandel super', place: 'Friture An + Piet', desc: 'Alleen contant! Zoek eerst wat muntgeld bij elkaar.' },
      { id: 'salma', npc: n.salma, title: 'Bezorgen voor Salma', place: 'Grillroom Pizzeria Salma', desc: 'Bezorg twee bestellingen in de buurt op tijd. Beloning: een Broodje Gulpen.' },
      { id: 'zheng', npc: n.zheng, title: 'Friet bij Zheng', place: 'Cafetaria Zheng', desc: 'Een frietje halen. Maar met welke saus?' },
      { id: 'tiktok', npc: n.stagiair, title: 'Viraal met een frietje', place: 'Cafetaria Zheng', desc: 'Film binnen een POV-filmpje van het klaarmaken van een bestelling. Zo veel mogelijk views op TikTok!' },
      { id: 'skateboard', npc: n.concierge, title: 'In beslag genomen', place: 'Sophianum', desc: 'Haal je skateboard op bij de conciërge. Eerst een overhoring.' },
      { id: 'race', npc: n.skater, title: 'Ringweg Race', place: 'Ringweg', desc: 'Skatewedstrijd over de Ringweg. Je hebt je skateboard nodig.' },
      { id: 'vat', npc: n.brouwer, title: 'Vers van \'t vat', place: 'Gulpener Bierbrouwerij', desc: 'Breng een vat naar Herberg De Zwarte Ruiter.' },
      { id: 'pils', npc: n.waard, title: 'Pilsje', place: 'Herberg De Zwarte Ruiter', desc: 'Help de waard met een overvol dienblad en drink daarna een pilsje. Daarna wordt het avond (of weer ochtend).', repeat: true },
      { id: 'penalty', npc: n.trainer, title: 'Penalty\'s bij FC Gulpen', place: 'Sportpark FC Gulpen', desc: 'Scoor er minstens 3 van de 5.' },
      { id: 'deal', npc: n.jas, title: 'Een schimmig zaakje', place: 'Mariabeeld, Gulperberg', desc: 'Iemand op de Gulperberg heeft een pakketje. Niet te veel vragen stellen.' },
      { id: 'nacht', npc: n.nacht, title: 'De Nachtburgemeester', place: 'Markt (alleen \'s avonds)', desc: 'De Nachtburgemeester is iets kwijt.', nightOnly: true },
      { id: 'armenfonds', npc: n.koster, title: 'Het verdwenen armenfonds', place: 'Sint-Petruskerk', desc: 'Het offerblok is leeg. Zoek de sporen van deken Haffmans door het dorp.' },
      { id: 'borrelplank', npc: n.donnys, title: 'De Gezellerie-borrelplank', place: "Donny's Gezellerie", desc: 'Haal worst en vleeswaren bij Slagerij Bormans voor een borrelplank, snel!' },
      { id: 'karretjes', npc: n.plus, title: 'Karretjes-trein', place: 'PLUS supermarkt', desc: 'Winkelwagentjes zijn door het dorp gezworven. Breng ze in één lange trein terug.' },
      { id: 'vlaaien', npc: n.bakker, title: 'Vlaaien voor na de mis', place: 'Bakkerij Paulissen', desc: 'Breng drie vlaaien naar de Sint-Petruskerk zonder ergens tegenaan te lopen.' },
      { id: 'slager', npc: n.slager, title: 'Bestelling in het plat', place: 'De Eetwinkel van het Heuvelland', desc: 'Een klant bestelde in het Gulpens. Pak de juiste spullen en bezorg ze.' },
      { id: 'hubertus', npc: n.reporter, title: 'Kroegentocht op de Hubertusmarkt', place: 'Markt (De Razende Reporter)', desc: 'Haal verhalen op in vier cafés rond de Markt en geef daarna een live interview.' },
      { id: 'plat', npc: n.opa, title: 'Plat kalle', place: 'Benkske bij de Markt', desc: 'Opa overhoort je in het Gulpens. Weet jij wat de woorden betekenen?' },
      { id: 'gulperberg', npc: n.wielrenner, title: 'Gulperberg op!', place: 'Voet van de Gulperberg', desc: 'Fiets zo snel mogelijk naar het Mariabeeld op de top.' },
      { id: 'geit', npc: n.boer, title: 'De ontsnapte geit', place: 'Boerenland aan de rand van het dorp', desc: 'De geit van de boer is ontsnapt. Ren hem achterna en tik hem drie keer aan.' },
      { id: 'inparkeren', npc: n.klant, title: 'Inparkeren bij de PLUS', place: 'Parkeerplaats PLUS', desc: 'Vijf keer netjes inparkeren in twee minuten. Botsen kost tijd.' },
      { id: 'vogelschieten', npc: n.schutter, title: 'Vogelschieten', place: 'Bij het sportpark', desc: 'Schiet bij de schutterij de houten vogel stukje voor stukje van de paal.' },
      { id: 'vissen', npc: n.visser, title: 'Vissen in de Gulp', place: 'Oever van de Gulp', desc: 'Vang drie vissen. Tik pas als de dobber onder gaat.' },
      { id: 'polonaise', npc: n.carnaval, title: 'Op tijd voor de optocht', place: 'Markt', desc: 'Prins Carnaval moet klumpkes sjmiete in de optocht. Haal zijn gevolg op, dan kan de optocht beginnen.' },
      { id: 'nachtvangulpen', npc: n.organisator, title: 'Nacht van Gulpen', place: 'Bij de Markt (alleen \'s avonds)', desc: 'Een proefrondje wandelen langs de stempelposten.', nightOnly: true },
    ].filter((m) => m.npc).concat(moreItems(n), westItems(n), marktItems(n), geschiedenisItems(n), knotwilgItems(n));
    for (const m of items) { m.state = this.active?.id === m.id ? 'actief' : this.done.has(m.id) && !m.repeat ? 'klaar' : 'open'; m.best = this.bestLabel(m.id); }
    void g;
    return items;
  }

  refresh() {
    const g = this.g;
    const night = g.night > 0.5;
    for (const k of ['nacht', 'organisator']) {
      this.npcs[k].group.visible = night;
      this.npcs[k].enabled = night;
    }
    if (this.active) {
      g.ui.setQuest(this.active.title, this.active.desc, this.active.progress || '');
      g.ui.setTally(null);
    } else {
      g.ui.setQuest(null); // vrij rondlopen: geen tekstblok, wel de teller
      // tel alleen missies die in de lijst op de kaart staan (oude opgeslagen namen tellen niet mee)
      const items = this.list();
      const doneN = items.filter((m) => this.done.has(m.id)).length;
      g.ui.setTally(doneN, items.length);
      // alles af? dan een uitnodiging voor het feest op de Markt (één keer per sessie, tot de finale gespeeld is)
      if (items.length && doneN >= items.length && !this.done.has('finale') && !this.finaleInvited) {
        this.finaleInvited = true;
        setTimeout(() => { if (!this.active && !g.ui.dialogOpen) inviteFinale(this, g); else this.finaleInvited = false; }, 3500);
      }
    }
    g.updateMarkers();
  }

  setActive(id, title, desc, progress = '') {
    // een gewone missie start in het donker: eerst weer dag (niet bij de nachtmissies, het pilsje of de finale)
    if (this.g.night > 0.5 && !['nacht', 'nachtvangulpen', 'bierfeesten', 'pils', 'finale'].includes(id) && !this.g.dawning) this.g.dawn();
    // tijd meten vanaf de start van de missie (opnieuw zetten tijdens dezelfde missie telt niet)
    if (this.runStart?.id !== id) { this.runStart = { id, t: performance.now() }; this.modeBefore = this.g.mode; }
    this.active = { id, title, desc, progress };
    this.refresh();
  }

  progress(text) {
    if (this.active) this.active.progress = text;
    this.g.ui.setProgress(text);
  }

  complete(id, toast, score = null) {
    this.done.add(id);
    this.g.lastDone = id; // voor foutmeldingen: welke missie net klaar was
    if (['nacht', 'nachtvangulpen', 'bierfeesten'].includes(id)) this.g.morningAsap = true; // avondmissie gehaald: weer ochtend
    const rec = id === 'finale' ? null : this.record(id, score);
    this.runStart = null;
    if (rec === 'record') toast = `${toast || 'Missie geslaagd!'} Nieuw record: ${this.bestLabel(id)}!`;
    this.save();
    statsMissions(this.list().filter((m) => this.done.has(m.id)).length);
    this.active?.cleanup?.();
    this.active = null;
    this.g.setTarget(null);
    this.g.ui.toast(toast || 'Missie geslaagd!', 3000);
    this.g.sfx?.play('success');
    this.g.celebrate();
    this.refresh();
  }

  fail(text) {
    if (['nacht', 'nachtvangulpen', 'bierfeesten'].includes(this.active?.id)) this.g.morningAsap = true; // avondmissie mislukt: weer ochtend
    this.runStart = null;
    this.active?.cleanup?.();
    this.active = null;
    if (this.g.interior) this.g.exitInterior();
    this.g.setTarget(null);
    this.g.collectibles = [];
    this.g.clearDestination();
    this.g.ui.toast(text, 3200);
    this.g.sfx?.play('fail');
    this.refresh();
  }

  // ------------------------------------------------------------ praten

  async talk(npc) {
    const g = this.g, ui = g.ui, N = npc.name, n = this.npcs;
    g.player.lockedFor = true;
    const token = (this.talkToken = (this.talkToken || 0) + 1);
    this.talking = true;
    npc.lookAtPlayer = true;
    try {
      // bezig met een andere klus?
      const missionOf = { monteur: 'fiets', frituur: 'frikandel', salma: 'salma', zheng: 'zheng', stagiair: 'tiktok', concierge: 'skateboard', skater: 'race', brouwer: 'vat', waard: 'pils', trainer: 'penalty', jas: 'deal', nacht: 'nacht', wielrenner: 'gulperberg', boer: 'geit', klant: 'inparkeren', schutter: 'vogelschieten', visser: 'vissen', carnaval: 'polonaise', organisator: 'nachtvangulpen', opa: 'plat', reporter: 'hubertus', donnys: 'borrelplank', koster: 'armenfonds', plus: 'karretjes', bakker: 'vlaaien', slager: 'slager', ...MORE_MISSION_OF, ...WEST_MISSION_OF, ...MARKT_MISSION_OF, ...GESCHIEDENIS_MISSION_OF, ...KNOTWILG_MISSION_OF };
      const key = Object.keys(n).find((k) => n[k] === npc);
      const mid = missionOf[key];
      const deliverKeg = key === 'waard' && this.active?.id === 'vat';
      const ownActive = this.active?.id === mid;
      if (this.active && !ownActive && !deliverKeg) {
        const a = await ui.dialog(N, [`Je bent nog bezig met "${this.active.title}". Wil je daarmee stoppen?`], ['Nee, ik ga verder', 'Ja, stoppen']);
        if (a !== 1) return;
        this.abort();
      }
      await (this.handlers[key] || this.extra[key])?.call(this, npc, N, ui, g);
    } finally {
      if (this.talkToken === token) this.talking = false;
      g.player.lockedFor = false;
      npc.lookAtPlayer = false;
      g.talkCooldownUntil = performance.now() + 600;
      g.input.actionPressed = false;
    }
  }

  // Iets aan de hand dat je kunt stoppen?
  busy() {
    const g = this.g;
    return !!(this.active || this.talking || g.race || g.penalty || g.minigame || g.interior);
  }

  // Altijd een klus kunnen stoppen, ook midden in een gesprek, minigame of binnen.
  stop() {
    const g = this.g;
    if (!this.busy()) return;
    g.ui.cancelDialogs();
    this.talking = false;
    this.talkToken = (this.talkToken || 0) + 1;
    const modeBefore = this.modeBefore;
    this.abort(); // gaat ook naar buiten als je binnen bent
    // terug naar hoe je de missie begon (de proefrit zet je bijvoorbeeld op de fiets)
    if (g.mode !== 'car' && modeBefore && modeBefore !== 'car' && g.mode !== modeBefore && g.availableModes().includes(modeBefore)) g.setMode(modeBefore);
    g.player.speed = 0;
    { const [rx, rz] = g.world.resolve(g.player.x, g.player.z, 0.5); g.player.x = rx; g.player.z = rz; }
    // alles wat de speler nog vasthoudt of aan zich heeft opruimen
    g.fragile = null;
    g.dropProp();
    g.dropKeg();
    g.stopPolonaise();
    g.player.pose = null;
    g.player.lockedFor = false;
    g.actGen = (g.actGen || 0) + 1; // eten/drinken dat nog loopt, stopt nu ook
    g.unlockUntil = performance.now() + 5000; // wat nog naloopt (drinken, een overgang) mag je niet opnieuw vastzetten
    g.dropProp?.();
    g.drunk = 0;
    g.wobble = 0;
    g.ui.timer(null);
    document.body.classList.remove('live');
    document.getElementById('live-badge').hidden = true;
    g.npcs.forEach((n) => { n.lookAtPlayer = false; });
    g.ui.toast('Missie gestopt', 1800);
    this.refresh();
  }

  abort() {
    const g = this.g;
    if (['nacht', 'nachtvangulpen', 'bierfeesten'].includes(this.active?.id)) g.morningAsap = true; // avondmissie gestopt: weer ochtend
    this.runStart = null;
    this.active?.cleanup?.();
    if (g.interior) g.exitInterior();
    g.collectibles.forEach((c) => c.cleanup?.());
    if (this.active?.id === 'vat') g.dropKeg();
    if (g.race) g.endRace(false, true);
    if (g.penalty) g.penalty.stop();
    if (g.minigame) g.minigame.stop();
    g.stopPolonaise();
    if (this.grain) { this.grain.parent?.remove(this.grain); this.grain = null; }
    g.collectibles.forEach((c) => c.cleanup?.());
    g.collectibles = [];
    g.clearDestination();
    g.setTarget(null);
    this.active = null;
    this.refresh();
  }

  handlers = {
    async monteur(npc, N, ui, g) {
      if (this.done.has('fiets') && g.bikeTuned) {
        // al gedaan: je mag de proefrit gewoon nog eens rijden
        const again = await ui.dialog(N, ['Rijdt hij lekker? Zin in nog een rondje door de pionnen? Kijken of je je tijd kunt verbeteren.'], ['Nog een proefrit!', 'Nee, ik rij verder']);
        if (again !== 0) return;
      }
      if (!g.bikeTuned) {
        await ui.dialog(N, [
          G('Joa? Ee blutsj in de fiets?', 'Ja? Een deuk in de fiets?'),
          'Laat eens kijken... Nee, geen deuk. Maar die fiets loopt wel heel stroef.',
          'Banden te zacht, ketting droog, remmen slepen. Daar kom je de Gulperberg niet mee op.',
          'Momentje... oppompen, smeren, afstellen...',
          G('Veâdig! Hea is aaf.', 'Klaar! Hij is klaar.'),
        ]);
        g.tuneBike();
        g.bikeTuned = true;
      }
      const a = await ui.dialog(N, [
        'Nu de proefrit. Voor de zaak staan zes poortjes, elk met twee pionnen en een oranje doek erboven.',
        'Rij zigzaggend tussen de twee pionnen van elk poortje door. De groene pijl wijst het volgende poortje aan. Daarna over de finish.',
        'Binnen 30 seconden. Een poortje missen kost 3 strafseconden, een pion omrijden 1. Lukt dat, dan is hij perfect afgesteld!',
      ], ['Op de fiets!', 'Straks']);
      if (a !== 0) return;
      this.setActive('fiets', 'Proefrit bij Jef Abels', 'Rij tussen de twee pionnen van elk poortje door (volg de groene pijl) en dan over de finish. Binnen 30 s, strafseconden tellen mee: poortje gemist +3, pion om +1.', 'Poortjes 0 / 6 goed');
      const f = g.facades.frames.jefabels;
      const r = f ? await startSlalom(g, f) : { total: 10, penalty: 0 };
      if (!r || this.active?.id !== 'fiets') return;
      if (r.total < Infinity) {
        await ui.dialog(N, [`${r.total.toFixed(1)} seconden${r.penalty ? `, inclusief ${r.penalty} strafseconden` : ''}! ${r.total < 18 ? 'Jij kunt zo de Amstel Gold Race in.' : 'Netjes gereden.'}`, 'Hij rijdt als een zonnetje. Veel plezier ermee!']);
        this.complete('fiets', 'Fiets afgesteld en proefrit gehaald!');
      } else {
        const why = r.penalty >= 9
          ? `Je had al ${r.penalty} strafseconden. Je moet tússen de twee pionnen van elk poortje door, niet eroverheen of erlangs. Volg de groene pijl!`
          : 'De 30 seconden waren op voordat je over de finish was. De fiets is wel afgesteld hoor, het ligt aan de berijder.';
        await ui.dialog(N, r.off ? ['Hé, de proefrit is hier, niet naar Valkenburg!'] : [`${r.good ?? 0} van de 6 poortjes goed. ${why}`, 'Probeer het nog eens!']);
        this.fail('Proefrit niet gehaald. Praat nog eens met Jef Abels.');
      }
    },

    async frituur(npc, N, ui, g) {
      if (this.active?.id === 'frikandel' && this.active.coinsDone) {
        await ui.dialog(N, [G('Hoi sjat!', 'Hoi schat!'), 'Ah, met gepast geld zelfs. Mooi zo!', 'Eén frikandel super, alsjeblieft.', 'Lekker jong!']);
        await g.eat(makeFrikandel(), 4);
        g.player.boost = 60;
        this.complete('frikandel', 'Frikandel super! Je kunt een minuut lang sprinten.');
        return;
      }
      if (this.active?.id === 'frikandel') {
        await ui.dialog(N, [G('Hoi sjat!', 'Hoi schat!'), G('Nog geen muntgeld gevonden? Kijk eens in je tes, of anders rond in de buurt.', 'Nog geen muntgeld gevonden? Kijk eens in je broekzak, of anders rond in de buurt.')]);
        return;
      }
      await ui.dialog(N, [
        G('Hoi sjat!', 'Hoi schat!'),
        G('Enne? Wat mag het zijn?', 'En? Wat mag het zijn?'),
        { name: 'Jij', text: 'Een frikandel super graag. Kan ik pinnen?' },
        'Pinnen? Nee hoor, hier is het alleen contant. Al sinds jaar en dag!',
      ]);
      this.setActive('frikandel', 'Alleen contant', 'Zoek losse munten in de buurt. Ze staan als gele punten op de kaart.', '0 / 4 munten');
      this.spawnCoins();
    },

    async salma(npc, N, ui, g) {
      if (this.active?.id === 'salma') {
        await ui.dialog(N, ['Schiet op, de bestelling wordt koud!']);
        return;
      }
      const a = await ui.dialog(N, [
        'Hé, kun jij me helpen? Mijn bezorger is ziek en de bestellingen stapelen zich op.',
        'Twee adressen hier in de buurt, elk binnen de tijd. Pak gerust je fiets. Doe je mee?',
      ], ['Ik ga ervoor', 'Nu even niet']);
      if (a !== 0) return;
      this.setActive('salma', 'Bezorgen voor Salma', 'Breng de bestelling naar het adres. Volg de lichtbundel.', 'Bestelling 1 / 2');
      // bezorgtas op de rug
      const bag = makeDeliveryBag();
      bag.position.set(0, 1.3, -0.32);
      g.player.group.add(bag);
      this.active.cleanup = () => g.player.group.remove(bag);
      this.deliveries('salma', 2, async () => {
        g.player.group.remove(bag);
        await ui.dialog(N, ['Top gedaan! Hier, een Broodje Gulpen van het huis: döner, kaas en pittige saus.', G('Smakelijk eëte!', 'Smakelijk eten!')]);
        await g.eat(makeBroodje(), 4);
        this.complete('salma', 'Broodje Gulpen verdiend!');
      }, 1, [100, 300]);
    },

    async zheng(npc, N, ui, g) {
      const a = await ui.dialog(N, [G('Joa? Welkom in de frieteboet!', 'Ja? Welkom in de friture!'), 'Wat mag het zijn?'], ['Friet met mayo', 'Frietje oorlog', 'Friet speciaal', 'Gewoon zonder']);
      const reply = [
        'Friet met mayo, de klassieker. Komt eraan!',
        'Frietje oorlog: mayo, pindasaus en uitjes. Jij durft!',
        'Speciaal: mayo, curry en uitjes. Goede keuze.',
        G('Zonder saus? Echt? Dan had je net zo goed naar de McDrek kunnen gaan. Nou, jij je zin.', 'Zonder saus? Echt? Dan had je net zo goed naar de McDonald\'s kunnen gaan. Nou, jij je zin.'),
      ][a];
      await ui.dialog(N, [reply, 'Alsjeblieft, vers uit het vet. Smakelijk eten!']);
      await g.eat(makePuntzak(), 4);
      g.player.boost = 30;
      this.complete('zheng', 'Friet bij Zheng!');
    },

    async concierge(npc, N, ui, g) {
      const replay = g.vehicles.skate;
      if (replay) {
        // skateboard heb je al, maar de overhoring mag je nog eens doen
        const again = await ui.dialog(N, ['Je hebt je skateboard toch al? Of kom je nog eens overhoord worden? Goed voor je cijfers.'], ['Overhoor me maar!', 'Nee, dank je']);
        if (again !== 0) return;
        this.setActive('skateboard', 'In beslag genomen', 'Beantwoord de vragen van de conciërge goed.', '');
      } else await ui.dialog(N, [
        G('Neet skate bie de sjoel!', 'Niet skaten bij school!'),
        'Zo, kom je je skateboard ophalen? Op het schoolplein wordt niet geskatet, dat weet je.',
        'Goed, je krijgt hem terug. Maar eerst een overhoring. Je zit tenslotte op het Sophianum!',
      ]);
      const qs = [
        ['Hoe hoog is de top van de Gulperberg ongeveer?', ['157 meter', '322 meter', '96 meter'], 0],
        ['In welke rivier stroomt de Gulp uit, net ten noorden van het dorp?', ['De Maas', 'De Geul', 'De Worm'], 1],
        ['Sinds wanneer wordt er bier gebrouwen door de Gulpener brouwerij?', ['1925', '1875', '1825'], 2],
      ];
      for (const [q, opts, good] of qs) {
        let ok = false;
        while (!ok) {
          ok = (await ui.dialog(N, [q], opts)) === good;
          if (!ok) await ui.dialog(N, ['Fout! Denk nog maar eens goed na.']);
        }
        await ui.dialog(N, ['Goed zo.']);
      }
      await ui.dialog(N, [replay ? 'Netjes, weer alles goed. Jij mag de volgende overhoring zelf maken.' : 'Netjes, alles goed. Hier is je skateboard. En niet op het schoolplein!']);
      if (!replay) g.unlockVehicle('skate');
      this.complete('skateboard', replay ? 'Overhoring weer gehaald!' : 'Skateboard terug!');
    },

    async skater(npc, N, ui, g) {
      if (!g.vehicles.skate) {
        await ui.dialog(N, ['Zonder skateboard ga je het niet redden, maat. Volgens mij ligt die van jou nog bij de conciërge van het Sophianum.']);
        return;
      }
      const a = await ui.dialog(N, [
        'Hé, nieuw gezicht op de Ringweg! Wij skaten hier elke zaterdag.',
        'Eén keer de hele Ringweg over, langs alle checkpoints. Durf je?',
      ], ['Kom maar op!', 'Straks misschien']);
      if (a !== 0) return;
      this.setActive('race', 'Ringweg Race', 'Haal alle checkpoints en wees sneller dan de skater.');
      await g.startRace(this.racePath, npc, (won) => {
        if (won) this.complete('race', 'Gewonnen! Koning van de Ringweg!');
        else this.fail('Net te langzaam. Praat met de skater voor een revanche.');
      });
    },

    async brouwer(npc, N, ui, g) {
      if (this.active?.id === 'vat') {
        await ui.dialog(N, ['Dat vat moet naar de Zwarte Ruiter op de Markt. Lopen hè, niet fietsen!']);
        return;
      }
      await ui.dialog(N, [
        G('Beer? Ummer!', 'Bier? Altijd!'),
        'Een vat voor de Zwarte Ruiter? Komt goed.',
        'Hier wordt al sinds 1825 gebrouwen. Deze zomer is de brouwerij helemaal overgenomen door Grolsch, zeggen ze.',
        'Maar wat er in dit vat zit, wordt nog steeds gewoon hier in Gulpen gebrouwen.',
        'Pas op, hij is zwaar. Fietsen, skaten of rijden gaat niet met zo\'n vat. Lopen dus!',
      ]);
      g.carryKeg(makeKeg());
      this.setActive('vat', 'Vers van \'t vat', 'Breng het vat naar Herberg De Zwarte Ruiter op de Markt.');
      g.setTarget(this.npcs.waard);
    },

    async waard(npc, N, ui, g) {
      if (this.active?.id === 'vat' && g.keg) {
        await ui.dialog(N, ['Daar is ie! Precies op tijd, de tap was bijna droog.', G('Ee glaas beer va de zaak!', 'Een glas bier van de zaak!')]);
        g.dropKeg();
        await g.drinkPils();
        this.complete('vat', 'Vat bezorgd!');
        return;
      }
      const night = g.night > 0.5;
      const a = await ui.dialog(N, [night ? G('Nog ee glaas beer, braggelear?', 'Nog een glas bier, nachtbraker?') : G('Ee glaas beer op de maat?', 'Een glas bier op de markt?')],
        [night ? 'Nog eentje (tot morgenochtend)' : 'Graag, een pilsje!', 'Nee, dank je']);
      if (a !== 0) return;
      // eerder al geholpen? dan mag je kiezen of je het dienblad nog eens doet
      let tray = !this.done.has('pils');
      if (!tray) tray = (await ui.dialog(N, ['Help je me nog eens met het dienblad? Het terras zit weer vol.'], ['Ja, geef dat blad maar', 'Nee, gewoon een pilsje'])) === 0;
      if (tray) {
        // eerste keer: eerst de waard helpen met een overvol dienblad
        await ui.dialog(N, ['Eerst even helpen, want het terras staat vol en ik heb veel te veel glazen pils op mijn blad...', 'Oei, daar gaan ze! Vang ze op!']);
        this.setActive('pils', 'Pils vangen', 'Vang de vallende glazen pils op met het dienblad.', '');
        const r = await startCatch(g);
        if (!r || this.active?.id !== 'pils') return;
        this.active = null;
        if (r.caught < r.need) {
          await ui.dialog(N, [`${r.caught} gevangen... en de rest ligt in scherven. Scherven brengen geluk, zeggen ze. Probeer het straks nog eens!`]);
          this.refresh();
          return;
        }
        await ui.dialog(N, [`${r.caught} van de ${r.total}! Jij mag hier zo achter de tap. Deze pils is van de zaak.`]);
      }
      await g.drinkPils();
      await ui.dialog(N, ['Proost! Op Gulpen!']);
      await g.skipTime(night ? 15 : 22.5);
      this.done.add('pils');
      this.save();
      this.refresh();
    },

    async trainer(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        'Hé! Wij zoeken nog een penaltyspecialist voor het eerste elftal.',
        'Vijf penalty\'s tegen onze keeper. Scoor er minstens drie en je mag zaterdag meedoen.',
        'Eerst zet je het mikpunt vast, dan kies je de kracht. Groen is goed, te hard en hij ligt in de Gulp. En pas op: onze keeper leest je als een boek. Klaar?',
      ], ['Ik ben er klaar voor', 'Een andere keer']);
      if (a !== 0) return;
      this.setActive('penalty', 'Penalty\'s bij FC Gulpen', g.input.isTouch ? 'Tik om het mikpunt vast te zetten, en nog eens om te schieten als de krachtbalk in het groen staat.' : 'Druk op E of spatie om het mikpunt vast te zetten, en nog eens om te schieten als de krachtbalk in het groen staat.', '0 / 5');
      const goals = await g.startPenalty();
      if (goals >= 3) {
        await ui.dialog(N, [goals === 5 ? 'Vijf van de vijf! Onze keeper zit in de kleedkamer te huilen. Jij bent aanvoerder.' : `${goals} van de 5! Jij staat zaterdag in de basis.`]);
        this.complete('penalty', 'Penaltyspecialist van FC Gulpen!', { v: goals, unit: 'van de 5', high: true });
      } else {
        await ui.dialog(N, [`${goals} van de 5... Dat moet beter. Kom maar terug als je getraind hebt.`]);
        this.fail('Niet genoeg gescoord.');
      }
    },

    async jas(npc, N, ui, g) {
      if (this.active?.id === 'deal') {
        await ui.dialog(N, ['Wat sta je hier nog? Wegwezen met dat pakketje!']);
        return;
      }
      const a = await ui.dialog(N, [
        G('Psst. Hot de moel.', 'Psst. Zwijg.'),
        'Niet zo opvallend kijken. En let op de pliesie.',
        G('Ik heb hier een pakketje dat zo snel mogelijk naar een adres in het dorp moet. Geen vragen, anders gaan we op de kis houwe.', 'Ik heb hier een pakketje dat zo snel mogelijk naar een adres in het dorp moet. Geen vragen, anders gaan we vechten.'),
        'Je hebt niet veel tijd. Doe je het?',
      ], ['Oké, geef maar', 'Nee, dat zit me niet lekker']);
      if (a !== 0) { await ui.dialog(N, ['Dan heb je mij nooit gezien.']); return; }
      this.setActive('deal', 'Een schimmig zaakje', 'Breng het pakketje snel naar het adres. Niet treuzelen!', 'Pakketje 1 / 1');
      g.holdProp(makeShadyPackage());
      this.active.cleanup = () => g.dropProp();
      this.deliveries('deal', 1, async () => {
        await ui.dialog('Bij de deur', ['Ah, eindelijk! Laat eens kijken...']);
        // het pakketje gaat open...
        g.holdProp(makeSnuifdoos());
        await ui.dialog('Bij de deur', [
          'Perfect. Echte sjnoef! Precies op tijd voor het kaartavondje van opa.',
          'Die mannen snuiven er al sinds 1962 van. Ze worden er niet slimmer van, wel vrolijker. Niks tegen de pliesie zeggen, hè!',
        ]);
        g.dropProp();
        this.complete('deal', 'Het was... sjnoef.');
      }, 0.85, [150, 350]);
    },

    async nacht(npc, N, ui, g) {
      if (this.active?.id === 'nacht' && this.active.found) {
        this.keten.visible = true;
        await ui.dialog(N, ['Mijn keten! Je bent een held.', 'Hierbij benoem ik jou tot Ere-Nachtburgemeester van Gulpen!']);
        this.complete('nacht', 'Ere-Nachtburgemeester van Gulpen!');
        return;
      }
      if (this.active?.id === 'nacht') {
        await ui.dialog(N, ['Al iets gevonden? Hij moet ergens bij een bruggetje over de Gulp liggen.']);
        return;
      }
      await ui.dialog(N, [
        G('Ah, nog ee braggelear!', 'Ah, nog een nachtbraker!'),
        'Ik ben de Nachtburgemeester van Gulpen. Als de echte burgemeester slaapt, waak ik over het dorp.',
        'Maar ik ben mijn ambtsketen kwijt! Zonder keten neemt niemand me serieus.',
        'Ik had hem nog bij een bruggetje over de Gulp. Wil je helpen zoeken?',
      ]);
      this.keten.visible = false; // opnieuw spelen: de keten is weer kwijt
      this.setActive('nacht', 'De ambtsketen', 'Zoek de ambtsketen bij een bruggetje over de Gulp.');
      this.spawnChain();
    },
  };

  // ------------------------------------------------------------ nieuwe Gulpen-klussen

  extra = {
    // Sint-Petruskerk: speurtocht naar het verdwenen armenfonds van deken Haffmans.
    // Gebaseerd op berichtgeving (L1, Wikipedia, het boek 'In Gods naam'); nooit bewezen in een rechtszaak.
    async koster(npc, N, ui, g) {
      if (this.active?.id === 'armenfonds') {
        await ui.dialog(N, [this.active.carReady ? 'Waar blijft die gouden bak? Rij hem hierheen, dan zien we wel wie er gelijk had!' : 'Nog niet alles gevonden? Kijk op de kaart, de sporen zijn met een dollarteken gemarkeerd. Of nou ja, een euroteken.']);
        return;
      }
      const a = await ui.dialog(N, [
        'Psst. Kom eens even mee naar binnen. Ik moet je iets laten zien. Het offerblok staat vooraan bij het middenpad.',
        'Je kent het verhaal toch wel van deken Haffmans? Van 1984 tot 2006 de baas in deze kerk.',
        'Volgens de krant en een heel boek ging er bijna twee miljoen euro uit de armenkas. Naar dure auto\'s, dure vakanties en rekeningen in het buitenland.',
        'Hij is in 2007 overleden voordat het ooit voor de rechter kwam, dus bewezen is het nooit. Maar in Gulpen wordt er nog steeds over gepraat, kan ik je vertellen.',
      ], ['Laat zien!', 'Laat de doden maar rusten']);
      if (a !== 0) { await ui.dialog(N, ['Ook goed. Maar als je van gedachten verandert: ik sta hier elke dag, net als het offerblok. Dat is tenminste nog wel hier.']); return; }
      const kerk = g.interiors.room('kerk');
      await new Promise((resolve) => {
        g.enterInterior(kerk, {
          triggers: [{ x: kerk.offerblok.x, z: kerk.offerblok.z, r: kerk.offerblok.r, label: 'Bekijk het offerblok', action: () => { kerk.activeTriggers = []; resolve(); } }],
        });
      });
      g.player.lockedFor = true;
      await ui.dialog(N, [
        G('Kijk. Het offerblok. Toenstraks zat er nog geld in, nu is het helemaal leeg. Alleen dit briefje: "Even geleend, voor de goede zaak."', 'Kijk. Het offerblok. Daarnet zat er nog geld in, nu is het helemaal leeg. Alleen dit briefje: "Even geleend, voor de goede zaak."'),
        'De goede zaak! Ik wed dat die goede zaak vier wielen had en een zwembad op de achterbank.',
        'Ik heb gehoord dat er nog wat sporen door het dorp slingeren. Een koffer vol reisstickers, en een bankafschrift uit het buitenland. Ga jij even kijken?',
      ]);
      g.player.lockedFor = false;
      this.startArmenfonds(npc);
    },

    // PLUS-parkeerplaats: netjes inparkeren tussen twee auto's
    async klant(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        'Tjonge, tjonge... Mijn man staat altijd half in het volgende vak. De mensen kijken me erop aan!',
        'Laat jij eens zien hoe het moet? Vijf keer netjes inparkeren in twee minuten. Een krasje kost tijd, dus rustig aan bij de buren.',
      ], ['Geef de sleutels maar', 'Ik heb geen rijbewijs']);
      if (a !== 0) return;
      this.setActive('inparkeren', 'Inparkeren bij de PLUS', 'Rij de groene auto in het gele vak en sta even stil. Vijf vakken in twee minuten. Botsen kost 5 seconden.', 'Ingeparkeerd: 0 / 5');
      const r = await startParking(g, [npc.pos.x, npc.pos.z], { lot: this.plusLot });
      if (!r || this.active?.id !== 'inparkeren') return;
      if (r.none) { await ui.dialog(N, ['Hm, alles staat vol. Kom straks maar terug.']); this.abort(); return; }
      if (r.ok) {
        await ui.dialog(N, [r.bumps ? `Vijf keer in het vak! Met ${r.bumps === 1 ? 'één klein krasje' : r.bumps + ' krasjes'}, maar dat zeggen we niet tegen mijn man.` : 'Vijf keer kaarsrecht in het vak, zonder één kras! Zo moet het.', 'Dank je wel! Hier, een zakje drop voor onderweg.']);
        this.complete('inparkeren', 'Parkeerkampioen van de PLUS!');
      } else {
        await ui.dialog(N, [`${r.parked} van de ${r.need}... De ijsjes in mijn tas zijn al gesmolten. Probeer het nog eens!`]);
        this.fail('Niet genoeg ingeparkeerd.');
      }
    },

    // Schutterij: vogelschieten op de houten vogel
    async schutter(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        'Goedendag! Vandaag is het koningsschieten bij de schutterij. Wie het laatste stuk van de vogel eraf schiet, is schutterskoning.',
        'Eerst de kop, de vleugels en de staart, dan pas de romp. Je hebt veertien schoten. Durf je het aan?',
      ], ['Geef mij de buks', 'Ik kijk wel toe']);
      if (a !== 0) return;
      if (g.mode === 'car') g.exitCar();
      g.setMode('walk');
      this.setActive('vogelschieten', 'Vogelschieten', 'Richt op de vogel en schiet de vijf stukken er een voor een af. Eerst kop, vleugels en staart, de romp als laatste.', '0 / 5 stukken');
      const r = await startVogelschieten(g, this.polePos || [npc.pos.x + 15, npc.pos.z]);
      if (!r || this.active?.id !== 'vogelschieten') return;
      if (r.king) {
        await ui.dialog(N, [`In ${r.shots} schoten! Leve de nieuwe schutterskoning!`, 'Je krijgt het koningszilver om. Volgend jaar moet je hem verdedigen, hè.']);
        this.complete('vogelschieten', 'Schutterskoning van Gulpen!');
      } else {
        await ui.dialog(N, [`${r.hits} van de 5 stukken. Niet slecht, maar de vogel zit er nog. Probeer het straks nog eens!`]);
        this.fail('De vogel zit er nog.');
      }
    },

    // Cafetaria Zheng: een POV-filmpje voor TikTok opnemen in de keuken
    async stagiair(npc, N, ui, g) {
      const best = this.tiktokBest || 0;
      const a = await ui.dialog(N, [
        best ? `Daar is onze ster! Je vorige filmpje had ${formatViews(best)} views. Nog eentje?` : 'Hé! Jij daar! Heb jij verstand van TikTok?',
        'De baas wil dat Cafetaria Zheng viraal gaat. Ik heb een telefoon, een ringlamp en nul talent.',
        'Het plan: een POV. Jij maakt achter de toonbank een bestelling klaar, de camera zit op je hoofd. Hoe strakker het gaat, hoe meer views.',
        'Onder de 15.000 views telt niet, zegt de baas. Doe je mee?',
      ], ['Ik ga viraal', 'Ik ben camera-schuw']);
      if (a !== 0) { await ui.dialog(N, ['Jammer. Dan film ik wel weer de frituur. Vorige keer: 14 views. Waarvan 11 van mijn moeder.']); return; }
      const order = ORDERS[Math.floor(Math.random() * ORDERS.length)];
      this.setActive('tiktok', 'Viraal met een frietje', `Ga naar binnen en start de opname bij de toonbank. Bestelling: ${order.text.toLowerCase()}.`, 'Doel: 15.000 views');
      const room = g.interiors.room('cafetaria');
      await g.enterInterior(room, {
        triggers: [{
          x: room.counter.x, z: room.counter.z, r: room.counter.r, label: 'Start de opname',
          action: async () => {
            room.activeTriggers = [];
            g.player.lockedFor = true;
            await ui.dialog(N, [`Bestelling: ${order.text.toLowerCase()}. Telefoon staat aan... en... actie!`]);
            if (this.active?.id !== 'tiktok') return;
            const r = await runTikTok(g, room, order);
            if (!r || this.active?.id !== 'tiktok') return;
            const v = Math.round(r.views);
            this.tiktokBest = Math.max(this.tiktokBest || 0, v);
            const perfect = r.results.filter((x) => x === 'perfect').length;
            if (v >= 15000) {
              await ui.dialog(N, [
                `${formatViews(v)} views! ${v >= 250000 ? 'Dit is groter dan carnaval!' : v >= 80000 ? 'Heel Limburg kijkt mee!' : 'Gulpe kijkt mee!'}`,
                r.results.includes('fail') ? 'En dat bakje dat viel... de mensen kunnen er geen genoeg van krijgen.' : perfect >= 4 ? 'Strak als een frituurmandje. De baas gaat dit inlijsten.' : 'Netjes gedaan. De baas is tevreden.',
                G('Dat is hiel leuk! Hier, een frietje van de zaak. Voor de content natuurlijk.', 'Dat is heel leuk! Hier, een frietje van de zaak. Voor de content natuurlijk.'),
              ]);
              await g.eat(makePuntzak(), 3);
              this.complete('tiktok', `Viraal! ${formatViews(v)} views`, { v: Math.round(v), unit: 'views', high: true });
            } else {
              await ui.dialog(N, [`${formatViews(v)} views... Daar ga ik niet mee naar de baas. Probeer je het nog een keer?`]);
              this.fail('Te weinig views. Praat nog eens met de stagiair.');
            }
          },
        }],
      });
    },

    // Donny's Gezellerie: borrelplank samenstellen met spullen uit het dorp
    async donnys(npc, N, ui, g) {
      const act = this.active?.id === 'borrelplank' ? this.active : null;
      if (act && act.left > 0) { await ui.dialog(N, [`Nog ${act.left} ding${act.left === 1 ? '' : 'en'} ophalen! De gasten zitten al te wachten.`]); return; }
      if (act) {
        g.dropProp();
        await ui.dialog(N, ['Kijk eens aan! Worst en vleeswaren van Bormans, met mijn eigen brood en kaas. Een echte Gezellerie-plank.']);
        g.holdProp(makeBorrelplank());
        await ui.dialog(N, ['En een speciaalbiertje erbij, van de zaak. Proost!']);
        g.dropProp();
        await g.drinkPils();
        this.complete('borrelplank', 'Borrelplank geserveerd!');
        return;
      }
      const a = await ui.dialog(N, [
        "Welkom bij Donny's! Hier draait alles om gezelligheid: lekker eten, delen en een goed speciaalbiertje.",
        'Maar ik heb een probleem. Straks komen de fietsers van de Gulpense Graveltocht binnen en mijn borrelplanken zijn op!',
        'Brood en kaas heb ik nog. Haal jij worst en vleeswaren bij Slagerij Bormans in de Rosstraat? Snel, voordat ze er zijn!',
      ], ['Ik ga al!', 'Ik heb geen tijd']);
      if (a !== 0) return;
      this.startShopping('borrelplank', 'De Gezellerie-borrelplank', [
        { id: g.facades.frames.bormans ? 'bormans' : 'meertens', what: 'Worst en vleeswaren', line: 'Worst en vleeswaren voor Donny? Komt goed, vers gesneden!' },
      ], 150, npc);
    },

    // PLUS: winkelwagentjes terugbrengen als lange trein
    async plus(npc, N, ui, g) {
      if (this.active?.id === 'karretjes') {
        await ui.dialog(N, [`Nog ${g.followers.length - g.followersJoined()} karretjes zoek! Kijk op de kaart.`]);
        return;
      }
      const a = await ui.dialog(N, [
        'Help! De wind van de Gulperberg heeft al mijn winkelwagentjes het dorp in geblazen. Ze staan overal!',
        'Ik heb er minstens vier nodig voor de zaterdagdrukte. Kun jij ze ophalen? Duw ze gewoon achter elkaar aan, als een trein.',
      ], ['Choo choo, ik ga!', 'Ik doe mijn boodschappen wel ergens anders']);
      if (a !== 0) return;
      if (g.mode === 'car') g.exitCar();
      g.setMode('walk');
      const n = 4;
      g.startPolonaise(n, { factory: () => makeCart(), minD: 25, maxD: 130, color: '#1b6e3a', glyph: 'W', joinLines: ['Klik!', 'Karretje erbij!', 'Nog eentje!', 'Tjoek tjoek!'] });
      this.setActive('karretjes', 'Karretjes-trein', 'Loop naar de groene markeringen. De karretjes rijden dan achter je aan. Breng ze naar het karretjeshok bij de PLUS.', `0 / ${n} karretjes`);
      this.active.followerWord = 'karretjes';
      this.active.noVehicles = true;
      const shed = g.facades.cartShed ? [g.facades.cartShed.x, g.facades.cartShed.z] : [npc.pos.x, npc.pos.z];
      g.setDestination(g.world.resolve(shed[0], shed[1], 0.6), 300, async () => {
        g.stopPolonaise();
        await ui.dialog(N, ['Wat een trein! Allemaal netjes terug. Hier, een karretjesmuntje voor je sleutelbos. Dank je wel!']);
        this.complete('karretjes', 'Karretjeskoning van Gulpen!');
      }, (msg) => { g.stopPolonaise(); this.fail(msg || 'Te laat, de zaterdagdrukte is al begonnen.'); }, {
        require: () => (g.followersJoined() >= n ? null : `Je hebt pas ${g.followersJoined()} van de ${n} karretjes.`),
      });
    },

    // Paulissen: vlaaien ophalen in de bakkerij en naar de koffietafel in de kerk brengen
    async bakker(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        'Goedemorgen! Na de mis is er koffie in de Sint-Petruskerk, en daar horen natuurlijk vlaaien bij.',
        G('Riestevla, kersen en proeme!', 'Rijstevlaai, kersen en pruimen!'),
        'Ze staan binnen op de toonbank. Breng jij ze naar de koffietafel in de kerk? Met drie vlaaien kun je niet rennen, en loop nergens tegenaan!',
      ], ['Ik loop heel voorzichtig', 'Ik ben een beetje onhandig']);
      if (a !== 0) return;
      this.setActive('vlaaien', 'Vlaaien voor na de mis', 'Pak de vlaaien van de toonbank in de bakkerij.', 'Vlaaien: 3 / 3');
      this.active.noVehicles = true;
      const act = this.active;
      const bakery = g.interiors.room('bakkerij');
      await g.enterInterior(bakery, {
        triggers: [{
          x: bakery.pickup.x, z: bakery.pickup.z, r: 1.6, label: 'Pak de vlaaien',
          action: () => {
            bakery.activeTriggers = [];
            this.carryVlaaien(act);
          },
        }],
      });
    },

    // Meertens: een bestelling die in het Gulpens is doorgebeld
    async slager(npc, N, ui, g) {
      // woorden uit de woordenlijst Gulpens (mijnwoordenboek.nl)
      const items = [['zoervleisj', 'zuurvlees'], ['sjink', 'ham'], ['poetes', 'bloedworst'], ['hujtvleisj', 'hoofdkaas'], ['kieës', 'kaas'], ['knien', 'konijn']];
      const order = items.slice().sort(() => Math.random() - 0.5).slice(0, 3);
      const a = await ui.dialog(N, [
        'Goeiemorgen! Ik heb een bestelling binnen van een vaste klant, maar ze belde helemaal in het plat.',
        `Ze zei: "${order.map((o) => o[0]).join(', ')}". Ik ben de enige die het verstaat, en ik sta hier alleen achter de toonbank.`,
        'Pak jij het even in en breng je het naar haar toe? Maar wel de goede spullen hè!',
      ], ['Ik spreek plat, geef maar', 'Plat? Ik versta er niks van']);
      if (a !== 0) return;
      // naar binnen, achter de vitrine
      const shop = g.interiors.room('slagerij');
      await new Promise((resolve) => {
        g.enterInterior(shop, {
          triggers: [{ x: shop.counter.x, z: shop.counter.z, r: 1.8, label: 'Bestelling inpakken', action: () => { shop.activeTriggers = []; resolve(); } }],
        });
      });
      let good = 0;
      for (const [word, meaning] of order) {
        const wrong = items.filter((x) => x[1] !== meaning).sort(() => Math.random() - 0.5).slice(0, 2).map((x) => x[1]);
        const opts = [meaning, ...wrong].sort(() => Math.random() - 0.5);
        const pick = await ui.dialog(N, [`"${word}". Wat pak je uit de vitrine?`], opts);
        if (opts[pick] === meaning) good++;
        else await ui.dialog(N, [`Nee, nee! "${word}" is ${meaning}. Ik pak het wel even voor je.`]);
      }
      g.holdProp(makeMeatPackage());
      await ui.dialog(N, [good === 3 ? 'Allemaal goed, jij bent een echte Gulpenaar! Hier is het pakketje.' : 'Bijna goed. Hier is het pakketje, ik heb het voor je rechtgezet.']);
      this.setActive('slager', 'Bestelling in het plat', 'Ga naar buiten en breng het pakketje naar de klant. Volg de lichtbundel.');
      this.active.cleanup = () => g.dropProp();
      const dest = g.randomAddress(100, 260);
      const dist = g.distOutside(dest);
      g.setDestination(dest, Math.round(dist / 5 + 40), async () => {
        g.dropProp();
        await ui.dialog('Bij de klant', [G('Ah, de bestelling va de slechter!', 'Ah, de bestelling van de slager!'), 'Hier, voor de moeite:', G('Ee pletzke!', 'Een koekje!')]);
        this.complete('slager', 'Bestelling bezorgd!');
      }, (msg) => this.fail(msg || 'Te laat. De klant heeft al iets anders gegeten.'));
    },

    async reporter(npc, N, ui, g) {
      const act = this.active?.id === 'hubertus' ? this.active : null;
      if (act && !act.ready) {
        await ui.dialog(N, [`Nog ${act.left} kroeg${act.left === 1 ? '' : 'en'} te gaan! Schiet op, over vijf minuten zijn we live!`]);
        return;
      }
      if (act && act.ready) return this.interview(npc, N, ui, g);
      const a = await ui.dialog(N, [
        'Hallo hallo! Hier De Razende Reporter, live vanaf de 482e Hubertusmarkt in Gulpen!',
        'Of nou ja, bijna live. Mijn uitzending begint zo en ik heb nog geen enkel verhaal. Geen tijd, geen tijd!',
        G('Jij gaat voor mij op de joets: Brasserie De Kroon, Herberg De Zwarte Ruiter, Grand Café Neubourg en Gasterij De Poort.', 'Jij gaat voor mij op stap: Brasserie De Kroon, Herberg De Zwarte Ruiter, Grand Café Neubourg en Gasterij De Poort.'),
        'Bij elke kroeg haal je een bierviltje, drink je een pilsje en hoor je wat de stamgasten over de Hubertusmarkt vertellen.',
        'Daarna kom je terug, en dan interview ik jou live. En je gaat te voet hè: wie drinkt, rijdt niet!',
      ], ['Proost, ik ga!', 'Ik moet nog rijden vandaag']);
      if (a !== 0) { await ui.dialog(N, ['Verstandig! Maar ik zoek wel iemand anders, hoor. Geen tijd, geen tijd!']); return; }
      await ui.dialog(N, [G('Lope, lope!', 'Lopen, lopen!')]);
      if (g.mode === 'car') g.exitCar();
      g.setMode('walk');
      this.startCrawl();
    },

    async opa(npc, N, ui) {
      // woorden en betekenissen uit de woordenlijst Gulpens (mijnwoordenboek.nl)
      const pool = [
        ['kuusj', 'varken'], ['braggelear', 'nachtbraker'], ['frieteboet', 'friture'], ['sjtroat', 'straat'],
        ['pliesie', 'politie'], ['elbur', 'aardbei'], ['maat', 'markt'], ['knien', 'konijn'], ['sjoel', 'school'],
        ['péat', 'paard'], ['sjoepkar', 'kruiwagen'], ['pieëpul', 'vlinder'], ['huuve', 'knikkers'],
        ['moelejan', 'roddelaar'], ['behijdskriemer', 'opschepper'], ['schmiezele', 'motregenen'],
        ['kanjel', 'dakgoot'], ['toepes', 'zot'], ['trèkkar', 'bolderwagen'], ['bölke', 'snoepje'],
      ];
      const a = await ui.dialog(N, [
        'Hé jong, kom eens bij me zitten op het benkske.',
        'Spreek jij nog plat? Of is het allewiel alleen nog Hollands?',
      ], ['Natuurlijk spreek ik plat!', 'Een beetje...', 'Nee, opa']);
      void a;
      await ui.dialog(N, ['Eens kijken. Ik noem een woord, jij zegt wat het betekent. Drie van de vier goed, dan ben je een echte Gulpenaar.']);
      const qs = pool.slice().sort(() => Math.random() - 0.5).slice(0, 4);
      let good = 0;
      for (const [word, meaning] of qs) {
        const wrong = pool.filter((p) => p[1] !== meaning).sort(() => Math.random() - 0.5).slice(0, 2).map((p) => p[1]);
        const opts = [meaning, ...wrong].sort(() => Math.random() - 0.5);
        const pick = await ui.dialog(N, [`Wat is "${word}"?`], opts);
        if (opts[pick] === meaning) { good++; await ui.dialog(N, ['Joa! Goed zo.']); }
        else await ui.dialog(N, [`Nee nee. "${word}" is ${meaning}.`]);
      }
      if (good >= 3) {
        await ui.dialog(N, [`${good} van de 4! Jij bent een echte Gulpenaar.`, G('Opgedrage an alle lu i Gullepe, die hun plat nog kalle!', 'Opgedragen aan alle mensen in Gulpen die hun dialect nog spreken!')]);
        this.complete('plat', 'Plat kalle: geslaagd!');
      } else {
        await ui.dialog(N, [`${good} van de 4... Kom morgen maar weer op het benkske zitten, dan oefenen we nog wat.`]);
        this.refresh();
      }
    },

    async wielrenner(npc, N, ui, g) {
      if (!g.vehicles.bike) {
        await ui.dialog(N, ['Te voet tegen mij de Gulperberg op? Dat wordt niks. Laat eerst je fiets maken bij Jef Abels.']);
        return;
      }
      const a = await ui.dialog(N, [
        'Hé! De Gulperberg, dat is hier dé klim. Steile stukken, en bovenaan het Mariabeeld.',
        'Wedstrijdje? Wie het eerst bij het Mariabeeld is. Ik win altijd, maar je mag het proberen.',
      ], ['Kom maar op!', 'Mijn benen zijn nog moe']);
      if (a !== 0) return;
      if (g.mode === 'car') g.exitCar();
      g.setMode('bike');
      const p = g.world.meta.pois.find((q) => q.id === 'mariabeeld').pos;
      const dest = g.world.resolve(p[0] + 7, p[1] + 3, 0.5);
      // route van de wielrenner: de Gulperbergweg omhoog, dan naar het Mariabeeld
      let route = g.world.streetPath('Gulperbergweg').map(([x, z]) => [x, z]);
      if (route.length < 2) route = [[npc.pos.x, npc.pos.z]];
      if (g.world.heightAt(...route[0]) > g.world.heightAt(...route.at(-1))) route.reverse();
      route.unshift([npc.pos.x, npc.pos.z]);
      route.push(dest);
      const lens = [0];
      for (let k = 1; k < route.length; k++) lens.push(lens[k - 1] + Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]));
      const total = lens.at(-1);
      const at = (s) => {
        s = Math.max(0, Math.min(total, s));
        let k = 1; while (k < lens.length - 1 && lens[k] < s) k++;
        const f = (s - lens[k - 1]) / Math.max(0.001, lens[k] - lens[k - 1]);
        const [ax, az] = route[k - 1], [bx, bz] = route[k];
        return [ax + (bx - ax) * f, az + (bz - az) * f, Math.atan2(bx - ax, bz - az)];
      };
      // tegenstander op de fiets; de 'gewone' wielrenner verdwijnt even
      const rider = makeCharacter({ shirt: 0xfdd835, pants: 0x111111, hair: 0x5d4037, hat: 'helmet', hatColor: 0xe53935 });
      const bike = makeBike(0xe53935);
      const rg = new THREE.Group();
      rg.add(bike, rider);
      rider.position.y = 0.35;
      g.scene.add(rg);
      npc.group.visible = false;
      // samen aan de start, jij naast hem
      const [sx, sz, sh] = at(0);
      const [px, pz] = g.world.resolve(sx + Math.cos(sh) * 1.8, sz - Math.sin(sh) * 1.8, 0.5);
      g.player.x = px; g.player.z = pz; g.player.heading = sh; g.player.speed = 0;
      g.camYaw = sh + Math.PI;
      const marker = { x: sx, z: sz, color: '#fdd835', glyph: 'W', done: false };
      g.tempMarkers = [marker];
      this.setActive('gulperberg', 'Gulperberg op!', 'Race tegen de wielrenner naar het Mariabeeld op de top. Wie het eerst boven is wint. Alleen op de fiets!', '');
      let s = 0, t = 0, speed = 0, finished = false, lastGap = null;
      const base = Math.max(7.5, (g.bikeSpeed || 12.5) * 0.86);
      const cleanup = () => { g.scene.remove(rg); npc.group.visible = true; g.tempMarkers = []; if (g.minigame?.race) g.minigame = null; };
      this.active.cleanup = cleanup;
      const go = (fn) => { if (!finished) { finished = true; cleanup(); fn(); } };
      g.setDestination(dest, 900, async () => {
        go(async () => {
          await ui.dialog(N, [G('Wat?! Jij was eerder boven? Doa valle mig de sjoon van oet! Ik had... eh... een lekke band. Bijna.', 'Wat?! Jij was eerder boven? Daar sta ik versteld van! Ik had... eh... een lekke band. Bijna.'), 'Respect. Jij bent de nieuwe Koning van de Gulperberg.']);
          this.complete('gulperberg', 'Koning van de Gulperberg!');
        });
      }, (msg) => go(() => this.fail(msg || 'Opgegeven.')), {
        noTimer: true,
        violate: () => (t > 3 && g.mode !== 'bike' ? 'Valsspelen! Dit is een fietswedstrijd.' : null),
      });
      g.ui.toast('3...', 800);
      g.minigame = {
        race: true, actionLabel: null,
        stop: () => { finished = true; cleanup(); },
        update: (dt) => {
          t += dt;
          const pl = g.player;
          // aftellen: iedereen staat stil
          if (t < 3) {
            pl.lockedFor = true; pl.speed = 0;
            const c = Math.ceil(3 - t);
            if (c !== this._count) { this._count = c; if (t > 0.05) g.ui.toast(`${c}...`, 700); g.sfx?.play('tally'); }
          } else {
            if (this._count !== 0) { this._count = 0; g.ui.toast('Gaan!', 900); g.sfx?.play('whistle'); }
            pl.lockedFor = false;
            // snelheid van de wielrenner: langzamer op steile stukken, een beetje bijsturen zodat het spannend blijft
            const [x0, z0] = at(s), [x1, z1] = at(s + 4);
            const slope = (g.world.heightAt(x1, z1) - g.world.heightAt(x0, z0)) / 4;
            let want = base * THREE.MathUtils.clamp(1 - slope * 2.2, 0.5, 1.25);
            // jouw voortgang: dichtstbijzijnde punt op dezelfde route
            let playerS = 0, bd = Infinity;
            for (let k = 1; k < route.length; k++) {
              const [ax, az] = route[k - 1], [bx, bz] = route[k];
              const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
              const f = Math.max(0, Math.min(1, ((pl.x - ax) * dx + (pl.z - az) * dz) / l2));
              const d = Math.hypot(pl.x - ax - dx * f, pl.z - az - dz * f);
              if (d < bd) { bd = d; playerS = lens[k - 1] + f * (lens[k] - lens[k - 1]); }
            }
            // ver van de route af (binnendoor): dan telt de afstand tot de top
            if (bd > 25) playerS = Math.max(playerS, total - Math.hypot(dest[0] - pl.x, dest[1] - pl.z));
            const gap = s - playerS; // positief: wielrenner voor
            if (gap > 40) want *= 0.9; else if (gap < -25) want *= 1.12;
            speed += (want - speed) * Math.min(1, dt * 1.5);
            s += speed * dt;
            const lead = Math.abs(gap) < 5 ? 'Zij aan zij!' : gap > 0 ? `Wielrenner ligt ${Math.round(gap)} m voor` : `Jij ligt ${Math.round(-gap)} m voor`;
            if (lead !== lastGap) { lastGap = lead; this.progress(lead); }
            if (s >= total) go(async () => {
              g.clearDestination();
              await ui.dialog(N, ['Haha! Eerst boven! Ik heb hier al tien jaar niet verloren.', 'Volgende keer beter. Of laat je fiets nog eens opvoeren bij Jef Abels.']);
              this.fail('De wielrenner was eerder boven.');
            });
          }
          const [x, z, h] = at(s);
          rg.position.set(x, g.world.groundAt(x, z), z);
          rg.rotation.y = h;
          rider.userData.animate(dt, speed, 'bike');
          marker.x = x; marker.z = z;
        },
      };
    },

    async boer(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        'Goeiedag! Heb jij mijn geit gezien? Hij is weer uitgebroken. Dat beest springt overal overheen.',
        G('Dat is ee gek baest!', 'Dat is een gek beest!'),
        'Hij is snel en hij zigzagt, maar hij komt nooit ver van het land. Tik hem drie keer aan, dan geeft hij zich over.',
      ], ['Ik vang die geit', 'Nee, ik ben bang voor geiten']);
      if (a !== 0) return;
      this.setActive('geit', 'De ontsnapte geit', 'Ren de geit achterna (witte punt op de kaart) en tik hem drie keer aan. Hij zigzagt!', '0 / 3 keer getikt');
      const ok = await startGoat(g, [npc.pos.x, npc.pos.z]);
      if (ok === null || this.active?.id !== 'geit') return;
      if (ok) {
        await ui.dialog(N, ['Hebbes! Kom maar, ondeugd. Bedankt! Hier, een stuk geitenkaas van eigen land.']);
        this.complete('geit', 'Geitenvanger van Gulpen!');
      } else {
        await ui.dialog(N, ['Weg is ie weer... Hij komt vanzelf terug als hij honger heeft. Probeer het straks nog eens.']);
        this.fail('De geit was te snel.');
      }
    },

    async visser(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        G('Ssst. Hot de moel!', 'Ssst. Zwijg!'),
        'Je jaagt de visch weg.',
        'Wil je het ook eens proberen? Wacht tot de dobber onder gaat, en dan pas ophalen.',
      ], ['Geef die hengel maar', 'Ik kijk wel even']);
      if (a !== 0) return;
      this.setActive('vissen', 'Vissen in de Gulp', g.input.isTouch ? 'Tik op "Haal op" als de dobber onder gaat.' : 'Druk op E als de dobber onder gaat.', '0 / 3 vissen');
      const caught = await g.startFishing();
      if (caught >= 3) {
        await ui.dialog(N, ['Drie stuks! Jij hebt dit vaker gedaan. Ik zet ze wel weer terug, hoor.', G('En nu snel naar huis, anders is het d\'n klets kriegen hier aan het water.', 'En nu snel naar huis, anders word je verkouden hier aan het water.')]);
        this.complete('vissen', 'Visser van de Gulp!');
      } else {
        await ui.dialog(N, [`${caught} gevangen. Geduld is het halve werk. Probeer het straks nog eens.`]);
        this.fail('Niet genoeg vissen gevangen.');
      }
    },

    async carnaval(npc, N, ui, g) {
      if (this.active?.id === 'polonaise') {
        await ui.dialog(N, [`Nog ${g.followers.length - g.followersJoined()} van mijn gevolg te gaan. Schiet op, de optocht vertrekt zo en de klumpkes moeten gesjmete worden!`]);
        return;
      }
      const a = await ui.dialog(N, [
        'Alaaf! Ik heb haast: zo vertrekt de optocht en dan moet ik vanaf de wagen het hele dorp vol snoep gooien.',
        G('Klumpkes sjmiete!', 'Snoepjes gooien!'),
        'Maar mijn gevolg is zoek, en zij hebben de zakken met snoep! Haal ze op en kom met een polonaise terug naar de Markt. Te voet natuurlijk, en snel!',
      ], ['Alaaf, ik ga!', 'Ik ben geen feestbeest']);
      if (a !== 0) return;
      if (g.mode === 'car') g.exitCar();
      g.setMode('walk');
      const n = g.world.isMobile ? 5 : 6;
      g.startPolonaise(n, { minD: 25, maxD: 120 }); // feestgangers vlak bij de Markt
      this.setActive('polonaise', 'Op tijd voor de optocht', 'Het gevolg van de prins staat als roze punten op de kaart. Loop erheen, dan lopen ze achter je aan. Breng ze naar de Markt voordat de optocht vertrekt.', `0 / ${n} feestgangers`);
      const markt = g.world.spotNear(20, 0);
      g.setDestination(markt, 300, async () => {
        g.stopPolonaise();
        await ui.dialog(N, ['Daar zijn ze allemaal, met de zakken snoep! Net op tijd, de optocht kan vertrekken.', G('Alaaf! Klumpkes voor iedereen! Haije!', 'Alaaf! Snoep voor iedereen! Doei!')]);
        // de prins sjmiet klumpkes: een paar handenvol snoep in een boog, ook jouw kant op
        const gy = g.world.groundAt(npc.pos.x, npc.pos.z);
        npc.pose = 'wave'; npc.heading = Math.atan2(g.player.x - npc.pos.x, g.player.z - npc.pos.z);
        for (let k = 0; k < 6; k++) setTimeout(() => { g.fx.candy(npc.pos.x, gy + 2.1, npc.pos.z, 26, gy, [g.player.x, g.player.z]); g.sfx?.play('pop'); }, k * 420);
        setTimeout(() => { npc.pose = null; }, 3000);
        this.complete('polonaise', 'Op tijd voor de optocht!');
      }, (msg) => { g.stopPolonaise(); this.fail(msg || 'De optocht is al vertrokken. Zonder snoep.'); }, {
        require: () => (g.followersJoined() >= n ? null : `Je hebt pas ${g.followersJoined()} van de ${n} feestgangers.`),
        violate: () => (g.mode !== 'walk' ? 'Een polonaise doe je te voet!' : null),
      });
    },

    async organisator(npc, N, ui, g) {
      const a = await ui.dialog(N, [
        'Goedenavond! Elk jaar in juni lopen er hier honderden mensen de Nacht van Gulpen: een lange wandeltocht door de nacht.',
        'Ik test vanavond een proefrondje door het dorp. Loop jij langs de drie stempelposten? Te voet, uiteraard.',
      ], ['Ik loop mee', 'Een andere keer']);
      if (a !== 0) return;
      await ui.dialog(N, [G('Lope, lope, lope!', 'Lopen, lopen, lopen!')]);
      if (g.mode === 'car') g.exitCar();
      g.setMode('walk');
      this.setActive('nachtvangulpen', 'Nacht van Gulpen', 'Loop naar de stempelpost. Alleen te voet!', 'Stempel 0 / 3');
      let i = 0;
      const next = () => {
        if (this.active?.id !== 'nachtvangulpen') return;
        if (i >= 3) {
          ui.dialog(N, ['Drie stempels! Volgend jaar loop je de hele tocht mee.']).then(() => this.complete('nachtvangulpen', 'Nacht van Gulpen uitgelopen!'));
          return;
        }
        const dest = g.randomAddress(80, 180);
        const dist = g.distOutside(dest);
        // stempelpost met lantaarn en vlag
        const post = makeStampPost();
        const [sx, sz] = g.world.resolve(dest[0] + 1.5, dest[1] + 1.5, 0.6);
        post.position.set(sx, g.world.groundAt(sx, sz), sz);
        post.rotation.y = Math.atan2(dest[0] - sx, dest[1] - sz);
        g.scene.add(post);
        this.active.cleanup = () => g.scene.remove(post);
        g.setDestination(dest, Math.round(dist / 4.5 + 25), () => { g.scene.remove(post); i++; this.progress(`Stempel ${i} / 3`); g.ui.toast('Stempel!', 1200); next(); },
          (msg) => { g.scene.remove(post); this.fail(msg || 'Te laat bij de stempelpost.'); },
          { violate: () => (g.mode !== 'walk' ? 'Dit is een wandeltocht. Lopen dus!' : null) });
      };
      next();
    },
  };

  // speurtocht armenfonds: twee sporen, daarna de gouden sportwagen naar de kerk rijden
  startArmenfonds(koster) {
    const g = this.g, ui = g.ui;
    g.tempMarkers = [];
    const act = { id: 'armenfonds', title: 'Het verdwenen armenfonds', left: 2, carReady: false, desc: 'Ga naar buiten en zoek de twee sporen (gemarkeerd op de kaart).', progress: 'Sporen: 0 / 2' };
    let golden = null;
    act.cleanup = () => { g.tempMarkers = []; g.collectibles.forEach((c) => c.cleanup?.()); g.collectibles = []; };
    this.active = act;
    this.refresh();
    const clues = [
      {
        prop: makeSuitcase(), title: 'Een koffer vol reisstickers',
        lines: ['Een dure koffer, helemaal beplakt met stickers van zon, zee en strand. Op het label staat: "Retour: de pastorie, Gulpen".', 'De armen kregen een ansichtkaart. Als ze geluk hadden.'],
      },
      {
        prop: makeBankStatement(), title: 'Een buitenlands bankafschrift',
        lines: ['Een envelop met een bankafschrift van een rekening ver over de grens. Het saldo is zo lang dat het van het papier af loopt.', 'Onderaan, met de hand: "Collecte zondag". Amen.'],
      },
    ];
    g.collectibles = clues.map((c) => {
      const [x, z] = g.randomAddress(90, 240);
      const m = c.prop;
      m.position.set(x, g.world.groundAt(x, z) + 0.6, z);
      m.scale.setScalar(1.6);
      g.scene.add(m);
      const beam = g.makeBeam(x, z, 0xf2c14e);
      const marker = { x, z, color: '#f2c14e', glyph: '€', done: false };
      g.tempMarkers.push(marker);
      const item = {
        pos: m.position, mesh: m,
        cleanup: () => g.scene.remove(m, beam),
        onCollect: async () => {
          item.cleanup();
          marker.done = true;
          g.collectibles = g.collectibles.filter((k) => k !== item);
          g.player.lockedFor = true;
          await ui.dialog(c.title, c.lines);
          g.player.lockedFor = false;
          act.left--;
          this.progress(`Sporen: ${2 - act.left} / 2`);
          if (act.left <= 0) this.revealGoldenCar(act, koster);
        },
      };
      return item;
    });
  }

  revealGoldenCar(act, koster) {
    const g = this.g, ui = g.ui;
    // een glimmende gouden sportwagen op een parkeerplaats
    const spots = g.world.parkingSpots.filter((s) => Math.hypot(s.x - g.player.x, s.z - g.player.z) > 120 && !g.cars.cars.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < 4));
    const s = spots[Math.floor(Math.random() * spots.length)] || { x: g.player.x + 20, z: g.player.z, heading: 0 };
    const car = g.cars.addCar('sport', s.x, s.z, s.heading, 0xd4af37, { isGolden: true });
    car.mesh.children[0].material.metalness = 0.95;
    car.mesh.children[0].material.roughness = 0.18;
    act.carReady = true;
    act.desc = 'Er staat een gouden sportwagen in het dorp. Pak hem en rij hem naar de Sint-Petruskerk!';
    g.tempMarkers.push({ x: car.x, z: car.z, color: '#d4af37', glyph: '€', done: false });
    this.refresh();
    g.setTarget({ pos: car.mesh.position });
    ui.toast('Kijk daar: een gouden sportwagen!', 2200);
    const f = g.facades.frames.kerk;
    const poi = g.world.meta.pois.find((p) => p.id === 'kerk');
    const dest = f ? g.world.resolve(f.x + f.nx * 6, f.z + f.nz * 6, 1.2) : g.world.spotNear(...poi.pos);
    // wachten tot de speler instapt, dan de bestemming zetten
    const wait = setInterval(() => {
      if (this.active !== act) { clearInterval(wait); return; }
      if (g.car !== car) return;
      clearInterval(wait);
      g.tempMarkers = [];
      ui.toast('Hallelujah, wat een bak!', 1800);
      g.setDestination(dest, 240, async () => {
        if (g.car === car) g.exitCar();
        g.fx.confetti(g.player.x, g.player.y + 3, g.player.z, 220);
        g.sfx?.play('bells');
        await ui.dialog(koster.name, [
          'Kijk nou! Een gouden sportwagen voor de kerk. Daar had de armenkas dus al die jaren in gezeten.',
          'Dure auto\'s, verre reizen, rekeningen in het buitenland... de deken had zijn eigen interpretatie van "geven aan de armen".',
          'Maar vergeet niet: bewezen is het nooit. Hij overleed in 2007, en een rechter heeft er nooit over geoordeeld.',
          'Ik zet hem wel achter de pastorie. Voor de goede zaak, natuurlijk.',
        ]);
        this.complete('armenfonds', 'Het armenfonds is (een beetje) terecht!');
      }, (msg) => this.fail(msg || 'Te lang getreuzeld. De gouden bak is alweer verdwenen.'), {
        require: () => (g.car === car ? null : 'Kom met de gouden sportwagen!'),
      });
    }, 300);
  }

  // vlaaien dragen: elke botsing kost een vlaai; aankomen bij de koffietafel in de kerk
  carryVlaaien(act) {
    const g = this.g, ui = g.ui;
    const stack = makeVlaaiStack();
    g.holdProp(stack);
    let left = 3;
    act.desc = 'Loop rustig naar de Sint-Petruskerk en zet de vlaaien op de koffietafel. Nergens tegenaan!';
    this.refresh();
    act.cleanup = () => { g.fragile = null; g.dropProp(); };
    g.fragile = () => {
      const layer = stack.userData.layers.pop();
      if (!layer) return;
      left--;
      const wp = new THREE.Vector3();
      layer.getWorldPosition(wp);
      stack.remove(layer);
      const floorY = g.interior ? 0 : g.world.groundAt(wp.x, wp.z);
      const splat = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), new THREE.MeshStandardMaterial({ color: 0x7a0f1e, roughness: 0.4 }));
      splat.rotation.x = -Math.PI / 2;
      splat.position.set(wp.x, floorY + 0.03, wp.z);
      g.scene.add(splat);
      setTimeout(() => g.scene.remove(splat), 20000);
      g.sfx?.play('splat');
      g.ui.toast('Boem! Daar gaat een vlaai...', 1800);
      this.progress(`Vlaaien: ${left} / 3`);
      if (left <= 0) { g.fragile = null; this.fail('Alle vlaaien liggen op de grond. Ga terug naar de bakker voor een nieuwe poging.'); }
    };
    const f = g.facades.frames.kerk;
    const poi = g.world.meta.pois.find((p) => p.id === 'kerk');
    const dest = f ? g.world.resolve(f.x + f.nx * 4, f.z + f.nz * 4, 0.6) : g.world.spotNear(...poi.pos);
    g.setDestination(dest, 300, async () => {
      // de kerk in, naar de koffietafel bij het altaar
      const kerk = g.interiors.room('kerk');
      g.sfx?.play('bells');
      await g.enterInterior(kerk, {
        triggers: [{
          x: kerk.coffeeTable.x, z: kerk.coffeeTable.z, r: kerk.coffeeTable.r, label: 'Zet de vlaaien op de koffietafel',
          action: async () => {
            kerk.activeTriggers = [];
            g.fragile = null;
            g.dropProp();
            if (left >= 2) {
              await ui.dialog('Na de mis', [`${left} vlaaien heel aangekomen! De koffie staat klaar, iedereen is blij.`, 'Een stukje kersenvlaai voor de bezorger, uiteraard.']);
              this.complete('vlaaien', 'Vlaaien bezorgd!');
            } else {
              await ui.dialog('Na de mis', ['Eén vlaai voor de hele parochie? Dat worden wel héél kleine stukjes...']);
              this.fail('Te weinig vlaaien. Probeer het opnieuw bij de bakker.');
            }
          },
        }],
      });
    }, (msg) => this.fail(msg || 'Te laat, de koffie is al op.'));
  }

  // ------------------------------------------------------------ boodschappen langs winkels

  startShopping(id, title, stops, limit, returnNpc) {
    const g = this.g;
    g.tempMarkers = [];
    const act = { id, title, left: stops.length, desc: `Haal de spullen op (gele markeringen) en ga terug naar ${returnNpc.name.toLowerCase()}.`, progress: `0 / ${stops.length} opgehaald` };
    act.cleanup = () => { g.tempMarkers = []; g.collectibles.forEach((c) => c.cleanup?.()); g.collectibles = []; g.dropProp(); g.ui.timer(null); clearInterval(timer); };
    this.active = act;
    this.refresh();
    let leftTime = limit;
    const timer = setInterval(() => {
      if (this.active !== act) { clearInterval(timer); return; }
      leftTime--;
      g.ui.timer(`${leftTime} s`);
      if (leftTime <= 0) { clearInterval(timer); this.fail('Te laat! De gasten zijn al vertrokken.'); }
    }, 1000);
    g.collectibles = stops.map((st) => {
      const f = g.facades.frames[st.id];
      const [x, z] = g.world.resolve(f.x + f.nx * 2.2, f.z + f.nz * 2.2, 0.4);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xf3efe3, emissive: 0x6b4d00, emissiveIntensity: 0.3 }));
      m.position.set(x, g.world.groundAt(x, z) + 1.1, z);
      g.scene.add(m);
      const beam = g.makeBeam(x, z, 0xf2c14e);
      const marker = { x, z, color: '#f2c14e', glyph: '!', done: false };
      g.tempMarkers.push(marker);
      const item = {
        pos: m.position, mesh: m,
        cleanup: () => g.scene.remove(m, beam),
        onCollect: async () => {
          item.cleanup();
          marker.done = true;
          g.collectibles = g.collectibles.filter((k) => k !== item);
          g.player.lockedFor = true;
          await g.ui.dialog(st.what, [st.line]);
          g.player.lockedFor = false;
          act.left--;
          this.progress(`${stops.length - act.left} / ${stops.length} opgehaald`);
          g.holdProp(makeMeatPackage());
          if (act.left <= 0) {
            act.desc = `Alles binnen! Terug naar ${returnNpc.name.toLowerCase()}.`;
            this.refresh();
            g.setTarget(returnNpc);
          }
        },
      };
      return item;
    });
  }

  // ------------------------------------------------------------ kroegentocht Hubertusmarkt

  startCrawl() {
    const g = this.g;
    // weetjes over de Hubertusmarkt (bronnen: Regio Online, evenementen.nl, gemeente Gulpen-Wittem)
    const looks = { kroon: [0x8a5a3a, '#3e2a1e', '#e8c77a'], zwarteruiter: [0x3b2f2a, '#151515', '#d9b25a'], neubourg: [0x4f6b55, '#1f3b2c', '#f1e6c8'], poort: [0x8a3b30, '#5a1f1f', '#f5e3c0'] };
    const cafes = [
      { id: 'kroon', name: 'Brasserie De Kroon', fact: 'Wist je dat de eerste Hubertusmarkt al in 1544 werd gehouden? Dit is dus de 482e keer!' },
      { id: 'zwarteruiter', name: 'Herberg De Zwarte Ruiter', fact: 'Vanochtend om tien uur begon het met de Hubertusmis in de Sint-Petruskerk. Pas daarna de markt.' },
      { id: 'neubourg', name: 'Grand Café Neubourg', fact: 'Rond twintig over elf worden bij het gemeentehuis de paarden gezegend. Dat is elk jaar weer een mooi gezicht.' },
      { id: 'poort', name: 'Gasterij De Poort', fact: 'Er staan zo\'n honderdvijftig kramen. Kleding, streekproducten, en natuurlijk gerookte paling!' },
    ];
    const cleanupStalls = g.facades.marketStalls(g.world.isMobile ? 12 : 24);
    g.tempMarkers = [];
    const act = {
      id: 'hubertus', title: 'Kroegentocht op de Hubertusmarkt', noVehicles: true, left: cafes.length, ready: false,
      desc: 'Loop langs de vier cafés (gele lichtbundels). Bij elk café een bierviltje en een verhaal.',
      progress: `Bierviltjes 0 / ${cafes.length}`,
      cleanup: () => { cleanupStalls(); g.drunk = 0; g.tempMarkers = []; g.collectibles.forEach((c) => c.cleanup?.()); g.collectibles = []; },
    };
    this.active = act;
    this.refresh();
    const coasterGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.02, 24);
    coasterGeo.rotateX(Math.PI / 2);
    const coasterMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e1, emissive: 0x6b4d00, emissiveIntensity: 0.25 });
    g.collectibles = cafes.map((c) => {
      const f = g.facades.frames[c.id];
      const poi = g.world.meta.pois.find((p) => p.id === c.id);
      const [x, z] = f ? g.world.resolve(f.x + f.nx * 2.2, f.z + f.nz * 2.2, 0.4) : g.world.spotNear(...poi.pos);
      const m = new THREE.Mesh(coasterGeo, coasterMat);
      m.position.set(x, g.world.groundAt(x, z) + 1.1, z);
      g.scene.add(m);
      const beam = g.makeBeam(x, z, 0xf2c14e);
      const marker = { x, z, color: '#f2c14e', glyph: 'B', done: false };
      g.tempMarkers.push(marker);
      const item = {
        pos: m.position, mesh: m,
        cleanup: () => g.scene.remove(m, beam),
        onCollect: async () => {
          item.cleanup();
          marker.done = true;
          g.collectibles = g.collectibles.filter((k) => k !== item);
          // naar binnen in het café, waar de stamgast aan de bar zit
          const [wall, bg, fg] = looks[c.id];
          const room = g.interiors.dressCafe(c.name, wall, bg, fg);
          let talked = false;
          await g.enterInterior(room, {
            triggers: [{
              x: room.stamgastPos.x, z: room.stamgastPos.z, r: 1.8, label: 'Praat met de stamgast',
              action: async () => {
                if (talked) return;
                talked = true;
                room.activeTriggers = [];
                g.player.lockedFor = true;
                await g.ui.dialog(`Stamgast in ${c.name}`, [
                  'Ah, nog een kroegentocht voor de Hubertusmarkt? Dan moet je dit weten:',
                  c.fact,
                  G('Ee glaas beer!', 'Een glas bier!'),
                ]);
                await g.drinkPils();
                g.drunk = (g.drunk || 0) + 1;
                g.player.lockedFor = false;
                act.left--;
                this.progress(`Bierviltjes ${cafes.length - act.left} / ${cafes.length}`);
                g.ui.toast(`Bierviltje ${cafes.length - act.left} van ${cafes.length}! Op naar buiten.`, 1800);
                if (act.left <= 0) {
                  act.ready = true;
                  act.desc = 'Alle verhalen verzameld. Terug naar De Razende Reporter op de Markt voor het live interview!';
                  this.refresh();
                  g.setTarget(this.npcs.reporter);
                }
              },
            }],
          });
        },
      };
      return item;
    });
  }

  async interview(npc, N, ui, g) {
    // camera van opzij, zodat de reporter en jij samen in beeld staan
    const ang = Math.atan2(g.player.x - npc.pos.x, g.player.z - npc.pos.z);
    g.camYaw = ang + Math.PI / 2;
    g.camDist = 5.5;
    g.camPitch = 0.08;
    g.lastManualLook = g.time;
    document.body.classList.add('live');
    g.sfx?.play('tally');
    document.getElementById('live-badge').hidden = false;
    try {
      await ui.dialog(N, [
        'Drie, twee, een... en we zijn LIVE! Goedemiddag Gulpen, hier De Razende Reporter op de Hubertusmarkt!',
        'Naast mij staat iemand die net een grondige kroegentocht heeft gedaan. Even wat vragen!',
      ]);
      const qs = [
        ['Sinds welk jaar is er een Hubertusmarkt in Gulpen?', ['1544', '1844', '1944'], '1544'],
        ['Wat gebeurt er rond twintig over elf bij het gemeentehuis?', ['De paarden worden gezegend', 'De burgemeester deelt vlaai uit', 'Er start een optocht'], 'De paarden worden gezegend'],
        ['Waar begint de dag mee?', ['De Hubertusmis in de Sint-Petruskerk', 'Een mis op de Markt', 'Een mis bij het Mariabeeld'], 'De Hubertusmis in de Sint-Petruskerk'],
        ['Welke vis wordt er op de markt gerookt verkocht?', ['Paling', 'Haring', 'Zalm'], 'Paling'],
      ].sort(() => Math.random() - 0.5).slice(0, 3);
      let good = 0;
      for (const [q, opts, right] of qs) {
        const shuffled = opts.slice().sort(() => Math.random() - 0.5);
        const pick = await ui.dialog(N, [q], shuffled);
        if (shuffled[pick] === right) { good++; await ui.dialog(N, ['Helemaal goed! Hoor je dat, Gulpen?']); }
        else await ui.dialog(N, [`Hmm, volgens mij was het: ${right.toLowerCase()}. Dat zijn die pilsjes, denk ik!`]);
      }
      await ui.dialog(N, ['En dan nog één vraag: hoeveel pilsjes heb je op?', { name: 'Jij', text: 'Vier. Maar ik ben wel te voet!' }]);
      if (good >= 2) {
        await ui.dialog(N, [`${good} van de 3, dat was een topinterview! Dit was De Razende Reporter, live vanaf de Hubertusmarkt in Gulpen!`]);
        this.complete('hubertus', 'Live op de Hubertusmarkt!');
      } else {
        await ui.dialog(N, ['Eh... dat liep niet helemaal lekker. We schakelen even terug naar de studio! Kom straks maar terug voor een herkansing.']);
        this.fail('Interview mislukt. Praat opnieuw met De Razende Reporter.');
      }
    } finally {
      document.body.classList.remove('live');
      document.getElementById('live-badge').hidden = true;
    }
  }

  // ------------------------------------------------------------ onderdelen

  spawnCoins() {
    const g = this.g;
    const center = g.world.meta.pois.find((p) => p.id === 'anpiet').pos;
    const cands = g.world.segments.filter(([, ax, az]) => {
      const d = Math.hypot(ax - center[0], az - center[1]);
      return d > 50 && d < 260;
    });
    const picked = [];
    for (let i = 0; picked.length < 4 && i < 400; i++) {
      const s = cands[(i * 37 + Math.floor(Math.random() * 50)) % cands.length];
      if (!s) break;
      const x = (s[1] + s[3]) / 2, z = (s[2] + s[4]) / 2;
      if (picked.some(([px, pz]) => Math.hypot(px - x, pz - z) < 60)) continue;
      if (g.world.insideBuilding(x, z) || g.world.blocked(x, z)) continue;
      picked.push([x, z]);
    }
    const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.9, roughness: 0.25, emissive: 0x6b4d00, emissiveIntensity: 0.5 });
    let count = 0;
    g.collectibles = picked.map(([x, z]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, g.world.groundAt(x, z) + 1, z);
      g.scene.add(m);
      const beam = g.makeBeam(x, z, 0xf2c14e);
      const c = {
        pos: m.position, mesh: m,
        cleanup: () => g.scene.remove(m, beam),
        onCollect: () => {
          c.cleanup();
          g.collectibles = g.collectibles.filter((k) => k !== c);
          count++;
          this.progress(`${count} / 4 munten`);
          g.ui.toast(['Een euro!', 'Nog een euro!', '50 cent... telt ook!', 'Genoeg!'][count - 1], 1500);
          if (count >= 4) {
            this.active.coinsDone = true;
            this.active.desc = 'Genoeg muntgeld. Terug naar Friture An + Piet!';
            this.refresh();
            g.setTarget(this.npcs.frituur);
          }
        },
      };
      return c;
    });
  }

  spawnChain() {
    const g = this.g;
    const bridges = g.world.ground.polys
      .filter(([cls]) => g.world.ground.classes[cls] === 'brug')
      .map(([, rings]) => {
        const r = rings[0];
        let sx = 0, sz = 0;
        for (let i = 0; i < r.length; i += 2) { sx += r[i]; sz += r[i + 1]; }
        return [sx / (r.length / 2), sz / (r.length / 2)];
      })
      .filter(([x, z]) => Math.hypot(x, z) > 80 && Math.hypot(x, z) < 450);
    const [x, z] = bridges[Math.floor(Math.random() * bridges.length)] || [120, -60];
    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.06, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.2, emissive: 0x7a5a00, emissiveIntensity: 0.8 }),
    );
    chain.position.set(x, g.world.groundAt(x, z) + 1, z);
    g.scene.add(chain);
    const beam = g.makeBeam(x, z, 0xf2c14e);
    g.collectibles = [{
      pos: chain.position, mesh: chain, glyph: '!', cleanup: () => g.scene.remove(chain, beam),
      onCollect: () => {
        g.scene.remove(chain, beam);
        g.collectibles = [];
        this.active.found = true;
        this.active.desc = 'Gevonden! Breng de keten terug naar de Nachtburgemeester.';
        this.refresh();
        g.ui.toast('De ambtsketen!');
        g.setTarget(this.npcs.nacht);
      },
    }];
  }

  // Een reeks bezorgingen naar willekeurige huizen, elk met een tijdslimiet.
  deliveries(id, count, onDone, timeFactor = 1, range = [220, 650]) {
    const g = this.g;
    let i = 0;
    const next = () => {
      if (this.active?.id !== id) return;
      if (i >= count) { onDone(); return; }
      const dest = g.randomAddress(range[0], range[1]);
      const dist = g.distOutside(dest);
      const limit = Math.round((dist / 6 + 25) * timeFactor);
      if (count > 1) this.progress(`Bestelling ${i + 1} / ${count}`);
      g.setDestination(dest, limit, () => { i++; g.ui.toast(i < count ? 'Bezorgd! Op naar de volgende.' : 'Bezorgd!', 1800); next(); },
        () => this.fail('Te laat! De klant heeft afgezegd.'));
    };
    next();
  }
}
