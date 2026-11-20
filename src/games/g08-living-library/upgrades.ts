export interface PlayerBuild {
  moveSpeed: number;
  maxHp: number;
  magnetRadius: number;
  globalDamageMul: number;

  // 1. Orbiting Brass Astrolabes
  astrolabeCount: number;
  astrolabeRadius: number;
  astrolabeSpeed: number;
  astrolabeDamage: number;

  // 2. Spectacle Chain-Lightning
  lightningChains: number;
  lightningCooldown: number;
  lightningDamage: number;
  lightningRange: number;

  // 3. Bow-Tie Nova Bolt
  novaCount: number;
  novaCooldown: number;
  novaDamage: number;
  novaPierce: number;

  // 4. Arcane Shockwave Dash
  dashCooldown: number;
  dashRadius: number;
  dashDamage: number;

  ranks: Record<UpgradeId, number>;
}

export type UpgradeId =
  | 'astrolabe'
  | 'lightning'
  | 'nova'
  | 'shockwave'
  | 'magnet'
  | 'folio'
  | 'tea';

export interface UpgradeDefinition {
  id: UpgradeId;
  title: string;
  tag: string;
  accent: string;
  maxRank: number;
  iconSvg: string;
  describe: (nextRank: number) => string;
  apply: (build: PlayerBuild, healFn: (amount: number) => void) => void;
}

export function createInitialBuild(): PlayerBuild {
  return {
    moveSpeed: 7.8,
    maxHp: 100,
    magnetRadius: 4.8,
    globalDamageMul: 1.0,

    astrolabeCount: 2,
    astrolabeRadius: 2.35,
    astrolabeSpeed: 3.1,
    astrolabeDamage: 20,

    lightningChains: 2,
    lightningCooldown: 1.65,
    lightningDamage: 26,
    lightningRange: 9.2,

    novaCount: 1,
    novaCooldown: 1.18,
    novaDamage: 24,
    novaPierce: 1,

    dashCooldown: 3.1,
    dashRadius: 5.4,
    dashDamage: 48,

    ranks: {
      astrolabe: 1,
      lightning: 1,
      nova: 1,
      shockwave: 1,
      magnet: 0,
      folio: 0,
      tea: 0,
    },
  };
}

