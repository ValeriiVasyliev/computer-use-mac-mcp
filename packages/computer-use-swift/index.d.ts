export interface DisplayGeometry {
  width: number
  height: number
  scaleFactor: number
}

export interface ScreenshotResult {
  base64: string
  width: number
  height: number
}

export interface InstalledApp {
  bundleId: string
  displayName: string
  path: string
}

export interface RunningApp {
  bundleId: string
  displayName: string
}

export interface ComputerUseAPI {
  _drainMainRunLoop(): void
  hotkey?: {
    registerEscape(onEscape: () => void): boolean
    unregister(): void
    notifyExpectedEscape(): void
  }
  tcc: {
    checkAccessibility(): boolean
    checkScreenRecording(): boolean
  }
  display: {
    getSize(displayId?: number): DisplayGeometry
    listAll(): DisplayGeometry[]
  }
  screenshot: {
    captureExcluding(
      allowedBundleIds: string[],
      quality: number,
      targetW: number,
      targetH: number,
      displayId?: number,
    ): Promise<ScreenshotResult>
    captureRegion(
      allowedBundleIds: string[],
      x: number,
      y: number,
      w: number,
      h: number,
      outW: number,
      outH: number,
      quality: number,
      displayId?: number,
    ): Promise<ScreenshotResult>
  }
  apps: {
    prepareDisplay(
      allowlistBundleIds: string[],
      surrogateHost: string,
      displayId?: number,
    ): Promise<{ hidden: string[]; activated?: string }>
    previewHideSet(
      bundleIds: string[],
      displayId?: number,
    ): Array<{ bundleId: string; displayName: string }>
    findWindowDisplays(
      bundleIds: string[],
    ): Array<{ bundleId: string; displayIds: number[] }>
    appUnderPoint(
      x: number,
      y: number,
    ): { bundleId: string; displayName: string } | null
    listInstalled(): Promise<InstalledApp[]>
    listRunning(): Promise<RunningApp[]>
    iconDataUrl(path: string): string | null
    unhide(bundleIds: string[]): Promise<void>
    open(bundleId: string): Promise<void>
  }
  resolvePrepareCapture(
    allowedBundleIds: string[],
    surrogateHost: string,
    quality: number,
    targetW: number,
    targetH: number,
    preferredDisplayId?: number,
    autoResolve?: boolean,
    doHide?: boolean,
  ): Promise<unknown>
}

export declare function _drainMainRunLoop(): void
export declare const tcc: ComputerUseAPI['tcc']
export declare const display: ComputerUseAPI['display']
export declare const screenshot: ComputerUseAPI['screenshot']
export declare const apps: ComputerUseAPI['apps']
export declare function resolvePrepareCapture(
  allowedBundleIds: string[],
  surrogateHost: string,
  quality: number,
  targetW: number,
  targetH: number,
  preferredDisplayId?: number,
  autoResolve?: boolean,
  doHide?: boolean,
): Promise<unknown>
