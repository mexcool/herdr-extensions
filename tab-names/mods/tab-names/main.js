import { View, div } from "gpui-kit";
import { terminals, panes, spaces, machines, run, shared, setShared, checking } from "herdr";

// Lets a program name its tab from any machine: a terminal labelled
// tab.name=<name> (`hc label <terminal> tab.name=<name>`) gets its tab renamed
// to <name>. A tab no label names takes the title of its first agent pane: for
// Claude Code its session name (`-n`, `/rename`). Once per value, so a rename made
// later in the app stays. A pane.name label names the pane showing that terminal
// the same way (Herdr 0.1.17's pane.rename).
const LABEL = "tab.name";
const KEY = "tab-names"; // shared: { <terminal address>: <name it was given> }
const PANE_LABEL = "pane.name";
const PANE_KEY = "tab-names.panes"; // shared: { <terminal address>: <pane name it was given> }

const machineOf = (address) => (address.includes("/") ? address.split("/")[0] : "");

// Same as Herdr's tab bar (the tabs mod): drops a status glyph, keeps a leading bracket or quote.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// The title the tab bar shows over an unnamed tab, or null: an agent running now, under
// its own title, not a shell's user@host:path or the program's name. Codex appends " | <worktree>".
function agentTitle(p) {
  if (!p.program?.agent) return null;
  const raw = (p.title ?? "").split(" | ")[0];
  const live = clean(raw);
  const path = /^[~/]|^[A-Za-z]:\\/.test(raw.replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== p.terminal && live !== p.program.name && !path && !live.includes("@") && live.toLowerCase() !== p.program.key;
  return telling ? live : null;
}

export default class TabNames extends View {
  init(_props, cx) {
    if (checking()) return;
    cx.timer.every(1000, () => this.tick());
    this.tick();
  }

  tick() {
    const given = shared(KEY) ?? {};
    const shown = panes().filter((p) => p.terminal);
    const tabOf = new Map(shown.map((p) => [p.terminal, p.tab]));
    // Keep what was given while its terminal lives (an agent quit and started again in it
    // still counts as named here), and on machines whose terminals aren't known right now
    // (offline), so their labels don't rename again when they come back.
    const ready = new Set(machines().filter((m) => m.layout === "ready").map((m) => m.name ?? ""));
    const live = new Set(terminals().map((t) => t.address));
    const kept = (map) => Object.fromEntries(Object.entries(map).filter(([a]) => live.has(a) || !ready.has(machineOf(a))));
    const next = kept(given);
    const givenPanes = shared(PANE_KEY) ?? {};
    const nextPanes = kept(givenPanes);
    const paneOf = new Map(shown.map((p) => [p.terminal, p.pane]));
    for (const t of terminals()) {
      const name = t.labels?.[PANE_LABEL];
      if (!name) continue;
      if (givenPanes[t.address] !== name) {
        const pane = paneOf.get(t.address);
        if (!pane) continue; // no pane yet: try again on the next tick
        run("pane.rename", { pane, name });
      }
      nextPanes[t.address] = name;
    }
    if (JSON.stringify(nextPanes) !== JSON.stringify(givenPanes)) setShared(PANE_KEY, nextPanes);
    const labelled = new Set(); // tabs a label names
    for (const t of terminals()) {
      const name = t.labels?.[LABEL];
      if (!name) continue;
      const tab = tabOf.get(t.address);
      if (tab) labelled.add(tab);
      if (given[t.address] !== name) {
        if (!tab) continue; // no pane yet: try again on the next tick
        run("tab.rename", { id: tab, name });
      }
      next[t.address] = name;
    }
    // The title fallback: only a tab nobody named, or one this mod named from that
    // pane's previous title, so a hand rename stays.
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, tab]));
    const titled = new Set();
    for (const p of shown) {
      if (!p.program?.agent || titled.has(p.tab)) continue;
      titled.add(p.tab);
      const tab = tabs.get(p.tab);
      const name = agentTitle(p);
      if (labelled.has(p.tab) || !tab || !name) continue;
      const mine = given[p.terminal];
      if (mine !== name && (!tab.named || tab.name === mine)) run("tab.rename", { id: p.tab, name });
      next[p.terminal] = name;
    }
    if (JSON.stringify(next) !== JSON.stringify(given)) setShared(KEY, next);
  }

  render() {
    return div();
  }
}
