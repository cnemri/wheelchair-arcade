import type { AudioEngine, GameMeta, HudState, NotifyTone } from './types';

export interface HudCallbacks {
  onExitToHub: () => void;
  onTogglePause: () => void;
  onRestart: () => void;
}

export class GameHud {
  private readonly root: HTMLDivElement;
  private readonly statusPill: HTMLDivElement;
  private readonly statsWrap: HTMLDivElement;
  private readonly metersWrap: HTMLDivElement;
  private readonly promptEl: HTMLDivElement;
  private readonly toastStack: HTMLDivElement;
  private readonly controlsBody: HTMLDivElement;
  private readonly controlsToggle: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly pauseOverlay: HTMLDivElement;
  private readonly resultOverlay: HTMLDivElement;

  private readonly meta: GameMeta;
  private readonly audio: AudioEngine;
  private readonly callbacks: HudCallbacks;

  private controlsOpen = true;
  private currentResultRestart: (() => void) | null = null;
  private disposed = false;

  constructor(parent: HTMLElement, meta: GameMeta, audio: AudioEngine, callbacks: HudCallbacks) {
    this.meta = meta;
    this.audio = audio;
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.className = 'game-hud';
    this.root.style.setProperty('--game-accent', meta.accentColor);

    // Top bar
    const topBar = document.createElement('header');
    topBar.className = 'hud-top';

    // Top-left: Hub button + Title badge
    const leftGroup = document.createElement('div');
    leftGroup.className = 'hud-top-left';

    const hubBtn = document.createElement('button');
    hubBtn.type = 'button';
    hubBtn.className = 'hud-pill-btn';
    hubBtn.innerHTML = `<span class="hud-btn-icon">←</span><span>Gallery</span><kbd>ESC</kbd>`;
    hubBtn.addEventListener('click', () => {
      this.audio.playClick();
      this.callbacks.onExitToHub();
    });

    const titleCard = document.createElement('div');
    titleCard.className = 'hud-title-card';
    titleCard.innerHTML = `
      <span class="hud-game-num">${String(meta.number).padStart(2, '0')}</span>
      <div class="hud-title-text">
        <span class="hud-game-title">${escapeHtml(meta.title)}</span>
        <span class="hud-game-sub">${escapeHtml(meta.genre)}</span>
      </div>
    `;

    leftGroup.append(hubBtn, titleCard);

    // Top-center: status pill
    this.statusPill = document.createElement('div');
    this.statusPill.className = 'hud-status-pill is-hidden';

    // Top-right: stats, meters, mute & pause icon buttons
    const rightGroup = document.createElement('div');
    rightGroup.className = 'hud-top-right';

    this.statsWrap = document.createElement('div');
    this.statsWrap.className = 'hud-stats-row';

    this.metersWrap = document.createElement('div');
    this.metersWrap.className = 'hud-meters-col';

    const utilityRow = document.createElement('div');
    utilityRow.className = 'hud-utility-row';

    this.muteBtn = document.createElement('button');
    this.muteBtn.type = 'button';
    this.muteBtn.className = 'hud-icon-btn';
    this.muteBtn.title = 'Toggle sound';
    this.updateMuteIcon();
    this.muteBtn.addEventListener('click', () => {
      this.audio.toggleMute();
      this.updateMuteIcon();
    });

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'hud-icon-btn';
    pauseBtn.title = 'Pause (P)';
    pauseBtn.innerHTML = '❚❚';
    pauseBtn.addEventListener('click', () => {
      this.audio.playClick();
      this.callbacks.onTogglePause();
    });

    utilityRow.append(this.muteBtn, pauseBtn);

    const rightStack = document.createElement('div');
    rightStack.className = 'hud-right-stack';
    const rightTopRow = document.createElement('div');
    rightTopRow.className = 'hud-right-top-row';
    rightTopRow.append(this.statsWrap, utilityRow);
    rightStack.append(rightTopRow, this.metersWrap);
    rightGroup.append(rightStack);

    topBar.append(leftGroup, this.statusPill, rightGroup);

    // Toast stack (upper-center)
    this.toastStack = document.createElement('div');
    this.toastStack.className = 'hud-toast-stack';

    // Bottom-center prompt
    this.promptEl = document.createElement('div');
    this.promptEl.className = 'hud-prompt is-hidden';

    // Bottom-left collapsible controls legend
    const controlsCard = document.createElement('aside');
    controlsCard.className = 'hud-controls-card';

    const controlsHeader = document.createElement('div');
    controlsHeader.className = 'hud-controls-header';

    this.controlsToggle = document.createElement('button');
    this.controlsToggle.type = 'button';
    this.controlsToggle.className = 'hud-controls-toggle';
    this.controlsToggle.textContent = 'Controls −';
    this.controlsToggle.addEventListener('click', () => {
      this.controlsOpen = !this.controlsOpen;
      this.controlsBody.classList.toggle('is-collapsed', !this.controlsOpen);
      this.controlsToggle.textContent = this.controlsOpen ? 'Controls −' : 'Controls +';
    });
    controlsHeader.append(this.controlsToggle);

    this.controlsBody = document.createElement('div');
    this.controlsBody.className = 'hud-controls-body';
    this.controlsBody.innerHTML = meta.controls
      .map(
        (c) =>
          `<div class="hud-control-row"><kbd>${escapeHtml(c.keys)}</kbd><span>${escapeHtml(c.action)}</span></div>`
      )
      .join('');

    controlsCard.append(controlsHeader, this.controlsBody);

    // Pause Overlay
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'hud-modal-backdrop is-hidden';
    this.pauseOverlay.innerHTML = `
      <div class="hud-modal">
        <div class="hud-modal-kicker">Paused · Game ${String(meta.number).padStart(2, '0')}</div>
        <h2 class="hud-modal-title">${escapeHtml(meta.title)}</h2>
        <p class="hud-modal-desc">${escapeHtml(meta.objective)}</p>
        <div class="hud-modal-actions">
          <button type="button" class="btn-primary" data-action="resume">Resume</button>
          <button type="button" class="btn-secondary" data-action="restart">Restart</button>
          <button type="button" class="btn-ghost" data-action="hub">Return to Gallery</button>
        </div>
      </div>
    `;
    this.pauseOverlay.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null;
      if (!btn) return;
      this.audio.playClick();
      const action = btn.dataset.action;
      if (action === 'resume') this.callbacks.onTogglePause();
      else if (action === 'restart') this.callbacks.onRestart();
      else if (action === 'hub') this.callbacks.onExitToHub();
    });

    // Result / Victory Overlay
    this.resultOverlay = document.createElement('div');
    this.resultOverlay.className = 'hud-modal-backdrop is-hidden';
    this.resultOverlay.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null;
      if (!btn) return;
      this.audio.playClick();
      const action = btn.dataset.action;
      if (action === 'restart') {
        if (this.currentResultRestart) {
          this.currentResultRestart();
        } else {
          this.callbacks.onRestart();
        }
      } else if (action === 'hub') {
        this.callbacks.onExitToHub();
      }
    });

    this.root.append(
      topBar,
      this.toastStack,
      this.promptEl,
      controlsCard,
      this.pauseOverlay,
      this.resultOverlay
    );
    parent.appendChild(this.root);
  }

  update(state: HudState): void {
    if (this.disposed) return;

    if (state.statusText !== undefined) {
      if (state.statusText) {
        this.statusPill.textContent = state.statusText;
        this.statusPill.classList.remove('is-hidden');
      } else {
        this.statusPill.classList.add('is-hidden');
      }
    }

    if (state.stats !== undefined) {
      this.statsWrap.innerHTML = state.stats
        .map(
          (s) => `
          <div class="hud-stat${s.accent ? ' is-accent' : ''}">
            <span class="hud-stat-label">${escapeHtml(s.label)}</span>
            <span class="hud-stat-value">${escapeHtml(String(s.value))}</span>
          </div>`
        )
        .join('');
    }

    if (state.meters !== undefined) {
      this.metersWrap.innerHTML = state.meters
        .map((m) => {
          const pct = Math.max(0, Math.min(100, ((m.max ? m.value / m.max : m.value) || 0) * 100));
          const colorStyle = m.color ? `background:${escapeHtml(m.color)}` : '';
          return `
            <div class="hud-meter">
              <span class="hud-meter-label">${escapeHtml(m.label)}</span>
              <div class="hud-meter-track">
                <div class="hud-meter-fill" style="width:${pct.toFixed(1)}%;${colorStyle}"></div>
              </div>
            </div>`;
        })
        .join('');
    }

    if (state.promptText !== undefined) {
      if (state.promptText) {
        this.promptEl.textContent = state.promptText;
        this.promptEl.classList.remove('is-hidden');
      } else {
        this.promptEl.classList.add('is-hidden');
      }
    }

    if (state.paused !== undefined) {
      this.pauseOverlay.classList.toggle('is-hidden', !state.paused);
    }

    if (state.result !== undefined) {
      if (state.result) {
        const r = state.result;
        this.currentResultRestart = r.onRestart ?? null;
        const statsHtml = (r.stats ?? [])
          .map(
            (s) => `
            <div class="hud-result-stat">
              <span>${escapeHtml(s.label)}</span>
              <strong>${escapeHtml(String(s.value))}</strong>
            </div>`
          )
          .join('');
        this.resultOverlay.innerHTML = `
          <div class="hud-modal hud-modal-result">
            <div class="hud-modal-kicker">
              ${r.victory ? 'Atelier Milestone' : 'Run Complete'} · ${escapeHtml(this.meta.title)}
            </div>
            <h2 class="hud-modal-title">${escapeHtml(r.title)}</h2>
            ${r.subtitle ? `<p class="hud-modal-desc">${escapeHtml(r.subtitle)}</p>` : ''}
            <div class="hud-result-score-box">
              <span class="hud-result-score-label">${escapeHtml(r.scoreLabel ?? 'Final Score')}</span>
              <span class="hud-result-score-value">${escapeHtml(String(Math.round(r.score)))}</span>
              ${r.isNewBest ? `<span class="hud-new-best">New Personal Best</span>` : ''}
            </div>
            ${statsHtml ? `<div class="hud-result-stats">${statsHtml}</div>` : ''}
            <div class="hud-modal-actions">
              <button type="button" class="btn-primary" data-action="restart">Play Again</button>
              <button type="button" class="btn-ghost" data-action="hub">Return to Gallery</button>
            </div>
          </div>
        `;
        this.resultOverlay.classList.remove('is-hidden');
      } else {
        this.currentResultRestart = null;
        this.resultOverlay.classList.add('is-hidden');
      }
    }
  }

  notify(text: string, tone: NotifyTone = 'info', durationMs = 2400): void {
    if (this.disposed) return;
    const toast = document.createElement('div');
    toast.className = `hud-toast hud-toast-${tone}`;
    toast.textContent = text;
    this.toastStack.appendChild(toast);

    // Keep max 3 stacked toasts
    while (this.toastStack.children.length > 3) {
      this.toastStack.firstElementChild?.remove();
    }

    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 260);
    }, durationMs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.remove();
  }

  private updateMuteIcon(): void {
    this.muteBtn.innerHTML = this.audio.muted ? '✕♪' : '♪';
    this.muteBtn.classList.toggle('is-muted', this.audio.muted);
  }
}

function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
