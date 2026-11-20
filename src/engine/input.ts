export interface PointerState {
  /** Normalized device coords [-1, 1] relative to target element */
  ndcX: number;
  ndcY: number;
  /** Client coordinates */
  x: number;
  y: number;
  /** Accumulated movement since last consumeDelta() */
  deltaX: number;
  deltaY: number;
  down: boolean;
  rightDown: boolean;
  wheelDelta: number;
}

export interface InputOptions {
  /** Element to bind pointer listeners to (defaults to window) */
  target?: HTMLElement | Window;
  /** Prevent default browser scrolling on Space / Arrow keys (default true) */
  preventScrollKeys?: boolean;
  /** Smoothing factor for analog axes in 1/s (default 12) */
  axisSmoothing?: number;
}

const SCROLL_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

export class InputController {
  private readonly target: HTMLElement | Window;
  private readonly preventScrollKeys: boolean;
  private readonly axisSmoothing: number;

  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly keysReleased = new Set<string>();

  private smoothForward = 0;
  private smoothTurn = 0;
  private smoothStrafe = 0;

  private readonly _pointer: PointerState = {
    ndcX: 0,
    ndcY: 0,
    x: 0,
    y: 0,
    deltaX: 0,
    deltaY: 0,
    down: false,
    rightDown: false,
    wheelDelta: 0,
  };

  private clickQueued = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private hasLastPointer = false;
  private disposed = false;

  constructor(options: InputOptions = {}) {
    this.target = options.target ?? window;
    this.preventScrollKeys = options.preventScrollKeys ?? true;
    this.axisSmoothing = options.axisSmoothing ?? 12;

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    this.target.addEventListener('pointerdown', this.onPointerDown as EventListener);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.target.addEventListener('wheel', this.onWheel as EventListener, { passive: true });
    this.target.addEventListener('contextmenu', this.onContextMenu as EventListener);
  }

  /** Call once per frame with `dt` to update smoothed movement axes */
  update(dt: number): void {
    const rawForward = this.rawForward();
    const rawTurn = this.rawTurn();
    const rawStrafe = this.rawStrafe();
    const alpha = 1 - Math.exp(-this.axisSmoothing * Math.min(dt, 0.1));

    this.smoothForward += (rawForward - this.smoothForward) * alpha;
    this.smoothTurn += (rawTurn - this.smoothTurn) * alpha;
    this.smoothStrafe += (rawStrafe - this.smoothStrafe) * alpha;

    if (Math.abs(this.smoothForward) < 0.002 && rawForward === 0) this.smoothForward = 0;
    if (Math.abs(this.smoothTurn) < 0.002 && rawTurn === 0) this.smoothTurn = 0;
    if (Math.abs(this.smoothStrafe) < 0.002 && rawStrafe === 0) this.smoothStrafe = 0;
  }

  /** Clear per-frame edge states (call at the END of your frame tick) */
  endFrame(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this._pointer.deltaX = 0;
    this._pointer.deltaY = 0;
    this._pointer.wheelDelta = 0;
    this.clickQueued = false;
  }

  /** Check by KeyboardEvent.code (e.g. 'KeyW', 'Space', 'ShiftLeft', 'ArrowUp') or friendly alias ('w', 'space', 'shift', 'e', 'r', 'esc') */
  isDown(key: string): boolean {
    const codes = resolveKeyCodes(key);
    for (const c of codes) {
      if (this.keysDown.has(c)) return true;
    }
    return false;
  }

  wasPressed(key: string): boolean {
    const codes = resolveKeyCodes(key);
    for (const c of codes) {
      if (this.keysPressed.has(c)) return true;
    }
    return false;
  }

  wasReleased(key: string): boolean {
    const codes = resolveKeyCodes(key);
    for (const c of codes) {
      if (this.keysReleased.has(c)) return true;
    }
    return false;
  }

  /** Raw forward input in [-1, 1]: +1 for W/ArrowUp, -1 for S/ArrowDown */
  rawForward(): number {
    const f = this.isDown('up') ? 1 : 0;
    const b = this.isDown('down') ? 1 : 0;
    return f - b;
  }

  /** Raw turn input in [-1, 1]: +1 for Left (A/ArrowLeft), -1 for Right (D/ArrowRight) (matches CCW yaw in Three.js) */
  rawTurn(): number {
    const l = this.isDown('left') ? 1 : 0;
    const r = this.isDown('right') ? 1 : 0;
    return l - r;
  }