export const UPGRADE_CATALOG: readonly UpgradeDefinition[] = [
  {
    id: 'astrolabe',
    title: 'Orbiting Astrolabe',
    tag: 'Brass Relic',
    accent: '#e8c166',
    maxRank: 6,
    iconSvg: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="18" cy="18" r="12"/>
      <ellipse cx="18" cy="18" rx="12" ry="5.5" transform="rotate(-32 18 18)"/>
      <circle cx="18" cy="18" r="3" fill="currentColor"/>
    </svg>`,
    describe: () => '+1 spinning Brass Astrolabe orbiting your chair, +14% orbit speed & +22% slice damage.',
    apply: (b) => {
      b.ranks.astrolabe += 1;
      b.astrolabeCount = Math.min(7, b.astrolabeCount + 1);
      b.astrolabeSpeed *= 1.14;
      b.astrolabeDamage = Math.round(b.astrolabeDamage * 1.22);
      b.astrolabeRadius = Math.min(3.35, b.astrolabeRadius + 0.14);
    },
  },
  {
    id: 'lightning',
    title: 'Spectacle Chain-Arc',
    tag: 'Static Lens',
    accent: '#63f0d4',
    maxRank: 6,
    iconSvg: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
      <path d="M20 4L9 19h8l-2 13 12-16h-8l1-12z"/>
    </svg>`,
    describe: () => 'Your glasses snap +2 extra turquoise-gold lightning jumps, +26% shock damage & faster cadence.',
    apply: (b) => {
      b.ranks.lightning += 1;
      b.lightningChains += 2;
      b.lightningDamage = Math.round(b.lightningDamage * 1.26);
      b.lightningCooldown = Math.max(0.68, b.lightningCooldown * 0.86);
      b.lightningRange += 1.0;
    },
  },
  {
    id: 'nova',
    title: 'Bow-Tie Volley',
    tag: 'Crimson Sigil',
    accent: '#e8687a',
    maxRank: 6,
    iconSvg: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
      <path d="M5 11l11 7-11 7V11zm26 0l-11 7 11 7V11z"/>
      <circle cx="18" cy="18" r="2.8" fill="currentColor"/>
    </svg>`,
    describe: () => 'Launches +1 extra Crimson Nova Bolt per salvo with +1 pierce & faster casting.',
    apply: (b) => {
      b.ranks.nova += 1;
      b.novaCount = Math.min(6, b.novaCount + 1);
      b.novaPierce += 1;
      b.novaDamage = Math.round(b.novaDamage * 1.16);
      b.novaCooldown = Math.max(0.54, b.novaCooldown * 0.88);
    },
  },
  {
    id: 'shockwave',
    title: 'Quicksilver Shockwave',
    tag: 'Arcane Dash',
    accent: '#f0b85c',
    maxRank: 5,
    iconSvg: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="18" cy="18" r="5"/>
      <circle cx="18" cy="18" r="10" stroke-dasharray="4 3"/>
      <circle cx="18" cy="18" r="14.5" opacity="0.65"/>
    </svg>`,
    describe: () => 'Cuts Space Shockwave Dash cooldown by 22%, expands rune blast radius +24% & boosts blast force.',
    apply: (b) => {
      b.ranks.shockwave += 1;
      b.dashCooldown = Math.max(1.15, b.dashCooldown * 0.78);
      b.dashRadius = Math.min(9.0, b.dashRadius * 1.24);
      b.dashDamage = Math.round(b.dashDamage * 1.35);
    },
  },
  {
    id: 'magnet',
    title: 'Lodestone Aura',
    tag: 'Archive Pull',
    accent: '#68d4a0',
    maxRank: 5,
    iconSvg: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M10 8v10a8 8 0 0016 0V8"/>
      <path d="M7 8h6M23 8h6M18 4v4"/>
    </svg>`,
    describe: () => 'Expands Knowledge Gem magnetic pull by +45% and tunes wheelchair casters for +10% glide speed.',
    apply: (b) => {
      b.ranks.magnet += 1;
      b.magnetRadius = Math.min(14.5, b.magnetRadius * 1.45);
      b.moveSpeed = Math.min(11.6, b.moveSpeed * 1.1);
    },
  },
  {
    id: 'folio',
    title: 'Gilded Master Folio',
    tag: 'Arcane Power',
    accent: '#d8b2ff',
    maxRank: 5,
    iconSvg: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
      <path d="M6 9c4 0 8 1.5 12 4 4-2.5 8-4 12-4v18c-4 0-8 1.5-12 4-4-2.5-8-4-12-4V9z"/>
      <path d="M18 13v18"/>
    </svg>`,
    describe: () => 'Illuminates your entire arsenal: +26% damage across all weapons & wider Astrolabe orbit reach.',
    apply: (b) => {
      b.ranks.folio += 1;
      b.globalDamageMul *= 1.26;
      b.astrolabeRadius = Math.min(3.6, b.astrolabeRadius + 0.2);
    },
  },
  {
    id: 'tea',
    title: 'Mending Chamomile Tea',
    tag: 'Conservatory Brew',
    accent: '#7de29c',
    maxRank: 99,
    iconSvg: `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M8 15h15v7a7.5 7.5 0 01-15 0v-7z"/>
      <path d="M23 17h3a3 3 0 010 6h-3"/>
      <path d="M12 10c0-2 2-2 2-4M18 10c0-2 2-2 2-4"/>
    </svg>`,
    describe: () => 'Steeps warm conservatory herbs: restores +42 HP immediately & increases Max Vitality by +15.',
    apply: (b, healFn) => {
      b.ranks.tea += 1;
      b.maxHp += 15;
      healFn(42);
    },
  },
];

