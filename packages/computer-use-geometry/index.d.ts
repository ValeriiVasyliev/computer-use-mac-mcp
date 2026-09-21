export interface PointRect {
  x: number
  y: number
  w: number
  h: number
}

export interface DisplayRecord {
  /** 0-based index; 0 is the primary (menu-bar) display. */
  index: number
  /** CGDirectDisplayID, or null if unavailable. */
  cgDisplayId: number | null
  /** Retina backing scale factor (1 on non-Retina, 2 on most Retina panels). */
  scaleFactor: number
  /** Display rect in global points, top-left origin (CG space). */
  points: PointRect
  /** Native pixel dimensions = points × scaleFactor. */
  pixels: { w: number; h: number }
}

export interface ScreenshotSize {
  width: number
  height: number
}

export declare const MAX_SCREENSHOT_W: number
export declare const MAX_SCREENSHOT_H: number

export declare function fitWithin(
  w: number, h: number, maxW?: number, maxH?: number,
): [number, number]

export declare function refreshDisplays(): DisplayRecord[]
export declare function getDisplays(): DisplayRecord[]
export declare function getDisplay(displayId?: number): DisplayRecord
export declare function displayContainingPoint(px: number, py: number): DisplayRecord | null
export declare function screenshotSize(display: DisplayRecord): ScreenshotSize

export declare function screenshotToPoints(
  x: number, y: number, shot: ScreenshotSize, display: DisplayRecord,
): { x: number; y: number }

export declare function pointsToScreenshot(
  px: number, py: number, shot: ScreenshotSize, display: DisplayRecord,
): { x: number; y: number }

export declare function zoomRegionPoints(
  x: number, y: number, shot: ScreenshotSize, display: DisplayRecord, boxShotPx: number,
): PointRect
