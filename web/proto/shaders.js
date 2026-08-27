// shaders.js - GLSL ES 3.00. 왼쪽(예전 방식)과 오른쪽(PBR) 을 나란히 그린다.
'use strict';

const S_HEAD = '#version 300 es\n' +
  'precision highp float;\n' +
  'precision highp int;\n' +
  // GLSL ES 3.00 은 표본기 정밀도를 따로 적어 줘야 한다
  'precision mediump sampler2DArray;\n' +
  'precision highp sampler2DShadow;\n' +
  'precision highp sampler2D;\n';

// ── 장면 꼭짓점 (두 방식이 함께 쓴다) ──
const SCENE_VS = S_HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec2 aUV;
layout(location=3) in float aMat;
layout(location=4) in float aAO;
uniform mat4 uVP;
out vec3 vPos; out vec3 vNor; out vec2 vUV; out float vMat; out float vAO;
void main(){
  vPos=aPos; vNor=aNor; vUV=aUV; vMat=aMat; vAO=aAO;
  gl_Position=uVP*vec4(aPos,1.0);
}`;

// ── 예전 방식 ── 면마다 고정 명암 + 색만. 그림자도 감마도 없다.
const OLD_FS = S_HEAD + `
in vec3 vPos; in vec3 vNor; in vec2 vUV; in float vMat; in float vAO;
uniform sampler2DArray uAlb;
uniform vec3 uCam; uniform vec3 uSky; uniform float uFogA; uniform float uFogB;
uniform float uDay;
out vec4 o;
void main(){
  vec3 c = texture(uAlb, vec3(vUV, vMat)).rgb;
  // 원본과 같은 방식 — 면 방향마다 정해진 밝기
  float s = 0.62;
  if (vNor.y > 0.5) s = 1.0;
  else if (vNor.y < -0.5) s = 0.45;
  else if (abs(vNor.x) > 0.5) s = 0.72;
  c *= s * (0.35 + 0.65*uDay);
  float d = length(vPos - uCam);
  float f = clamp((d - uFogA) / max(1.0, uFogB - uFogA), 0.0, 1.0);
  o = vec4(mix(c, uSky, f), 1.0);
}`;

// ── 깊이·노멀만 먼저 (SSAO 용) ──
const PRE_FS = S_HEAD + `
in vec3 vPos; in vec3 vNor; in vec2 vUV; in float vMat; in float vAO;
uniform mat4 uView;
out vec4 o;
void main(){
  vec3 vn = normalize(mat3(uView) * vNor);
  o = vec4(vn*0.5+0.5, 1.0);
}`;

// ── 그림자 지도 ──
const SHADOW_VS = S_HEAD + `
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main(){ gl_Position = uLightVP * vec4(aPos,1.0); }`;
const SHADOW_FS = S_HEAD + `void main(){}`;

// ── 새 방식 ── PBR + 그림자 + SSAO + 하늘 조명
const PBR_FS = S_HEAD + `
in vec3 vPos; in vec3 vNor; in vec2 vUV; in float vMat; in float vAO;
uniform sampler2DArray uAlb;
uniform sampler2DArray uNrm;
uniform sampler2DArray uOrm;
uniform sampler2DShadow uShadow;
uniform sampler2D uAO;
uniform mat4 uLightVP;
uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uSunCol;
uniform vec3 uSkyUp; uniform vec3 uSkyDn;
uniform vec3 uAmbUp; uniform vec3 uAmbDn;
uniform vec2 uPix;
uniform float uEmit[24];
uniform float uShadowOn; uniform float uSsaoOn; uniform float uNormalOn;
uniform float uFogA; uniform float uFogB; uniform vec3 uFogCol;
layout(location=0) out vec4 oCol;

const float PI = 3.14159265;

float D_GGX(float nh, float a){ float a2=a*a; float d=nh*nh*(a2-1.0)+1.0; return a2/(PI*d*d+1e-7); }
float V_Smith(float nv, float nl, float a){
  float k=a*0.5;
  return 0.25/max(1e-5,(nv*(1.0-k)+k)*(nl*(1.0-k)+k));
}
vec3 F_Schlick(vec3 f0, float vh){ return f0 + (1.0-f0)*pow(1.0-vh,5.0); }

// 면의 접선틀 — 축에 붙은 면이라 방향으로 바로 만든다
mat3 tbnFor(vec3 n){
  vec3 t, b;
  if (abs(n.y) > 0.5) { t = vec3(1,0,0); b = vec3(0,0,1); }
  else if (abs(n.x) > 0.5) { t = vec3(0,0,1); b = vec3(0,1,0); }
  else { t = vec3(1,0,0); b = vec3(0,1,0); }
  return mat3(t, b, n);
}

