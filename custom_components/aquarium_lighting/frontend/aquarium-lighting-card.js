/* Aquarium Lighting cards
 *
 * Two cards live in this file:
 *
 *  1. Schedule editor (full card, for a config dashboard)
 *       type: custom:aquarium-lighting-card
 *       title: Reef lighting          # optional
 *       auto_entity: input_boolean.reef_auto_mode   # optional with one aquarium
 *       show_all: true                # optional: default state of "Show all channels"
 *
 *  2. Graph only (for a main display): all channels at full strength + "now" line
 *       type: custom:aquarium-lighting-graph-card
 *       title: Lighting               # optional (no header if omitted)
 *       auto_entity: input_boolean.reef_auto_mode   # optional with one aquarium
 *       channels: [blue, white]       # optional: only show these
 *       show_legend: true             # optional (default true)
 *
 * With several aquariums, set auto_entity to pick which one a card shows.
 * Curve previews come from the same engine that drives the lights.
 */
(() => {
"use strict";

const DAY = 1440;
const STEP = 10;
const CURVES = [
  ["linear", "Linear"],
  ["cosine", "Cosine (smooth S-curve)"],
  ["parabolic", "Parabolic (ease in / out)"],
  ["multi_segment", "Multi-segment (custom points)"],
];

/* ---------------------------------------------------------------- colours */
const FALLBACK = ["#3b82f6", "#e6f0ff", "#8b5cf6", "#ffb000", "#22c55e", "#ef2b2b", "#22d3ee", "#e11d9c"];
const PRESETS = [
  ["Royal blue", "#1d3fff"],
  ["Blue", "#3b82f6"],
  ["Cyan", "#22d3ee"],
  ["Cool white", "#e6f0ff"],
  ["Neutral white", "#f4f4f5"],
  ["Warm white", "#ffd9a0"],
  ["Amber", "#ffb000"],
  ["Red", "#ef2b2b"],
  ["Magenta", "#e11d9c"],
  ["UV / violet", "#8b5cf6"],
  ["Green", "#22c55e"],
];
// Used until you pick a colour: guessed from words in the channel name.
const GUESS = [
  [["royal"], "#1d3fff"],
  [["cool", "cold", "daylight"], "#e6f0ff"],
  [["warm"], "#ffd9a0"],
  [["white"], "#f4f4f5"],
  [["cyan", "teal"], "#22d3ee"],
  [["blue"], "#3b82f6"],
  [["uv", "violet", "purple", "actinic"], "#8b5cf6"],
  [["red"], "#ef2b2b"],
  [["green"], "#22c55e"],
  [["amber", "orange", "yellow"], "#ffb000"],
  [["magenta", "pink"], "#e11d9c"],
];

const guessColor = (name) => {
  const tokens = String(name).toLowerCase().split(/[^a-z0-9]+/);
  for (const [words, color] of GUESS) if (tokens.some((t) => words.includes(t))) return color;
  return null;
};

/** name -> colour for every channel (saved colour, else guess, else palette). */
const channelColors = (channels) => {
  const out = {};
  Object.keys(channels).forEach((n, i) => {
    out[n] = channels[n].color || guessColor(n) || FALLBACK[i % FALLBACK.length];
  });
  return out;
};

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Very light / very dark lines get a thin grey outline so they read on any theme.
const needsOutline = (hex) => {
  const l = luminance(hex);
  return l > 0.7 || l < 0.05;
};

/* ---------------------------------------------------------------- helpers */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
const pct = (v) => Math.round((v / 255) * 100);

const chip = (name, color, text) =>
  `<span class="chip"><span class="dot" style="background:${esc(color)}"></span>${esc(name)} ${esc(text)}</span>`;

const CHIP_CSS = `
  .now { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; }
  .chip { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
          background: var(--secondary-background-color); font-size: .85rem; }
  .dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(128,128,128,.6); box-sizing: border-box; }
  svg { width: 100%; height: auto; display: block; }
  .err { color: var(--error-color); font-size: .85rem; min-height: 1.2em; }
  .muted { color: var(--secondary-text-color); font-size: .85rem; }`;

/* ------------------------------------------------------------------ graph */
const W = 720, H = 240, L = 36, R = 10, T = 10, B = 24;
const gx = (m) => L + (m / DAY) * (W - L - R);
const gy = (v) => T + (1 - v / 255) * (H - T - B);
const pathOf = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${gx(i * STEP).toFixed(1)},${gy(v).toFixed(1)}`).join(" ");

/** series: [{name, color, values, width, opacity, fill?}] drawn in order. */
function graphMarkup(series, nowMin) {
  let out = "";
  for (let h = 0; h <= 24; h += 3) {
    out += `<line x1="${gx(h * 60)}" x2="${gx(h * 60)}" y1="${T}" y2="${H - B}" stroke="var(--divider-color)" stroke-width="1"/>
            <text x="${gx(h * 60)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--secondary-text-color)">${String(h % 24).padStart(2, "0")}:00</text>`;
  }
  for (const v of [0, 64, 128, 191, 255]) {
    out += `<line x1="${L}" x2="${W - R}" y1="${gy(v)}" y2="${gy(v)}" stroke="var(--divider-color)" stroke-width="1" stroke-dasharray="2 4"/>
            <text x="${L - 6}" y="${gy(v) + 4}" text-anchor="end" font-size="11" fill="var(--secondary-text-color)">${pct(v)}%</text>`;
  }
  for (const s of series) {
    const d = pathOf(s.values);
    if (s.fill) out += `<path d="${d} L${gx(DAY)},${gy(0)} L${gx(0)},${gy(0)} Z" fill="${esc(s.color)}" opacity="${s.fill}"/>`;
    if (needsOutline(s.color)) {
      out += `<path d="${d}" fill="none" stroke="rgba(128,128,128,.75)" stroke-width="${s.width + 2.5}" stroke-linejoin="round" opacity="${s.opacity}"/>`;
    }
    out += `<path d="${d}" fill="none" stroke="${esc(s.color)}" stroke-width="${s.width}" stroke-linejoin="round" opacity="${s.opacity}"/>`;
  }
  out += `<line x1="${gx(nowMin)}" x2="${gx(nowMin)}" y1="${T}" y2="${H - B}" stroke="var(--primary-text-color)" stroke-width="1.5" stroke-dasharray="4 3"/>
          <text x="${Math.min(gx(nowMin) + 4, W - 44)}" y="${T + 11}" font-size="11" fill="var(--primary-text-color)">now ${fmt(nowMin)}</text>`;
  return out;
}

/* ============================================================ editor card */
class AquariumLightingCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null;
    this._sel = null;
    this._draft = null;
    this._dirty = false;
    this._curve = [];
    this._series = [];
    this._error = "";
    this._previewTimer = null;
  }

  setConfig(config) {
    this._config = { title: "Aquarium Lighting", ...config };
    let stored = null;
    try {
      stored = localStorage.getItem("aquarium_lighting_show_all");
    } catch (e) { /* storage unavailable */ }
    this._showAll = stored !== null ? stored === "1" : this._config.show_all !== false;
  }
  getCardSize() {
    return 9;
  }
  static getStubConfig() {
    return {};
  }

  connectedCallback() {
    this._clock = setInterval(() => this._data && this._load(), 60000);
  }
  disconnectedCallback() {
    clearInterval(this._clock);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._shell();
      this._load();
    }
    this._syncAuto();
  }

  /* ------------------------------------------------------------ data */
  _ws(msg) {
    if (this._config.auto_entity) msg.auto_entity = this._config.auto_entity;
    return this._hass.callWS(msg);
  }

  async _load() {
    try {
      this._data = await this._ws({ type: "aquarium_lighting/get" });
    } catch (e) {
      this._root("fatal").textContent = `Could not reach the Aquarium Lighting integration: ${e.message || e.code || e}`;
      return;
    }
    this._root("fatal").textContent = "";
    const names = Object.keys(this._data.channels);
    if (!this._sel || !names.includes(this._sel)) {
      this._sel = names[0] || null;
      this._dirty = false;
    }
    if (!this._dirty) this._resetDraft();
    this._syncAuto();
    this._renderNow();
    this._renderTabs();
    if (!this._dirty || !this._form_built) this._renderForm();
    this._requestPreview();
  }

  _resetDraft() {
    this._draft = this._sel ? JSON.parse(JSON.stringify(this._data.channels[this._sel])) : null;
    this._dirty = false;
  }

  _payload() {
    const d = this._draft;
    return {
      sunrise_start: d.sunrise_start,
      sunrise_end: d.sunrise_end,
      sunset_start: d.sunset_start,
      sunset_end: d.sunset_end,
      min: Number(d.min),
      max: Number(d.max),
      curve: d.curve,
      points: d.points || [],
      target: d.target || "",
      color: d.color || "",
    };
  }

  _colors() {
    const c = channelColors(this._data.channels);
    if (this._sel && this._draft?.color) c[this._sel] = this._draft.color; // live colour preview
    return c;
  }

  _requestPreview() {
    clearTimeout(this._previewTimer);
    if (!this._draft) {
      this._curve = [];
      this._drawGraph();
      return;
    }
    this._previewTimer = setTimeout(async () => {
      try {
        const r = await this._hass.callWS({ type: "aquarium_lighting/preview", schedule: this._payload(), step: STEP });
        this._curve = r.values;
        this._error = "";
      } catch (e) {
        this._error = e.message || String(e);
      }
      this._drawGraph();
    }, 150);
  }

  /* ----------------------------------------------------------- actions */
  async _save() {
    try {
      await this._ws({ type: "aquarium_lighting/set_channel", name: this._sel, schedule: this._payload() });
      this._dirty = false;
      this._status("Saved");
      await this._load();
    } catch (e) {
      this._error = e.message || String(e);
      this._drawGraph();
    }
  }

  async _addChannel() {
    const raw = prompt("Channel name (letters, numbers, underscores), e.g. blue, cool_white, red, uv");
    if (!raw) return;
    const name = raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 32);
    if (!name) return;
    try {
      await this._ws({
        type: "aquarium_lighting/set_channel",
        name,
        schedule: { sunrise_start: "08:00", sunrise_end: "11:00", sunset_start: "17:00", sunset_end: "20:00", min: 10, max: 255, curve: "cosine", target: "", color: "" },
      });
      this._sel = name;
      this._dirty = false;
      await this._load();
      this._renderForm();
    } catch (e) {
      alert(e.message || e);
    }
  }

  async _deleteChannel() {
    if (!confirm(`Delete channel "${this._sel}" and its schedule?`)) return;
    try {
      await this._ws({ type: "aquarium_lighting/delete_channel", name: this._sel });
      this._sel = null;
      this._dirty = false;
      await this._load();
      this._renderForm();
    } catch (e) {
      alert(e.message || e);
    }
  }

  _selectChannel(name) {
    if (name === this._sel) return;
    if (this._dirty && !confirm("Discard unsaved changes?")) return;
    this._sel = name;
    this._resetDraft();
    this._renderNow();
    this._renderTabs();
    this._renderForm();
    this._requestPreview();
  }

  _seedPoints() {
    const d = this._draft;
    const seen = new Set();
    d.points = [
      ["00:00", d.min],
      [d.sunrise_start, d.min],
      [d.sunrise_end, d.max],
      [d.sunset_start, d.max],
      [d.sunset_end, d.min],
    ].filter(([t]) => !seen.has(t) && seen.add(t));
  }

  _markDirty() {
    this._dirty = true;
    this._root("save").disabled = false;
    this._root("revert").disabled = false;
  }

  /* ------------------------------------------------------------ events */
  _onInput(e) {
    const t = e.target;
    const k = t.dataset.k;
    const p = t.dataset.p;
    if (!this._draft) return;
    if (k) {
      let v = t.value;
      if (k === "min" || k === "max") {
        v = Number(v);
        const out = this.shadowRoot.querySelector(`output[data-for="${k}"]`);
        if (out) out.textContent = `${v} (${pct(v)}%)`;
      }
      this._draft[k] = v;
      if (k === "color") this._renderNow();
      if (k === "curve") {
        if (v === "multi_segment" && !(this._draft.points || []).length) this._seedPoints();
        this._renderForm();
      }
    } else if (p) {
      const [i, f] = p.split(":");
      this._draft.points[Number(i)][f === "time" ? 0 : 1] = f === "time" ? t.value : Number(t.value);
      if (f === "level") {
        // keep the slider and number box of this row in sync (no inline handlers: CSP-safe)
        t.closest(".pt").querySelectorAll('[data-p$=":level"]').forEach((n) => (n.value = t.value));
      }
    } else {
      return;
    }
    this._markDirty();
    this._requestPreview();
  }

  _onClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const [act, arg] = btn.dataset.act.split(":");
    if (act === "save") this._save();
    else if (act === "revert") {
      this._resetDraft();
      this._renderNow();
      this._renderForm();
      this._requestPreview();
    } else if (act === "delete") this._deleteChannel();
    else if (act === "add") this._addChannel();
    else if (act === "tab") this._selectChannel(arg);
    else if (act === "color") {
      this._draft.color = arg;
      this._markDirty();
      this._renderNow();
      this._renderForm();
      this._requestPreview();
    } else if (act === "addpoint") {
      this._draft.points.push(["12:00", Number(this._draft.max)]);
      this._markDirty();
      this._renderForm();
      this._requestPreview();
    } else if (act === "delpoint") {
      this._draft.points.splice(Number(arg), 1);
      this._markDirty();
      this._renderForm();
      this._requestPreview();
    }
  }

  async _toggleAuto(on) {
    const entity = this._autoEntity();
    try {
      await this._hass.callService("input_boolean", on ? "turn_on" : "turn_off", { entity_id: entity });
    } catch (e) {
      this._status(`Could not toggle ${entity}: ${e.message || e}`);
    }
  }

  /* --------------------------------------------------------- rendering */
  _root(id) {
    return this.shadowRoot.getElementById(id);
  }

  _status(msg) {
    const el = this._root("status");
    el.textContent = msg;
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => (el.textContent = ""), 3000);
  }

  _autoEntity() {
    return this._config.auto_entity || this._data?.auto_entity || "input_boolean.aquarium_auto_mode";
  }

  _shell() {
    this.shadowRoot.innerHTML = `
      <style>
        ${CHIP_CSS}
        ha-card { padding: 16px; display: block; }
        .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .head h2 { margin: 0; font-size: 1.25rem; font-weight: 500; }
        .auto { display: flex; align-items: center; gap: 8px; color: var(--secondary-text-color); font-size: .9rem; }
        .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 10px; }
        button { font: inherit; cursor: pointer; border-radius: 8px; padding: 6px 14px; border: 1px solid var(--divider-color);
                 background: transparent; color: var(--primary-text-color); }
        button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
        button.sel, button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
        button.danger { color: var(--error-color); }
        button:disabled { opacity: .45; cursor: default; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 12px; }
        label { display: flex; flex-direction: column; gap: 4px; font-size: .85rem; color: var(--secondary-text-color); }
        input, select { font: inherit; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color);
                        background: var(--card-background-color); color: var(--primary-text-color); min-width: 0; }
        input[type=range] { padding: 0; }
        input[type=color] { padding: 0; width: 34px; height: 30px; border-radius: 50%; cursor: pointer; }
        output { color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
        .color { display: flex; flex-direction: column; gap: 6px; margin: 12px 0 0; }
        .color .lbl { font-size: .85rem; color: var(--secondary-text-color); }
        .swatches { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        button.sw { width: 26px; height: 26px; padding: 0; border-radius: 50%; border: 2px solid var(--divider-color); }
        button.sw.on { border-color: var(--primary-text-color); box-shadow: 0 0 0 2px var(--card-background-color) inset; }
        .pts { display: grid; gap: 6px; margin: 4px 0 12px; }
        .pt { display: grid; grid-template-columns: 110px 1fr 56px auto; gap: 8px; align-items: center; }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; align-items: center; }
        .spacer { flex: 1; }
        .graphbar { display: flex; justify-content: flex-end; margin-top: 14px; }
        .showall { flex-direction: row; align-items: center; gap: 6px; cursor: pointer; }
        .readout { min-height: 1.3em; font-size: .85rem; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
        #fatal { color: var(--error-color); }
      </style>
      <ha-card>
        <div class="head">
          <h2>${esc(this._config.title)}</h2>
          <label class="auto"><span id="autolabel">Auto mode</span><ha-switch id="auto"></ha-switch></label>
        </div>
        <div id="fatal"></div>
        <div class="now" id="now"></div>
        <div class="tabs" id="tabs"></div>
        <div id="form"></div>
        <div class="graphbar">
          <label class="showall"><input type="checkbox" id="showall" ${this._showAll ? "checked" : ""}> Show all channels</label>
        </div>
        <svg id="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Brightness over 24 hours"></svg>
        <div class="readout" id="readout">Hover the graph to read values.</div>
        <div class="err" id="err"></div>
        <div class="muted" id="status"></div>
      </ha-card>`;
    const sw = this._root("auto");
    sw.addEventListener("change", () => this._toggleAuto(sw.checked));
    this._root("form").addEventListener("input", (e) => this._onInput(e));
    this._root("showall").addEventListener("change", (e) => {
      this._showAll = e.target.checked;
      try {
        localStorage.setItem("aquarium_lighting_show_all", this._showAll ? "1" : "0");
      } catch (err) { /* storage unavailable */ }
      this._drawGraph();
    });
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this._root("graph").addEventListener("mousemove", (e) => this._hover(e));
    this._root("graph").addEventListener("mouseleave", () => (this._root("readout").textContent = "Hover the graph to read values."));
  }

  _syncAuto() {
    if (!this._root("auto")) return;
    const entity = this._autoEntity();
    const st = this._hass.states[entity];
    const sw = this._root("auto");
    sw.checked = st?.state === "on";
    sw.disabled = !st;
    this._root("autolabel").textContent = !st
      ? `Helper ${entity} not found. Create a Toggle helper with that entity id`
      : st.state === "on"
      ? "Auto mode: following schedule"
      : "Auto mode off: manual control";
  }

  _renderNow() {
    const cur = this._data.current || {};
    const colors = this._colors();
    this._root("now").innerHTML = Object.entries(cur).map(([n, v]) => chip(n, colors[n], `${v} (${pct(v)}%)`)).join("");
  }

  _renderTabs() {
    const names = Object.keys(this._data.channels);
    this._root("tabs").innerHTML =
      names.map((n) => `<button data-act="tab:${esc(n)}" class="${n === this._sel ? "sel" : ""}">${esc(n)}</button>`).join("") +
      `<button data-act="add" title="Add channel">+ Add channel</button>`;
  }

  _renderForm() {
    const el = this._root("form");
    const d = this._draft;
    this._form_built = true;
    if (!d) {
      el.innerHTML = `<p class="muted">No channels yet. Add one to start building a schedule.</p>`;
      return;
    }
    const multi = d.curve === "multi_segment";
    const time = (k, label) => `<label>${label}<input type="time" data-k="${k}" value="${esc(d[k])}"></label>`;
    const rng = (k, label) =>
      `<label>${label} <output data-for="${k}">${d[k]} (${pct(d[k])}%)</output>
         <input type="range" min="0" max="255" data-k="${k}" value="${d[k]}"></label>`;
    const points = multi
      ? `<div class="muted">Levels are interpolated linearly between points and repeat every 24 h.
           Sunrise/sunset times are ignored. Levels stay within min/max.</div>
         <div class="pts">${(d.points || [])
           .map(
             (pt, i) => `<div class="pt">
               <input type="time" data-p="${i}:time" value="${esc(pt[0])}">
               <input type="range" min="0" max="255" data-p="${i}:level" value="${pt[1]}">
               <input type="number" min="0" max="255" data-p="${i}:level" value="${pt[1]}">
               <button data-act="delpoint:${i}" title="Remove point">Remove</button></div>`
           )
           .join("")}</div>
         <button data-act="addpoint">Add point</button>`
      : "";
    const eff = (d.color || this._colors()[this._sel] || FALLBACK[0]).toLowerCase();
    const colour = `<div class="color">
        <span class="lbl">Graph colour</span>
        <div class="swatches">
          ${PRESETS.map(([n, c]) => `<button class="sw ${eff === c ? "on" : ""}" style="background:${c}" title="${n}" aria-label="${n}" data-act="color:${c}"></button>`).join("")}
          <input type="color" data-k="color" value="${esc(eff)}" title="Custom colour" aria-label="Custom colour">
        </div>
        <span class="muted">${d.color ? "Pick the colour that matches the real LED." : "Automatic (guessed from the channel name) until you pick one."}</span>
      </div>`;
    el.innerHTML = `
      ${multi ? "" : `<div class="grid">${time("sunrise_start", "Sunrise start")}${time("sunrise_end", "Sunrise end")}${time("sunset_start", "Sunset start")}${time("sunset_end", "Sunset end")}</div>`}
      <div class="grid">
        ${rng("min", "Minimum")}${rng("max", "Maximum")}
        <label>Curve<select data-k="curve">${CURVES.map(([v, l]) => `<option value="${v}" ${v === d.curve ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      ${points}
      ${colour}
      <label style="margin-top:12px">Output target (light entity, ESPHome REST URL or MQTT command topic)
        <input type="text" data-k="target" value="${esc(d.target)}" placeholder="light.reef_blue"></label>
      <div class="actions">
        <button class="primary" id="save" data-act="save" ${this._dirty ? "" : "disabled"}>Save schedule</button>
        <button id="revert" data-act="revert" ${this._dirty ? "" : "disabled"}>Revert</button>
        <span class="spacer"></span>
        <button class="danger" data-act="delete">Delete channel</button>
      </div>`;
  }

  _drawGraph() {
    const svg = this._root("graph");
    if (!svg || !this._data) return;
    const colors = this._colors();
    const series = [];
    if (this._showAll) {
      for (const [n, vals] of Object.entries(this._data.curves || {})) {
        if (n !== this._sel) series.push({ name: n, color: colors[n], values: vals, width: 2, opacity: 0.5 });
      }
    }
    if (this._sel && this._curve.length) {
      series.push({ name: this._sel, color: colors[this._sel], values: this._curve, width: 3, opacity: 1, fill: 0.15 });
    }
    this._series = series;
    svg.innerHTML = graphMarkup(series, this._data.now_minute);
    this._root("err").textContent = this._error;
  }

  _hover(e) {
    if (!this._series.length) return;
    const r = this._root("graph").getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const m = Math.min(DAY, Math.max(0, ((px - L) / (W - L - R)) * DAY));
    const i = Math.round(m / STEP);
    const parts = this._series
      .slice()
      .reverse() // edited channel first
      .map((s) => `${s.name} ${s.values[i]} (${pct(s.values[i])}%)`);
    this._root("readout").textContent = `${fmt(i * STEP)}: ${parts.join(", ")}`;
  }
}

/* ============================================================ graph card */
class AquariumLightingGraphCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = { title: "", show_legend: true, ...config };
  }
  getCardSize() {
    return 4;
  }
  static getStubConfig() {
    return {};
  }

  connectedCallback() {
    this._clock = setInterval(() => this._load(), 60000);
    if (this._hass && this._built) this._load();
  }
  disconnectedCallback() {
    clearInterval(this._clock);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._shell();
      this._load();
    }
  }

  _shell() {
    this._built = true;
    this.shadowRoot.innerHTML = `
      <style>
        ${CHIP_CSS}
        ha-card { padding: 16px; display: block; }
        h2 { margin: 0 0 4px; font-size: 1.25rem; font-weight: 500; }
        .now { margin-top: 0; margin-bottom: 8px; }
      </style>
      <ha-card>
        ${this._config.title ? `<h2>${esc(this._config.title)}</h2>` : ""}
        <div class="now" id="now"></div>
        <svg id="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Brightness over 24 hours"></svg>
        <div class="err" id="err"></div>
      </ha-card>`;
  }

  async _load() {
    if (!this._hass || !this._built) return;
    const err = this.shadowRoot.getElementById("err");
    let data;
    try {
      const msg = { type: "aquarium_lighting/get" };
      if (this._config.auto_entity) msg.auto_entity = this._config.auto_entity;
      data = await this._hass.callWS(msg);
    } catch (e) {
      err.textContent = `Could not reach the Aquarium Lighting integration: ${e.message || e.code || e}`;
      return;
    }
    err.textContent = "";
    const colors = channelColors(data.channels); // colours and order come from ALL channels
    let names = Object.keys(data.channels);
    if (Array.isArray(this._config.channels) && this._config.channels.length) {
      names = names.filter((n) => this._config.channels.includes(n));
    }
    const series = names
      .filter((n) => data.curves[n])
      .map((n) => ({ name: n, color: colors[n], values: data.curves[n], width: 3, opacity: 1 }));
    this.shadowRoot.getElementById("graph").innerHTML = graphMarkup(series, data.now_minute);
    this.shadowRoot.getElementById("now").innerHTML = this._config.show_legend
      ? names.map((n) => chip(n, colors[n], `${data.current[n]} (${pct(data.current[n])}%)`)).join("")
      : "";
  }
}

/* ------------------------------------------------------------ registration */
if (!customElements.get("aquarium-lighting-card")) {
  customElements.define("aquarium-lighting-card", AquariumLightingCard);
}
if (!customElements.get("aquarium-lighting-graph-card")) {
  customElements.define("aquarium-lighting-graph-card", AquariumLightingGraphCard);
}
window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "aquarium-lighting-card",
    name: "Aquarium Lighting schedule editor",
    description: "Edit per-channel sunrise/sunset schedules, curves, colours and brightness limits, with a live preview.",
  },
  {
    type: "aquarium-lighting-graph-card",
    name: "Aquarium Lighting graph",
    description: "Graph-only view of every channel's brightness over 24 hours, with a current-time line.",
  }
);
})();
