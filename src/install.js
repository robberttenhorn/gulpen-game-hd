// Melding onderin het scherm: je kunt de game als app op je beginscherm zetten, met korte uitleg per apparaat.
// - verschijnt een paar seconden na het openen, elke keer dat je de game opnieuw opent of bezoekt;
// - wegklikken kan met het kruisje, en dan blijft hij voor de rest van die sessie weg (ook na opnieuw laden);
// - niet als de game al als app draait.
// Op Android en op de computer (Chrome, Edge) biedt de browser zelf een installatievenster aan; dan staat er een
// knop Installeren. Op iPhone en iPad kan dat alleen met de hand, via het deelmenu.
const KEY = 'locals-app-melding-weg';

// de browser meldt dit soms al vóór de game geladen is: daarom meteen bij het inladen van dit bestand luisteren
let deferred = null, show = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; show?.(); });

export function setupInstallTip({ delay = 4000 } = {}) {
  const el = document.getElementById('install-tip');
  if (!el) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  let gone = false;
  try { gone = sessionStorage.getItem(KEY) === '1'; } catch { /* geen opslag: dan gewoon tonen */ }
  if (standalone || gone) return;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const text = document.getElementById('install-text'), btn = document.getElementById('install-btn');
  const share = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-2px"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v9h14v-9h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let ready = false, closed = false;
  show = () => {
    if (!ready || closed) return;
    // zonder installatievenster van de browser heeft de melding op een computer geen zin
    if (!ios && !android && !deferred) return;
    btn.hidden = !deferred;
    text.innerHTML = deferred ? 'Zet de game als app op je ' + (android ? 'beginscherm' : 'computer') + '.'
      : ios ? `Tik op ${share} <b>Deel</b> en kies <b>Zet op beginscherm</b>.`
        : 'Tik op <b>⋮</b> rechtsboven en kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>.';
    el.hidden = false;
  };
  const close = () => {
    closed = true; el.hidden = true;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* negeren */ }
  };
  for (const ev of ['pointerdown', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  document.getElementById('install-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!deferred) return;
    const d = deferred; deferred = null;
    try { d.prompt(); await d.userChoice; } catch { /* negeren */ }
    close();
  });
  addEventListener('appinstalled', close);
  setTimeout(() => { ready = true; show(); }, delay);
}
