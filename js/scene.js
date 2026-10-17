/* WebGL 渲染层：立方体核 + 星星方块 + 粒子 + 射线拾取 */
(function (g) {
  'use strict';
  const MX = g.MX;
  const { v3, m4 } = MX;

  /* ============ 着色器 ============ */

  const TILE_VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'attribute vec2 aUV;',
    'attribute float aOut;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform mat4 uModel;',
    'varying vec3 vNormal;',
    'varying vec2 vUV;',
    'varying float vOut;',
    'varying vec3 vWorld;',
    'void main(){',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vWorld = wp.xyz;',
    // 立方体的面法线都是轴向量，非等比缩放后归一化即精确
    '  vNormal = normalize(mat3(uModel) * aNormal);',
    '  vUV = aUV;',
    '  vOut = aOut;',
    '  gl_Position = uProj * uView * wp;',
    '}'
  ].join('\n');

  const TILE_FS = [
    'precision mediump float;',
    'varying vec3 vNormal;',
    'varying vec2 vUV;',
    'varying float vOut;',
    'varying vec3 vWorld;',
    'uniform vec3 uColor;',
    'uniform vec3 uCamPos;',
    'uniform vec2 uFlags;',     // x: 圆角/边缘强度, y: 星形强度
    'uniform float uGridN;',    // >0 时在朝外面画 N×N 网格（给立方体核用）
    'uniform float uHighlight;',
    'uniform float uAlpha;',

    'float starR(float ang){',
    '  float seg = 6.28318530718 / 5.0;',
    '  float u = ang - 1.57079632679;',            // 让一个角朝正上方
    '  u = mod(u + seg * 0.5, seg) - seg * 0.5;',
    '  float t = abs(u) / (seg * 0.5);',
    '  return mix(0.40, 0.165, t);',
    '}',

    'void main(){',
    '  vec3 N = normalize(vNormal);',
    '  vec3 V = normalize(uCamPos - vWorld);',

    // 圆角方块 SDF（半边长 0.38 + 圆角 0.12 = 0.5，正好贴满这一面）
    '  vec2 q = abs(vUV) - 0.38;',
    '  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.12;',
    '  float inside = smoothstep(0.015, -0.03, d);',
    '  float edge = smoothstep(-0.03, 0.03, d);',

    // 五角星
    '  float rad = length(vUV);',
    '  float sr = starR(atan(vUV.y, vUV.x));',
    '  float star = smoothstep(sr + 0.012, sr - 0.012, rad) * vOut * uFlags.y;',

    '  vec3 base = uColor;',
    '  base = mix(base * 0.40, base, inside);',                  // 边缘压暗 -> 圆润感
    '  base *= 1.0 - 0.10 * edge * uFlags.x;',
    '  base = mix(base, mix(base, vec3(1.0), 0.46), star);',     // 星形提亮

    // 核上的浅网格：让空格子读得出来
    '  if (uGridN > 0.5) {',
    '    vec2 g = (vUV + 0.5) * uGridN;',
    '    vec2 fr = fract(g);',
    '    vec2 dd = min(fr, 1.0 - fr);',
    '    float line = 1.0 - smoothstep(0.0, 0.055, min(dd.x, dd.y));',
    '    base += vec3(0.055, 0.065, 0.115) * line;',
    '  }',

    '  vec3 L1 = normalize(vec3(-0.45, 0.90, 0.50));',
    '  vec3 L2 = normalize(vec3(0.70, 0.10, -0.65));',
    '  float diff = 0.42 + 0.58 * max(dot(N, L1), 0.0) + 0.30 * max(dot(N, L2), 0.0);',
    '  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
    '  float spec = pow(max(dot(reflect(-L1, N), V), 0.0), 30.0);',

    '  vec3 col = base * diff;',
    '  col += vec3(0.32, 0.46, 0.95) * rim * 0.55;',
    '  col += vec3(1.0) * spec * 0.22;',
    '  col += uHighlight * vec3(0.45, 0.42, 0.20);',            // 悬停高亮呼吸
    '  gl_FragColor = vec4(col, uAlpha);',
    '}'
  ].join('\n');

  const PT_VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aColor;',
    'attribute float aSize;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform float uPPU;',
    'varying vec3 vColor;',
    'void main(){',
    '  gl_Position = uProj * uView * vec4(aPos, 1.0);',
    '  gl_PointSize = max(1.0, aSize * uPPU / max(gl_Position.w, 0.15));',
    '  vColor = aColor;',
    '}'
  ].join('\n');

  const PT_FS = [
    'precision mediump float;',
    'varying vec3 vColor;',
    'void main(){',
    '  vec2 d = gl_PointCoord - 0.5;',
    '  float a = smoothstep(0.5, 0.06, length(d));',
    '  gl_FragColor = vec4(vColor, a);',
    '}'
  ].join('\n');

  function makeShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(s) + '\n' + src);
    }
    return s;
  }

  function makeProgram(gl, vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, makeShader(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, makeShader(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  /* 单位立方体（-0.5..0.5），每面局部 uv，+Z 面标记为「朝外面」 */
  function makeBox() {
    const faces = [
      { n: [0, 0, 1],  u: [1, 0, 0],  v: [0, 1, 0],  out: 1 },
      { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0],  out: 0 },
      { n: [1, 0, 0],  u: [0, 0, -1], v: [0, 1, 0],  out: 0 },
      { n: [-1, 0, 0], u: [0, 0, 1],  v: [0, 1, 0],  out: 0 },
      { n: [0, 1, 0],  u: [1, 0, 0],  v: [0, 0, -1], out: 0 },
      { n: [0, -1, 0], u: [1, 0, 0],  v: [0, 0, 1],  out: 0 }
    ];
    const pos = [], nor = [], uv = [], out = [], idx = [];
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

    faces.forEach((f) => {
      const base = pos.length / 3;
      corners.forEach(([a, b]) => {
        pos.push(
          f.n[0] * 0.5 + f.u[0] * a + f.v[0] * b,
          f.n[1] * 0.5 + f.u[1] * a + f.v[1] * b,
          f.n[2] * 0.5 + f.u[2] * a + f.v[2] * b
        );
        nor.push(f.n[0], f.n[1], f.n[2]);
        uv.push(a, b);
        out.push(f.out);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });

    return {
      pos: new Float32Array(pos),
      nor: new Float32Array(nor),
      uv: new Float32Array(uv),
      out: new Float32Array(out),
      idx: new Uint16Array(idx)
    };
  }

  /* ============ 粒子 ============ */
  const MAX_PT = 1400;

  class Particles {
    constructor() {
      this.n = 0;
      this.pos = new Float32Array(MAX_PT * 3);
      this.col = new Float32Array(MAX_PT * 3);
      this.siz = new Float32Array(MAX_PT);
      this.vel = new Float32Array(MAX_PT * 3);
      this.life = new Float32Array(MAX_PT);
      this.max = new Float32Array(MAX_PT);
      this.drag = new Float32Array(MAX_PT);
      this.grav = new Float32Array(MAX_PT);
    }

    spawn(p, color, opts) {
      if (this.n >= MAX_PT) return;
      const i = this.n++;
      const o = opts || {};
      this.pos[i * 3] = p[0]; this.pos[i * 3 + 1] = p[1]; this.pos[i * 3 + 2] = p[2];
      const sp = o.speed || 3.2;
      const d = v3.norm([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]);
      const dir = o.dir ? v3.add(v3.mul(d, 0.55), o.dir) : d;
      const dd = v3.norm([
        dir[0] + (Math.random() - 0.5) * 0.5,
        dir[1] + (Math.random() - 0.5) * 0.5,
        dir[2] + (Math.random() - 0.5) * 0.5
      ]);
      const v = sp * (0.55 + Math.random() * 0.75);
      this.vel[i * 3] = dd[0] * v; this.vel[i * 3 + 1] = dd[1] * v; this.vel[i * 3 + 2] = dd[2] * v;
      const tint = 0.7 + Math.random() * 0.55;
      this.col[i * 3] = Math.min(1, color[0] * tint + 0.10);
      this.col[i * 3 + 1] = Math.min(1, color[1] * tint + 0.10);
      this.col[i * 3 + 2] = Math.min(1, color[2] * tint + 0.10);
      this.siz[i] = (o.size || 0.055) * (0.6 + Math.random() * 0.9);
      this.max[i] = (o.life || 0.7) * (0.7 + Math.random() * 0.7);
      this.life[i] = this.max[i];
      this.grav[i] = o.gravity === undefined ? 5.0 : o.gravity;
      this.drag[i] = o.drag === undefined ? 1.4 : o.drag;
    }

    burst(p, color, count, opts) {
      for (let k = 0; k < count; k++) this.spawn(p, color, opts);
    }

    update(dt) {
      for (let i = this.n - 1; i >= 0; i--) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          const last = --this.n;
          if (i !== last) {
            for (let k = 0; k < 3; k++) {
              this.pos[i * 3 + k] = this.pos[last * 3 + k];
              this.col[i * 3 + k] = this.col[last * 3 + k];
              this.vel[i * 3 + k] = this.vel[last * 3 + k];
            }
            this.siz[i] = this.siz[last]; this.life[i] = this.life[last];
            this.max[i] = this.max[last]; this.grav[i] = this.grav[last]; this.drag[i] = this.drag[last];
          }
          continue;
        }
        const f = Math.pow(0.02, dt * this.drag[i] * 0.5);
        this.vel[i * 3] *= f;
        this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * f - this.grav[i] * dt;
        this.vel[i * 3 + 2] *= f;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      }
    }

    clear() { this.n = 0; }
  }

  /* ============ 场景 ============ */

  class Scene {
    constructor(canvas) {
      const opts = { alpha: true, antialias: true, depth: true, premultipliedAlpha: false };
      const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (!gl) throw new Error('当前浏览器/显卡驱动不支持 WebGL，无法运行 3D 版本。');
      this.gl = gl;
      this.canvas = canvas;

      const box = makeBox();
      this.vbo = {
        pos: gl.createBuffer(), nor: gl.createBuffer(), uv: gl.createBuffer(), out: gl.createBuffer(),
        idx: gl.createBuffer()
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.pos); gl.bufferData(gl.ARRAY_BUFFER, box.pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.nor); gl.bufferData(gl.ARRAY_BUFFER, box.nor, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.uv); gl.bufferData(gl.ARRAY_BUFFER, box.uv, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.out); gl.bufferData(gl.ARRAY_BUFFER, box.out, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.vbo.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, box.idx, gl.STATIC_DRAW);
      this.boxCount = box.idx.length;

      this.progTile = makeProgram(gl, TILE_VS, TILE_FS);
      this.tileLoc = this._locs(this.progTile, [
        'aPos', 'aNormal', 'aUV', 'aOut', 'uProj', 'uView', 'uModel',
        'uColor', 'uCamPos', 'uFlags', 'uGridN', 'uHighlight', 'uAlpha'
      ]);

      this.progPt = makeProgram(gl, PT_VS, PT_FS);
      this.ptLoc = this._locs(this.progPt, ['aPos', 'aColor', 'aSize', 'uProj', 'uView', 'uPPU']);
      this.ptVbo = { pos: gl.createBuffer(), col: gl.createBuffer(), siz: gl.createBuffer() };

      this.particles = new Particles();

      // 相机
      this.yaw = 0.62;
      this.pitch = 0.42;
      this.dist = 7.2;
      this.fitDist = 7.2;
      this.fov = 45 * Math.PI / 180;
      this.shake = 0;
      this.shakeT = 0;
      this.eye = [0, 0, 7];
      this.target = [0, 0, 0];

      this.proj = m4.create();
      this.view = m4.create();
      this.vp = m4.create();
      this.invVP = m4.create();
      this.tmpM = m4.create();
      this.tmpM2 = m4.create();
      this.tmpV = new Float32Array(4);
      this.time = 0;

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      this.resize();
    }

    _locs(prog, names) {
      const gl = this.gl, o = {};
      names.forEach((n) => {
        o[n] = n.charAt(0) === 'a'
          ? gl.getAttribLocation(prog, n)
          : gl.getUniformLocation(prog, n);
      });
      return o;
    }

    resize() {
      const c = this.canvas;
      const dpr = Math.min(g.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(c.clientWidth * dpr));
      const h = Math.max(1, Math.floor(c.clientHeight * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      this.w = w; this.h = h; this.dpr = dpr;
      this.aspect = w / h;

      const hy = this.fov / 2;
      const hx = Math.atan(Math.tan(hy) * this.aspect);
      this.fitDist = 2.42 / Math.sin(Math.min(hy, hx));   // 立方体外接球半径约 2.42
      this.ppu = (h * 0.5) / Math.tan(hy);
      this.gl.viewport(0, 0, w, h);
    }

    setCamera(yaw, pitch, dist) {
      this.yaw = yaw; this.pitch = pitch; this.dist = dist;
    }

    updateCamera(dt) {
      this.time += dt;
      if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt * 2.6);

      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      let ex = this.dist * cp * Math.sin(this.yaw);
      let ey = this.dist * sp;
      let ez = this.dist * cp * Math.cos(this.yaw);

      if (this.shakeT > 0) {
        const s = this.shake * this.shakeT * this.shakeT * 0.35;
        ex += (Math.random() - 0.5) * s;
        ey += (Math.random() - 0.5) * s;
        ez += (Math.random() - 0.5) * s;
      }
      this.eye = [ex, ey, ez];
    }

    addShake(v) { this.shake = Math.max(this.shake, v); this.shakeT = 1; }

    beginFrame() {
      const gl = this.gl;
      m4.perspective(this.proj, this.fov, this.aspect, 0.3, 60);
      m4.lookAt(this.view, this.eye, this.target, [0, 1, 0]);
      m4.multiply(this.vp, this.proj, this.view);
      m4.invert(this.invVP, this.vp);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.useProgram(this.progTile);
      gl.uniformMatrix4fv(this.tileLoc.uProj, false, this.proj);
      gl.uniformMatrix4fv(this.tileLoc.uView, false, this.view);
      gl.uniform3fv(this.tileLoc.uCamPos, this.eye);
      this._bindBox(this.progTile, this.tileLoc);
    }

    _bindBox(prog, loc) {
      const gl = this.gl;
      const bind = (buf, attrib, size) => {
        if (attrib < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(attrib);
        gl.vertexAttribPointer(attrib, size, gl.FLOAT, false, 0, 0);
      };
      bind(this.vbo.pos, loc.aPos, 3);
      bind(this.vbo.nor, loc.aNormal, 3);
      bind(this.vbo.uv, loc.aUV, 2);
      bind(this.vbo.out, loc.aOut, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.vbo.idx);
    }

    /** 画一个方块（用盒子几何 + 模型矩阵） */
    drawBox(model, color, flags, highlight, alpha, gridN) {
      const gl = this.gl, L = this.tileLoc;
      gl.uniformMatrix4fv(L.uModel, false, model);
      gl.uniform3fv(L.uColor, color);
      gl.uniform2f(L.uFlags, flags[0], flags[1]);
      gl.uniform1f(L.uGridN, gridN || 0);
      gl.uniform1f(L.uHighlight, highlight);
      gl.uniform1f(L.uAlpha, alpha);
      gl.depthMask(alpha > 0.985);
      gl.drawElements(gl.TRIANGLES, this.boxCount, gl.UNSIGNED_SHORT, 0);
    }

    drawCore(size, color, gridN) {
      m4.fromBasisScale(this.tmpM, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], [size, size, size]);
      this.drawBox(this.tmpM, color, [0.3, 0.0], 0, 1, gridN);
    }

    drawParticles() {
      const gl = this.gl, p = this.particles;
      if (p.n === 0) return;
      gl.useProgram(this.progPt);
      gl.uniformMatrix4fv(this.ptLoc.uProj, false, this.proj);
      gl.uniformMatrix4fv(this.ptLoc.uView, false, this.view);
      gl.uniform1f(this.ptLoc.uPPU, this.ppu);
      gl.depthMask(false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      const buf = (b, data, attrib, size) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(attrib);
        gl.vertexAttribPointer(attrib, size, gl.FLOAT, false, 0, 0);
      };
      buf(this.ptVbo.pos, p.pos.subarray(0, p.n * 3), this.ptLoc.aPos, 3);
      buf(this.ptVbo.col, p.col.subarray(0, p.n * 3), this.ptLoc.aColor, 3);
      buf(this.ptVbo.siz, p.siz.subarray(0, p.n), this.ptLoc.aSize, 1);
      gl.drawArrays(gl.POINTS, 0, p.n);

      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.progTile);
      gl.uniformMatrix4fv(this.tileLoc.uProj, false, this.proj);
      gl.uniformMatrix4fv(this.tileLoc.uView, false, this.view);
      gl.uniform3fv(this.tileLoc.uCamPos, this.eye);
      this._bindBox(this.progTile, this.tileLoc);
      gl.depthMask(true);
    }

    /* ---------- 屏幕坐标 -> 射线 ---------- */
    _ray(nx, ny) {
      const inv = this.invVP;
      const mul = (x, y, z) => {
        const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15];
        const iw = w ? 1 / w : 1;
        return [
          (inv[0] * x + inv[4] * y + inv[8] * z + inv[12]) * iw,
          (inv[1] * x + inv[5] * y + inv[9] * z + inv[13]) * iw,
          (inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) * iw
        ];
      };
      const far = mul(nx, ny, 1);
      return { o: this.eye, d: v3.norm(v3.sub(far, this.eye)) };
    }

    /** 射线与轴对齐盒 [-1,1]^3 求交，返回进入参数 t（无交返回 Infinity） */
    static rayBox(o, d, half) {
      let tmin = -Infinity, tmax = Infinity;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (o[a] < -half || o[a] > half) return Infinity;
        } else {
          let t1 = (-half - o[a]) / d[a];
          let t2 = (half - o[a]) / d[a];
          if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) return Infinity;
        }
      }
      return tmax < 0 ? Infinity : tmin;
    }

    /**
     * 拾取。tiles 为渲染列表，每项含 { id, center, basis, size }。
     * 立方体核会挡住背面的方块，所以只返回最靠前且未被核遮挡的那块。
     */
    pick(nx, ny, tiles) {
      const ray = this._ray(nx, ny);
      const coreT = Scene.rayBox(ray.o, ray.d, 1.0);
      let bestT = Infinity, bestId = -1;

      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const e = t.basis, s = t.size;
        const dx = ray.o[0] - t.center[0], dy = ray.o[1] - t.center[1], dz = ray.o[2] - t.center[2];
        const lo = [
          (dx * e[0] + dy * e[1] + dz * e[2]) / s[0],
          (dx * e[3] + dy * e[4] + dz * e[5]) / s[1],
          (dx * e[6] + dy * e[7] + dz * e[8]) / s[2]
        ];
        const ld = [
          (ray.d[0] * e[0] + ray.d[1] * e[1] + ray.d[2] * e[2]) / s[0],
          (ray.d[0] * e[3] + ray.d[1] * e[4] + ray.d[2] * e[5]) / s[1],
          (ray.d[0] * e[6] + ray.d[1] * e[7] + ray.d[2] * e[8]) / s[2]
        ];
        const tt = Scene.rayBox(lo, ld, 0.5);
        if (tt === Infinity || tt < 0) continue;
        if (tt > coreT + 1e-3) continue;         // 被立方体核挡住
        if (tt < bestT) { bestT = tt; bestId = t.id; }
      }
      return bestId;
    }

    project(p) {
      const m = this.vp;
      const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
      const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
      const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      if (w <= 0.001) return null;
      const iw = 1 / w;
      return [(x * iw * 0.5 + 0.5) * this.w / this.dpr, (1 - (y * iw * 0.5 + 0.5)) * this.h / this.dpr];
    }
  }

  g.Scene = Scene;
})(typeof window !== 'undefined' ? window : globalThis);
