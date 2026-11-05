import * as THREE from 'three';

/**
 * VoxelBuilder 收集体素放置指令，最终按空间 chunk 合并为多个 InstancedMesh:
 *  - solid: MeshLambertMaterial，参与光照与阴影
 *  - glow : MeshBasicMaterial（toneMapped=false），自发光（霓虹/窗户/路灯）
 * 每条记录: [x, y, z, sx, sy, sz, colorHex]
 *
 * 优化：
 *  - 城市 ±544 按 136 划分为 8×8=64 个空间 chunk，每个非空 chunk 一个
 *    InstancedMesh，配合手动计算的 boundingSphere 让视锥剔除生效
 *  - 支持分批构建，避免一次性创建百万级体素导致卡顿
 *  - 构建完成后清空内部记录数组，释放内存
 */

// 空间 chunk 网格：±544 / 136 = 8×8
const CHUNK_SIZE = 136;
const CHUNK_HALF = 544;
const CHUNK_COUNT = 8;

function chunkIndex(x, z) {
  const cx = Math.min(Math.max(Math.floor((x + CHUNK_HALF) / CHUNK_SIZE), 0), CHUNK_COUNT - 1);
  const cz = Math.min(Math.max(Math.floor((z + CHUNK_HALF) / CHUNK_SIZE), 0), CHUNK_COUNT - 1);
  return cx * CHUNK_COUNT + cz;
}

/** 按 chunk 分桶，返回 Map<chunkIdx, records[]> */
function bucketByChunk(list) {
  const buckets = new Map();
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    const k = chunkIndex(v[0], v[2]);
    let arr = buckets.get(k);
    if (!arr) {
      arr = [];
      buckets.set(k, arr);
    }
    arr.push(v);
  }
  return buckets;
}

export class VoxelBuilder {
  constructor(opts = {}) {
    this.solid = [];
    this.glow = [];
    this.keepRecords = !!opts.keepRecords;
  }

  /** 单个体素，中心位于整数坐标 */
  add(x, y, z, color, emissive = false) {
    (emissive ? this.glow : this.solid).push([x, y, z, 1, 1, 1, color]);
  }

  /** 以中心点 + 尺寸放置一个缩放体素块（大面积填充用，节省实例数） */
  boxC(cx, cy, cz, sx, sy, sz, color, emissive = false) {
    (emissive ? this.glow : this.solid).push([cx, cy, cz, sx, sy, sz, color]);
  }

  /** 以两个角点（含端点）放置缩放体素块 */
  box(x0, y0, z0, x1, y1, z1, color, emissive = false) {
    this.boxC(
      (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
      Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1, Math.abs(z1 - z0) + 1,
      color, emissive,
    );
  }

  /**
   * 分批构建：体素按 chunk 分桶，每个非空 chunk 输出一个 InstancedMesh
   * @param {number} batchSize 每批次的体素数量，默认 50000
   * @param {Function} onProgress 进度回调 (current, total, type)
   * @returns {Promise<{group, counts}>}
   */
  async buildBatched(batchSize = 50000, onProgress = null) {
    const group = new THREE.Group();
    const totalSolid = this.solid.length;
    const totalGlow = this.glow.length;
    const total = totalSolid + totalGlow;
    const geo = new THREE.BoxGeometry(1, 1, 1);

    let processed = 0;

    // 构建实体部分
    if (totalSolid > 0) {
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
      for (const records of bucketByChunk(this.solid).values()) {
        const mesh = await this._buildChunkBatched(geo, material, records, batchSize, (current) => {
          if (onProgress) onProgress(processed + current, total, 'solid');
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        processed += records.length;
      }
    }

    // 构建发光部分
    if (totalGlow > 0) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      for (const records of bucketByChunk(this.glow).values()) {
        const mesh = await this._buildChunkBatched(geo, material, records, batchSize, (current) => {
          if (onProgress) onProgress(processed + current, total, 'glow');
        });
        group.add(mesh);
        processed += records.length;
      }
    }

    // 释放记录数组内存
    this.solid.length = 0;
    this.glow.length = 0;

    return {
      group,
      counts: { solid: totalSolid, glow: totalGlow },
    };
  }

  /**
   * 同步构建（适用于小场景），同样按 chunk 输出
   */
  build() {
    const group = new THREE.Group();
    const totalSolid = this.solid.length;
    const totalGlow = this.glow.length;
    const geo = new THREE.BoxGeometry(1, 1, 1);

    if (totalSolid > 0) {
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
      for (const records of bucketByChunk(this.solid).values()) {
        const mesh = buildChunkMesh(geo, material, records);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
    if (totalGlow > 0) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      for (const records of bucketByChunk(this.glow).values()) {
        group.add(buildChunkMesh(geo, material, records));
      }
    }

    this.solid.length = 0;
    this.glow.length = 0;

    return { group, counts: { solid: totalSolid, glow: totalGlow } };
  }

  /**
   * 分批填充一个 chunk 的 InstancedMesh
   * @private
   */
  async _buildChunkBatched(geo, material, records, batchSize, onProgress) {
    const mesh = new THREE.InstancedMesh(geo, material, records.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();

    for (let start = 0; start < records.length; start += batchSize) {
      const end = Math.min(start + batchSize, records.length);

      for (let i = start; i < end; i++) {
        const v = records[i];
        p.set(v[0], v[1], v[2]);
        s.set(v[3], v[4], v[5]);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(v[6]));
      }

      // 报告进度
      if (onProgress) onProgress(end);

      // 让出控制权，避免阻塞主线程
      if (end < records.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    finishChunkMesh(mesh, records);
    return mesh;
  }
}

/** 同步填充一个 chunk 的 InstancedMesh */
function buildChunkMesh(geo, material, records) {
  const mesh = new THREE.InstancedMesh(geo, material, records.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < records.length; i++) {
    const v = records[i];
    p.set(v[0], v[1], v[2]);
    s.set(v[3], v[4], v[5]);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHex(v[6]));
  }
  finishChunkMesh(mesh, records);
  return mesh;
}

/**
 * 收尾：上传实例数据 + 手动计算覆盖本 chunk 全部实例的包围球
 * （InstancedMesh 的视锥剔除用 object.boundingSphere，几何体自身的包围球
 *  只覆盖单位盒子，必须按实例中心 + 半径重算）
 */
function finishChunkMesh(mesh, records) {
  mesh.count = records.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const center = new THREE.Vector3();
  for (let i = 0; i < records.length; i++) {
    center.x += records[i][0];
    center.y += records[i][1];
    center.z += records[i][2];
  }
  center.multiplyScalar(1 / records.length);

  let radius = 0;
  for (let i = 0; i < records.length; i++) {
    const v = records[i];
    const dx = v[0] - center.x;
    const dy = v[1] - center.y;
    const dz = v[2] - center.z;
    // 实例中心距离 + 该缩放盒子的半对角线，保守覆盖整个实例
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      + 0.5 * Math.sqrt(v[3] * v[3] + v[4] * v[4] + v[5] * v[5]);
    if (d > radius) radius = d;
  }
  mesh.boundingSphere = new THREE.Sphere(center, radius);
}
