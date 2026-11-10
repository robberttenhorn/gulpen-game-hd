// Nabewerking van het beeld (alleen in de standen 'hoog' en 'midden'):
//  1. de wereld wordt getekend in een beeld met groot helderheidsbereik, mét diepte;
//  2. uit de diepte komt ambient occlusion (zachte schaduw in hoeken en onder dingen) en komen de
//     zonnestralen (licht dat langs gebouwen en bomen strijkt als je richting de zon kijkt);
//  3. alles wordt samengevoegd, met scherptediepte tijdens gesprekken;
//  4. gloed (bloom) rond lampen, ramen en de zon;
//  5. filmische afwerking: tone mapping, kleurcorrectie, vignet, een beetje korrel en kleurschifting.
// Elke stap kan los uit (adaptQuality in main.js schakelt ze uit als het spel hapert).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// De diepte wordt altijd per hele pixel van de dieptekaart uitgelezen (texelFetch), nooit 'ergens tussen twee
// pixels in'. De occlusion draait op halve resolutie en kwam daardoor precies op de grens tussen twee pixels uit;
// op sommige rijen en kolommen pakte de videokaart dan twee keer dezelfde pixel, wat donkere strepen gaf.
const DEPTH_FNS = `
  uniform sampler2D tDepth;
  uniform vec2 uNearFar, uTan; // uTan = (tan(halve kijkhoek) * beeldverhouding, tan(halve kijkhoek))
  uniform vec2 uFull; // maat van de dieptekaart in pixels
  ivec2 dTex(vec2 uv){ return clamp(ivec2(floor(uv * uFull)), ivec2(0), ivec2(uFull) - 1); }
  float zOf(float d){ return (uNearFar.x * uNearFar.y) / ((uNearFar.y - uNearFar.x) * d - uNearFar.y); }
  float depthAt(vec2 uv){ return texelFetch(tDepth, dTex(uv), 0).r; }
  float viewZ(vec2 uv){ return zOf(depthAt(uv)); }
  vec3 posAt(ivec2 c){
    c = clamp(c, ivec2(0), ivec2(uFull) - 1);
    float z = zOf(texelFetch(tDepth, c, 0).r);
    return vec3(((vec2(c) + 0.5) / uFull * 2.0 - 1.0) * uTan * -z, z);
  }
  vec3 viewPos(vec2 uv){ return posAt(dTex(uv)); }
`;

// ambient occlusion (rood) en zonnestralen (groen), op halve resolutie
const AO_FRAG = `
  varying vec2 vUv;
  ${DEPTH_FNS}
  uniform vec2 uTexel; // één pixel van het volledige beeld
  uniform float uRadius, uAspect, uAoOn, uRaysOn;
  uniform vec3 uSunUV; // xy = plek van de zon op het scherm, z = sterkte (0 = zon niet in beeld)
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main(){
    ivec2 c0 = dTex(vUv);
    float d0 = texelFetch(tDepth, c0, 0).r;
    float n = ign(gl_FragCoord.xy);
    float ao = 1.0;
    if (uAoOn > 0.5 && d0 < 0.99999) {
      vec3 P = posAt(c0);
      if (-P.z < 90.0) {
        // normaal uit de diepte: per as de buur met het kleinste diepteverschil (geen randen meenemen)
        vec3 Pr = posAt(c0 + ivec2(1, 0)), Pl = posAt(c0 - ivec2(1, 0));
        vec3 Pu = posAt(c0 + ivec2(0, 1)), Pd = posAt(c0 - ivec2(0, 1));
        vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
        vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
        vec3 Nc = cross(dx, dy);
        float nl = length(Nc);
        vec3 N = nl > 1e-12 ? Nc / nl : vec3(0.0, 0.0, 1.0);
        float rUv = uRadius / (-P.z * uTan.y * 2.0); // straal als deel van de beeldhoogte
        rUv = min(rUv, 0.12);
        float occ = 0.0;
        for (int i = 0; i < 10; i++) {
          float a = (float(i) + n) * 2.399963;
          float r = sqrt((float(i) + 0.5) / 10.0) * rUv;
          vec2 uv2 = vUv + vec2(cos(a) / uAspect, sin(a)) * r;
          vec3 v = viewPos(uv2) - P;
          float d2 = dot(v, v);
          float nv = dot(N, v) * inversesqrt(d2 + 1e-5);
          occ += max(0.0, nv - 0.12) * clamp(1.0 - d2 / (uRadius * uRadius * 2.2), 0.0, 1.0);
        }
        ao = nl > 1e-12 ? 1.0 - clamp(occ / 10.0 * 3.0, 0.0, 1.0) : 1.0;
        ao = mix(ao, 1.0, smoothstep(45.0, 90.0, -P.z));
      }
    }
    float g = 0.0;
    if (uRaysOn > 0.5 && uSunUV.z > 0.001) {
      vec2 delta = (uSunUV.xy - vUv) / 22.0 * 0.92;
      vec2 p = vUv + delta * n;
      float w = 1.0;
      for (int j = 0; j < 22; j++) {
        if (p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0) {
          vec2 q = (p - uSunUV.xy) * vec2(uAspect, 1.0);
          g += step(0.99999, depthAt(p)) * exp(-dot(q, q) * 9.0) * w;
        }
        w *= 0.965;
        p += delta;
      }
      g = g / 22.0 * uSunUV.z;
    }
    gl_FragColor = vec4(ao, g, 0.0, 1.0);
  }`;

