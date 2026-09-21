export interface ScreenshotDims {
  width: number
  height: number
  displayWidth: number
  displayHeight: number
  displayId: number
  originX: number
  originY: number
}

export interface CuGrantFlags {
  clipboardRead: boolean
  clipboardWrite: boolean
  systemKeyCombos: boolean
}

export interface CuAllowedApp {
  bundleId: string
  displayName: string
}

export interface CuPermissionRequest {
  apps: CuAllowedApp[]
  flags?: Partial<CuGrantFlags>
}

export interface CuPermissionResponse {
  granted: CuAllowedApp[]
  denied: CuAllowedApp[]
  flags: CuGrantFlags
}

export type CuContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string }

export interface CuCallToolResult {
  content: CuContentBlock[]
  telemetry?: { error_kind?: string }
}

export interface ComputerUseSessionContext {
  getAllowedApps(): CuAllowedApp[]
  /** Operator allowlist from CU_ALLOWED_APPS, or null when unrestricted. */
  getAllowedAppsPolicy?(): string[] | null
  /** Whether protected (sentinel) apps are refused. */
  getSentinelBlocking?(): boolean
  getGrantFlags(): CuGrantFlags
  getUserDeniedBundleIds(): string[]
  getSelectedDisplayId(): number | undefined
  getDisplayPinnedByModel(): boolean
  getDisplayResolvedForApps(): string | undefined
  getLastScreenshotDims(): ScreenshotDims | undefined
  onPermissionRequest(req: CuPermissionRequest, signal: unknown): Promise<CuPermissionResponse>
  onAllowedAppsChanged(apps: CuAllowedApp[], flags: CuGrantFlags): void
  onAppsHidden(ids: string[]): void
  onResolvedDisplayUpdated(id: number | undefined): void
  onDisplayPinned(id: number | undefined): void
  onDisplayResolvedForApps(key: string): void
  onScreenshotCaptured(dims: ScreenshotDims): void
  checkCuLock(): Promise<{ holder: string | undefined; isSelf: boolean }>
  acquireCuLock(): Promise<void>
  formatLockHeldMessage(holder: string): string
}

export type CoordinateMode = 'pixels' | 'normalized'

export interface CuSubGates {
  pixelValidation: boolean
  clipboardPasteMultiline: boolean
  mouseAnimation: boolean
  hideBeforeAction: boolean
  autoTargetDisplay: boolean
  clipboardGuard: boolean
}

export declare const DEFAULT_GRANT_FLAGS: CuGrantFlags
export declare const API_RESIZE_PARAMS: Record<string, unknown>
export declare function getSentinelCategory(bundleId: string): string | null
export declare function sentinelBlockingEnabled(env?: NodeJS.ProcessEnv): boolean
export declare function readAllowedAppsPolicy(env?: NodeJS.ProcessEnv): string[] | null
export declare function targetImageSize(physW: number, physH: number, params: unknown): [number, number]
export declare function buildComputerUseTools(
  capabilities: unknown,
  mode: CoordinateMode,
  installedAppNames?: string[],
): Array<{ name: string; description: string; inputSchema: unknown }>
export declare function createComputerUseMcpServer(
  adapter: unknown,
  coordinateMode: CoordinateMode,
): {
  setRequestHandler(schema: unknown, handler: (...args: unknown[]) => unknown): void
  connect(transport: unknown): Promise<void>
}
export declare function bindSessionContext(
  adapter: unknown,
  coordinateMode: CoordinateMode,
  ctx: ComputerUseSessionContext,
): (toolName: string, args: unknown) => Promise<CuCallToolResult>

export declare function createSubprocessCtx(
  env?: NodeJS.ProcessEnv,
): ComputerUseSessionContext
