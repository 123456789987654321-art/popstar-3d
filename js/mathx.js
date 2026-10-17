/* 数学工具：vec3 / mat3(列基表示) / mat4(列主序，可直接传给 WebGL) */
(function (g) {
  'use strict';

  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ],
    len: (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]),
    norm: (a) => {
      const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    }
  };

  const m4 = {
    create() {
      const o = new Float32Array(16);
      o[0] = o[5] = o[10] = o[15] = 1;
      return o;
    },

    perspective(out, fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2);
      const nf = 1 / (near - far);
      out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
      out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
      out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
      out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
      return out;
    },

    lookAt(out, eye, center, up) {
      let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
      let l = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
      zx /= l; zy /= l; zz /= l;

      let xx = up[1] * zz - up[2] * zy;
      let xy = up[2] * zx - up[0] * zz;
      let xz = up[0] * zy - up[1] * zx;
      l = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
      xx /= l; xy /= l; xz /= l;

      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;

      out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
      out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
      out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
      out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
      out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
      out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
      out[15] = 1;
      return out;
    },

    multiply(out, a, b) {
      for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      return out;
    },

    invert(out, m) {
      const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
      const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
      const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
      const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
      const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
      const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;

      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return null;
      det = 1 / det;

      out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return out;
    },

    /**
     * 由「三个正交基向量 + 中心 + 缩放」直接构造模型矩阵。
     * @param {Float32Array} out 16 元素输出
     * @param {number[]} e 9 元素，列主序基向量 [e0x,e0y,e0z, e1x,...]
     * @param {number[]} c 中心点
     * @param {number[]} s 三个轴的缩放（局部半边长 * 2，即盒子尺寸）
     */
    fromBasisScale(out, e, c, s) {
      out[0] = e[0] * s[0]; out[1] = e[1] * s[0]; out[2] = e[2] * s[0]; out[3] = 0;
      out[4] = e[3] * s[1]; out[5] = e[4] * s[1]; out[6] = e[5] * s[1]; out[7] = 0;
      out[8] = e[6] * s[2]; out[9] = e[7] * s[2]; out[10] = e[8] * s[2]; out[11] = 0;
      out[12] = c[0]; out[13] = c[1]; out[14] = c[2]; out[15] = 1;
      return out;
    }
  };

  /* mat3 用 9 元素列主序数组表示：[e0x,e0y,e0z, e1x,e1y,e1z, e2x,e2y,e2z] */
  const m3 = {
    fromAxisAngle(ax, ay, az, ang) {
      const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
      const x = ax / l, y = ay / l, z = az / l;
      const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
      return [
        t * x * x + c,     t * x * y + s * z, t * x * z - s * y,
        t * x * y - s * z, t * y * y + c,     t * y * z + s * x,
        t * x * z + s * y, t * y * z - s * x, t * z * z + c
      ];
    },

    /** 旋转矩阵作用在向量上：R * v */
    apply(m, v) {
      return [
        m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
        m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
        m[2] * v[0] + m[5] * v[1] + m[8] * v[2]
      ];
    },

    /** 把基向量的每一列都旋转一次 */
    rotateBasis(m, e, out) {
      const c0 = m3.apply(m, [e[0], e[1], e[2]]);
      const c1 = m3.apply(m, [e[3], e[4], e[5]]);
      const c2 = m3.apply(m, [e[6], e[7], e[8]]);
      out[0] = c0[0]; out[1] = c0[1]; out[2] = c0[2];
      out[3] = c1[0]; out[4] = c1[1]; out[5] = c1[2];
      out[6] = c2[0]; out[7] = c2[1]; out[8] = c2[2];
      return out;
    }
  };

  /* 数值小工具 */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const easeInQuad = (t) => t * t;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  g.MX = { v3, m4, m3, clamp, easeInQuad, easeInOutCubic };
})(typeof window !== 'undefined' ? window : globalThis);
