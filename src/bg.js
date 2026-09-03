/* Hintergrund-Shader. Vier Szenen, Bloom, Lichtstrahlen, Schaerfentiefe. */
  var RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var paused = RM;

  /* ---------- echte Messwerte ---------- */
  // Prefill-Momentanrate, Qwen3.8-27B UD-Q6, R9700, Build bd9bd1b
  var PREFILL = [[8,498.3],[16,423.1],[34,323.0],[67,223.3],[100,172.4],[132,139.6],[164,118.0]];
  // Entwurf 3: Tempi. Nur Qwen3.8 Q4_XL ist gemessen, Rest Platzhalter.
  var RUNS = [
    ["Opus 5",                  0.98],
    ["GPT 5.6 Sol",             0.90],
    ["Sonnet 5",                0.84],
    ["Qwen 3.8 flash next Q4",  0.60],
    ["Qwen 3.8 27B Q4_XL",      0.52],
    ["deepseek v4 flash IQ3",   0.45],
    ["Qwen 3.6 27B Q6",         0.40],
    ["laguna-s-2.1 Q4_XL",      0.33],
    ["qwen3.5-122b-a10b",       0.26]
  ];

  /* ---------- GLSL-Bausteine ---------- */
  // fp16 auf Handy-GPUs zerlegt Rauschen und Zeitakkumulation -> wo möglich highp
  var PREC = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif"
  ].join("\n");

  var RAMP = [
    "vec3 ramp(float t){",
    "  t = clamp(t,0.0,1.0);",
    "  vec3 c0=vec3(0.063,0.075,0.204);",
    "  vec3 c1=vec3(0.169,0.294,0.847);",
    "  vec3 c2=vec3(0.545,0.361,0.965);",
    "  vec3 c3=vec3(0.941,0.251,0.612);",
    "  vec3 c4=vec3(1.000,0.702,0.278);",
    "  if(t<0.25) return mix(c0,c1,t/0.25);",
    "  if(t<0.50) return mix(c1,c2,(t-0.25)/0.25);",
    "  if(t<0.75) return mix(c2,c3,(t-0.50)/0.25);",
    "  return mix(c3,c4,(t-0.75)/0.25);",
    "}"
  ].join("\n");

  var QUAD_VS = [
    "attribute vec2 p; varying vec2 uv;",
    "void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }"
  ].join("\n");

  // Rauschen kommt aus einer CPU-erzeugten Textur statt aus einem Hash.
  // Jeder arithmetische Hash braucht fp32; viele Mobil-GPUs rechnen im Fragment-Shader
  // trotz highp-Deklaration gröber, dann liefert fract() grosser Zahlen konstant 0.
  // Die Textur-Variante hält alle Werte in [0,1], die Interpolation macht die Hardware.
  var NOISE = [
    "uniform sampler2D u_noise;",
    "float vnoise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p);",
    "  f = f*f*(3.0-2.0*f);",
    "  return texture2D(u_noise, (i+f+0.5)/256.0).r;",
    "}",
    "float fbm(vec2 p){",
    "  float a=0.5, s=0.0;",
    "  for(int k=0;k<4;k++){ s+=a*vnoise(p); p*=2.03; a*=0.5; }",
    "  return s*1.07;",
    "}"
  ].join("\n");

  function noiseTexture(gl){
    var S = 256, data = new Uint8Array(S*S*4);
    for(var i=0;i<S*S;i++){
      data[i*4] = (Math.random()*256)|0;
      data[i*4+1] = (Math.random()*256)|0;
      data[i*4+2] = (Math.random()*256)|0;
      data[i*4+3] = 255;
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  /* ---------- WebGL-Helfer ---------- */
  /* ---------- Diagnose ---------- */
  var DIAG = [];
  var PROBES = [];
  function dlog(s){ DIAG.push(s); }

  function compile(gl, type, src){
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
      var log = (gl.getShaderInfoLog(sh)||"").replace(/\s+/g," ").slice(0,220);
      dlog("  COMPILE FEHLGESCHLAGEN (" + (type===gl.VERTEX_SHADER?"vs":"fs") + "): " + log);
      console.error(log, src);
      return null;
    }
    return sh;
  }
  function program(gl, vsSrc, fsSrc){
    var vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if(!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
      var log = (gl.getProgramInfoLog(p)||"").replace(/\s+/g," ").slice(0,220);
      dlog("  LINK FEHLGESCHLAGEN: " + log);
      console.error(log);
      return null;
    }
    return p;
  }
  function quadBuffer(gl){
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    return b;
  }


  /* ---------- Nachbearbeitung: Bloom, Aberration, Vignette, Korn ----------
     Zwei-Pass-Gauss auf einem Viertel der Aufloesung. Der Weichzeichner
     bestimmt die Qualitaet des ganzen Effekts, deshalb echte Gewichte statt
     Box-Blur. Kostet vier zusaetzliche Vollbild-Durchgaenge. */
  function makeFBO(gl, w, h){
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: t, fb: f, w: w, h: h };
  }

  var BRIGHT_FS = [
    PREC, "varying vec2 uv;",
    "uniform sampler2D u_tex; uniform vec2 u_texel; uniform float u_cut;",
    "void main(){",
    "  vec3 c = texture2D(u_tex, uv + u_texel*vec2(-1.0,-1.0)).rgb",
    "         + texture2D(u_tex, uv + u_texel*vec2( 1.0,-1.0)).rgb",
    "         + texture2D(u_tex, uv + u_texel*vec2(-1.0, 1.0)).rgb",
    "         + texture2D(u_tex, uv + u_texel*vec2( 1.0, 1.0)).rgb;",
    "  c *= 0.25;",
    "  float l = dot(c, vec3(0.2126,0.7152,0.0722));",
    "  gl_FragColor = vec4(c * smoothstep(u_cut, u_cut+0.42, l), 1.0);",
    "}"
  ].join("\n");

  var BLUR_FS = [
    PREC, "varying vec2 uv;",
    "uniform sampler2D u_tex; uniform vec2 u_dir;",
    "void main(){",
    "  vec3 c = texture2D(u_tex, uv).rgb * 0.227027;",
    "  c += (texture2D(u_tex, uv + u_dir*1.384615).rgb",
    "      + texture2D(u_tex, uv - u_dir*1.384615).rgb) * 0.316216;",
    "  c += (texture2D(u_tex, uv + u_dir*3.230769).rgb",
    "      + texture2D(u_tex, uv - u_dir*3.230769).rgb) * 0.070270;",
    "  gl_FragColor = vec4(c, 1.0);",
    "}"
  ].join("\n");

  var COMP_FS = [
    PREC, "varying vec2 uv;",
    "uniform sampler2D u_scene; uniform sampler2D u_bloom;",
    "uniform float u_str; uniform float u_t; uniform vec2 u_res;",
    "uniform vec2 u_sun; uniform float u_rays;",
    // Volumetrische Strahlen: die Helligkeitsauslese wird entlang der Sichtlinie
    // zur Lichtquelle aufsummiert. Zwoelf Schritte reichen, weil die Quelle bereits
    // weichgezeichnet ist - das ergibt Lichtschaechte statt harter Speichen.
    "vec3 godrays(vec2 uv){",
    "  vec2 dir = (uv - u_sun) * (1.0/12.0) * 0.72;",
    "  vec2 p = uv; vec3 acc = vec3(0.0); float w = 1.0;",
    "  for(int i=0;i<12;i++){",
    "    p -= dir;",
    "    acc += texture2D(u_bloom, p).rgb * w;",
    "    w *= 0.86;",
    "  }",
    "  return acc * (1.0/12.0);",
    "}",
    "void main(){",
    "  vec2 d = uv - 0.5;",
    "  float r2 = dot(d, d);",
    // chromatische Aberration waechst nach aussen - in der Mitte bleibt alles scharf
    "  float ca = 0.0022 * r2;",
    "  vec3 s;",
    "  s.r = texture2D(u_scene, uv + d*ca).r;",
    "  s.g = texture2D(u_scene, uv).g;",
    "  s.b = texture2D(u_scene, uv - d*ca).b;",
    "  vec3 b = texture2D(u_bloom, uv).rgb;",
    // Screen-Blend statt Addition: Lichter laufen nicht aus
    "  vec3 c = 1.0 - (1.0 - s) * (1.0 - b*u_str);",
    "  if(u_rays > 0.001) c += godrays(uv) * u_rays;",
    "  c *= 1.0 - smoothstep(0.18, 0.92, r2*1.7)*0.52;",
    "  float g = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898,78.233)) + u_t*7.0) * 437.5453);",
    "  c += (g - 0.5) * 0.020;",
    "  gl_FragColor = vec4(c, 1.0);",
    "}"
  ].join("\n");

  function makePost(gl){
    var pBright = program(gl, QUAD_VS, BRIGHT_FS);
    var pBlur   = program(gl, QUAD_VS, BLUR_FS);
    var pComp   = program(gl, QUAD_VS, COMP_FS);
    if(!pBright || !pBlur || !pComp) return null;
    var quad = quadBuffer(gl);
    var scene = null, a = null, b = null, W = 0, H = 0;

    function loc(p, n){ return gl.getUniformLocation(p, n); }
    var uBt = loc(pBright,"u_tex"), uBtex = loc(pBright,"u_texel"), uBcut = loc(pBright,"u_cut");
    var uLt = loc(pBlur,"u_tex"),   uLd = loc(pBlur,"u_dir");
    var uCs = loc(pComp,"u_scene"), uCb = loc(pComp,"u_bloom"),
        uCstr = loc(pComp,"u_str"), uCt = loc(pComp,"u_t"), uCres = loc(pComp,"u_res"),
        uCsun = loc(pComp,"u_sun"), uCray = loc(pComp,"u_rays");
    var aB = gl.getAttribLocation(pBright,"p"),
        aL = gl.getAttribLocation(pBlur,"p"),
        aC = gl.getAttribLocation(pComp,"p");

    function bindQuad(attr){
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(attr);
      gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
    }
    function resize(w, h){
      if(w === W && h === H) return;
      W = w; H = h;
      var bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
      scene = makeFBO(gl, w, h);
      a = makeFBO(gl, bw, bh);
      b = makeFBO(gl, bw, bh);
    }
    function pass(prog, attr, target){
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : W, target ? target.h : H);
      gl.useProgram(prog);
      bindQuad(attr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return {
      resize: resize,
      render: function(drawScene, w, h, t, strength, sun, rays){
        resize(w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
        drawScene();
        gl.disable(gl.BLEND);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, scene.tex);
        gl.useProgram(pBright);
        gl.uniform1i(uBt, 1);
        gl.uniform2f(uBtex, 1.0/w, 1.0/h);
        gl.uniform1f(uBcut, 0.30);
        pass(pBright, aB, a);

        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.useProgram(pBlur);
        gl.uniform1i(uLt, 1);
        gl.uniform2f(uLd, 1.0/a.w, 0.0);
        pass(pBlur, aL, b);

        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.useProgram(pBlur);
        gl.uniform1i(uLt, 1);
        gl.uniform2f(uLd, 0.0, 1.0/a.h);
        pass(pBlur, aL, a);

        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, scene.tex);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.useProgram(pComp);
        gl.uniform1i(uCs, 1); gl.uniform1i(uCb, 2);
        gl.uniform1f(uCstr, strength);
        gl.uniform2f(uCsun, sun ? sun[0] : 0.5, sun ? sun[1] : 0.5);
        gl.uniform1f(uCray, rays || 0.0);
        gl.uniform1f(uCt, t);
        gl.uniform2f(uCres, w, h);
        pass(pComp, aC, null);
        gl.activeTexture(gl.TEXTURE0);
      }
    };
  }

  /* ---------- Szene 1: Kontexttiefe ---------- */
  var depthScene = {
    name: "01 · Kontexttiefe", bloom: 0.95, sun: [0.67,0.48], rays: 0.55,
    init: function(gl){
      var N = 40000;
      var seed = new Float32Array(N*3);
      for(var i=0;i<N;i++){
        // rechteckiger Korridor statt Scheibe — sonst liest es sich als Explosion
        seed[i*3]   = Math.random()*2.0-1.0;
        seed[i*3+1] = Math.random()*2.0-1.0;
        seed[i*3+2] = Math.random();
      }
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, seed, gl.STATIC_DRAW);

      var vs = [
        "attribute vec3 a_seed;",
        "uniform float u_t; uniform vec2 u_m; uniform float u_asp; uniform float u_dpr;",
        "varying float v_z; varying float v_a; varying float v_blur;",
        "void main(){",
        "  float u = fract(a_seed.z + u_t*0.052);",
        // z beschleunigt nie: die Ableitung geht gegen 0, je tiefer der Kontext
        "  float z = 1.0 - pow(1.0-u, 2.6);",
        "  float persp = 1.0/(0.60 + z*3.2);",
        // por = 0 im Querformat, 1 im schmalen Hochformat
        "  float por = clamp((1.30 - u_asp)/0.85, 0.0, 1.0);",
        // Fluchtpunkt rechts der Mitte -> Korridor statt Explosion, links bleibt Platz für Text.
        // Im Hochformat rueckt er zur Mitte und der Korridor wird schmaler und hoeher.
        "  vec2 vp = mix(vec2(0.34,-0.05), vec2(0.04,0.14), por) + u_m*0.10;",
        "  vec2 world = vec2(a_seed.x*mix(1.60,1.02,por) + z*0.30,",
        "                    a_seed.y*mix(0.82,1.34,por));",
        // Curl eines Sinus-Potentials: divergenzfrei, die Bahnen kreuzen sich nie
        // und wirken dadurch fluessig statt gezittert.
        "  float ph = u_t*0.16 + a_seed.z*6.28;",
        "  vec2 w2 = world*1.7;",
        "  float amp = 0.115*(0.18 + z*1.05);",
        "  vec2 curl = vec2(",
        "     cos(w2.y*1.3 + ph)*0.9 + cos(w2.y*2.7 - ph*0.7)*0.35,",
        "    -cos(w2.x*1.1 - ph)*0.9 - cos(w2.x*2.3 + ph*0.6)*0.35);",
        "  world += curl*amp;",
        "  world += u_m*0.22*(1.0-z*0.8);",
        // Echte 3D-Drehung: der Punkt bekommt eine Tiefenkoordinate und wird um
        // Hoch- und Querachse gedreht, bevor projiziert wird. Dadurch dreht sich der
        // Korridor mit der Maus, statt nur zu verschieben.
        "  float yaw   = u_m.x * 0.30;",
        "  float pitch = u_m.y * 0.20;",
        "  vec3 P3 = vec3(world - vp, (z - 0.42) * 2.6);",
        "  float cy = cos(yaw),  sy = sin(yaw);",
        "  P3 = vec3(P3.x*cy + P3.z*sy, P3.y, -P3.x*sy + P3.z*cy);",
        "  float cp = cos(pitch), sp2 = sin(pitch);",
        "  P3 = vec3(P3.x, P3.y*cp - P3.z*sp2, P3.y*sp2 + P3.z*cp);",
        "  float camZ = 1.0 + P3.z*0.42;",
        "  vec2 sp = vp + P3.xy * persp * mix(1.62,1.34,por) / max(camZ, 0.32);",
        // Divisor begrenzen: ungebremst spreizt Hochformat die x-Achse um Faktor 2,7
        "  sp.x /= max(u_asp*0.80, 0.86);",
        "  gl_Position = vec4(sp, 0.0, 1.0);",
        // Schaerfentiefe: nur eine Ebene ist scharf, davor und dahinter zerfliesst
        // der Punkt zu einem Lichtkreis. Das erzeugt die Tiefe, die eine reine
        // Groessenstaffelung nicht hergibt.
        "  float foc = abs(z - 0.30);",
        "  v_blur = smoothstep(0.04, 0.62, foc);",
        "  gl_PointSize = max(1.5, (4.1*persp*3.2 + v_blur*9.5)*u_dpr);",
        "  v_z = z;",
        // Ausdünnung mit der Tiefe, Nahfeld gedämpft damit Text lesbar bleibt
        "  v_a = smoothstep(1.0,0.80,z) * smoothstep(0.0,0.06,u) * (0.22 + 0.62*(1.0-z));",
        "  v_a /= (1.0 + v_blur*2.6);",
        "}"
      ].join("\n");

      var fs = [
        PREC,
        "varying float v_z; varying float v_a; varying float v_blur;",
        RAMP,
        "void main(){",
        "  vec2 q = gl_PointCoord*2.0-1.0;",
        "  float r2 = dot(q,q);",
        "  if(r2 > 1.0) discard;",
        "  vec3 base = ramp(0.14 + (1.0-v_z)*0.86);",
        // Scharfe Partikel werden als Kugel schattiert: Normale aus der Sprite-Koordinate,
        // dazu Streulicht, ein enges Glanzlicht und ein Fresnel-Saum. Das laesst jeden
        // Punkt wie eine polierte Perle wirken statt wie ein weicher Fleck.
        "  vec3 N = vec3(q, sqrt(max(0.0, 1.0 - r2)));",
        "  vec3 L = normalize(vec3(-0.42, 0.58, 0.70));",
        "  float diff = max(dot(N, L), 0.0);",
        "  vec3 Hv = normalize(L + vec3(0.0,0.0,1.0));",
        "  float spec = pow(max(dot(N, Hv), 0.0), 46.0);",
        "  float fres = pow(1.0 - N.z, 3.2);",
        // schwache Spiegelung der Umgebung: der Farbton wandert mit der Normalen
        "  vec3 envc = ramp(clamp(0.14 + (1.0-v_z)*0.86 + N.y*0.22, 0.0, 1.0));",
        "  vec3 sharp = base*(0.22 + 0.62*diff) + envc*fres*0.75 + vec3(1.0)*spec*1.15;",
        "  float edge = smoothstep(1.0, 0.86, r2);",
        // unscharfe Partikel bleiben weiche Lichtkreise
        "  float soft = pow(smoothstep(1.0, 0.0, r2), 1.35);",
        "  vec3 c = mix(sharp*edge, base*soft*1.25, v_blur);",
        "  float a = mix(edge, soft, v_blur) * v_a * 0.70;",
        "  gl_FragColor = vec4(c*a, a);",
        "}"
      ].join("\n");

      var bgFs = [
        PREC, "varying vec2 uv;",
        "uniform float u_t; uniform vec2 u_m;",
        RAMP,
        "void main(){",
        // Glut sitzt am Fluchtpunkt, nicht in der Bildmitte
        "  vec2 p = uv-vec2(0.67,0.475)-u_m*0.04;",
        "  float d = length(p*vec2(1.15,1.0));",
        "  vec3 col = mix(vec3(0.052,0.040,0.128), vec3(0.017,0.014,0.050), smoothstep(0.04,0.82,d));",
        "  col += ramp(0.30)*0.085*exp(-d*d*9.0);",
        "  col += ramp(0.55)*0.038*exp(-d*d*2.0);",
        "  gl_FragColor = vec4(col,1.0);",
        "}"
      ].join("\n");

      var prog = program(gl, vs, fs);
      var bgProg = program(gl, QUAD_VS, bgFs);
      var quad = quadBuffer(gl);
      var loc = {
        a: gl.getAttribLocation(prog,"a_seed"),
        t: gl.getUniformLocation(prog,"u_t"),
        m: gl.getUniformLocation(prog,"u_m"),
        asp: gl.getUniformLocation(prog,"u_asp"),
        dpr: gl.getUniformLocation(prog,"u_dpr")
      };
      var bgLoc = {
        p: gl.getAttribLocation(bgProg,"p"),
        t: gl.getUniformLocation(bgProg,"u_t"),
        m: gl.getUniformLocation(bgProg,"u_m")
      };

      return function(t, m, w, h, dpr){
        gl.viewport(0,0,w,h);
        gl.disable(gl.BLEND);
        gl.useProgram(bgProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(bgLoc.p);
        gl.vertexAttribPointer(bgLoc.p,2,gl.FLOAT,false,0,0);
        gl.uniform1f(bgLoc.t,t); gl.uniform2f(bgLoc.m,m[0],m[1]);
        gl.drawArrays(gl.TRIANGLES,0,3);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc.a);
        gl.vertexAttribPointer(loc.a,3,gl.FLOAT,false,0,0);
        gl.uniform1f(loc.t,t); gl.uniform2f(loc.m,m[0],m[1]);
        gl.uniform1f(loc.asp,w/h); gl.uniform1f(loc.dpr,dpr);
        gl.drawArrays(gl.POINTS,0,N);
      };
    }
  };

  /* ---------- Szene 2: Rechenfeld ---------- */
  var fieldScene = {
    name: "02 · Das Rechenfeld", bloom: 0.55, sun: [0.5,0.30], rays: 0.34,
    init: function(gl){
      var COLS = 150, ROWS = 80, N = COLS*ROWS;
      var cells = new Float32Array(N*2);
      var k = 0;
      // von hinten nach vorn erzeugen -> korrekte Zeichenreihenfolge ohne Tiefentest
      for(var r=ROWS-1;r>=0;r--){
        for(var c=0;c<COLS;c++){
          cells[k++] = (c/(COLS-1))*2.0-1.0;
          cells[k++] = (r/(ROWS-1));
        }
      }
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, cells, gl.STATIC_DRAW);

      var vs = [
        "attribute vec2 a_cell;",
        "uniform float u_t; uniform vec2 u_m; uniform float u_asp; uniform float u_dpr;",
        "varying float v_h; varying float v_lit; varying float v_far;",
        "float h21(vec2 p){",
    "  vec3 q = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));",
    "  q += dot(q, q.yzx+33.33);",
    "  return fract((q.x+q.y)*q.z);",
    "}",
        "void main(){",
        "  float por = clamp((1.30 - u_asp)/0.85, 0.0, 1.0);",
        "  float X = a_cell.x*mix(6.6, 3.6, por);",
        "  float Z = 0.70 + a_cell.y*13.0;",
        "  float rnd = h21(a_cell*37.0);",
        // drei sich überlagernde Aktivierungswellen
        "  float w1 = sin((X*0.62 + Z*0.34) - u_t*1.35);",
        "  float w2 = sin((X*-0.41 + Z*0.78) - u_t*0.86 + 1.7);",
        "  float w3 = sin(length(vec2(X,Z-4.0))*0.72 - u_t*1.05);",
        "  float act = 0.5 + 0.5*max(max(w1,w2),w3);",
        "  act = pow(act, 4.5);",
        "  float hgt = act*(0.30 + 0.70*rnd);",
        "  float Y = -1.50 + hgt*1.75;",
        "  float f = 1.70;",
        // Kamera höher und Horizont angehoben, damit das Feld die Fläche füllt
        "  vec2 sp = vec2(X/Z*f, (Y+0.95)/Z*f + mix(0.34, 0.12, por));",
        "  sp.x /= max(u_asp*0.70, 0.74);",
        "  sp += u_m*0.05;",
        "  gl_Position = vec4(sp, 0.0, 1.0);",
        "  gl_PointSize = max(1.0, (10.4/Z)*u_dpr*1.5);",
        "  v_h = hgt;",
        // Maus als Lichtquelle in Gitterkoordinaten
        "  vec2 lightXZ = vec2(u_m.x*6.0, 6.0 - u_m.y*4.6);",
        "  float dl = length(vec2(X,Z)-lightXZ);",
        "  v_lit = exp(-dl*dl*0.032);",
        "  v_far = clamp((Z-0.70)/13.0, 0.0, 1.0);",
        "}"
      ].join("\n");

      var fs = [
        PREC,
        "varying float v_h; varying float v_lit; varying float v_far;",
        RAMP,
        "void main(){",
        // Echter isometrischer Wuerfel: Raute als Deckflaeche, zwei Seitenflaechen.
        // Drei verschiedene Helligkeiten erzeugen die Raumwirkung, die flache
        // Quadrate nicht haben.
        "  vec2 P = gl_PointCoord;",
        "  float ax = abs(P.x-0.5)*2.0;",
        "  float lo = 0.26 + 0.26*(1.0-ax);",
        "  float hi = 0.26 - 0.26*(1.0-ax);",
        "  bool isTop  = (P.y >= hi && P.y <= lo);",
        "  bool isSide = (P.y > lo && P.y <= lo + 0.46);",
        "  if(!isTop && !isSide) discard;",
        "  vec3 base = ramp(0.06 + v_h*0.82);",
        "  float face = isTop ? 1.55 : (P.x < 0.5 ? 0.52 : 0.88);",
        // Kantenlicht an der Naht zwischen den Flaechen
        "  float seam = isTop ? smoothstep(0.030,0.0, abs(P.y-lo)) : 0.0;",
        "  vec3 col = base*(0.26 + 0.80*v_h)*face;",
        "  col += base*seam*0.9;",
        // Glanzlicht je Flaeche: die Deckflaeche bekommt einen wandernden Streifen,
        // die Seiten einen schmalen Reflex an der Aussenkante. Das laesst die Bloecke
        // poliert wirken statt matt.
        "  float gloss;",
        "  if(isTop){",
        "    float t = (P.x-0.5)*1.4 + (P.y-0.26)*0.9;",
        "    gloss = pow(max(0.0, 1.0 - abs(t-0.12)*3.4), 6.0)*0.85;",
        "  } else {",
        "    float e = P.x < 0.5 ? (P.x/0.5) : (1.0-(P.x-0.5)/0.5);",
        "    gloss = pow(max(0.0, 1.0-e*2.6), 3.0) * (P.x<0.5 ? 0.16 : 0.42);",
        "  }",
        "  col += vec3(1.0,0.97,0.92)*gloss*(0.25 + v_h*0.95);",
        "  col += ramp(0.95)*v_lit*(isTop ? 0.55 : 0.22);",
        "  col *= mix(1.0, 0.26, v_far);",
        "  col += vec3(0.026,0.022,0.066);",
        "  gl_FragColor = vec4(col, 1.0);",
        "}"
      ].join("\n");

      var bgFs = [
        PREC, "varying vec2 uv;",
        "void main(){",
        "  float g = smoothstep(0.0,0.9,uv.y);",
        "  vec3 col = mix(vec3(0.015,0.012,0.045), vec3(0.075,0.055,0.165), g);",
        "  gl_FragColor = vec4(col,1.0);",
        "}"
      ].join("\n");

      var prog = program(gl, vs, fs);
      var bgProg = program(gl, QUAD_VS, bgFs);
      var quad = quadBuffer(gl);
      var loc = {
        a: gl.getAttribLocation(prog,"a_cell"),
        t: gl.getUniformLocation(prog,"u_t"),
        m: gl.getUniformLocation(prog,"u_m"),
        asp: gl.getUniformLocation(prog,"u_asp"),
        dpr: gl.getUniformLocation(prog,"u_dpr")
      };
      var bgP = gl.getAttribLocation(bgProg,"p");

      return function(t, m, w, h, dpr){
        gl.viewport(0,0,w,h);
        gl.disable(gl.BLEND);
        gl.useProgram(bgProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(bgP);
        gl.vertexAttribPointer(bgP,2,gl.FLOAT,false,0,0);
        gl.drawArrays(gl.TRIANGLES,0,3);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc.a);
        gl.vertexAttribPointer(loc.a,2,gl.FLOAT,false,0,0);
        gl.uniform1f(loc.t,t); gl.uniform2f(loc.m,m[0],m[1]);
        gl.uniform1f(loc.asp,w/h); gl.uniform1f(loc.dpr,dpr);
        gl.drawArrays(gl.POINTS,0,N);
      };
    }
  };

  /* ---------- Szene 3: Bandbreiten ---------- */
  var bandsScene = {
    name: "03 · Bandbreiten", bloom: 0.80, sun: [0.08,0.5], rays: 0.30,
    init: function(gl){
      var speeds = new Float32Array(9);
      for(var i=0;i<9;i++) speeds[i] = RUNS[i][1];

      var fs = [
        PREC, "varying vec2 uv;",
        "uniform float u_t; uniform vec2 u_m; uniform float u_asp; uniform float u_sp[9];",
        RAMP,
        "void main(){",
        "  vec3 col = mix(vec3(0.028,0.024,0.082), vec3(0.055,0.038,0.125), uv.y);",
        "  float land = clamp((u_asp-0.50)/1.10, 0.0, 1.0);",
        "  float freq = mix(14.0, 26.0, land);",
        "  float tight = mix(1500.0, 2600.0, land);",
        "  for(int i=0;i<9;i++){",
        "    float fi = float(i);",
        "    float yc = (fi+0.72)/9.6;",
        "    float sp = u_sp[i];",
        // leichte Welle, damit die Bänder nicht wie ein Lineal wirken
        "    float wob = 0.010*sin(uv.x*5.0 + fi*2.1 + u_t*0.20);",
        "    float d = uv.y - yc - wob;",
        "    float band = exp(-d*d*tight);",
        "    float glow = exp(-d*d*260.0);",
        "    float x = uv.x*1.6 - u_t*sp*0.155;",
        "    float pk = pow(0.5+0.5*sin(x*freq), 12.0);",
        "    float headx = fract(u_t*sp*0.038 + fi*0.11);",
        "    float head = exp(-pow((uv.x-headx)*7.5, 2.0));",
        "    vec3 c = ramp(0.16 + sp*0.80);",
        "    col += c*(band*(0.16 + pk*1.25) + glow*0.055 + band*head*1.6);",
        "  }",
        "  float d2 = length((uv-0.5-u_m*0.12)*vec2(1.3,1.0));",
        "  col *= 1.0 - smoothstep(0.35,0.95,d2)*0.55;",
        "  gl_FragColor = vec4(col,1.0);",
        "}"
      ].join("\n");

      var prog = program(gl, QUAD_VS, fs);
      var quad = quadBuffer(gl);
      var pA = gl.getAttribLocation(prog,"p");
      var uT = gl.getUniformLocation(prog,"u_t");
      var uM = gl.getUniformLocation(prog,"u_m");
      var uA = gl.getUniformLocation(prog,"u_asp");
      var uS = gl.getUniformLocation(prog,"u_sp[0]");

      return function(t, m, w, h){
        gl.viewport(0,0,w,h);
        gl.disable(gl.BLEND);
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(pA);
        gl.vertexAttribPointer(pA,2,gl.FLOAT,false,0,0);
        gl.uniform1f(uT,t); gl.uniform2f(uM,m[0],m[1]);
        gl.uniform1f(uA, w/h);
        gl.uniform1fv(uS, speeds);
        gl.drawArrays(gl.TRIANGLES,0,3);
      };
    }
  };

  /* ---------- Szene 4: Fluid mit Datenrelief ---------- */
  var fluidScene = {
    name: "04 · Fluid mit Datenrelief", bloom: 0.45, sun: [0.5,0.5], rays: 0.0,
    init: function(gl){
      // Prefill-Kurve auf 0..1 normiert, als Stützstellen in den Shader
      var cx = new Float32Array(7), cy = new Float32Array(7);
      for(var i=0;i<7;i++){
        cx[i] = PREFILL[i][0]/164.0;
        cy[i] = PREFILL[i][1]/520.0;
      }

      var fs = [
        PREC, "varying vec2 uv;",
        "uniform float u_t; uniform vec2 u_m; uniform float u_asp;",
        "uniform float u_cx[7]; uniform float u_cy[7];",
        RAMP, NOISE,
        "float curveY(float x){",
        "  float y = u_cy[0];",
        "  for(int i=0;i<6;i++){",
        "    float x0=u_cx[i], x1=u_cx[i+1];",
        "    if(x>=x0 && x<=x1){",
        "      float f=(x-x0)/max(x1-x0,0.0001);",
        "      f = f*f*(3.0-2.0*f);",
        "      y = mix(u_cy[i], u_cy[i+1], f);",
        "    }",
        "  }",
        "  if(x<u_cx[0]) y = u_cy[0];",
        "  if(x>u_cx[6]) y = u_cy[6];",
        "  return y;",
        "}",
        "void main(){",
        "  float land = clamp((u_asp-0.50)/1.10, 0.0, 1.0);",
        "  vec2 p = uv*vec2(mix(0.62,1.9,land), 1.0);",
        "  float t = u_t*0.055;",
        // doppelte Domänenverzerrung
        "  vec2 q = vec2(fbm(p+vec2(0.0,t)), fbm(p+vec2(4.7,-t*0.8)));",
        "  vec2 r = vec2(fbm(p+3.1*q+vec2(1.7,9.2)+t*0.6),",
        "                fbm(p+3.1*q+vec2(8.3,2.8)-t*0.4));",
        "  float f = fbm(p+2.6*r);",
        "  vec2 md = uv-(u_m*0.5+0.5);",
        "  f += 0.20*exp(-dot(md,md)*11.0);",
        "  vec3 col = ramp(smoothstep(0.24,0.86,f));",
        "  col *= 0.30 + 0.85*smoothstep(0.10,0.92,f);",
        // Höhenlinien
        "  float cl = abs(fract(f*9.0)-0.5);",
        "  col += vec3(0.55,0.62,0.85)*smoothstep(0.47,0.5,cl)*0.055;",
        // der Grat: die echte Prefill-Kurve
        "  float y = curveY(uv.x)*0.80 + 0.10;",
        "  float dd = abs(uv.y - y);",
        "  col += ramp(0.97)*exp(-dd*dd*3400.0)*0.80;",
        "  col += ramp(0.72)*exp(-dd*dd*260.0)*0.13;",
        // Fläche unter der Kurve leicht abdunkeln, damit der Grat trägt
        "  col *= 1.0 - smoothstep(0.0,0.30, y-uv.y)*0.30;",
        "  col *= 1.0 - smoothstep(0.35,1.10,length((uv-0.5)*vec2(1.25,1.0)))*0.62;",
        // heruntergeregelt: als Vollflächen-Hintergrund muss Text darauf bestehen können
        "  col = col*0.74 + vec3(0.016,0.013,0.048);",
        "  col *= 1.0 - smoothstep(0.10,0.75, 1.0-uv.x)*0.12;",
        "  gl_FragColor = vec4(col,1.0);",
        "}"
      ].join("\n");

      var prog = program(gl, QUAD_VS, fs);
      var quad = quadBuffer(gl);
      var tex = noiseTexture(gl);
      var pA = gl.getAttribLocation(prog,"p");
      var uT = gl.getUniformLocation(prog,"u_t");
      var uM = gl.getUniformLocation(prog,"u_m");
      var uX = gl.getUniformLocation(prog,"u_cx[0]");
      var uY = gl.getUniformLocation(prog,"u_cy[0]");
      var uN = gl.getUniformLocation(prog,"u_noise");
      var uA = gl.getUniformLocation(prog,"u_asp");

      return function(t, m, w, h){
        gl.viewport(0,0,w,h);
        gl.disable(gl.BLEND);
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(uN, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(pA);
        gl.vertexAttribPointer(pA,2,gl.FLOAT,false,0,0);
        gl.uniform1f(uT,t); gl.uniform2f(uM,m[0],m[1]);
        gl.uniform1f(uA, w/h);
        gl.uniform1fv(uX,cx); gl.uniform1fv(uY,cy);
        gl.drawArrays(gl.TRIANGLES,0,3);
      };
    }
  };

  var SCENES = { depth: depthScene, field: fieldScene, bands: bandsScene, fluid: fluidScene };

  /* ---------- GPU-Diagnose ---------- */
  var gpuReported = false;
  function reportGpu(gl){
    if(gpuReported) return;
    gpuReported = true;
    var el = document.getElementById("gpuinfo");
    if(!el) return;
    var hf = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    var mf = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
    var name = "unbekannt";
    try {
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if(dbg) name = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
    } catch(e){}
    var bits = hf ? hf.precision : 0;
    var warn = bits < 23
      ? ' <span class="warn">— highp fehlt im Fragment-Shader, deshalb kommt das Rauschen aus einer Textur</span>'
      : "";
    el.innerHTML =
      "<b>GPU</b> " + String(name).slice(0,70) +
      " &nbsp;·&nbsp; <b>highp</b> " + bits + " bit" +
      " &nbsp;·&nbsp; <b>mediump</b> " + (mf ? mf.precision : 0) + " bit" + warn;
  }

  /* ---------- Renderer ---------- */
  function mount(canvas, scene, maxDpr){
    var gl = canvas.getContext("webgl", {antialias:false, alpha:false, powerPreference:"high-performance"});
    if(!gl){
      var msg = document.createElement("div");
      msg.className = "nojs";
      msg.textContent = "WebGL steht hier nicht zur Verfügung.";
      canvas.parentNode.appendChild(msg);
      return null;
    }
    reportGpu(gl);
    var draw = scene.init(gl);
    if(!draw) return null;
    var post = makePost(gl);
    var bloomStr = (scene.bloom === undefined ? 0.7 : scene.bloom);
    var sunPos   = scene.sun  || [0.5, 0.5];
    var rayStr   = scene.rays || 0.0;

    var mouse = [0,0], target = [0,0];
    var dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    var edpr = dpr;
    var w = 1, h = 1;

    function resize(){
      var r = canvas.getBoundingClientRect();
      // volle Geraetedichte bis zu einem Pixelbudget — sonst wird es auf Retina weich
      var d = dpr, px = r.width*r.height*d*d, budget = 2600000;
      if(px > budget) d = d*Math.sqrt(budget/px);
      edpr = d;
      w = Math.max(1, Math.round(r.width*d));
      h = Math.max(1, Math.round(r.height*d));
      if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
    }
    resize();
    if(window.ResizeObserver){ new ResizeObserver(resize).observe(canvas); }
    else { window.addEventListener("resize", resize); }

    canvas.addEventListener("pointermove", function(e){
      var r = canvas.getBoundingClientRect();
      target[0] = ((e.clientX-r.left)/r.width)*2-1;
      target[1] = -(((e.clientY-r.top)/r.height)*2-1);
    });
    canvas.addEventListener("pointerleave", function(){ target[0]=0; target[1]=0; });

    var tNow = 0, raf = 0, last = 0, prev = 0, frames = 0;
    var onscreen = true, active = true;

    // liest echte Pixel aus dem Framebuffer — sagt eindeutig, ob ein Feld schwarz bleibt
    function probe(){
      try{
        var pts = [[0.25,0.50],[0.50,0.35],[0.72,0.62],[0.50,0.82]], out = [], px = new Uint8Array(4);
        for(var i=0;i<pts.length;i++){
          gl.readPixels(Math.round(pts[i][0]*w), Math.round(pts[i][1]*h), 1, 1,
                        gl.RGBA, gl.UNSIGNED_BYTE, px);
          out.push(px[0]+"/"+px[1]+"/"+px[2]);
        }
        PROBES.push("  " + scene.name + "  " + w + "x" + h + " @" + edpr.toFixed(2) +
                    "  Pixel: " + out.join("  "));
      }catch(e){ PROBES.push("  " + scene.name + "  Probe-Fehler: " + e.message); }
    }

    function frame(now){
      raf = requestAnimationFrame(frame);
      if(!onscreen || !active){ prev = 0; return; }
      // pausiert nur noch mit 4 fps weiterzeichnen — spart Akku, hält das Standbild korrekt
      var minGap = paused ? 250 : 15;
      if(now - last < minGap) return;
      last = now;
      var dt = prev ? Math.min((now - prev)/1000, 0.05) : 0;
      prev = now;
      // Zeit bei 3600 s umbrechen: unbegrenztes u_t frisst in sin() die Präzision auf
      if(!paused) tNow = (tNow + dt) % 3600;
      mouse[0] += (target[0]-mouse[0])*0.055;
      mouse[1] += (target[1]-mouse[1])*0.055;
      if(post){
        post.render(function(){ draw(tNow, mouse, w, h, edpr); }, w, h, tNow, bloomStr,
                    [sunPos[0] + mouse[0]*0.06, sunPos[1] - mouse[1]*0.06], rayStr);
      } else {
        draw(tNow, mouse, w, h, edpr);
      }
      if(++frames === 40) probe();
    }
    raf = requestAnimationFrame(frame);

    // was nicht im Bild ist, wird nicht gerechnet — auf dem Handy stehen alle vier untereinander
    if(window.IntersectionObserver){
      new IntersectionObserver(function(es){
        onscreen = es[0].isIntersecting;
        if(!onscreen) prev = 0;
      }, { threshold: 0.01 }).observe(canvas);
    }

    return {
      stop: function(){ cancelAnimationFrame(raf); },
      setActive: function(v){ active = v; if(!v) prev = 0; }
    };
  }

