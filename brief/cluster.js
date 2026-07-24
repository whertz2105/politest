// cluster.js — cheap story clustering for the Daily Brief. No model call: a story
// is promoted when the SAME story is covered by >=2 distinct outlets, detected by
// title-token overlap. Pure functions (title strings in, clusters out), so the
// selection logic is fully unit-testable.

const STOP = new Set(
  ("the a an and or but of to in on for with at by from as is are was were be been being this that these those it its" +
   " his her their our your my we they he she you i not no new say says said will would can could has have had").split(" ")
);

// Distinct, meaningful title tokens (lowercased, punctuation stripped, stopwords
// and <3-char tokens removed).
function tokens(title) {
  return [...new Set(
    String(title || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP.has(t))
  )];
}

function overlap(a, bSet) { let n = 0; for (const t of a) if (bSet.has(t)) n++; return n; }

// candidates: [{ source, title, url }]. Greedy single-link clustering by shared
// title tokens; a cluster is "selected" when it spans >= minOutlets distinct
// outlets. Returns { clusters, selected } (selected sorted by breadth then size).
function clusterStories(candidates, opts = {}) {
  const minOutlets = opts.minOutlets || 2;
  const minShared = opts.minShared || 2;
  const cands = (candidates || [])
    .map((c) => ({ ...c, _tok: tokens(c.title) }))
    .filter((c) => c._tok.length);

  const clusters = [];
  for (const c of cands) {
    let best = null, bestN = 0;
    for (const cl of clusters) {
      const n = overlap(c._tok, cl.tokenSet);
      if (n >= minShared && n > bestN) { best = cl; bestN = n; }
    }
    if (best) { best.members.push(c); for (const t of c._tok) best.tokenSet.add(t); }
    else clusters.push({ tokenSet: new Set(c._tok), members: [c] });
  }

  const withMeta = clusters.map((cl) => {
    const outlets = [...new Set(cl.members.map((m) => m.source))];
    return { members: cl.members.map((m) => ({ source: m.source, title: m.title, url: m.url })), outlets, size: cl.members.length, headlineSeed: cl.members[0].title };
  });
  const selected = withMeta
    .filter((cl) => cl.outlets.length >= minOutlets)
    .sort((a, b) => b.outlets.length - a.outlets.length || b.size - a.size);
  return { clusters: withMeta, selected };
}

module.exports = { clusterStories, tokens };
