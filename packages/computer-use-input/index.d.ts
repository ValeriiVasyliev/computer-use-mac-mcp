export declare const isSupported: true

export interface ComputerUseInputAPI {
  readonly isSupported: true
  /** (x, y) in GLOBAL POINTS, top-left origin — not screenshot pixels. */
  moveMouse(x: number, y: number, interpolated: boolean): Promise<void>
  mouseButton(
    button: 'left' | 'right' | 'middle',
    action: 'click' | 'press' | 'release',
    count?: number,
  ): Promise<void>
  mouseScroll(amount: number, axis: 'vertical' | 'horizontal'): Promise<void>
  /** Cursor position in GLOBAL POINTS, top-left origin. */
  mouseLocation(): Promise<{ x: number; y: number }>
  key(name: string, action: 'press' | 'release'): Promise<void>
  keys(parts: string[]): Promise<void>
  typeText(text: string): Promise<void>
  getFrontmostAppInfo(): { bundleId: string; appName: string } | null
}

export interface ComputerUseInputUnsupported {
  readonly isSupported: false
}

export type ComputerUseInput = ComputerUseInputUnsupported | ComputerUseInputAPI

/** (x, y) in GLOBAL POINTS, top-left origin — not screenshot pixels. */
export declare function moveMouse(x: number, y: number, interpolated: boolean): Promise<void>
export declare function mouseButton(
  button: 'left' | 'right' | 'middle',
  action: 'click' | 'press' | 'release',
  count?: number,
): Promise<void>
export declare function mouseScroll(
  amount: number,
  axis: 'vertical' | 'horizontal',
): Promise<void>
/** Cursor position in GLOBAL POINTS, top-left origin. */
export declare function mouseLocation(): Promise<{ x: number; y: number }>
export declare function key(name: string, action: 'press' | 'release'): Promise<void>
export declare function keys(parts: string[]): Promise<void>
export declare function typeText(text: string): Promise<void>
export declare function getFrontmostAppInfo(): { bundleId: string; appName: string } | null
