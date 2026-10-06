(function () {
  const DATA = window.MAP_DATA;
  const TOTAL = DATA.districts.length;
  const STORE = 'unseen-my:v1';
  // Printed on exported maps and used for sharing. Change this if you add a custom domain.
  const SITE_URL = 'https://unseen-malaysia-map.pages.dev';

  // Show the town people know (e.g. "Ipoh") instead of the official district ("Kinta").
  for (const d of DATA.districts) {
    d.places = (window.PLACES && window.PLACES[d.name]) || [d.name];
    d.label = d.places[0];
    d.search = [d.name, ...d.places].join('|').toLowerCase();
  }

  const THEMES = {
    rainforest: { label: 'Rainforest', bg: '#f4efe3', land: '#e2d9c5', visited: '#1f7a4d', stroke: '#fbf7ee', ink: '#17301f', muted: '#6b7a6e', accent: '#e0a526' },
    gemilang: { label: 'Jalur Gemilang', bg: '#fbfaf6', land: '#e3e5ee', visited: '#cc0001', stroke: '#ffffff', ink: '#010066', muted: '#5d6083', accent: '#f2b705' },
    batik: { label: 'Batik Night', bg: '#111a2e', land: '#27334f', visited: '#f2b33d', stroke: '#111a2e', ink: '#f5efe1', muted: '#9aa5bf', accent: '#f2b33d' },
    hibiscus: { label: 'Hibiscus', bg: '#fff4f1', land: '#f1dad5', visited: '#d6336c', stroke: '#fffaf8', ink: '#4a1028', muted: '#8c5a6b', accent: '#d6336c' },
    sipadan: { label: 'Sipadan', bg: '#edf6f7', land: '#d1e2e4', visited: '#0e7c86', stroke: '#f7fcfc', ink: '#0b3c49', muted: '#557780', accent: '#f08a4b' },
    mono: { label: 'Monochrome', bg: '#ffffff', land: '#e7e7e7', visited: '#151515', stroke: '#ffffff', ink: '#151515', muted: '#6e6e6e', accent: '#151515' },
  };
  window.THEMES = THEMES;

  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const saved = load();
  const state = {
    visited: new Set((saved.visited || []).filter((id) => DATA.districts.some((d) => d.id === id))),
    theme: THEMES[saved.theme] ? saved.theme : 'rainforest',
    name: saved.name || '',
    labels: saved.labels !== false,
    photo: saved.photo || null,
    lang: saved.lang || (/^(ms|id)/i.test(navigator.language || '') ? 'ms' : 'en'),
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
  }
  function save() {
    const data = { visited: [...state.visited], theme: state.theme, name: state.name, labels: state.labels, lang: state.lang, photo: state.photo };
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch {
      // Photo may exceed the quota; keep everything else.
      try { delete data.photo; localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* storage unavailable */ }
    }
  }

  const t = (key, vars) => {
    let s = (window.I18N[state.lang] || window.I18N.en)[key] ?? window.I18N.en[key] ?? key;
    for (const k in vars || {}) s = s.replace('{' + k + '}', vars[k]);
    return s;
  };
  const stateName = (s) => (state.lang === 'ms' ? s.ms : s.en);
  const fmtPct = (n) => (Math.round((n / TOTAL) * 1000) / 10).toLocaleString(state.lang === 'ms' ? 'ms-MY' : 'en-MY');

  // ---------- Picker ----------
  const chips = new Map();
  const groups = new Map();

  function buildPicker() {
    const list = $('stateList');
    list.innerHTML = '';
    for (const s of DATA.states) {
      const items = DATA.districts.filter((d) => d.state === s.id).sort((a, b) => a.label.localeCompare(b.label));
      const group = document.createElement('section');
      group.className = 'state-group';
      group.innerHTML = `
        <header>
          <h4><span class="state-name"></span> <span class="state-count"></span></h4>
          <button type="button" class="link state-toggle"></button>
        </header>
        <div class="chips"></div>`;
      const box = group.querySelector('.chips');
      for (const d of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = d.label;
        if (d.label !== d.name) {
          const sub = document.createElement('small');
          sub.textContent = d.name;
          b.appendChild(sub);
        }
        b.title = d.places.join(', ');
        b.dataset.id = d.id;
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => toggle(d.id));
        box.appendChild(b);
        chips.set(d.id, b);
      }
      group.querySelector('.state-toggle').addEventListener('click', () => {
        const all = items.every((d) => state.visited.has(d.id));
        for (const d of items) all ? state.visited.delete(d.id) : state.visited.add(d.id);
        update();
      });
      groups.set(s.id, { el: group, items, state: s });
      list.appendChild(group);
    }
    const empty = document.createElement('p');
    empty.id = 'noResults';
    empty.className = 'empty';
    empty.hidden = true;
    list.appendChild(empty);
  }

  function filterPicker() {
    const q = $('search').value.trim().toLowerCase();
    let shown = 0;
    for (const g of groups.values()) {
      const stateMatch = q && (g.state.en.toLowerCase().includes(q) || g.state.ms.toLowerCase().includes(q));
      let any = false;
      for (const d of g.items) {
        const match = !q || stateMatch || d.search.includes(q);
        chips.get(d.id).hidden = !match;
        any ||= match;
      }
      g.el.hidden = !any;
      shown += any ? 1 : 0;
    }
    const empty = $('noResults');
    empty.hidden = shown > 0;
    empty.textContent = t('noResults', { q: $('search').value.trim() });
  }

  // ---------- Map ----------
  const paths = new Map();
  let labelLayer;

  function buildMap() {
    const svg = $('mapSvg');
    svg.setAttribute('viewBox', DATA.viewBox.join(' '));
    const g = document.createElementNS(SVG_NS, 'g');
    for (const d of DATA.districts) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d.d);
      p.setAttribute('class', 'district');
      p.dataset.id = d.id;
      g.appendChild(p);
      paths.set(d.id, p);
    }
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', DATA.divider); line.setAttribute('x2', DATA.divider);
    line.setAttribute('y1', 40); line.setAttribute('y2', DATA.viewBox[3] - 40);
    line.setAttribute('class', 'divider');
    labelLayer = document.createElementNS(SVG_NS, 'g');
    labelLayer.setAttribute('class', 'labels');
    svg.append(g, line, labelLayer);

    const tip = $('tooltip');
    const card = $('card');
    svg.addEventListener('click', (e) => {
      const id = e.target.dataset && e.target.dataset.id;
      if (id) toggle(id);
    });
    svg.addEventListener('mousemove', (e) => {
      const id = e.target.dataset && e.target.dataset.id;
      if (!id) { tip.hidden = true; return; }
      const d = DATA.districts.find((x) => x.id === id);
      const s = DATA.states.find((x) => x.id === d.state);
      tip.replaceChildren();
      const title = document.createElement('b');
      title.textContent = d.label;
      const where = document.createElement('span');
      where.textContent = (d.label !== d.name ? d.name + ', ' : '') + stateName(s);
      tip.append(title, where);
      const more = d.places.slice(1).filter((p) => p !== d.name && p.length > 3);
      if (more.length) {
        const also = document.createElement('span');
        also.textContent = more.slice(0, 4).join(' · ');
        tip.appendChild(also);
      }
      const r = card.getBoundingClientRect();
      tip.style.left = e.clientX - r.left + 'px';
      tip.style.top = e.clientY - r.top + 'px';
      tip.hidden = false;
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; });
  }

  function renderLabels() {
    labelLayer.innerHTML = '';
    if (!state.labels) return;
    for (const d of DATA.districts) {
      if (!state.visited.has(d.id)) continue;
      const txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('x', d.c[0]);
      txt.setAttribute('y', d.c[1]);
      txt.textContent = d.label;
      labelLayer.appendChild(txt);
    }
  }

  // ---------- Updates ----------
  function toggle(id) {
    state.visited.has(id) ? state.visited.delete(id) : state.visited.add(id);
    update();
  }

  function statesVisited() {
    return DATA.states.filter((s) => DATA.districts.some((d) => d.state === s.id && state.visited.has(d.id))).length;
  }

  function update() {
    const n = state.visited.size;
    for (const [id, p] of paths) p.classList.toggle('visited', state.visited.has(id));
    for (const [id, c] of chips) {
      const on = state.visited.has(id);
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    }
    for (const g of groups.values()) {
      const done = g.items.filter((d) => state.visited.has(d.id)).length;
      g.el.querySelector('.state-name').textContent = stateName(g.state);
      g.el.querySelector('.state-count').textContent = `${done}/${g.items.length}`;
      g.el.querySelector('.state-toggle').textContent = done === g.items.length ? t('stateNone') : t('stateAll');
      g.el.classList.toggle('complete', done === g.items.length);
    }
    $('pickerCount').textContent = `${n} / ${TOTAL}`;
    $('count').textContent = n;
    $('bar').style.width = (n / TOTAL) * 100 + '%';
    $('summary').textContent = t('summary', { pct: fmtPct(n) });
    $('statesDone').textContent = t('statesDone', { n: statesVisited() });
    renderLabels();
    save();
  }

  function applyTheme() {
    const th = THEMES[state.theme];
    const card = $('card');
    for (const k of ['bg', 'land', 'visited', 'stroke', 'ink', 'muted', 'accent']) card.style.setProperty('--' + k, th[k]);
    for (const b of $('themes').children) {
      const on = b.dataset.theme === state.theme;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    }
    save();
  }

  function applyPersonal() {
    $('cardName').textContent = state.name ? t('exploredBy', { name: state.name }) : '';
    const img = $('avatar');
    img.hidden = !state.photo;
    if (state.photo) img.src = state.photo;
    $('removePhoto').hidden = !state.photo;
    $('photoLabel').textContent = state.photo ? t('changePhoto') : t('addPhoto');
    save();
  }

  // ---------- Visitor counter ----------
  // Each browser is counted once; later visits only read the total.
  let visitorCount = null;
  const COUNTED = 'unseen-my:counted';

  function renderVisitors() {
    if (visitorCount === null) return;
    const n = visitorCount.toLocaleString(state.lang === 'ms' ? 'ms-MY' : 'en-MY');
    $('visitorsText').textContent = t('visitors', { n });
    $('visitors').hidden = false;
  }

  async function loadVisitors() {
    let first = false;
    try { first = !localStorage.getItem(COUNTED); } catch { /* storage unavailable */ }
    try {
      const res = await fetch('/api/visitors', { method: first ? 'POST' : 'GET' });
      if (!res.ok) return;
      const { count } = await res.json();
      if (typeof count !== 'number') return;
      if (first) try { localStorage.setItem(COUNTED, '1'); } catch { /* ignore */ }
      visitorCount = count;
      renderVisitors();
    } catch { /* offline or no backend (local dev): keep the counter hidden */ }
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
    for (const b of document.querySelectorAll('[data-lang]')) b.classList.toggle('active', b.dataset.lang === state.lang);
    applyPersonal();
    filterPicker();
    update();
    renderVisitors();
  }

  // Shrink the uploaded photo so it fits in localStorage and exports crisply.
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const size = 320;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const s = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- Wire up ----------
  function init() {
    buildPicker();
    buildMap();

    const themes = $('themes');
    for (const [key, th] of Object.entries(THEMES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.theme = key;
      b.title = th.label;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', th.label);
      b.style.setProperty('--a', th.bg);
      b.style.setProperty('--b', th.visited);
      b.addEventListener('click', () => { state.theme = key; applyTheme(); });
      themes.appendChild(b);
    }

    $('search').addEventListener('input', filterPicker);
    $('selectAll').addEventListener('click', () => { DATA.districts.forEach((d) => state.visited.add(d.id)); update(); });
    $('clearAll').addEventListener('click', () => {
      if (state.visited.size && !confirm(t('confirmClear'))) return;
      state.visited.clear();
      update();
    });
    $('labels').checked = state.labels;
    $('labels').addEventListener('change', (e) => { state.labels = e.target.checked; update(); });
    $('name').value = state.name;
    $('name').addEventListener('input', (e) => { state.name = e.target.value.trim(); applyPersonal(); });
    $('photo').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try { state.photo = await readPhoto(file); applyPersonal(); } catch { /* not an image */ }
    });
    $('removePhoto').addEventListener('click', () => { state.photo = null; applyPersonal(); });
    for (const b of document.querySelectorAll('[data-lang]')) {
      b.addEventListener('click', () => { state.lang = b.dataset.lang; applyLang(); });
    }
    const exportOpts = () => ({
      data: DATA,
      site: SITE_URL,
      theme: THEMES[state.theme],
      visited: state.visited,
      labels: state.labels,
      photo: state.photo,
      texts: {
        kicker: t('cardKicker'),
        title: t('cardTitle'),
        name: state.name ? t('exploredBy', { name: state.name }) : '',
        summary: t('summary', { pct: fmtPct(state.visited.size) }),
        states: t('statesDone', { n: statesVisited() }),
        cta: t('makeYours'),
      },
    });
    for (const b of document.querySelectorAll('[data-export]')) {
      b.addEventListener('click', () => window.exportMap(b.dataset.export, exportOpts()));
    }
    $('share').addEventListener('click', async () => {
      const btn = $('share');
      btn.disabled = true;
      try {
        const result = await window.shareMap(exportOpts(), t('shareText', { n: state.visited.size }));
        if (result === 'copied') {
          btn.textContent = t('linkCopied');
          setTimeout(() => { btn.textContent = t('share'); }, 2000);
        }
      } catch { /* clipboard blocked */ }
      btn.disabled = false;
    });

    applyTheme();
    applyLang();
    loadVisitors();
  }

  init();
})();
