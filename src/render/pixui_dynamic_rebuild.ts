// Helpers for tearing down and re-attaching pixui sub-trees outside the
// normal scene boot path. pixui has no public child-removal or destroy API,
// so these reach into _children / _initialized / _insert._container — the
// same pattern fixPixuiCanvasViewport uses on _root.
//
// Scenes use this to do partial UI rebuilds (e.g., updating a detail pane on
// a selection click) without paying for a full scene.restart() flicker.

// Walk a pixui sub-tree and destroy every underlying Phaser game object.
// Renderable components hold the object on `internal`; Interactive holds a
// hit-area Phaser Container on `_hitArea`. Containers track children in
// `_children`; we recurse and clear so the parent doesn't keep zombie refs.
export function destroyPixuiSubtree(component: unknown): void {
  const c = component as {
    internal?: { destroy?: () => void };
    _hitArea?: { destroy?: () => void };
    _children?: { component: unknown }[];
    _initialized?: boolean;
  };
  if (Array.isArray(c._children)) {
    for (const child of c._children) destroyPixuiSubtree(child.component);
    c._children = [];
  }
  c.internal?.destroy?.();
  c._hitArea?.destroy?.();
  c._initialized = false;
}

// Remove `child` from `parent`'s child list. StyledComponents (Frame /
// Dialog / Button / ...) hold inserted children in an inner container
// reachable as _insert._container, not on the StyledComponent itself.
// Try the inner container first, fall back to direct _children (covers
// plain Containers and the scene's _root, where _insert._container is
// _root itself).
export function detachPixuiChild(parent: unknown, child: unknown): void {
  const p = parent as {
    _insert?: { _container?: { _children?: { component: unknown }[] } };
    _children?: { component: unknown }[];
  };
  const remove = (children: { component: unknown }[] | undefined): boolean => {
    if (!Array.isArray(children)) return false;
    const idx = children.findIndex((c) => c.component === child);
    if (idx < 0) return false;
    children.splice(idx, 1);
    return true;
  };
  if (remove(p._insert?._container?._children)) return;
  remove(p._children);
}
