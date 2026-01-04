// src\schemas\events.js

/** @typedef {{items: HTMLElement[], names: string[]}} SelectionChangePayload */
/** @typedef {{name: string}} SelectionItemOpenPayload */
/** @typedef {{index: number}} LightboxOpenPayload */
/** @typedef {{count: number, to: string}} DndMovedPayload */
/** @typedef {{count: number, to: string}} DndUploadedPayload */

/**
 * Имена событий по проекту (используем, чтобы не плодить «магические строки»).
 */
export const EVENTS = Object.freeze({
  APP_READY: "app:ready",
  GALLERY_RENDERED: "gallery:rendered",
  SELECTION_CHANGE: "selection:change",
  SELECTION_ITEM_OPEN: "selection:itemOpen",
  PREVIEW_OPEN: "preview:open",
  PREVIEW_CLOSE: "preview:close",
  LIGHTBOX_OPEN: "lightbox:open",
  DND_MOVED: "dnd:moved",
  DND_UPLOADED: "dnd:uploaded",
});