export function pickThreeUpgrades(build: PlayerBuild, hpRatio: number): UpgradeDefinition[] {
  const pool = UPGRADE_CATALOG.filter((u) => build.ranks[u.id] < u.maxRank);
  // Guarantee Mending Tea appears when hurt below 60% HP
  const chosen: UpgradeDefinition[] = [];
  if (hpRatio < 0.6) {
    const tea = pool.find((u) => u.id === 'tea');
    if (tea) chosen.push(tea);
  }
  const remaining = pool.filter((u) => !chosen.includes(u));
  // Fisher-Yates shuffle
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  while (chosen.length < 3 && remaining.length > 0) {
    chosen.push(remaining.shift()!);
  }
  return chosen;
}

function toRoman(n: number): string {
  const map: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rem = Math.max(1, n);
  let out = '';
  for (const [val, sym] of map) {
    while (rem >= val) {
      out += sym;
      rem -= val;
    }
  }
  return out;
}

export interface TomeChoiceOverlay {
  readonly isOpen: boolean;
  open(
    level: number,
    options: UpgradeDefinition[],
    build: PlayerBuild,
    onSelect: (upgrade: UpgradeDefinition) => void
  ): void;
  close(): void;
  dispose(): void;
}

const OVERLAY_CSS = `
.ll-tome-backdrop {
  position: fixed;
  inset: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(circle at 50% 42%, rgba(16, 28, 25, 0.72), rgba(8, 12, 11, 0.86));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: llFadeIn 0.2s ease;
}
.ll-tome-backdrop.is-hidden {
  display: none;
}
@keyframes llFadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
.ll-tome-panel {
  width: min(860px, 100%);
  text-align: center;
}
.ll-tome-kicker {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #edd08c;
  margin-bottom: 8px;
}
.ll-tome-heading {
  margin: 0;
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(30px, 4vw, 44px);
  font-weight: 600;
  line-height: 1.05;
  color: #fbf7ee;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
}
.ll-tome-sub {
  margin: 8px 0 24px;
  font-size: 13px;
  color: rgba(244, 241, 234, 0.74);
  letter-spacing: 0.02em;
}
.ll-tome-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
@media (max-width: 720px) {
  .ll-tome-grid {
    grid-template-columns: 1fr;
  }
}
.ll-tome-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 20px 20px;
  border-radius: 16px;
  background: linear-gradient(168deg, rgba(25, 34, 31, 0.94) 0%, rgba(15, 20, 19, 0.96) 100%);
  border: 1px solid rgba(226, 189, 108, 0.28);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 244, 214, 0.12);
  color: #f6f2e9;
  cursor: pointer;
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.18s ease, box-shadow 0.18s ease;
}
.ll-tome-card:hover,
.ll-tome-card:focus-visible {
  outline: none;
  transform: translateY(-6px);
  border-color: var(--card-accent, #e8c166);
  box-shadow: 0 24px 52px rgba(0, 0, 0, 0.58), 0 0 26px color-mix(in srgb, var(--card-accent, #e8c166) 28%, transparent);
}
.ll-tome-key {
  position: absolute;
  top: 12px;
  left: 12px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: rgba(244, 241, 234, 0.1);
  border: 1px solid rgba(244, 241, 234, 0.22);
  color: #f6ecd4;
}
.ll-tome-rank {
  position: absolute;
  top: 14px;
  right: 14px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--card-accent, #e8c166);
}
.ll-tome-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  margin: 10px 0 14px;
  color: var(--card-accent, #e8c166);
  background: radial-gradient(circle, color-mix(in srgb, var(--card-accent, #e8c166) 22%, transparent), rgba(10, 14, 13, 0.5));
  border: 1px solid color-mix(in srgb, var(--card-accent, #e8c166) 52%, transparent);
}
.ll-tome-icon svg {
  width: 30px;
  height: 30px;
}
.ll-tome-tag {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--card-accent, #e8c166);
  margin-bottom: 6px;
}
.ll-tome-title {
  margin: 0 0 10px;
  font-family: var(--font-display, Georgia, serif);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.12;
  color: #fcf9f2;
}
.ll-tome-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.52;
  color: rgba(244, 241, 234, 0.78);
  flex: 1;
}
.ll-tome-cta {
  margin-top: 16px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #f3dfb1;
  opacity: 0.85;
}
`;

