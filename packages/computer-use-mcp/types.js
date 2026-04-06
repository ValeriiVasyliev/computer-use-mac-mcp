// types subpath — re-exports from main index for consumers that use the /types path
export {
  DEFAULT_GRANT_FLAGS,
  getSentinelCategory,
  targetImageSize,
  API_RESIZE_PARAMS,
} from './index.js'

/**
 * @typedef {Object} ScreenshotDims
 * @property {number} width
 * @property {number} height
 * @property {number} displayWidth
 * @property {number} displayHeight
 * @property {number} displayId
 * @property {number} originX
 * @property {number} originY
 */
