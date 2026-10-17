/* 立方体棋盘：六面拓扑 / 连通组 / 消除 / 逐面重力 */
(function (g) {
  'use strict';

  /**
   * 六个面。n = 外法线，d = 该面「向下」方向（四个侧面 = 世界 -Y；
   * 顶面与底面 = 世界 +Z，即朝观察者的前方），r = 该面的「向右」= n × d。
   * 面序号：0 +Z(前) / 1 +X(右) / 2 -Z(后) / 3 -X(左) / 4 +Y(上) / 5 -Y(下)
   */
  const FACE_DEF = [
    { n: [0, 0, 1],  d: [0, -1, 0] },
    { n: [1, 0, 0],  d: [0, -1, 0] },
    { n: [0, 0, -1], d: [0, -1, 0] },
    { n: [-1, 0, 0], d: [0, -1, 0] },
    { n: [0, 1, 0],  d: [0, 0, 1] },
    { n: [0, -1, 0], d: [0, 0, 1] }
  ];

  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

  class Board {
    constructor(N) {
      this.N = N;
      this.h = 1;                 // 立方体半边长
      this.pitch = 2 / N;         // 每格间距
      this.perFace = N * N;
      this.size = 6 * N * N;      // 总格数
      this.color = new Int8Array(this.size).fill(-1);   // -1 = 空

      this.faces = FACE_DEF.map((f) => ({
        n: f.n.slice(),
        d: f.d.slice(),
        r: cross(f.n, f.d).map(Math.round)
      }));

      this.nbr = this._buildNeighbors();   // Int16Array(size*4)，-1 表示无
    }

    /* ---------- 索引 ---------- */
    id(f, i, j) { return (f * this.N + i) * this.N + j; }
    faceOf(id) { return (id / this.perFace) | 0; }
    rowOf(id) { return (((id % this.perFace) / this.N) | 0); }
    colOf(id) { return id % this.N; }
    idOfFace(f) { return f * this.perFace; }

    /** 该面中心到某格的表面点（不含方块厚度） */
    cellPos(f, i, j) {
      const F = this.faces[f], N = this.N, p = this.pitch;
      const a = (j - (N - 1) / 2) * p;
      const b = (i - (N - 1) / 2) * p;
      const n = F.n, r = F.r, d = F.d;
      return [
        n[0] * this.h + r[0] * a + d[0] * b,
        n[1] * this.h + r[1] * a + d[1] * b,
        n[2] * this.h + r[2] * a + d[2] * b
      ];
    }

    cellCenter(id) {
      return this.cellPos(this.faceOf(id), this.rowOf(id), this.colOf(id));
    }

    /** 该格所在面的局部坐标系（列基）：局部 +Z 朝外，+X 向右，+Y 向上 */
    faceBasis(f) {
      const F = this.faces[f];
      const n = F.n, r = F.r, d = F.d;
      return [
        r[0], r[1], r[2],
        -d[0], -d[1], -d[2],
        n[0], n[1], n[2]
      ];
    }

    /* ---------- 邻接表（含跨棱边） ---------- */
    _buildNeighbors() {
      const N = this.N, h = this.h, p = this.pitch;
      const eps = 1e-6;
      const out = new Int16Array(this.size * 4).fill(-1);

      // 方向顺序：0:+r 1:-r 2:+d 3:-d
      const faceIndexOfNormal = (v) => {
        for (let f = 0; f < 6; f++) if (same(this.faces[f].n, v)) return f;
        return -1;
      };

      for (let f = 0; f < 6; f++) {
        const F = this.faces[f];
        const dirs = [
          F.r, [-F.r[0], -F.r[1], -F.r[2]],
          F.d, [-F.d[0], -F.d[1], -F.d[2]]
        ];

        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            const p0 = this.cellPos(f, i, j);

            for (let k = 0; k < 4; k++) {
              const dir = dirs[k];
              const t = p0[0] * dir[0] + p0[1] * dir[1] + p0[2] * dir[2];

              if (t <= h - p * 0.5 - eps) {
                // 还在同一面内
                const q = [p0[0] + dir[0] * p, p0[1] + dir[1] * p, p0[2] + dir[2] * p];
                const a = q[0] * F.r[0] + q[1] * F.r[1] + q[2] * F.r[2];
                const b = q[0] * F.d[0] + q[1] * F.d[1] + q[2] * F.d[2];
                const jj = Math.round(a / p + (N - 1) / 2);
                const ii = Math.round(b / p + (N - 1) / 2);
                out[(this.id(f, i, j)) * 4 + k] = this.id(f, ii, jj);
              } else {
                // 翻过棱边：法线换成 dir，位置 p + (dir - n) * pitch/2
                const g2 = faceIndexOfNormal(dir);
                const G = this.faces[g2];
                const q = [
                  p0[0] + (dir[0] - F.n[0]) * p * 0.5,
                  p0[1] + (dir[1] - F.n[1]) * p * 0.5,
                  p0[2] + (dir[2] - F.n[2]) * p * 0.5
                ];
                const a = q[0] * G.r[0] + q[1] * G.r[1] + q[2] * G.r[2];
                const b = q[0] * G.d[0] + q[1] * G.d[1] + q[2] * G.d[2];
                const jj = Math.round(a / p + (N - 1) / 2);
                const ii = Math.round(b / p + (N - 1) / 2);
                out[(this.id(f, i, j)) * 4 + k] = this.id(g2, ii, jj);
              }
            }
          }
        }
      }
      return out;
    }

    neighbors(id) {
      const o = id * 4;
      return [this.nbr[o], this.nbr[o + 1], this.nbr[o + 2], this.nbr[o + 3]];
    }

    /* ---------- 玩法 ---------- */
    colorOf(id) { return this.color[id]; }

    /** 找同色连通组（含跨棱边），返回格 id 数组（可含单块） */
    groupOf(id) {
      const c = this.color[id];
      if (c < 0) return [];
      const seen = new Uint8Array(this.size);
      const out = [];
      const stack = [id];
      seen[id] = 1;
      while (stack.length) {
        const cur = stack.pop();
        out.push(cur);
        const nb = this.nbr;
        for (let k = 0; k < 4; k++) {
          const nx = nb[cur * 4 + k];
          if (nx >= 0 && !seen[nx] && this.color[nx] === c) {
            seen[nx] = 1;
            stack.push(nx);
          }
        }
      }
      return out;
    }

    /** 是否还存在可消除的组（≥2 同色相邻） */
    hasMoves() {
      const nb = this.nbr, col = this.color;
      for (let id = 0; id < this.size; id++) {
        const c = col[id];
        if (c < 0) continue;
        for (let k = 0; k < 4; k++) {
          const nx = nb[id * 4 + k];
          if (nx >= 0 && col[nx] === c) return true;
        }
      }
      return false;
    }

    aliveCount() {
      let n = 0;
      for (let i = 0; i < this.size; i++) if (this.color[i] >= 0) n++;
      return n;
    }

    remove(ids) {
      for (let i = 0; i < ids.length; i++) this.color[ids[i]] = -1;
    }

    /**
     * 逐面重力：每一面沿自己的「向下」方向把方块压到该列底部。
     * 返回移动列表 [{ from, to, dist, dir }]，from/to 为格 id，dir 为世界方向。
     */
    applyGravity() {
      const N = this.N, moves = [];

      for (let f = 0; f < 6; f++) {
        const base = f * this.perFace;
        for (let j = 0; j < N; j++) {
          let write = N - 1;
          for (let i = N - 1; i >= 0; i--) {
            const from = base + i * N + j;
            const c = this.color[from];
            if (c < 0) continue;
            if (write !== i) {
              const to = base + write * N + j;
              this.color[to] = c;
              this.color[from] = -1;
              const a = this.cellPos(f, i, j);
              const b = this.cellPos(f, write, j);
              moves.push({
                from, to,
                dist: write - i,
                dy: b[1] - a[1],
                dir: [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
              });
            }
            write--;
          }
        }
      }
      return moves;
    }

    /** 随机填充（避免开局就出现超大团，视觉上更像传统消灭星星） */
    fillRandom(colorCount, rnd) {
      const s = this.size;
      for (let tries = 0; tries < 40; tries++) {
        for (let i = 0; i < s; i++) this.color[i] = (rnd() * colorCount) | 0;
        if (this.hasMoves()) {
          // 统计一下最大连通块，太大就重来（超过 45% 就换一版）
          const seen = new Uint8Array(s);
          let max = 0;
          for (let i = 0; i < s; i++) {
            if (seen[i]) continue;
            const c = this.color[i];
            let n = 0;
            const st = [i];
            seen[i] = 1;
            while (st.length) {
              const cur = st.pop(); n++;
              for (let k = 0; k < 4; k++) {
                const nx = this.nbr[cur * 4 + k];
                if (nx >= 0 && !seen[nx] && this.color[nx] === c) { seen[nx] = 1; st.push(nx); }
              }
            }
            if (n > max) max = n;
          }
          if (max <= s * 0.45 || tries >= 30) return;
        }
      }
    }
  }

  g.Board = Board;
  g.FACE_DEF = FACE_DEF;
})(typeof window !== 'undefined' ? window : globalThis);
