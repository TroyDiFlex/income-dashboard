// Apply saved appearance before first paint and point installation metadata at matching assets.
(() => {
  const THEME_KEY = 'potok-theme';
  const SETTINGS_KEY = 'potok-theme-customization';
  const DEFAULT_ACCENT = '#fb7185';
  const ACCENTS = new Set(['#fb7185','#f97316','#facc15','#4ade80','#2dd4bf','#38bdf8','#60a5fa','#818cf8','#a78bfa','#e879f9','#f472b6','#f5f5f4']);
  const PRESETS = {
    violet: {accent:'#b39aff', background:'#0c0b13'},
    midnight: {accent:'#83bbff', background:'#0a111b'},
    forest: {accent:'#9be5c3', background:'#0b1413'},
    light: {accent:'#7954c0', background:'#f4f2f8'},
    obsidian: {accent:DEFAULT_ACCENT, background:'#080808'},
    quartz: {accent:DEFAULT_ACCENT, background:'#fafafa'}
  };
  const rgb = hex => [1,3,5].map(index => parseInt(hex.slice(index,index+2),16)).join(' ');
  function resolve(theme) {
    theme = PRESETS[theme] ? theme : 'obsidian';
    const state = {...PRESETS[theme], theme};
    if (theme === 'obsidian' || theme === 'quartz') {
      try {
        const value = JSON.parse(localStorage.getItem(SETTINGS_KEY))?.[theme];
        if (ACCENTS.has(value?.accent)) state.accent = value.accent;
      } catch {}
    }
    return state;
  }
  function iconKey({theme,accent}) { return `${theme}-${accent.slice(1).toLowerCase()}`; }
  function apply(requested) {
    const state = resolve(requested?.theme);
    if (ACCENTS.has(requested?.accent) || Object.values(PRESETS).some(value => value.accent === requested?.accent)) state.accent = requested.accent.toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(requested?.background || '')) state.background = requested.background.toLowerCase();
    const key = iconKey(state);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="${state.accent}"/><path d="M4.8 12.4V5.8h6.9v6.6H9.4V7.7H7.1v4.7Z" fill="${state.background}"/></svg>`;
    const favicon = document.getElementById('site-icon');
    const manifest = document.getElementById('app-manifest');
    const apple = document.getElementById('apple-touch-icon');
    if (favicon) favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    if (manifest) manifest.href = `manifests/${key}.webmanifest?v=1`;
    if (apple) apple.href = `icons/themes/${key}-apple.png?v=1`;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.background;
    return state;
  }
  let savedTheme = 'obsidian';
  try { savedTheme = localStorage.getItem(THEME_KEY) || savedTheme; } catch {}
  const initial = resolve(savedTheme);
  document.documentElement.dataset.theme = initial.theme;
  if (initial.theme === 'obsidian' || initial.theme === 'quartz') {
    const color = rgb(initial.accent);
    let glow = 6;
    try { const value=JSON.parse(localStorage.getItem(SETTINGS_KEY))?.[initial.theme]?.glow;if(Number.isInteger(value)&&value>=0&&value<=10)glow=value; } catch {}
    document.documentElement.style.setProperty('--accent',initial.accent);
    document.documentElement.style.setProperty('--accent-strong',initial.accent);
    document.documentElement.style.setProperty('--accent-soft',`rgb(${color} / .12)`);
    document.documentElement.style.setProperty('--glow',`rgb(${color} / ${glow*.012})`);
  }
  window.PotokBranding = Object.freeze({apply,resolve,iconKey});
  apply(initial);
})();
