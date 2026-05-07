import type { UiScene } from 'phaser-pixui';

/**
 * pixui's ResponsiveScene reads window.innerWidth/innerHeight to compute its
 * viewport — wrong for our embedded fixed-resolution game (canvas is always
 * 960×540; Phaser.Scale.FIT handles browser fitting).
 *
 * This helper:
 *
 * 1. Monkey-patches the private canvas-size accessors on the scene instance to
 *    return Phaser's logical canvas dimensions instead of window dimensions.
 *
 * 2. Re-runs _updateViewport() so _viewport / _zoom are correct immediately.
 *
 * 3. Re-runs _updateCamera() so the Phaser camera zoom and bounds match.
 *
 * 4. Resets _root's component tree for a clean rebuild — but ONLY on restart.
 *    On scene.restart() (or stop + re-launch), the scene instance is reused:
 *    UiScene._root is the same StyledComponent object from the original
 *    constructor, with _initialized=true and _children still holding all the
 *    defunct components from the previous run (their Phaser game objects were
 *    destroyed by Phaser's shutdown).  If we leave _root in that state:
 *      - _root.initialize() (called from the events.once('create') callback
 *        inside UiScene.create) is a no-op because _initialized is already true.
 *      - New components added in create() are pushed into _children but never
 *        initialized, so their Phaser game objects are never positioned on-screen.
 *    Clearing _children and resetting _initialized lets _root.initialize() do
 *    a proper first-time setup for the fresh component tree.
 *    On FIRST-OPEN we leave _root alone: _initialized is false and _children
 *    is [] — both already in the correct initial state from the constructor.
 *
 * 5. Re-runs _updateRoot() with the corrected viewport so _root._parent has the
 *    right anchor dimensions before any children are attached.
 *
 * Call from a UiScene's create() BEFORE super.create().
 * Works for both first open and every subsequent scene.restart().
 */
export function fixPixuiCanvasViewport(scene: UiScene): void {
  const internal = scene as unknown as {
    // ResponsiveScene privates
    _getCanvasWidth: () => number;
    _getCanvasHeight: () => number;
    _getDevicePixelRatio: () => number;
    _updateViewport: () => void;
    _updateCamera: () => void;
    // UiScene privates
    _root: {
      _initialized: boolean;
      _children: unknown[];
    };
    _updateRoot: () => void;
  };

  // Step 1 — patch canvas-size accessors
  internal._getCanvasWidth = () => scene.game.scale.width;
  internal._getCanvasHeight = () => scene.game.scale.height;
  internal._getDevicePixelRatio = () => 1;

  // Step 2 — recompute viewport with correct dimensions
  internal._updateViewport();

  // Step 3 — reset the Phaser camera to match
  // _updateCamera() requires this.cameras, which exists by the time create() runs.
  internal._updateCamera();

  // Step 4 — reset the pixui component tree so initialize() runs properly
  // on this create() pass (restart only).
  //
  // First-open: _initialized is false (set by Component constructor); the
  //   constructor's _children is already [] so wiping is harmless, but we
  //   guard anyway to be semantically correct and future-proof against any
  //   pixui version that adds constructor-time children.
  // Restart (scene.restart() or scene.stop() + re-launch): _initialized is
  //   true (set by the previous run's events.once('create') callback).
  //   _children holds zombie components whose Phaser game objects were
  //   destroyed by Phaser's shutdown. Clearing them lets create() build a
  //   clean tree and lets _root.initialize() do a proper first-time setup.
  if (internal._root._initialized) {
    internal._root._initialized = false;
    internal._root._children = [];
  }

  // Step 5 — set _root._parent to the corrected viewport before children attach
  internal._updateRoot();
}
