import './styles/main.css';
import { ProceduralAudioEngine } from './engine/audio';
import { loadFigurineTemplate } from './engine/character';
import { GameHud } from './engine/hud';
import type { GameContext, GameId, GameInstance, GameMeta, HudState, NotifyTone } from './engine/types';
import {
  GAME_CATALOG,
  getBestScore,
  getGameMeta,
  isGameAvailable,
  loadGameModule,
  saveBestScore,
} from './games/registry';
import { HubView } from './hub/HubView';

class AtelierApp {
  private readonly appRoot: HTMLElement;
  private readonly audio = new ProceduralAudioEngine();

  private activeHub: HubView | null = null;
  private activeGameId: GameId | null = null;
  private activeGame: GameInstance | null = null;
  private activeHud: GameHud | null = null;
  private activeGameStage: HTMLDivElement | null = null;
  private activeRestartHandler: (() => void) | null = null;
  private paused = false;
  private hasResultOverlay = false;
  private transitionSeq = 0;

  constructor(appRoot: HTMLElement) {
    this.appRoot = appRoot;
    this.appRoot.className = 'app-stage';

    // Warm the figurine GLB cache immediately on boot
    loadFigurineTemplate().catch((err) => {
      console.error('[AtelierApp] Failed to preload figurine GLB:', err);
    });

    window.addEventListener('hashchange', this.onHashChange);
    window.addEventListener('keydown', this.onGlobalKeyDown);

    const initialId = parseGameIdFromHash();
    if (initialId && isGameAvailable(initialId)) {
      void this.launchGame(initialId, false);
    } else {
      void this.showHub(false);
    }
  }

  private onHashChange = (): void => {
    const hashId = parseGameIdFromHash();
    if (hashId) {
      if (hashId !== this.activeGameId) {
        void this.launchGame(hashId, false);
      }
    } else if (this.activeGameId !== null || !this.activeHub) {
      void this.showHub(false);
    }
  };