float shadowAt(vec3 p, float nl){
  vec4 lp = uLightVP * vec4(p, 1.0);
  vec3 q = lp.xyz / lp.w * 0.5 + 0.5;
  if (q.x<0.0||q.x>1.0||q.y<0.0||q.y>1.0||q.z>1.0) return 1.0;
  float bias = mix(0.0016, 0.0004, nl);
  float s = 0.0;
  vec2 texel = vec2(1.0/2048.0);
  for (int y=-1;y<=1;y++)
    for (int x=-1;x<=1;x++)
      s += texture(uShadow, vec3(q.xy + vec2(float(x),float(y))*texel, q.z - bias));
  return s / 9.0;
}

void main(){
  int mi = int(vMat + 0.5);
  vec3 alb = texture(uAlb, vec3(vUV, vMat)).rgb;
  vec3 orm = texture(uOrm, vec3(vUV, vMat)).rgb;
  float rough = clamp(orm.g, 0.03, 1.0);
  float metal = orm.b;
  float cav = orm.r;

  vec3 n = normalize(vNor);
  if (uNormalOn > 0.5) {
    vec3 tn = texture(uNrm, vec3(vUV, vMat)).rgb * 2.0 - 1.0;
    n = normalize(tbnFor(n) * tn);
  }
  vec3 v = normalize(uCam - vPos);
  float nv = max(dot(n, v), 1e-4);
  float nl = max(dot(n, uSun), 0.0);

  // 가림 — 꼭짓점 AO · 결 AO · 화면 공간 AO 를 함께 쓴다
  float ao = mix(0.55, 1.0, vAO) * mix(0.82, 1.0, cav);
  if (uSsaoOn > 0.5) ao *= texture(uAO, gl_FragCoord.xy * uPix).r;

  float sh = (uShadowOn > 0.5) ? shadowAt(vPos, nl) : 1.0;

  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 diffCol = alb * (1.0 - metal);

  // 해
  vec3 h = normalize(uSun + v);
  float a = rough * rough;
  vec3 spec = F_Schlick(f0, max(dot(v,h),0.0)) * D_GGX(max(dot(n,h),0.0), a)
            * V_Smith(nv, max(nl,1e-4), a);
  vec3 lit = (diffCol / PI + spec) * uSunCol * nl * sh;

  // 하늘 조명 — 위는 하늘빛, 아래는 땅에서 튄 빛.
  // 하늘 그림 색을 그대로 쓰면 온 세상이 새파래진다. 그래서 따로 받는다.
  vec3 sky = mix(uAmbDn, uAmbUp, n.y * 0.5 + 0.5);
  vec3 amb = diffCol * sky * ao;
  // 하늘 쪽 거울 반사 (거칠수록 흐려진다)
  vec3 r = reflect(-v, n);
  vec3 skyR = mix(uSkyDn, uSkyUp, r.y * 0.5 + 0.5);
  vec3 fres = F_Schlick(f0, nv) * (1.0 - rough);
  amb += skyR * fres * ao;

  vec3 col = lit + amb + alb * uEmit[mi];

  float d = length(vPos - uCam);
  float f = clamp((d - uFogA) / max(1.0, uFogB - uFogA), 0.0, 1.0);
  col = mix(col, uFogCol, f * 0.9);
  oCol = vec4(col, 1.0);
}`;

// ── SSAO ──
const POST_VS = S_HEAD + `
layout(location=0) in vec2 aPos;
out vec2 vT;
void main(){ vT = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const SSAO_FS = S_HEAD + `
in vec2 vT;
uniform sampler2D uDepth;
uniform sampler2D uNormal;
uniform mat4 uInvProj;
uniform mat4 uProj;
uniform vec2 uSize;
uniform float uRadius; uniform float uStrength;
out vec4 o;

vec3 viewPos(vec2 uv){
  float z = texture(uDepth, uv).r * 2.0 - 1.0;
  vec4 c = uInvProj * vec4(uv*2.0-1.0, z, 1.0);
  return c.xyz / c.w;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }

void main(){
  float dz = texture(uDepth, vT).r;
  if (dz >= 0.9999) { o = vec4(1.0); return; }
  vec3 p = viewPos(vT);
  vec3 n = normalize(texture(uNormal, vT).xyz * 2.0 - 1.0);
  float ang = hash(vT * uSize) * 6.2831;
  float ca = cos(ang), sa = sin(ang);
  float occ = 0.0;
  const int N = 12;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    // 반구 안에 고르게 흩뿌린 표본
    float t = (fi + 0.5) / float(N);
    float r = uRadius * sqrt(t);
    float a2 = fi * 2.399963;
    vec3 dir = vec3(cos(a2), sin(a2), 0.0);
    dir.xy = vec2(dir.x*ca - dir.y*sa, dir.x*sa + dir.y*ca);
    dir.z = 0.35 + 0.65*t;
    if (dot(dir, n) < 0.0) dir = -dir;
    vec3 sp = p + dir * r;
    vec4 cp = uProj * vec4(sp, 1.0);
    vec2 su = cp.xy / cp.w * 0.5 + 0.5;
    if (su.x<0.0||su.x>1.0||su.y<0.0||su.y>1.0) continue;
    vec3 q = viewPos(su);
    float diff = q.z - sp.z;
    float range = smoothstep(0.0, 1.0, uRadius / max(0.0001, abs(p.z - q.z)));
    if (diff > 0.02) occ += range;
  }
  o = vec4(vec3(clamp(1.0 - occ / float(N) * uStrength, 0.0, 1.0)), 1.0);
}`;

const BLUR_FS = S_HEAD + `
in vec2 vT;
uniform sampler2D uTex; uniform vec2 uDir;
out vec4 o;
void main(){
  float s = 0.0, w = 0.0;
  for (int i=-2;i<=2;i++){
    float k = 1.0 - abs(float(i))*0.25;
    s += texture(uTex, vT + uDir*float(i)).r * k;
    w += k;
  }
  o = vec4(vec3(s/w), 1.0);
}`;

// ── 밝은 부분 뽑기 · 흐리기 · 합치기 ──
const BRIGHT_FS = S_HEAD + `
in vec2 vT;
uniform sampler2D uTex; uniform float uThresh;
out vec4 o;
void main(){
  vec3 c = texture(uTex, vT).rgb;
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  o = vec4(c * smoothstep(uThresh, uThresh*2.0, l), 1.0);
}`;

const BLOOM_FS = S_HEAD + `
in vec2 vT;
uniform sampler2D uTex; uniform vec2 uDir;
out vec4 o;
void main(){
  vec3 s = vec3(0.0); float w = 0.0;
  for (int i=-4;i<=4;i++){
    float k = exp(-float(i*i)/8.0);
    s += texture(uTex, vT + uDir*float(i)).rgb * k;
    w += k;
  }
  o = vec4(s/w, 1.0);
}`;

const COMP_FS = S_HEAD + `
in vec2 vT;
uniform sampler2D uHdr; uniform sampler2D uBloom;
uniform float uBloomAmt; uniform float uExposure; uniform float uTone;
out vec4 o;
// ACES 근사
vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
void main(){
  vec3 c = texture(uHdr, vT).rgb;
  c += texture(uBloom, vT).rgb * uBloomAmt;
  c *= uExposure;
  if (uTone > 0.5) c = aces(c);
  c = pow(max(c, 0.0), vec3(1.0/2.2));
  // 아주 옅은 비네트
  vec2 d = vT - 0.5;
  c *= 1.0 - dot(d,d)*0.35;
  o = vec4(c, 1.0);
}`;

// 예전 방식은 톤매핑도 감마도 없이 그대로 낸다
const RAW_FS = S_HEAD + `
in vec2 vT;
uniform sampler2D uHdr;
out vec4 o;
void main(){ o = vec4(texture(uHdr, vT).rgb, 1.0); }`;

// ── 하늘 ──
const SKY_FS = S_HEAD + `
in vec2 vT;
uniform mat4 uInvVP; uniform vec3 uCam;
uniform vec3 uSun; uniform vec3 uSunCol;
uniform vec3 uSkyUp; uniform vec3 uSkyDn;
uniform float uPbr;
out vec4 o;
void main(){
  vec4 f = uInvVP * vec4(vT*2.0-1.0, 1.0, 1.0);
  vec3 d = normalize(f.xyz/f.w - uCam);
  vec3 c = mix(uSkyDn, uSkyUp, pow(clamp(d.y*0.5+0.5,0.0,1.0), 0.75));
  if (uPbr > 0.5) {
    float sd = max(dot(d, uSun), 0.0);
    c += uSunCol * (smoothstep(0.9985,0.9995,sd)*3.0 + pow(sd,180.0)*0.6 + pow(sd,8.0)*0.05);
    float hz = pow(1.0-clamp(abs(d.y)*2.2,0.0,1.0), 3.0);
    c += uSunCol * hz * pow(max(dot(normalize(vec3(d.x,0.0,d.z)), normalize(vec3(uSun.x,0.0,uSun.z))),0.0),3.0)*0.25;
  }
  o = vec4(c, 1.0);
}`;
