// radio-karte v1.0.1
// Einzeln installierbares Modul (Home Assistant Marketplace / HACS, Kategorie Dashboard).
window.customCards = window.customCards || [];
window.customCardFeatures = window.customCardFeatures || [];
// Eigener Block: Namen bleiben lokal, auch wenn mehrere Karten zusammen geladen werden.
{
// ---------------------------------------------------------------------------
// Radio-Auswahl (Baustein fuer Karten, keine eigene Karte): Lieblingssender als Tasten und optional Suche
// in den Sendern von Radio Browser (HA-Integration), standardmaessig Oesterreich (laender: [AT, DE, ...]).
//   In einer Karte: <radio-wahl> einfuegen, dann el.hass = hass; el.einstellen(config, (sender) => starten, aktiverName)

const RADIO_CACHE = {};
const radioNorm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

class RadioWahl extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        button { font: inherit; cursor: pointer; border: none; background: none; color: var(--primary-text-color); }
        .sender { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 8px; margin-top: 14px; }
        .sender:empty { display: none; }
        .q { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: 12px;
          background: var(--secondary-background-color, rgba(127,127,127,.12)); border: 2px solid transparent; font-size: 13px; line-height: 1.2; text-align: center; }
        .q ha-icon { --mdc-icon-size: 26px; color: var(--state-icon-color, #44739e); }
        .q.aktiv { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
        .q.aktiv ha-icon { color: var(--primary-color); }
        .suche { margin-top: 10px; display: none; }
        .suche.an { display: block; }
        .feld { display: flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--divider-color, #555);
          background: var(--card-background-color, #1c1c1c); }
        .feld ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
        .feld input { flex: 1; min-width: 0; font: inherit; font-size: 14px; padding: 9px 0; border: none; outline: none; background: none; color: var(--primary-text-color); }
        .liste { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; max-height: 300px; overflow-y: auto; }
        .liste:empty { display: none; }
        .t { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; text-align: left; font-size: 14px;
          background: color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
        .t:hover { background: color-mix(in srgb, var(--primary-color) 15%, transparent); }
        .t img, .t .ph { width: 28px; height: 28px; border-radius: 6px; object-fit: contain; flex: none; background: var(--secondary-background-color); }
        .t .ph { display: flex; align-items: center; justify-content: center; }
        .t .ph ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
        .t span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .info { font-size: 13px; color: var(--secondary-text-color); padding: 6px 8px; }
      </style>
      <div class="sender"></div>
      <div class="suche"><div class="feld"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" placeholder="Radiosender suchen …"></div><div class="liste"></div></div>`;
    const ein = this.shadowRoot.querySelector("input");
    ein.addEventListener("input", () => { clearTimeout(this._takt); this._takt = setTimeout(() => this._suche(ein.value), 250); });
    ein.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ein.value = ""; this._suche(""); } });
  }

  set hass(h) { this._hass = h; }

  einstellen(cfg, starte, aktiv) {
    this._starte = starte;
    const k = JSON.stringify([cfg.sender, cfg.suche, cfg.laender]);
    if (k !== this._k) {
      this._k = k; this._cfg = cfg;
      const box = this.shadowRoot.querySelector(".sender");
      box.innerHTML = "";
      for (const x of (cfg.sender || []).filter((s) => s && s.id)) {
        const b = document.createElement("button");
        b.className = "q"; b.dataset.n = x.name;
        b.innerHTML = `<ha-icon icon="${x.icon || "mdi:radio"}"></ha-icon><span></span>`;
        b.querySelector("span").textContent = x.name;
        b.addEventListener("click", () => this._starte && this._starte(x));
        box.appendChild(b);
      }
      this.shadowRoot.querySelector(".suche").classList.toggle("an", !!cfg.suche);
    }
    this.shadowRoot.querySelectorAll(".q").forEach((b) => b.classList.toggle("aktiv", !!aktiv && b.dataset.n === aktiv));
  }

  async _laden() {
    const alle = [];
    for (const l of (this._cfg.laender || ["AT"])) {
      if (!RADIO_CACHE[l]) RADIO_CACHE[l] = this._hass.callWS({ type: "media_source/browse_media", media_content_id: `media-source://radio_browser/country/${l}` })
        .then((r) => (r.children || []).filter((x) => x.can_play)).catch(() => { delete RADIO_CACHE[l]; return []; });
      alle.push(...(await RADIO_CACHE[l]));
    }
    return alle;
  }

  async _suche(text) {
    this._text = text;
    const liste = this.shadowRoot.querySelector(".liste");
    if (text.trim().length < 2) { liste.innerHTML = ""; return; }
    liste.innerHTML = `<div class="info">Suche …</div>`;
    const alle = await this._laden();
    if (this._text !== text) return;
    const woerter = radioNorm(text).split(/\s+/).filter(Boolean);
    const gesehen = new Set();
    const treffer = alle.filter((x) => {
      const n = radioNorm(x.title);
      if (!woerter.every((w) => n.includes(w)) || gesehen.has(n)) return false;
      gesehen.add(n); return true;
    }).slice(0, 12);
    liste.innerHTML = treffer.length ? "" : `<div class="info">Kein Sender gefunden.</div>`;
    for (const x of treffer) {
      const b = document.createElement("button");
      b.className = "t";
      const bild = /^https?:\/\//.test(x.thumbnail || "") ? x.thumbnail : "";
      b.innerHTML = (bild ? `<img loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph"><ha-icon icon="mdi:radio"></ha-icon></div>`) + `<span></span>`;
      if (bild) { const img = b.querySelector("img"); img.src = bild; img.onerror = () => (img.style.visibility = "hidden"); }
      b.querySelector("span").textContent = x.title;
      b.addEventListener("click", () => {
        if (this._starte) this._starte({ name: x.title, id: x.media_content_id, typ: x.media_content_type });
        this.shadowRoot.querySelector("input").value = ""; this._suche("");
      });
      liste.appendChild(b);
    }
  }
}
if (!customElements.get("radio-wahl")) customElements.define("radio-wahl", RadioWahl);

// ---------------------------------------------------------------------------
// Radio-Karte: Netzwerk-Lautsprecher/Verstaerker (z. B. Arylic) mit Radiosendern in einer Karte.
// Play startet den Standardsender (erster Sender), wenn nichts laeuft; laeuft etwas, pausiert er.
// Sender werden ueber einen Chromecast-Eintrag gestartet (play_media), Lautstaerke/Pause/Quelle ueber das Geraet.
//
//   type: custom:radio-karte
//   entity: media_player.badezimmer_arylic_la50     # Geraet (Lautstaerke, Pause, Quelle)
//   cast: media_player.arylic_la50_71524d_3         # Chromecast desselben Geraets (Sender starten)
//   name: Badezimmer Radio                          # optional
//   power: switch.steckdose_badezimmer              # optional, Ein/Aus (z. B. Steckdose des Verstaerkers)
//   suche: true                                     # optional, Sendersuche (Radio Browser), laender: [AT] (Standard)
//   sender:                                         # erster = Standard fuer Play
//     - { name: FM4, id: "media-source://radio_browser/1e13ed4e-daa9-4728-8550-e08d89c1c8e7", icon: mdi:radio }
//       # optional: titel = Text, an dem der laufende Sender erkannt wird (Standard: name)

const TYPE19 = "radio-karte";

class RadioKarte extends HTMLElement {
  setConfig(c) {
    if (!c?.entity) throw new Error("entity (media_player.*) fehlt");
    this._config = { sender: [], ...c };
    this._render();
  }

  set hass(hass) { this._hass = hass; this._update(); }

  _s(id) { return id ? this._hass?.states[id] : null; }
  _dienst(d, s, daten) { return this._hass.callService(d, s, daten); }
  _sender() { return (this._config.sender || []).filter((x) => x && x.id); }

  _spielt() {
    const s = this._s(this._config.entity), cs = this._s(this._config.cast);
    return (s && ["playing", "buffering"].includes(s.state)) || (cs && ["playing", "buffering"].includes(cs.state));
  }

  // Strom (optional): Schalter fuer das Geraet, z. B. Steckdose
  _stromAn() { const p = this._s(this._config.power); return !this._config.power || (!!p && p.state === "on"); }
  _bereit() {
    const s = this._s(this._config.entity), cs = this._s(this._config.cast);
    return !!s && !["unavailable", "unknown"].includes(s.state) && (!this._config.cast || (!!cs && !["unavailable", "unknown"].includes(cs.state)));
  }
  async _einschalten() {
    if (this._stromAn()) return;
    await this._dienst("switch", "turn_on", { entity_id: this._config.power });
    for (let i = 0; i < 60 && !this._bereit(); i++) await new Promise((ok) => setTimeout(ok, 500));
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  async _ausschalten() {
    if (this._spielt()) await this._dienst("media_player", "media_pause", { entity_id: this._config.entity }).catch(() => {});
    await this._dienst("switch", "turn_off", { entity_id: this._config.power });
  }

  async _starte(x) {
    if (!x) return;
    this._letzter = x.name;
    await this._einschalten();
    this._dienst("media_player", "play_media", { entity_id: this._config.cast || this._config.entity,
      media_content_id: x.id, media_content_type: x.typ || "audio/mpeg" });
  }

  _playPause() {
    if (this._spielt()) {
      const s = this._s(this._config.entity);
      const ziel = s && ["playing", "buffering"].includes(s.state) ? this._config.entity : this._config.cast;
      return this._dienst("media_player", "media_pause", { entity_id: ziel });
    }
    return this._starte(this._sender()[0]);
  }

  // Laufender Sender: Titel des Chromecast enthaelt den Sendernamen (oder 'titel')
  _aktiv() {
    if (!this._spielt()) return null;
    const cs = this._s(this._config.cast), a = cs?.attributes || {};
    const text = [a.media_title, a.media_artist, a.media_channel].filter(Boolean).join(" ").toLowerCase();
    const treffer = this._sender().find((x) => text && text.includes(String(x.titel || x.name).toLowerCase()));
    return treffer ? treffer.name : (cs && ["playing", "buffering"].includes(cs.state) ? this._letzter : null);
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 14px 16px; box-sizing: border-box; }
        .kopf { display: flex; align-items: center; gap: 12px; }
        .cover { width: 48px; height: 48px; border-radius: 10px; background: var(--secondary-background-color) center/cover no-repeat; flex: none;
          display: flex; align-items: center; justify-content: center; }
        .cover ha-icon { --mdc-icon-size: 26px; color: var(--state-icon-color, #44739e); }
        .kopf.an .cover ha-icon { color: var(--state-media_player-active-color, var(--amber-color, #ffc107)); }
        .titel { flex: 1; min-width: 0; }
        .name { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
        .status { font-size: 13px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        button { font: inherit; cursor: pointer; border: none; background: none; color: var(--primary-text-color); }
        .rund { width: 42px; height: 42px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
          background: var(--secondary-background-color, rgba(127,127,127,.15)); flex: none; }
        .rund ha-icon { --mdc-icon-size: 22px; }
        .rund.klein { width: 34px; height: 34px; }
        .rund.klein ha-icon { --mdc-icon-size: 18px; }
        .play { background: var(--primary-color); color: var(--text-primary-color, #fff); }
        .power.an { background: var(--success-color, #43a047); color: #fff; }
        .aus .laut, .aus .zeile2 { opacity: .45; }
        .stumm.an { background: var(--error-color, #e53935); color: #fff; }
        .laut { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
        .laut input { flex: 1; accent-color: var(--primary-color); height: 28px; min-width: 0; }
        .wert { width: 38px; text-align: right; font-size: 14px; color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
        .sender { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 8px; margin-top: 14px; }
        .sender:empty { display: none; }
        .q { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: 12px;
          background: var(--secondary-background-color, rgba(127,127,127,.12)); border: 2px solid transparent; font-size: 13px; line-height: 1.2; text-align: center; }
        .q ha-icon { --mdc-icon-size: 26px; color: var(--state-icon-color, #44739e); }
        .q.aktiv { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
        .q.aktiv ha-icon { color: var(--primary-color); }
        .zeile2 { display: flex; gap: 8px; margin-top: 10px; }
        .zeile2 label { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--secondary-text-color); }
        select { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; color: var(--primary-text-color);
          background: var(--card-background-color, #1c1c1c); border: 1px solid var(--divider-color, #555); }
      </style>
      <ha-card>
        <div class="kopf">
          <div class="cover"><ha-icon icon="mdi:radio"></ha-icon></div>
          <div class="titel"><div class="name"></div><div class="status"></div></div>
          <button class="rund play" title="Wiedergabe / Pause"><ha-icon icon="mdi:play"></ha-icon></button>
          <button class="rund power" title="Ein / Aus"><ha-icon icon="mdi:power"></ha-icon></button>
        </div>
        <radio-wahl></radio-wahl>
        <div class="laut">
          <button class="rund klein stumm" title="Stumm"><ha-icon icon="mdi:volume-high"></ha-icon></button>
          <button class="rund klein leiser" title="Leiser"><ha-icon icon="mdi:minus"></ha-icon></button>
          <input type="range" min="0" max="100" step="1">
          <button class="rund klein lauter" title="Lauter"><ha-icon icon="mdi:plus"></ha-icon></button>
          <span class="wert"></span>
        </div>
        <div class="zeile2"><label class="lq">Quelle<select class="quelle"></select></label></div>
      </ha-card>`;
    const r = this.shadowRoot, e = () => ({ entity_id: this._config.entity });
    r.querySelector(".play").addEventListener("click", () => this._playPause());
    r.querySelector(".power").addEventListener("click", () => (this._stromAn() ? this._ausschalten() : this._einschalten()));
    r.querySelector(".stumm").addEventListener("click", () => {
      const s = this._s(this._config.entity);
      this._dienst("media_player", "volume_mute", { ...e(), is_volume_muted: !s?.attributes.is_volume_muted });
    });
    r.querySelector(".leiser").addEventListener("click", () => this._dienst("media_player", "volume_down", e()));
    r.querySelector(".lauter").addEventListener("click", () => this._dienst("media_player", "volume_up", e()));
    const regler = r.querySelector("input");
    regler.addEventListener("input", () => { this._ziehen = true; r.querySelector(".wert").textContent = regler.value; });
    regler.addEventListener("change", () => {
      this._ziehen = false;
      this._dienst("media_player", "volume_set", { ...e(), volume_level: Number(regler.value) / 100 });
    });
    r.querySelector(".quelle").addEventListener("change", (ev) => {
      if (ev.target.value) this._dienst("media_player", "select_source", { ...e(), source: ev.target.value });
    });
    this._senderSchluessel = null;
    this._update();
  }

  _update() {
    const r = this.shadowRoot, c = this._config;
    if (!r || !c || !this._hass) return;
    const s = this._s(c.entity), a = s?.attributes || {}, cs = this._s(c.cast), ca = cs?.attributes || {};
    const spielt = this._spielt(), aktiv = this._aktiv(), strom = this._stromAn();
    r.querySelector(".kopf").classList.toggle("an", spielt);
    const pw = r.querySelector(".power");
    pw.style.display = c.power ? "" : "none";
    pw.classList.toggle("an", !!c.power && strom);
    r.querySelector("ha-card").classList.toggle("aus", !strom);
    r.querySelector(".name").textContent = c.name || a.friendly_name || c.entity;
    const castLaeuft = cs && ["playing", "paused", "buffering"].includes(cs.state);
    const t = castLaeuft ? ca : a;
    const titel = [t.media_title, t.media_artist].filter(Boolean).join(" · ");
    r.querySelector(".status").textContent = !strom ? "Aus" : !s ? "nicht gefunden" : s.state === "unavailable" ? "startet …"
      : spielt ? (titel || aktiv || "spielt") : (s.state === "paused" || cs?.state === "paused") ? `pausiert${titel ? " · " + titel : ""}`
      : ["Bereit", a.source].filter(Boolean).join(" · ");
    r.querySelector(".play ha-icon").setAttribute("icon", spielt ? "mdi:pause" : "mdi:play");
    const bild = spielt ? (ca.entity_picture || a.entity_picture) : null, cv = r.querySelector(".cover");
    cv.style.backgroundImage = bild ? `url("${bild}")` : "";
    cv.querySelector("ha-icon").style.display = bild ? "none" : "";

    // Sender-Tasten und Suche
    const rw = r.querySelector("radio-wahl");
    if (rw.einstellen) { rw.hass = this._hass; rw.einstellen(c, (x) => this._starte(x), aktiv); }

    // Lautstaerke
    const vol = a.volume_level != null ? Math.round(a.volume_level * 100) : null;
    const regler = r.querySelector("input");
    regler.disabled = vol == null;
    if (!this._ziehen && vol != null) regler.value = String(vol);
    if (!this._ziehen) r.querySelector(".wert").textContent = vol != null ? String(vol) : "–";
    const stumm = !!a.is_volume_muted, sb = r.querySelector(".stumm");
    sb.classList.toggle("an", stumm);
    sb.querySelector("ha-icon").setAttribute("icon", stumm ? "mdi:volume-off" : "mdi:volume-high");

    // Quelle
    const quellen = a.source_list || [], sel = r.querySelector(".quelle");
    r.querySelector(".zeile2").style.display = quellen.length > 1 ? "" : "none";
    const kq = JSON.stringify([quellen, a.source]);
    if (sel.dataset.k !== kq) {
      sel.dataset.k = kq;
      sel.innerHTML = quellen.map((x) => `<option value="${x}"${x === a.source ? " selected" : ""}>${x}</option>`).join("");
    }
  }

  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, rows: "auto" }; }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "media_player" } } },
        { name: "cast", selector: { entity: { domain: "media_player" } } },
        { name: "name", selector: { text: {} } },
        { name: "power", selector: { entity: { domain: "switch" } } },
        { name: "suche", selector: { boolean: {} } },
        { name: "sender", selector: { object: {} } },
      ],
      computeLabel: (s) => ({ entity: "Gerät (Lautstärke, Pause, Quelle)", cast: "Chromecast (Sender starten)", name: "Name",
        power: "Ein / Aus (z. B. Steckdose)", suche: "Sendersuche anzeigen", sender: "Sender" }[s.name] || s.name),
      computeHelper: (s) => (s.name === "sender"
        ? "Liste mit name, id (media-source://radio_browser/...), icon – der erste Sender startet mit Play" : undefined),
    };
  }

  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {}).filter((id) => id.startsWith("media_player."));
    return { entity: ids[0] || "", sender: [] };
  }
}

if (!customElements.get(TYPE19)) customElements.define(TYPE19, RadioKarte);
if (!window.customCards.some((c) => c.type === TYPE19)) {
  window.customCards.push({ type: TYPE19, name: "Radio-Karte", description: "Lautsprecher mit Radiosendern: Play startet den Standardsender, Sender-Tasten, Lautstärke und Quelle", preview: true });
}
}

console.info("%c radio-karte %c v1.0.0 ", "color:#fff;background:#03a9f4;font-weight:700", "color:#03a9f4");
