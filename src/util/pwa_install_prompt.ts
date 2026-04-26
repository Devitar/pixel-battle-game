export type BrowserClass = 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | null;

export function classifyBrowser(ua: string): BrowserClass {
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS) {
    if (/CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  const isAndroid = /Android/.test(ua);
  if (isAndroid) {
    if (/EdgA|OPR\//.test(ua)) return 'android-other';
    if (/Chrome/.test(ua)) return 'android-chrome';
    return 'android-other';
  }
  return null;
}

const DISMISS_KEY = 'pwa-prompt-dismissed';
const SHOW_DELAY_MS = 1500;

interface InstructionContent {
  pitch: string;
  steps: string[];
}

function instructionsFor(klass: Exclude<BrowserClass, null>): InstructionContent {
  switch (klass) {
    case 'ios-safari':
      return {
        pitch: 'Get the full-screen experience.',
        steps: [
          'Tap the Share button (⮭) at the bottom of the screen.',
          'Scroll down and tap "Add to Home Screen".',
          'Tap "Add" in the top-right.',
        ],
      };
    case 'ios-other':
      return {
        pitch: 'Get the full-screen experience.',
        steps: [
          'Add to Home Screen requires Safari on iPhone or iPad.',
          'Open this page in Safari, then use the Share menu.',
        ],
      };
    case 'android-chrome':
      return {
        pitch: 'Get the full-screen experience.',
        steps: [
          'Tap the menu (⋮) in the top-right.',
          'Tap "Install app" (or "Add to Home Screen").',
          'Tap "Install".',
        ],
      };
    case 'android-other':
      return {
        pitch: 'Get the full-screen experience.',
        steps: [
          'Look for an "Install" or "Add to Home Screen" option in your browser’s menu.',
        ],
      };
  }
}

function shouldShow(): boolean {
  if (!window.matchMedia('(pointer: coarse)').matches) return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return false;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return false;
  if (sessionStorage.getItem(DISMISS_KEY) !== null) return false;
  return true;
}

function buildModal(content: InstructionContent): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.id = 'pwa-prompt-backdrop';

  const card = document.createElement('div');
  card.id = 'pwa-prompt-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'pwa-prompt-title');

  const title = document.createElement('h2');
  title.id = 'pwa-prompt-title';
  title.className = 'pwa-prompt-title';
  title.textContent = 'Install Pixel Battle';

  const pitch = document.createElement('p');
  pitch.className = 'pwa-prompt-pitch';
  pitch.textContent = content.pitch;

  const list = document.createElement('ol');
  list.className = 'pwa-prompt-steps';
  for (const step of content.steps) {
    const li = document.createElement('li');
    li.textContent = step;
    list.appendChild(li);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pwa-prompt-dismiss';
  dismiss.textContent = 'Maybe Later';

  card.append(title, pitch, list, dismiss);
  backdrop.appendChild(card);
  return backdrop;
}

export function installPwaPrompt(): void {
  if (!shouldShow()) return;
  const klass = classifyBrowser(navigator.userAgent);
  if (klass === null) return;

  const content = instructionsFor(klass);
  const backdrop = buildModal(content);

  function dismiss(): void {
    sessionStorage.setItem(DISMISS_KEY, '1');
    backdrop.remove();
  }

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) dismiss();
  });
  const dismissButton = backdrop.querySelector('.pwa-prompt-dismiss');
  dismissButton?.addEventListener('click', dismiss);

  setTimeout(() => {
    document.body.appendChild(backdrop);
  }, SHOW_DELAY_MS);
}