export function createTomeChoiceOverlay(
  container: HTMLElement,
  canInteract: () => boolean = () => true
): TomeChoiceOverlay {
  const styleEl = document.createElement('style');
  styleEl.textContent = OVERLAY_CSS;
  document.head.appendChild(styleEl);

  const backdrop = document.createElement('div');
  backdrop.className = 'll-tome-backdrop is-hidden';
  container.appendChild(backdrop);

  let openState = false;
  let activeOptions: UpgradeDefinition[] = [];
  let activeCallback: ((u: UpgradeDefinition) => void) | null = null;
  let disposed = false;

  const chooseIndex = (idx: number) => {
    if (!openState || !activeCallback || !canInteract()) return;
    const picked = activeOptions[idx];
    if (!picked) return;
    const cb = activeCallback;
    close();
    cb(picked);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!openState || !canInteract()) return;
    if (e.code === 'Digit1' || e.code === 'Numpad1') {
      e.preventDefault();
      e.stopPropagation();
      chooseIndex(0);
    } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
      e.preventDefault();
      e.stopPropagation();
      chooseIndex(1);
    } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
      e.preventDefault();
      e.stopPropagation();
      chooseIndex(2);
    }
  };

  window.addEventListener('keydown', onKeyDown, true);

  const open = (
    level: number,
    options: UpgradeDefinition[],
    build: PlayerBuild,
    onSelect: (upgrade: UpgradeDefinition) => void
  ) => {
    if (disposed) return;
    activeOptions = options;
    activeCallback = onSelect;
    openState = true;

    const cardsHtml = options
      .map((opt, idx) => {
        const nextRank = build.ranks[opt.id] + 1;
        return `
          <button type="button" class="ll-tome-card" data-idx="${idx}" style="--card-accent:${opt.accent}">
            <span class="ll-tome-key">${idx + 1}</span>
            <span class="ll-tome-rank">Rank ${toRoman(nextRank)}</span>
            <div class="ll-tome-icon">${opt.iconSvg}</div>
            <div class="ll-tome-tag">${opt.tag}</div>
            <h3 class="ll-tome-title">${opt.title}</h3>
            <p class="ll-tome-desc">${opt.describe(nextRank)}</p>
            <div class="ll-tome-cta">Bind Tome →</div>
          </button>
        `;
      })
      .join('');

    backdrop.innerHTML = `
      <div class="ll-tome-panel">
        <div class="ll-tome-kicker">✦ Level ${level} · Arcane Illumination ✦</div>
        <h2 class="ll-tome-heading">Choose an Arcane Tome</h2>
        <p class="ll-tome-sub">Click a gilded folio or press <strong>1</strong>, <strong>2</strong>, or <strong>3</strong> to bind its power</p>
        <div class="ll-tome-grid">${cardsHtml}</div>
      </div>
    `;

    backdrop.querySelectorAll<HTMLButtonElement>('.ll-tome-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        if (!Number.isNaN(idx)) chooseIndex(idx);
      });
    });

    backdrop.classList.remove('is-hidden');
  };

  const close = () => {
    openState = false;
    activeOptions = [];
    activeCallback = null;
    backdrop.classList.add('is-hidden');
    backdrop.innerHTML = '';
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    close();
    window.removeEventListener('keydown', onKeyDown, true);
    if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
    if (styleEl.parentElement) styleEl.parentElement.removeChild(styleEl);
  };

  return {
    get isOpen() {
      return openState;
    },
    open,
    close,
    dispose,
  };
}
