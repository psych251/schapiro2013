/*
 * Community-structure graph and sequence generation for Schapiro et al. (2013), Experiment 2.
 *
 * The graph (their Fig. 1a): 15 nodes in 3 communities of 5. Every node has exactly 4
 * neighbours. Within a community every pair of nodes is connected except the two "boundary"
 * nodes (positions 0 and 4); each boundary node instead has one edge to the adjacent
 * community, so the communities form a ring: ... c0[4] - c1[0] ... c1[4] - c2[0] ... c2[4] - c0[0].
 * A random walk picks uniformly among the 4 neighbours, so every transition has probability
 * 1/4 and community structure is the only cue to event boundaries.
 *
 * Node ids are 0..14; community = Math.floor(node / 5), position in community = node % 5.
 *
 * Works in the browser (window.CommunityGraph) and in Node (module.exports), so the sequence
 * logic can be checked without a browser. Pass a random() function in [0, 1) to every
 * generator; experiment.js passes Math.random.
 */
(function (root) {
  const N_COMMUNITIES = 3;
  const COMMUNITY_SIZE = 5;
  const N_NODES = N_COMMUNITIES * COMMUNITY_SIZE;

  function community(node) { return Math.floor(node / COMMUNITY_SIZE); }

  function buildAdjacency() {
    const adj = Array.from({ length: N_NODES }, () => []);
    const link = (a, b) => { adj[a].push(b); adj[b].push(a); };
    for (let c = 0; c < N_COMMUNITIES; c++) {
      const base = c * COMMUNITY_SIZE;
      for (let i = 0; i < COMMUNITY_SIZE; i++) {
        for (let j = i + 1; j < COMMUNITY_SIZE; j++) {
          if (i === 0 && j === COMMUNITY_SIZE - 1) continue; // the two boundary nodes are not linked
          link(base + i, base + j);
        }
      }
      // Last node of this community to the first node of the next one.
      link(base + COMMUNITY_SIZE - 1, ((c + 1) % N_COMMUNITIES) * COMMUNITY_SIZE);
    }
    adj.forEach((a) => a.sort((x, y) => x - y));
    return adj;
  }

  const ADJ = buildAdjacency();

  function pick(arr, random) { return arr[Math.floor(random() * arr.length)]; }

  /** Random walk of `length` nodes. Starts at a random node, or at a neighbour of `after`. */
  function randomWalk(length, random, after) {
    const seq = [];
    let cur = after == null ? Math.floor(random() * N_NODES) : pick(ADJ[after], random);
    for (let i = 0; i < length; i++) {
      seq.push(cur);
      cur = pick(ADJ[cur], random);
    }
    return seq;
  }

  /** All Hamiltonian cycles, each listed once (starting at node 0, one direction). */
  function allHamiltonianCycles() {
    const cycles = [];
    const path = [0];
    const used = new Array(N_NODES).fill(false);
    used[0] = true;
    (function extend() {
      const last = path[path.length - 1];
      if (path.length === N_NODES) {
        // Close the cycle; keep only one of the two directions (second node < last node).
        if (ADJ[last].includes(0) && path[1] < last) cycles.push(path.slice());
        return;
      }
      for (const nb of ADJ[last]) {
        if (used[nb]) continue;
        used[nb] = true; path.push(nb);
        extend();
        path.pop(); used[nb] = false;
      }
    })();
    return cycles;
  }

  const CYCLES = allHamiltonianCycles();

  /** One Hamiltonian cycle drawn at random: fixed per participant in Experiment 2. */
  function drawHamiltonianCycle(random) { return pick(CYCLES, random).slice(); }

  /**
   * One 15-item Hamiltonian block: enter `cycle` at a node adjacent to `after` (the last
   * node shown), and traverse it forward or backward (chosen at random), visiting every node
   * exactly once.
   */
  function hamiltonianBlock(cycle, random, after) {
    const entry = after == null ? Math.floor(random() * N_NODES) : pick(ADJ[after], random);
    const start = cycle.indexOf(entry);
    const dir = random() < 0.5 ? 1 : -1;
    const seq = [];
    for (let i = 0; i < N_NODES; i++) seq.push(cycle[(start + dir * i + N_NODES * N_NODES) % N_NODES]);
    return { nodes: seq, direction: dir === 1 ? "forward" : "backward" };
  }

  /**
   * Parsing-phase sequence: `nBlocks` blocks of 15 items alternating random walk and
   * Hamiltonian traversal, starting with a random walk. Each block continues from the last
   * node of the previous one (and the first from `after`), so every step is a graph edge.
   */
  function parsingSequence(nBlocks, cycle, random, after) {
    const items = [];
    let last = after;
    for (let b = 0; b < nBlocks; b++) {
      let nodes, walkType, direction = null;
      if (b % 2 === 0) {
        nodes = randomWalk(N_NODES, random, last);
        walkType = "random";
      } else {
        const h = hamiltonianBlock(cycle, random, last);
        nodes = h.nodes; direction = h.direction;
        walkType = "hamiltonian";
      }
      nodes.forEach((node, i) => items.push({ node, block: b, walk_type: walkType, direction, block_pos: i }));
      last = nodes[nodes.length - 1];
    }
    return items;
  }

  /**
   * Annotate a node sequence with community information used by the parsing analysis:
   *   community_change  this item is in a different community than the previous item
   *   prev_run          how many consecutive items immediately before this one were all in
   *                     one community (the community of the previous item)
   * Schapiro et al. count "arrival into any community following at least four consecutive
   * steps in another single community"; with these two fields the analysis can apply that
   * threshold (or 1-3 and 5, as in their Supplementary Table 2).
   */
  function annotate(nodes) {
    let run = 0;
    return nodes.map((node, i) => {
      const c = community(node);
      const prev = i > 0 ? community(nodes[i - 1]) : null;
      const out = { node, community: c, community_change: i > 0 && c !== prev, prev_run: run };
      run = i > 0 && c === prev ? run + 1 : 1;
      return out;
    });
  }

  const api = {
    N_NODES, N_COMMUNITIES, COMMUNITY_SIZE, ADJ, CYCLES,
    community, randomWalk, drawHamiltonianCycle, hamiltonianBlock, parsingSequence, annotate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CommunityGraph = api;
})(typeof window !== "undefined" ? window : this);
