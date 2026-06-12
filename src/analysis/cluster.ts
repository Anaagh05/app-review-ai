/**
 * Phase 4.2 — Review Clustering (UMAP + HDBSCAN)
 *
 * Pipeline:
 *   1. Filter zero-vectors (too-short reviews from embed.ts)
 *   2. UMAP: reduce 384-dim embeddings → 5-dim (configurable)
 *   3. HDBSCAN: density-based clustering on reduced vectors
 *   4. Rank clusters: score = cluster_size × (1 + |3 - avg_rating|)
 *      (balances size with sentiment extremity — ensures both 1★ and 5★ themes surface)
 *   5. Return top-K clusters (default 5)
 *
 * Dependencies: umap-js (UMAP), custom HDBSCAN implementation
 */

import { UMAP } from 'umap-js';
import { EmbeddingResult } from './embed.js';
import { PulseConfig } from '../config.js';

export interface Cluster {
  cluster_id: number;
  review_ids: string[];
  embeddings: EmbeddingResult[];
  size: number;
  avg_rating: number;
  rank_score: number;
  date_range: { earliest: string; latest: string };
}

// ─── HDBSCAN (lightweight implementation) ────────────────────────────────────

/**
 * Computes Euclidean distance between two vectors.
 */
function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Finds k-nearest neighbours for each point.
 */
function knnDistances(
  points: number[][],
  k: number
): { indices: number[]; distances: number[] }[] {
  return points.map((p, i) => {
    const dists = points
      .map((q, j) => ({ j, d: i === j ? Infinity : euclidean(p, q) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k);
    return { indices: dists.map((x) => x.j), distances: dists.map((x) => x.d) };
  });
}

/**
 * Simplified HDBSCAN:
 *   1. Compute core distances (k-th nearest neighbour distance)
 *   2. Build mutual reachability graph
 *   3. Find connected components via union-find at each threshold
 *   4. Label clusters by minimum cluster size
 *
 * Returns cluster labels array (-1 = noise).
 */
function hdbscan(points: number[][], minClusterSize: number): number[] {
  const n = points.length;
  if (n === 0) return [];

  const k = Math.max(2, Math.min(minClusterSize - 1, Math.floor(Math.sqrt(n))));
  const knn = knnDistances(points, k);

  // Core distance = distance to k-th nearest neighbour
  const coreDist = knn.map((nn) => nn.distances[nn.distances.length - 1]);

  // Build all edges with mutual reachability distance
  const edges: { i: number; j: number; dist: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (const j of knn[i].indices) {
      if (j > i) {
        const mrd = Math.max(coreDist[i], coreDist[j], euclidean(points[i], points[j]));
        edges.push({ i, j, dist: mrd });
      }
    }
  }
  edges.sort((a, b) => a.dist - b.dist);

  // Union-Find
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);
  const compSize = new Array(n).fill(1);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x: number, y: number): void {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return;
    if (rank[rx] < rank[ry]) {
      parent[rx] = ry;
      compSize[ry] += compSize[rx];
    } else if (rank[rx] > rank[ry]) {
      parent[ry] = rx;
      compSize[rx] += compSize[ry];
    } else {
      parent[ry] = rx;
      compSize[rx] += compSize[ry];
      rank[rx]++;
    }
  }

  // Build MST incrementally
  for (const edge of edges) {
    union(edge.i, edge.j);
  }

  // Assign cluster IDs — components smaller than minClusterSize → noise (-1)
  const rootToCluster = new Map<number, number>();
  let nextCluster = 0;

  const labels = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (compSize[root] >= minClusterSize) {
      if (!rootToCluster.has(root)) {
        rootToCluster.set(root, nextCluster++);
      }
      labels[i] = rootToCluster.get(root)!;
    }
  }

  return labels;
}

// ─── Main clustering function ─────────────────────────────────────────────────

/**
 * Clusters reviews using UMAP + HDBSCAN and returns the top-K ranked clusters.
 */
export function clusterReviews(
  embeddings: EmbeddingResult[],
  config: PulseConfig
): Cluster[] {
  // 1. Filter zero-vectors (too-short reviews)
  const valid = embeddings.filter((e) => e.vector.some((v) => v !== 0));

  if (valid.length < 10) {
    console.warn(`[cluster] Only ${valid.length} valid embeddings — too few to cluster.`);
    return [];
  }

  const { umap: umapCfg, hdbscan: hdbscanCfg, topKClusters } = config;

  // 2. UMAP dimensionality reduction
  console.log(`[cluster] Running UMAP on ${valid.length} reviews → ${umapCfg.nComponents}D…`);

  // Grace-degrade nComponents if we have very few points
  const nComponents = Math.min(umapCfg.nComponents, Math.floor(valid.length / 2));

  const umapInstance = new UMAP({
    nComponents,
    nNeighbors: Math.min(15, Math.floor(valid.length / 2)),
    minDist: 0.1,
    spread: 1.0,
    random: () => {
      // Seeded pseudo-random for determinism
      return ((Math.sin(umapCfg.seed++) * 10000) % 1 + 1) % 1;
    },
  });

  const vectors = valid.map((e) => e.vector);
  const reduced = umapInstance.fit(vectors); // returns number[][]

  console.log(`[cluster] UMAP done. Running HDBSCAN (minClusterSize=${hdbscanCfg.minClusterSize})…`);

  // Adaptively scale minClusterSize for small datasets.
  // With n=74: max(2, min(10, floor(74/10))) = max(2, 7) = 7 → ~3 clusters expected
  // With n=500: max(2, min(10, floor(500/10))) = max(2, 10) = 10 (full config kicks in)
  const adaptiveMinClusterSize = Math.max(
    2,
    Math.min(hdbscanCfg.minClusterSize, Math.floor(valid.length / 10))
  );
  console.log(`[cluster] Adaptive minClusterSize: ${adaptiveMinClusterSize} (config=${hdbscanCfg.minClusterSize}, n=${valid.length})`);

  // 3. HDBSCAN clustering
  const labels = hdbscan(reduced, adaptiveMinClusterSize);

  // 4. Group by cluster label
  const clusterMap = new Map<number, EmbeddingResult[]>();
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label === -1) continue; // noise
    if (!clusterMap.has(label)) clusterMap.set(label, []);
    clusterMap.get(label)!.push(valid[i]);
  }

  if (clusterMap.size === 0) {
    console.warn('[cluster] HDBSCAN found no clusters. Falling back to single cluster of all reviews.');
    // Fallback: treat all valid reviews as one cluster
    clusterMap.set(0, valid);
  }

  // 5. Build Cluster objects and rank them
  const clusters: Cluster[] = [];

  for (const [id, members] of clusterMap.entries()) {
    const avgRating = members.reduce((s, m) => s + m.rating, 0) / members.length;
    const rankScore = members.length * (1 + Math.abs(3 - avgRating));

    const dates = members.map((m) => m.date).sort();

    clusters.push({
      cluster_id: id,
      review_ids: members.map((m) => m.review_id),
      embeddings: members,
      size: members.length,
      avg_rating: avgRating,
      rank_score: rankScore,
      date_range: { earliest: dates[0], latest: dates[dates.length - 1] },
    });
  }

  // Sort by rank score descending, take top-K
  const topK = clusters
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, topKClusters);

  console.log(
    `[cluster] Found ${clusters.length} clusters, selected top ${topK.length}. ` +
    topK.map((c) => `#${c.cluster_id}(n=${c.size}, avg★=${c.avg_rating.toFixed(1)})`).join(', ')
  );

  return topK;
}