// vervaging die randen in de diepte respecteert (twee keer: horizontaal en verticaal)
const BLUR_FRAG = `
  varying vec2 vUv;
  ${DEPTH_FNS}
  uniform sampler2D tIn;
  uniform vec2 uDir;
  void main(){
    float z0 = viewZ(vUv);
    vec2 acc = vec2(0.0); float ws = 0.0, wg = 0.0; float gacc = 0.0;
    for (int k = -3; k <= 3; k++) {
      vec2 uv2 = vUv + uDir * float(k);
      float g = exp(-float(k * k) / 6.0);
      vec2 s = texture2D(tIn, uv2).rg;
      float w = g * max(0.0, 1.0 - abs(viewZ(uv2) - z0) / (0.04 * -z0 + 0.08));
      acc.x += s.r * w; ws += w;
      gacc += s.g * g; wg += g;
    }
    gl_FragColor = vec4(ws > 0.0 ? acc.x / ws : 1.0, gacc / wg, 0.0, 1.0);
  }`;

// samenvoegen: kleur x occlusion + zonnestralen, en scherptediepte
const COMP_FRAG = `
  varying vec2 vUv;
  ${DEPTH_FNS}
  uniform sampler2D tScene, tAO;
  uniform vec2 uTexel;
  uniform vec3 uSunColor;
  uniform float uAo, uRays, uDof, uFocus, uDofPx, uDebug;
  float cocAt(float z){ return clamp((abs(z - uFocus) - uFocus * 0.22) / (uFocus * 1.6), 0.0, 1.0); }
  void main(){
    vec3 col = texture2D(tScene, vUv).rgb;
    if (uDof > 0.01) {
      float z0 = -viewZ(vUv);
      float c0 = cocAt(z0) * uDof;
      vec3 acc = col; float ws = 1.0;
      for (int i = 0; i < 16; i++) {
        float a = float(i) * 2.399963;
        float r = sqrt((float(i) + 0.5) / 16.0);
        vec2 uv2 = vUv + vec2(cos(a), sin(a)) * r * uDofPx * uTexel;
        float zs = -viewZ(uv2);
        float cs = cocAt(zs) * uDof;
        if (zs > z0) cs = min(cs, c0 * 2.0); // wat erachter ligt mag niet over een scherpe voorgrond lekken
        float w = smoothstep(r - 0.12, r + 0.12, cs);
        acc += texture2D(tScene, uv2).rgb * w; ws += w;
      }
      col = acc / ws;
    }
    vec2 ag = texture2D(tAO, vUv).rg;
    float lum = dot(col, vec3(0.3, 0.55, 0.15));
    float ao = mix(1.0, ag.r, uAo * (1.0 - smoothstep(1.5, 5.0, lum))); // felle lampen en ramen niet dimmen
    col *= ao;
    col += uSunColor * ag.g * uRays;
    if (uDebug > 0.5) col = vec3(ag.r * 0.6) + vec3(ag.g * 3.0, 0.0, 0.0); // controlebeeld: occlusion (grijs) en zonnestralen (rood)
    gl_FragColor = vec4(col, 1.0);
  }`;