  private onGlobalKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (this.activeGameId) {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.audio.playClick();
        this.exitToHub();
      } else if (e.code === 'KeyP' && !this.hasResultOverlay) {
        e.preventDefault();
        this.audio.playClick();
        this.togglePause();
      }
      return;
    }

    // Hub number shortcuts: 1..9 -> games 1..9, 0 -> game 10
    if (this.activeHub && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.code.startsWith('Digit')) {
        const digit = Number(e.code.slice(5));
        const idx = digit === 0 ? 9 : digit - 1;
        const meta = GAME_CATALOG[idx];
        if (meta) {
          e.preventDefault();
          this.activeHub.selectGame(meta.id);
          if (isGameAvailable(meta.id)) {
            this.audio.playClick();
            void this.launchGame(meta.id, true);
          } else {
            this.activeHub.showToast(`${meta.title} is currently being crafted in the Atelier.`);
          }
        }
      }
    }
  };

  private async showHub(updateHash: boolean): Promise<void> {
    const seq = ++this.transitionSeq;
    this.teardownGame();

    if (updateHash && window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    if (this.activeHub) {
      this.activeHub.refreshScores();
      return;
    }

    const hub = new HubView(this.appRoot, this.audio, {
      onLaunchGame: (id) => {
        void this.launchGame(id, true);
      },
    });
    this.activeHub = hub;
    await hub.init();

    // If another navigation happened while initializing the hub, clean up cleanly
    if (seq !== this.transitionSeq && this.activeHub === hub) {
      hub.dispose();
      this.activeHub = null;
    }
  }

  private async launchGame(id: GameId, updateHash: boolean): Promise<void> {
    const meta = getGameMeta(id);
    if (!meta) {
      void this.showHub(true);
      return;
    }

    if (!isGameAvailable(id)) {
      if (!this.activeHub) {
        await this.showHub(true);
      }
      this.activeHub?.showToast(`${meta.title} is not yet installed.`);
      return;
    }

    const seq = ++this.transitionSeq;
    this.teardownHub();
    this.teardownGame();

    if (updateHash) {
      const targetHash = `#game=${id}`;
      if (window.location.hash !== targetHash) {
        history.pushState(null, '', targetHash);
      }
    }

    const stage = document.createElement('div');
    stage.className = 'canvas-layer';
    this.appRoot.appendChild(stage);
    this.activeGameStage = stage;
    this.activeGameId = id;
    this.paused = false;
    this.hasResultOverlay = false;

    const curtain = createLoadingCurtain(meta);
    stage.appendChild(curtain);

    try {
      const [mod] = await Promise.all([loadGameModule(id), loadFigurineTemplate()]);
      if (seq !== this.transitionSeq) return;
      if (!mod) {
        curtain.remove();
        void this.showHub(true);
        return;
      }

      const activeMeta = mod.meta ?? meta;
      const hud = new GameHud(stage, activeMeta, this.audio, {
        onExitToHub: () => this.exitToHub(),
        onTogglePause: () => this.togglePause(),
        onRestart: () => this.restartCurrentGame(),
      });
      this.activeHud = hud;

      const gameCanvasWrap = document.createElement('div');
      gameCanvasWrap.className = 'canvas-layer';
      stage.insertBefore(gameCanvasWrap, hud ? stage.firstChild : null);

      const ctx: GameContext = {
        container: gameCanvasWrap,
        audio: this.audio,
        saveBestScore: (score: number) => saveBestScore(id, score),
        getBestScore: () => getBestScore(id),
        exitToHub: () => this.exitToHub(),
        setHud: (hudState: HudState) => {
          if (hudState.paused !== undefined) this.paused = hudState.paused;
          if (hudState.result !== undefined) this.hasResultOverlay = Boolean(hudState.result);
          hud.update(hudState);
        },
        notify: (text: string, tone?: NotifyTone, durationMs?: number) => {
          hud.notify(text, tone, durationMs);
        },
        setRestartHandler: (handler) => {
          this.activeRestartHandler = handler;
        },
      };

      const instance = await mod.mount(ctx);
      if (seq !== this.transitionSeq) {
        instance.dispose();
        return;
      }
      this.activeGame = instance;
      curtain.remove();
    } catch (err) {
      console.error(`[AtelierApp] Failed to launch "${id}":`, err);
      curtain.remove();
      if (seq === this.transitionSeq) {
        void this.showHub(true);
        this.activeHub?.showToast(`Could not load ${meta.title}.`);
      }
    }
  }

  private togglePause(): void {
    if (!this.activeGame || this.hasResultOverlay) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.audio.stopMotor();
    }
    this.activeGame.setPaused?.(this.paused);
    this.activeHud?.update({ paused: this.paused });
  }

  private restartCurrentGame(): void {
    if (!this.activeGameId) return;
    if (this.activeRestartHandler) {
      this.paused = false;
      this.hasResultOverlay = false;
      this.activeHud?.update({ paused: false, result: null });
      this.activeGame?.setPaused?.(false);
      this.activeRestartHandler();
    } else {
      void this.launchGame(this.activeGameId, false);
    }
  }

  private exitToHub(): void {
    void this.showHub(true);
  }

  private teardownGame(): void {
    this.audio.stopMotor();
    this.audio.setAmbient('none');
    this.activeRestartHandler = null;
    this.paused = false;
    this.hasResultOverlay = false;

    if (this.activeGame) {
      try {
        this.activeGame.dispose();
      } catch (err) {
        console.error('[AtelierApp] Error disposing game:', err);
      }
      this.activeGame = null;
    }
    if (this.activeHud) {
      this.activeHud.dispose();
      this.activeHud = null;
    }
    if (this.activeGameStage) {
      this.activeGameStage.remove();
      this.activeGameStage = null;
    }
    this.activeGameId = null;
  }

  private teardownHub(): void {
    if (this.activeHub) {
      this.activeHub.dispose();
      this.activeHub = null;
    }
  }
}

function parseGameIdFromHash(): GameId | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const match = hash.match(/^game=([a-z0-9-]+)$/i);
  if (!match) return null;
  const candidate = match[1].toLowerCase();
  const found = getGameMeta(candidate);
  return found ? found.id : null;
}

function createLoadingCurtain(meta: GameMeta): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'loading-curtain';
  el.innerHTML = `
    <div class="loading-card">
      <div class="hud-modal-kicker" style="color:${meta.accentColor}">
        Exhibition ${String(meta.number).padStart(2, '0')}
      </div>
      <h3>${meta.title}</h3>
      <p>Preparing diorama &amp; figurine…</p>
    </div>
  `;
  return el;
}

const appRoot = document.getElementById('app');
if (appRoot) {
  new AtelierApp(appRoot);
}
