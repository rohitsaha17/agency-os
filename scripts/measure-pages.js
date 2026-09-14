/**
 * Paste this into the browser console on studio-flow.vibrnd.in while signed in.
 *
 * It reloads each page in turn and reports what that page actually costs: how
 * long until the document is done, how many API calls it made, whether any of
 * them were duplicates, the slowest one, and the total bytes. Duplicates are
 * the interesting column — the same URL fetched twice on one load is work
 * nobody asked for.
 */
(async () => {
  const pages = ["/", "/tasks", "/projects", "/calendar", "/files", "/clients"];
  const out = [];
  for (const p of pages) {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;left:-9999px;width:1280px;height:900px";
    document.body.appendChild(f);
    const t0 = performance.now();
    await new Promise((res) => { f.onload = res; f.src = p; });
    await new Promise((r) => setTimeout(r, 3500)); // let client fetches finish
    const total = Math.round(performance.now() - t0);
    const api = [...f.contentWindow.performance.getEntriesByType("resource")]
      .filter((e) => e.name.includes("/api/"));
    const urls = api.map((e) => e.name.replace(location.origin, "").split("?")[0]);
    const dupes = urls.filter((u, i) => urls.indexOf(u) !== i);
    const slowest = api.slice().sort((a, b) => b.duration - a.duration)[0];
    out.push({
      page: p,
      ms: total,
      apiCalls: api.length,
      duplicates: [...new Set(dupes)].join(", ") || "none",
      slowest: slowest ? `${slowest.name.replace(location.origin, "").split("?")[0]} ${Math.round(slowest.duration)}ms` : "-",
      kb: Math.round(api.reduce((s, e) => s + (e.transferSize || 0), 0) / 1024),
    });
    f.remove();
  }
  console.table(out);
  return out;
})();