  /** Raw strafe input in [-1, 1]: +1 for Right (D/ArrowRight), -1 for Left (A/ArrowLeft) */
  rawStrafe(): number {
    return -this.rawTurn();
  }

  /** Smooth forward axis [-1, 1] */
  get forward(): number {
    return this.smoothForward;
  }

  /** Smooth turn axis [-1, 1] (+1 left / CCW, -1 right / CW) */
  get turn(): number {
    return this.smoothTurn;
  }

  /** Smooth horizontal axis [-1, 1] (+1 right, -1 left) */
  get strafe(): number {
    return this.smoothStrafe;
  }

  get boost(): boolean {
    return this.isDown('shift');
  }

  get action(): boolean {
    return this.isDown('space');
  }

  get interact(): boolean {
    return this.isDown('e');
  }

  get pointer(): Readonly<PointerState> {
    return this._pointer;
  }

  consumeClick(): boolean {
    const c = this.clickQueued;
    this.clickQueued = false;
    return c;
  }

  consumePointerDelta(): { dx: number; dy: number } {
    const dx = this._pointer.deltaX;
    const dy = this._pointer.deltaY;
    this._pointer.deltaX = 0;
    this._pointer.deltaY = 0;
    return { dx, dy };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('pointerdown', this.onPointerDown as EventListener);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('wheel', this.onWheel as EventListener);
    this.target.removeEventListener('contextmenu', this.onContextMenu as EventListener);
    this.keysDown.clear();
    this.keysPressed.clear();
    this.keysReleased.clear();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Do not hijack typing if an input element is focused
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (this.preventScrollKeys && SCROLL_KEYS.has(e.code)) {
      e.preventDefault();
    }
    if (!this.keysDown.has(e.code)) {
      this.keysPressed.add(e.code);
    }
    this.keysDown.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.keysDown.has(e.code)) {
      this.keysDown.delete(e.code);
      this.keysReleased.add(e.code);
    }
  };

  private onBlur = (): void => {
    this.keysDown.clear();
    this._pointer.down = false;
    this._pointer.rightDown = false;
    this.hasLastPointer = false;
  };

  private updatePointerCoords(clientX: number, clientY: number): void {
    this._pointer.x = clientX;
    this._pointer.y = clientY;
    if (this.target instanceof HTMLElement) {
      const rect = this.target.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this._pointer.ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        this._pointer.ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      }
    } else {
      this._pointer.ndcX = (clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      this._pointer.ndcY = -(clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.updatePointerCoords(e.clientX, e.clientY);
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.hasLastPointer = true;
    if (e.button === 0) {
      this._pointer.down = true;
      this.clickQueued = true;
    } else if (e.button === 2) {
      this._pointer.rightDown = true;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.updatePointerCoords(e.clientX, e.clientY);
    if (this.hasLastPointer) {
      this._pointer.deltaX += e.clientX - this.lastPointerX;
      this._pointer.deltaY += e.clientY - this.lastPointerY;
    }
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.hasLastPointer = true;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) this._pointer.down = false;
    if (e.button === 2) this._pointer.rightDown = false;
  };

  private onWheel = (e: WheelEvent): void => {
    this._pointer.wheelDelta += e.deltaY;
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this._pointer.rightDown) {
      e.preventDefault();
    }
  };
}

function resolveKeyCodes(key: string): string[] {
  const lower = key.toLowerCase();
  switch (lower) {
    case 'up':
    case 'forward':
      return ['KeyW', 'ArrowUp'];
    case 'down':
    case 'backward':
      return ['KeyS', 'ArrowDown'];
    case 'left':
      return ['KeyA', 'ArrowLeft'];
    case 'right':
      return ['KeyD', 'ArrowRight'];
    case 'space':
    case 'jump':
      return ['Space'];
    case 'shift':
    case 'boost':
      return ['ShiftLeft', 'ShiftRight'];
    case 'esc':
    case 'escape':
      return ['Escape'];
    case 'enter':
      return ['Enter'];
    case 'e':
      return ['KeyE'];
    case 'r':
      return ['KeyR'];
    case 'q':
      return ['KeyQ'];
    case 'f':
      return ['KeyF'];
    case 'w':
      return ['KeyW'];
    case 'a':
      return ['KeyA'];
    case 's':
      return ['KeyS'];
    case 'd':
      return ['KeyD'];
    default:
      if (key.length === 1 && key >= 'a' && key <= 'z') {
        return [`Key${key.toUpperCase()}`];
      }
      if (key.length === 1 && key >= '0' && key <= '9') {
        return [`Digit${key}`];
      }
      return [key];
  }
}