// filmische afwerking, als laatste stap naar het scherm
const OUT_FRAG = `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform float uTime, uGrain, uVignette, uChroma, uSat, uContrast, uNight;
  uniform vec3 uLift, uGain;
  varying vec2 vUv;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main(){
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);
    // lichte kleurschifting naar de randen, zoals bij een echte lens
    vec3 col;
    col.r = texture2D(tDiffuse, vUv + c * r2 * uChroma).r;
    col.g = texture2D(tDiffuse, vUv).g;
    col.b = texture2D(tDiffuse, vUv - c * r2 * uChroma).b;
    col *= mix(1.0, smoothstep(1.25, 0.25, length(c) * 1.45), uVignette);
    #if TONEMAP == 1
      col = AgXToneMapping(col);
    #else
      col = ACESFilmicToneMapping(col);
    #endif
    col = sRGBTransferOETF(vec4(col, 1.0)).rgb;
    // kleurcorrectie: koele schaduwen, warme lichten, wat meer contrast en verzadiging
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, uSat);
    col = (col - 0.5) * uContrast + 0.5;
    col = col * uGain + uLift * (1.0 - col);
    // filmkorrel (in de schaduwen iets sterker) en ruis tegen kleurbanden
    float g = hash(gl_FragCoord.xy + fract(uTime) * 311.0) - 0.5;
    col += g * uGrain * (1.0 - 0.6 * l) + (hash(gl_FragCoord.xy * 1.7) - 0.5) / 255.0;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

export class Post {
  constructor(renderer, scene, camera, q) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.q = q;
    // schakelaars (de automatische kwaliteitsregeling kan ze uitzetten)
    this.on = { ao: !!q.ao, rays: !!q.zonnestralen, dof: !!q.scherptediepte, bloom: !!q.bloom };
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sunColor = new THREE.Color(1, 0.9, 0.75);
    this.raysAmount = 1; // 0 's nachts
    this.dofTarget = 0; this.dof = 0; this.focus = 8;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const depth = new THREE.DepthTexture(size.x, size.y);
    depth.type = THREE.UnsignedIntType;
    this.rtScene = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa || 0, depthTexture: depth });
    const half = { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(size.x >> 1, size.y >> 1, half);
    this.rtB = new THREE.WebGLRenderTarget(size.x >> 1, size.y >> 1, half);
    this.rtComp = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
    const dU = () => ({ tDepth: { value: depth }, uNearFar: { value: new THREE.Vector2(camera.near, camera.far) }, uTan: { value: new THREE.Vector2(1, 1) }, uFull: { value: new THREE.Vector2(size.x, size.y) } });
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.aoMat = mk(AO_FRAG, { ...dU(), uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.1 }, uAspect: { value: 1 }, uAoOn: { value: 1 }, uRaysOn: { value: 1 }, uSunUV: { value: new THREE.Vector3() } });
    this.blurMat = mk(BLUR_FRAG, { ...dU(), tIn: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.compMat = mk(COMP_FRAG, { ...dU(), tScene: { value: this.rtScene.texture }, tAO: { value: this.rtA.texture }, uTexel: { value: new THREE.Vector2() }, uSunColor: { value: new THREE.Color() }, uAo: { value: 0.85 }, uRays: { value: 0.6 }, uDof: { value: 0 }, uFocus: { value: 8 }, uDofPx: { value: 9 }, uDebug: { value: 0 } });
    this.outMat = new THREE.RawShaderMaterial({
      vertexShader: 'precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: OUT_FRAG, defines: { TONEMAP: 0, SRGB_TRANSFER: '' }, depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.rtComp.texture }, toneMappingExposure: { value: 1 }, uTime: { value: 0 }, uNight: { value: 0 },
        uGrain: { value: q.korrel ? 0.035 : 0 }, uVignette: { value: 0.32 }, uChroma: { value: 0.004 }, uSat: { value: 1.08 }, uContrast: { value: 1.03 },
        uLift: { value: new THREE.Vector3(0.0, 0.006, 0.016) }, uGain: { value: new THREE.Vector3(1.02, 1.0, 0.975) },
      },
    });
    this.quad = new FullScreenQuad(this.aoMat);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.25, 0.6, 0.92);
    this.depthUniforms = [this.aoMat, this.blurMat, this.compMat];
    this.tmp = new THREE.Vector3();
    this.time = 0;
  }

  setSize() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rtScene.setSize(s.x, s.y);
    this.rtComp.setSize(s.x, s.y);
    this.rtA.setSize(Math.max(1, s.x >> 1), Math.max(1, s.y >> 1));
    this.rtB.setSize(Math.max(1, s.x >> 1), Math.max(1, s.y >> 1));
    this.bloom.setSize(s.x / 2, s.y / 2);
  }

  // scherptediepte: 0 = uit, 1 = volledig; focus in meters vanaf de camera
  setDof(amount, focus) { this.dofTarget = amount; if (focus) this.focus = focus; }

  render(dt = 0.016) {
    const r = this.renderer, cam = this.camera;
    this.time += dt;
    const s = r.getDrawingBufferSize(new THREE.Vector2());
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    for (const m of this.depthUniforms) { m.uniforms.uTan.value.set(tan * cam.aspect, tan); m.uniforms.uNearFar.value.set(cam.near, cam.far); m.uniforms.uFull.value.set(this.rtScene.width, this.rtScene.height); }

    r.setRenderTarget(this.rtScene);
    r.render(this.scene, cam);

    // plek van de zon op het scherm
    const p = this.tmp.copy(this.sunDir).multiplyScalar(1000).add(cam.position).project(cam);
    const front = this.tmp.copy(this.sunDir).dot(cam.getWorldDirection(new THREE.Vector3()));
    const su = this.aoMat.uniforms.uSunUV.value;
    const off = Math.max(Math.abs(p.x), Math.abs(p.y));
    su.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, front > 0.05 ? this.raysAmount * (1 - THREE.MathUtils.smoothstep(off, 1.0, 1.9)) * Math.min(1, (front - 0.05) * 4) : 0);

    const needAO = this.on.ao || (this.on.rays && su.z > 0.001);
    if (needAO) {
      const a = this.aoMat.uniforms;
      a.uTexel.value.set(1 / s.x, 1 / s.y); a.uAspect.value = cam.aspect;
      a.uAoOn.value = this.on.ao ? 1 : 0; a.uRaysOn.value = this.on.rays ? 1 : 0;
      this.quad.material = this.aoMat;
      r.setRenderTarget(this.rtA); this.quad.render(r);
      const b = this.blurMat.uniforms;
      this.quad.material = this.blurMat;
      b.tIn.value = this.rtA.texture; b.uDir.value.set(2 / s.x, 0);
      r.setRenderTarget(this.rtB); this.quad.render(r);
      b.tIn.value = this.rtB.texture; b.uDir.value.set(0, 2 / s.y);
      r.setRenderTarget(this.rtA); this.quad.render(r);
    }
    const c = this.compMat.uniforms;
    this.dof += (this.dofTarget - this.dof) * Math.min(1, dt * 4);
    c.uDof.value = this.on.dof ? this.dof : 0;
    c.uFocus.value += (this.focus - c.uFocus.value) * Math.min(1, dt * 6);
    c.uDofPx.value = 10 * (s.y / 900);
    c.uTexel.value.set(1 / s.x, 1 / s.y);
    c.uAo.value = needAO && this.on.ao ? 0.85 : 0;
    c.uRays.value = needAO && this.on.rays ? 0.42 : 0;
    c.uSunColor.value.copy(this.sunColor);
    this.quad.material = this.compMat;
    r.setRenderTarget(this.rtComp); this.quad.render(r);

    if (this.on.bloom) this.bloom.render(r, null, this.rtComp, dt, false);

    const o = this.outMat.uniforms;
    o.toneMappingExposure.value = r.toneMappingExposure;
    o.uTime.value = this.time;
    this.quad.material = this.outMat;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}
