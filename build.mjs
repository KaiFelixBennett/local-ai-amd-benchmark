// Erzeugt dist/ aus data/ und src/. Kein Framework, keine Abhaengigkeiten.
//   node build.mjs
import fs from 'node:fs';
import path from 'node:path';

const R = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const read = p => fs.readFileSync(path.join(R, p), 'utf8');
const json = p => JSON.parse(read(p));

const HW = json('data/hardware.json');
const RUNS = json('data/runs.json');
const CFG = json('data/configs.json');

const DIST = path.join(R, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const de = (n, d = 1) => (n === null || n === undefined) ? '—' : Number(n).toFixed(d).replace('.', ',');
const num = n => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('de-DE');

/* ---------------------------------------------------------------- Kopf */
function head(title, desc, depth) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${up}assets/styles.css">
</head>
<body>
<div id="bg" aria-hidden="true"><canvas id="bgc"></canvas></div>
<div id="tip" role="status" aria-live="polite"></div>
<div class="page">
<header class="top"><div class="topin">
  <a class="mark" href="${up}index.html" style="text-decoration:none;color:inherit">benchmark<span>.securesight.ai</span></a>
  <div class="spacer"></div>
  <div class="bgpick" role="group" aria-label="Hintergrund">
    <button class="tbtn" type="button" data-bg="depth">01</button>
    <button class="tbtn" type="button" data-bg="field">02</button>
    <button class="tbtn" type="button" data-bg="bands">03</button>
    <button class="tbtn" type="button" data-bg="fluid">04</button>
  </div>
  <button class="tbtn" type="button" id="motion">Bewegung aus</button>
</div></header>`;
}
const foot = (depth, extraJs) => {
  const up = '../'.repeat(depth);
  return `<footer><div class="wrap" style="display:flex;flex-wrap:wrap;gap:8px 26px;justify-content:center">
  <span>Stand ${new Date().toLocaleDateString('de-DE')}</span>
  <span>Messdaten CC-BY-4.0 · Code MIT</span>
  <a href="https://github.com/KaiFelixBennett/local-ai-amd-benchmark">Quelltext auf GitHub</a>
</div></footer>
</div>
<script src="${up}assets/bg.js"></script>
<script src="${up}assets/data.js"></script>
${extraJs.map(f => `<script src="${up}assets/${f}"></script>`).join('\n')}
</body>
</html>`;
};

/* ------------------------------------------------------- Hilfsbausteine */
const measured = RUNS.filter(r => r.kind === 'agent' && r.decode);
const totalTok = measured.reduce((a, r) => a + (r.tokens || 0), 0);
const totalMin = measured.reduce((a, r) => a + (r.minutes || 0), 0);
const fastest = measured.reduce((a, b) => (b.decode.median > a.decode.median ? b : a));

function cmdBlock(cmd, id) {
  return `<div class="copywrap"><div class="code" id="${id}">${esc(cmd)}</div>
    <button class="copy" type="button" data-copy="${id}">Startzeile kopieren</button></div>`;
}

function runCard(r) {
  const hw = HW[r.hw];
  const d = r.decode;
  return `<a class="mc" href="m/${r.slug}/index.html">
    <p class="top"><i style="background:${hw.color}"></i><span>${esc(hw.short)} · ${esc(r.task)}</span></p>
    <h3>${esc(r.model)}</h3>
    <p class="q">${esc(r.quant)}</p>
    <div class="nums">
      <div><b>${d ? de(d.median, 2) : '—'}</b><span>t/s Median</span></div>
      <div><b>${r.tokens ? Math.round(r.tokens / 1000) + 'k' : '—'}</b><span>Tokens</span></div>
      <div><b>${r.minutes ? r.minutes + ' min' : '—'}</b><span>Laufzeit</span></div>
    </div></a>`;
}

/* ------------------------------------------------------------ Startseite */
function indexPage() {
  const kindLabel = { agent: ['Agentenlauf', 'k-a'], synth: ['synthetisch', 'k-s'], offen: ['offen', 'k-o'] };
  const cfgRows = CFG.map((c, i) => `<tr>
    <td class="model"><span class="mtxt"><b>${esc(c.model)}</b><span>${esc(c.file)}</span></span></td>
    <td><span class="hwchip"><i style="background:${HW[c.hw].color}"></i>${esc(HW[c.hw].short)}</span></td>
    <td class="num"><span class="v dim">${c.ctx ? num(c.ctx) : '—'}</span></td>
    <td class="num"><span class="v dim">${c.ub || '—'}</span></td>
    <td><span class="rngtxt">${esc(c.kv || '—')} / ${esc(c.ctv || c.kv || '—')}</span></td>
    <td><span class="rngtxt">${esc(c.spec || '—')}</span></td>
    <td>${c.vision ? '<span class="kind k-a">Vision</span>' : '<span class="kind k-o">—</span>'}</td>
    <td><button class="copy" type="button" data-cfg="${i}">Startzeile</button></td></tr>`).join('');

  return head('Lokale KI auf AMD — Nutzbarkeitstest',
    'Erfahrungsberichte zu lokaler KI auf AMD-Hardware: agentisches Coding in VS Code, Bilderkennung und gemessene Geschwindigkeit.', 0) + `

<div class="wrap hero">
  <p class="kick">Nutzbarkeitstest</p>
  <h1>Lokale KI auf AMD.</h1>
  <span class="heroprice"><i></i>Prüfstand ab 1 500 € · kein Abo, keine Cloud</span>
  <p class="say" style="max-width:56ch">
    <b>Erfahrungsberichte:</b> Welche Modelle bringen welche Ergebnisse in welcher
    Geschwindigkeit? Abseits von Standard-Benchmarks — wie gut sind Bilderkennung und
    agentisches Coding mit VS Code auf lokaler, bezahlbarer AMD-Hardware wirklich?
  </p>
</div>

<!-- ===================== MODELLWAHL ===================== -->
<section class="center" id="modelle" style="padding-top:0">
  <div class="wrap">
    <div class="finder">
      <div class="finder-in">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>
        <input id="q" type="search" autocomplete="off" spellcheck="false"
          placeholder="Modell suchen — Qwen, DeepSeek, Laguna, R9700 …"
          aria-label="Modell suchen" aria-expanded="false" aria-controls="qlist" role="combobox">
        <span class="kbd" id="kbdhint">/</span>
      </div>
      <div class="finder-list" id="qlist" role="listbox" hidden></div>
    </div>
    <p class="finder-hint">Tippen zum Filtern · ↑ ↓ zum Wählen · Eingabe öffnet die Detailseite</p>
    <div class="cards" id="cards">${RUNS.map(runCard).join('')}</div>
  </div>
</section>

<!-- ===================== ERGEBNIS ===================== -->
<section class="center" id="ergebnis">
  <div class="wrap">
    <p class="kick">Das Ergebnis</p>
    <h2 style="max-width:19ch">Moorhuhn &amp; Clair Obscure Single-Shot-Benchmark</h2>
    <p class="say">Aufnahmen aus den ausgelieferten Builds — Menüs, Spielmodi, Punktesystem,
      Freischaltungen.</p>
  </div>
  <div class="wide bleed">
    <figure class="film" style="margin:0">
      <video autoplay muted loop playsinline preload="metadata" poster="media/hero.jpg" src="media/hero.webm"></video>
      <figcaption class="filmcap"><b>Clair Obscure — Kampfstudie</b> · gebaut von Qwen3.8-27B auf
        der Radeon AI PRO R9700 · ein einziger Auftrag</figcaption>
    </figure>
    <div class="strip">
      <figure><video autoplay muted loop playsinline preload="none" poster="media/night.jpg" src="media/night.webm"></video>
        <figcaption><b>Qwen3.6-27B Q6</b>Clair Obscure · Nachtszene</figcaption></figure>
      <figure><video autoplay muted loop playsinline preload="none" poster="media/moor36.jpg" src="media/moor36.webm"></video>
        <figcaption><b>Qwen3.6-27B Q6</b>Moorhuhn · 1 125 Punkte</figcaption></figure>
      <figure><video autoplay muted loop playsinline preload="none" poster="media/sonnet.jpg" src="media/sonnet.webm"></video>
        <figcaption><b>Sonnet 5 · Cloud</b>Moorhuhn · zum Vergleich</figcaption></figure>
      <figure><img src="media/q38q4xl-play.jpg" alt="Fortschrittsbildschirm" loading="lazy">
        <figcaption><b>Qwen3.8-27B Q4_XL</b>Fortschritt &amp; Freischaltungen</figcaption></figure>
    </div>
  </div>
</section>

<!-- ===================== NACHTSZENE ===================== -->
<section class="center" id="nacht" style="padding-top:0">
  <div class="wide">
    <figure class="film" style="margin:0">
      <video autoplay muted loop playsinline preload="none" poster="media/night.jpg" src="media/night.webm"></video>
      <figcaption class="filmcap"><b>Clair Obscure — Nachtszene</b> · Qwen3.6-27B Q6 ·
        Nebel, Punktlichter und Gelände, komplett selbst erzeugt</figcaption>
    </figure>
  </div>
</section>

<!-- ===================== AUSDAUER ===================== -->
<section class="center" id="ausdauer">
  <div class="wrap">
    <p class="kick">Agentische Entwicklung</p>
    <h2>9 Stunden. Ein einzelner Prompt.</h2>
    <p class="say" style="max-width:54ch">
      Das Modell läuft im lokalen Netz und ist in <b>VS Code Copilot Chat als Custom
      Endpoint</b> hinterlegt — also genau dort, wo die meisten Entwickler ohnehin sind.
      Mit Tool Use schreibt es Tests, legt Dateien und Ordner an, erstellt Screenshots und
      Playwright-Tests, um sich selbst zu prüfen.
    </p>
  </div>
  <div class="wide bleed">
    <figure class="film" style="margin:0">
      <img src="media/vscode.jpg" alt="VS Code mit lokalem Modell: llama.cpp-Konsole und Agent bei der Arbeit">
      <figcaption class="filmcap"><b>Qwen3.8-Flash-Next Q4XL + MTP — 177B/6B aktiv — 131k — Vision — :8099</b><br>
        Links die Serverkonsole mit laufenden Token-Raten, rechts der Agent nach 18 geänderten
        Dateien. Kontextfenster 57,3 K von 131 K.</figcaption>
    </figure>
    <div class="statrow">
      <div><b>${num(totalTok)}</b><span>Tokens erzeugt</span></div>
      <div><b>${measured.reduce((a, r) => a + (r.decode.n || 0), 0)}</b><span>gemessene Antworten</span></div>
      <div><b>${Math.round(totalMin / 60)} h</b><span>reine Rechenzeit</span></div>
    </div>
  </div>
</section>

<!-- ===================== BILDERKENNUNG ===================== -->
<section class="center" id="vision">
  <div class="wrap">
    <p class="kick">Vision</p>
    <h2>Bilderkennung</h2>
    <p class="say">Viele lokale Modelle können Bilder erkennen. Geprüft wird an <b>eigenen
      Bildern</b>, um zu testen, wie gut die Bilderkennung wirklich funktioniert.</p>
    <div class="duo">
      <figure><img src="media/vision-dashboard.jpg" alt="Dashboard-Screenshot als Prüfbild">
        <figcaption><b>Werte ablesen</b>Ein eigenes Dashboard: Tooltip-Tabelle, KPI-Kacheln,
          aktive Filter, Fußnoten. Das Modell gibt sie als JSON aus und zeichnet das Diagramm
          als SVG nach.</figcaption></figure>
      <figure><img src="media/vision-foto.jpg" alt="Dichtes Foto als Prüfbild">
        <figcaption><b>Im Gewühl lesen</b>Ein Messestand mit über vierzig Objekten. Gezählt wird,
          wie viele Preisschilder korrekt gelesen werden — und wie viele erfunden.</figcaption></figure>
    </div>
  </div>
</section>

<!-- ===================== TEMPO ===================== -->
<section id="tempo">
  <div class="wrap center">
    <p class="kick">Geschwindigkeit</p>
    <p class="huge">${de(fastest.decode.median, 1)}<small>t/s</small></p>
    <h2 style="max-width:20ch">So schnell schreibt der schnellste Lauf.</h2>
    <p class="say">Median über ${fastest.decode.n} echte Antworten, nicht die Spitze aus einem
      Labortest. <b>Die Spalte Messart entscheidet:</b> ein Laborwert liegt rund doppelt so hoch
      wie das, was im Betrieb ankommt.</p>
  </div>
  <div class="wide" style="margin-top:16px">
    <div class="bar" role="group" aria-label="Filter">
      <span class="lbl">Hardware</span>
      <button class="chip" type="button" data-f="all">Alle</button>
      <button class="chip" type="button" data-f="r9700"><i style="background:#1c9ab8"></i>R9700</button>
      <button class="chip" type="button" data-f="evox2"><i style="background:#cb7815"></i>Evo X2</button>
      <button class="chip" type="button" data-f="cloud"><i style="background:#7b7796"></i>Cloud</button>
      <span class="count" id="count"></span>
      <div class="views" role="group" aria-label="Ansicht">
        <button type="button" data-v="table" aria-pressed="true">Tabelle</button>
        <button type="button" data-v="chart" aria-pressed="false">Diagramm</button>
      </div>
    </div>
    <div class="plate tablewrap" id="viewTable">
      <table><thead><tr id="thead"></tr></thead><tbody id="tbody"></tbody></table>
    </div>
    <div class="plate" id="viewChart" hidden>
      <div style="overflow-x:auto"><div class="fieldbox">
        <svg id="scatter" role="img" aria-label="Qualität über Decode-Geschwindigkeit"></svg>
      </div></div>
      <div class="legend">
        <span><i style="background:#1c9ab8"></i>R9700</span>
        <span><i style="background:#cb7815"></i>Evo X2</span>
        <span><i class="dash"></i>Cloud, keine lokale Geschwindigkeit</span>
        <span><i class="par"></i>Pareto-Front</span>
        <span style="color:#e0a13a">Qualitätsachse vorläufig</span>
      </div>
    </div>
  </div>
</section>

<!-- ===================== TIEFE ===================== -->
<section class="center" id="tiefe">
  <div class="wrap">
    <p class="kick">Kontexttiefe</p>
    <h2>Die Spitzenzahl gilt nur am Anfang.</h2>
    <p class="say">Fast jede Angabe misst bei kurzem Kontext. Agenten arbeiten bei 50 K bis
      180 K — und dort brechen beide Maschinen ein, jede auf ihre Art.</p>
    <div class="two">
      <div class="plate depthbox">
        <p class="cl">Prefill · Qwen3.8-27B UD-Q6 · R9700</p>
        <svg id="depth" role="img" aria-label="Prefill fällt von 498 auf 118 t/s"></svg>
      </div>
      <div class="plate depthbox">
        <p class="cl">Decode · Qwen3.8-Flash-Next · Ryzen AI Max+ 395</p>
        <svg id="depth2" role="img" aria-label="Decode fällt von 22,1 auf 7,7 t/s"></svg>
      </div>
    </div>
    <p class="note">Auf der R9700 fällt die Prefill-Rate zwischen 8 K und 164 K um den
      <b>Faktor 4,2</b>; ein Prompt mit 180 396 Tokens brauchte 16,6 Minuten bis zum ersten
      Zeichen. Die Decode-Kurve rechts stammt von der Vorgängerfassung von Qwen3.8-Flash-Next;
      die aktuelle Fassung ist im Betrieb mehr als doppelt so schnell.</p>
  </div>
</section>

<!-- ===================== EINSTELLUNGEN ===================== -->
<section class="center" id="einstellung">
  <div class="wrap">
    <p class="kick">Feinabstimmung</p>
    <h2>Was wir anders eingestellt haben.</h2>
    <p class="say">Die Voreinstellungen der Modelcards sind für andere Hardware gedacht. Drei
      davon haben wir geändert — jede mit messbarer Wirkung.</p>
    <div class="finds">
      <div class="find"><p class="n">Entwurfstiefe · Laguna S 2.1</p><p class="big">15 → 3</p>
        <h3>Weniger Entwurfstiefe, mehr Durchsatz</h3>
        <p>Mit dem dokumentierten <code>--spec-draft-n-max 15</code> fällt der Decode auf
          <b>8,1 t/s</b>, unter die 20,55 ohne jede Spekulation. Mit <code>3</code> steigt er auf
          27,9. Auf bandbreitenbegrenzter Hardware ist das Optimum sehr scharf.</p></div>
      <div class="find"><p class="n">Sampling · Qwen3.5-122B</p><p class="big">0,0 → 1,5</p>
        <h3>Ohne Präsenzstrafe endet die Antwort nicht</h3>
        <p>Mit <code>presence_penalty 0.0</code> lief eine Aufgabe bis ans Kontextende —
          <b>32 768 Tokens</b>, ohne Abschluss. Dieselbe Aufgabe braucht 201 Tokens.</p></div>
      <div class="find"><p class="n">Speicher · Strix Halo</p><p class="big">25,6 GiB</p>
        <h3>Die Reservierung hochzudrehen half nicht</h3>
        <p>Eine größere UMA-Reservierung brachte <b>keinen Zuwachs</b> und hätte dem
          Betriebssystem Speicher entzogen. Selbst bei 262 144 Kontext blieben 25,6 GiB frei.</p></div>
    </div>
  </div>
</section>

<!-- ===================== KONFIGURATIONEN ===================== -->
<section class="center" id="konfig">
  <div class="wrap">
    <p class="kick">Modellkarten</p>
    <h2>${CFG.length} Startkonfigurationen.</h2>
    <p class="say">Jede Zeile ist ein Skript, das genau so einen Server gestartet hat. Die
      Startzeile lässt sich einzeln kopieren — vollständig, mit allen Flags.</p>
  </div>
  <div class="wide" style="margin-top:14px">
    <div class="plate tablewrap"><table style="min-width:940px">
      <thead><tr><th>Modell</th><th>Hardware</th><th class="num">Kontext</th><th class="num">-ub</th>
        <th>KV k / v</th><th>Spekulation</th><th>Bild</th><th></th></tr></thead>
      <tbody>${cfgRows}</tbody></table></div>
  </div>
</section>

<!-- ===================== MASCHINEN ===================== -->
<section class="center" id="hardware">
  <div class="wrap">
    <p class="kick">Prüfstand</p>
    <h2>Zwei Rechner. Beide unter 3 500 Euro.</h2>
    <p class="say">Gezeigt ist jeweils die Startzeile des <b>schnellsten gemessenen Laufs</b> auf
      der Maschine.</p>
    <div class="hwgrid">
      ${['r9700', 'evox2'].map(id => {
        const h = HW[id];
        const best = measured.filter(r => r.hw === id).sort((a, b) => b.decode.median - a.decode.median)[0];
        return `<div class="hwcard">
          <h3><i style="background:${h.color}"></i>${esc(h.name)}</h3>
          <p class="sublabel">${esc(h.arch)} · ${esc(h.memory)}</p>
          <p class="price">${esc(h.price)}</p>
          <dl class="spec">${h.specs.slice(0, 6).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
          ${best ? `<p class="cfglbl">Schnellster Lauf: <b>${esc(best.model)} ${esc(best.quant)} · ${de(best.decode.median, 2)} t/s</b></p>
          ${cmdBlock(best.cmd, 'hwcmd-' + id)}` : ''}
        </div>`;
      }).join('')}
    </div>
    <p class="note"><b>Drei Zahlen für denselben Speicher.</b> Der Ryzen AI Max+ 395 hat 128 GiB
      unified LPDDR5X — keine 128 GB VRAM. Windows sieht 63,6 GiB, die BIOS-Reservierung beträgt
      64,4 GiB, Vulkan meldet 98.123 MiB.</p>
  </div>
</section>

<!-- ===================== OFFEN ===================== -->
<section class="center" id="offen">
  <div class="wrap">
    <p class="kick">Quelltext</p>
    <h2>Alles nachlesbar.</h2>
    <p class="say">Die Werkzeuge hinter diesen Messungen liegen offen — Quantisierung,
      Fine-Tuning und die Brücke, über die lokale Modelle in VS Code auftauchen.</p>
    <div class="repos">
      <a class="repo" href="https://github.com/KaiFelixBennett/hermes-claude-code-local" target="_blank" rel="noopener">
        <p class="meta"><span>★ 29</span><span>Shell</span><span>MIT</span></p>
        <h3>hermes-claude-code-local</h3>
        <p>Hermes Agent und Claude Code komplett lokal über llama.cpp. Eine Sitzung über
          4 Stunden und 7 Millionen Tokens hätte in der Cloud rund 94 Dollar gekostet.</p></a>
      <a class="repo" href="https://github.com/KaiFelixBennett/gemma4-turboquant-rdna4" target="_blank" rel="noopener">
        <p class="meta"><span>★ 11</span><span>Python</span><span>MIT</span></p>
        <h3>gemma4-turboquant-rdna4</h3>
        <p>Gemma-4-31B mit vollen 256 K Kontext auf einer RDNA4-Karte — TurboQuant-KV-Cache
          und Flash-Attention für llama.cpp, mit echten Messungen.</p></a>
      <a class="repo" href="https://github.com/KaiFelixBennett/RadeonForge" target="_blank" rel="noopener">
        <p class="meta"><span>★ 6</span><span>ROCm · QLoRA</span></p>
        <h3>RadeonForge</h3>
        <p>Fine-Tuning auf Radeon-GPUs per QLoRA über ROCm, unter Windows mit WSL2 und unter
          Linux. Mit Gemma-4-Beispiel, Live-Dashboard und Validierung.</p></a>
      <a class="repo" href="https://github.com/KaiFelixBennett/llama-cpp-turboquant" target="_blank" rel="noopener">
        <p class="meta"><span>C++</span><span>Fork</span><span>MIT</span></p>
        <h3>llama-cpp-turboquant</h3>
        <p>Der llama.cpp-Fork mit TurboQuant-KV-Cache, auf dem ein Teil dieser Messungen
          entstanden ist — Build <code>bd9bd1b</code>.</p></a>
    </div>
  </div>
</section>
` + foot(0, ['common.js', 'app.js']);
}

/* ----------------------------------------------------------- Detailseite */
function detailPage(r) {
  const hw = HW[r.hw];
  const d = r.decode;
  const others = RUNS.filter(x => x.slug !== r.slug).slice(0, 6);
  const kind = { agent: 'Agentenlauf', synth: 'synthetischer Labortest', offen: 'Lauf steht aus' }[r.kind];
  const media = r.media && (r.media.video
    ? `<div class="dmedia"><video autoplay muted loop playsinline preload="metadata"
        poster="../../media/${r.media.poster}" src="../../media/${r.media.video}"></video></div>`
    : (r.media.image ? `<div class="dmedia"><img src="../../media/${r.media.image}" alt="${esc(r.model)}"></div>` : ''));

  return head(`${r.model} ${r.quant} — ${hw.short}`,
    `Gemessene Werte für ${r.model} ${r.quant} auf ${hw.name}: Decode, Prefill, Startzeile und Kontexttiefe.`, 2) + `
<div class="wrap">
  <div class="dhead">
    <p class="crumb"><a href="../../index.html">Alle Modelle</a> &nbsp;/&nbsp; ${esc(hw.short)} &nbsp;/&nbsp; ${esc(r.task)}</p>
    <h1>${esc(r.model)}</h1>
    <div class="badges">
      <span class="badge"><i style="background:${hw.color}"></i>${esc(hw.name)}</span>
      <span class="badge">${esc(r.quant)}</span>
      <span class="badge">${esc(kind)}</span>
      ${r.ctx ? `<span class="badge">Kontext ${num(r.ctx)}</span>` : ''}
      ${r.build && r.build !== '—' ? `<span class="badge">Build ${esc(r.build)}</span>` : ''}
    </div>
    <div class="metrics">
      <div><b>${d ? de(d.median, 2) : '—'}<small>t/s</small></b><span>Decode Median</span></div>
      <div><b>${d && d.p10 ? de(d.p10, 1) + '–' + de(d.p90, 1) : '—'}</b><span>p10 – p90</span></div>
      <div><b>${r.prefill ? de(r.prefill.median, 0) : '—'}<small>t/s</small></b><span>Prefill Median</span></div>
      <div><b>${r.tokens ? num(r.tokens) : '—'}</b><span>Tokens erzeugt</span></div>
    </div>
  </div>

  ${media ? `<div class="dsec"><h2>Das Ergebnis</h2><div class="dgrid">${media}
    <div><p style="color:var(--ink-2);margin:0 0 14px">Aufnahme aus dem ausgelieferten Build,
      aufgezeichnet über einen lokalen HTTP-Server.</p>
      ${r.note ? `<p class="dnote">${esc(r.note)}</p>` : ''}</div></div></div>` :
    (r.note ? `<div class="dsec"><p class="dnote">${esc(r.note)}</p></div>` : '')}

  ${r.cmd ? `<div class="dsec"><h2>Startzeile</h2>
    <p style="color:var(--ink-2);max-width:64ch;margin:0 0 14px">Wörtlich aus dem Skript, das
      diesen Lauf gestartet hat. Pfade gekürzt, sonst unverändert.</p>
    ${cmdBlock(r.cmd, 'cmd')}
    <dl class="spec" style="max-width:520px;margin-top:18px">
      <dt>Spekulation</dt><dd>${esc(r.spec)}</dd>
      <dt>KV-Cache</dt><dd>${esc(r.kv || '—')}</dd>
      <dt>Mikro-Batch</dt><dd>${r.ub || '—'}</dd>
      <dt>Kontext</dt><dd>${r.ctx ? num(r.ctx) : '—'}</dd>
      <dt>Build</dt><dd>${esc(r.build)}</dd>
    </dl></div>` : ''}

  ${r.depth ? `<div class="dsec"><h2>${esc(r.depth.label)}</h2>
    <div class="plate depthbox"><svg id="ddepth" role="img" aria-label="${esc(r.depth.label)}"></svg></div></div>` : ''}

  <div class="dsec"><h2>Prüfstand</h2>
    <div class="hwcard" style="max-width:560px">
      <h3><i style="background:${hw.color}"></i>${esc(hw.name)}</h3>
      <p class="sublabel">${esc(hw.arch)}</p>
      <dl class="spec">${hw.specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    </div>
    ${r.source ? `<p class="srcline">Quelle: ${esc(r.source)}</p>` : ''}
  </div>

  <div class="dsec"><h2>Weitere Läufe</h2>
    <div class="othr">${others.map(o =>
      `<a href="../${o.slug}/index.html">${esc(o.model)} · ${esc(HW[o.hw].short)}</a>`).join('')}</div>
  </div>
</div>
<script>window.__RUN__ = ${JSON.stringify(r)};</script>
` + foot(2, ['common.js', 'detail.js']);
}

/* --------------------------------------------------------------- Schreiben */
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
for (const f of ['styles.css', 'bg.js', 'common.js', 'app.js', 'detail.js']) {
  const src = path.join(R, 'src', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, 'assets', f));
}
fs.writeFileSync(path.join(DIST, 'assets', 'data.js'),
  'window.HW=' + JSON.stringify(HW) + ';\nwindow.RUNS=' + JSON.stringify(RUNS) +
  ';\nwindow.CFG=' + JSON.stringify(CFG) + ';\n');

fs.cpSync(path.join(R, 'media'), path.join(DIST, 'media'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), indexPage());
for (const r of RUNS) {
  const dir = path.join(DIST, 'm', r.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), detailPage(r));
}
console.log(`dist/ erzeugt: 1 Startseite + ${RUNS.length} Detailseiten, ${CFG.length} Konfigurationen`);
