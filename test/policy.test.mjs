/**
 * Policy tests: the gates that decide whether an input event is allowed to
 * reach an app at all. These run without touching the real display — the
 * executor and session context are stubs.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bindSessionContext,
  buildComputerUseTools,
  createSubprocessCtx,
  getSentinelCategory,
  readAllowedAppsPolicy,
  sentinelBlockingEnabled,
} from '../packages/computer-use-mcp/index.js'
import { isValidBundleId } from '../packages/computer-use-swift/index.js'

// ── Sentinel classification ────────────────────────────────────────────────

test('sentinel categories cover password managers, keychain and 2FA', () => {
  assert.equal(getSentinelCategory('com.1password.1password'), 'password-manager')
  assert.equal(getSentinelCategory('com.bitwarden.desktop'), 'password-manager')
  assert.equal(getSentinelCategory('com.apple.keychainaccess'), 'system-credentials')
  assert.equal(getSentinelCategory('com.authy.authy'), 'authenticator')
})

test('sentinel matching covers helper bundles and ignores case', () => {
  assert.equal(getSentinelCategory('com.1password.1password-launcher'), 'password-manager')
  assert.equal(getSentinelCategory('COM.1PASSWORD.1Password'), 'password-manager')
})

test('ordinary apps are not sentinels', () => {
  assert.equal(getSentinelCategory('com.apple.Safari'), null)
  assert.equal(getSentinelCategory('com.googlecode.iterm2'), null)
  assert.equal(getSentinelCategory(''), null)
  assert.equal(getSentinelCategory(undefined), null)
})

test('sentinel blocking is on by default and opt-out only', () => {
  assert.equal(sentinelBlockingEnabled({}), true)
  assert.equal(sentinelBlockingEnabled({ CU_ALLOW_SENTINEL_APPS: '0' }), true)
  assert.equal(sentinelBlockingEnabled({ CU_ALLOW_SENTINEL_APPS: '1' }), false)
})

// ── Operator allowlist parsing ─────────────────────────────────────────────

test('an unset or blank allowlist means unrestricted, not empty', () => {
  assert.equal(readAllowedAppsPolicy({}), null)
  assert.equal(readAllowedAppsPolicy({ CU_ALLOWED_APPS: '   ' }), null)
})

test('allowlist is split, trimmed and emptied of blanks', () => {
  assert.deepEqual(
    readAllowedAppsPolicy({ CU_ALLOWED_APPS: ' com.apple.Safari , ,com.apple.Notes ' }),
    ['com.apple.Safari', 'com.apple.Notes'],
  )
})

// ── Bundle ID validation (command-argument safety) ─────────────────────────

test('bundle ID validation rejects injection and flag lookalikes', () => {
  assert.equal(isValidBundleId('com.apple.Safari'), true)
  assert.equal(isValidBundleId('com.foo.bar-baz'), true)
  assert.equal(isValidBundleId('com.apple.Safari" to activate\ntell app "Terminal'), false)
  assert.equal(isValidBundleId('-e'), false)
  assert.equal(isValidBundleId('foo bar'), false)
  assert.equal(isValidBundleId('foo;rm -rf /'), false)
  assert.equal(isValidBundleId(''), false)
  assert.equal(isValidBundleId(null), false)
})

// ── Dispatch gating ────────────────────────────────────────────────────────

function harness({ frontmost, env = {}, granted = [] }) {
  const calls = []
  const executor = {
    capabilities: { os: 'darwin' },
    getFrontmostApp: async () => frontmost,
    click: async (...a) => { calls.push(['click', ...a]) },
    type: async (...a) => { calls.push(['type', ...a]) },
    moveMouse: async (...a) => { calls.push(['moveMouse', ...a]) },
    screenshot: async () => { calls.push(['screenshot']); return { base64: 'x', width: 10, height: 10 } },
    getCursorPosition: async () => ({ x: 0, y: 0 }),
  }
  const ctx = createSubprocessCtx(env)
  if (granted.length) {
    ctx.onAllowedAppsChanged(granted.map(bundleId => ({ bundleId })), {})
  }
  const adapter = {
    executor,
    isDisabled: () => false,
    getSubGates: () => ({ clipboardPasteMultiline: true }),
  }
  return { dispatch: bindSessionContext(adapter, 'pixels', ctx), calls, ctx }
}

test('acting on a password manager is refused', async () => {
  const { dispatch, calls } = harness({
    frontmost: { bundleId: 'com.1password.1password', displayName: '1Password' },
  })
  const res = await dispatch('left_click', { x: 1, y: 1 })
  assert.equal(res.telemetry.error_kind, 'sentinel_app')
  assert.match(res.content[0].text, /protected application \(password-manager\)/)
  assert.deepEqual(calls, [], 'no input reached the executor')
})

test('capturing a password manager is refused too', async () => {
  const { dispatch, calls } = harness({
    frontmost: { bundleId: 'com.1password.1password', displayName: '1Password' },
  })
  const res = await dispatch('screenshot', {})
  assert.equal(res.telemetry.error_kind, 'sentinel_app')
  assert.deepEqual(calls, [])
})

test('the sentinel override lets it through', async () => {
  const { dispatch, calls } = harness({
    frontmost: { bundleId: 'com.1password.1password' },
    env: { CU_ALLOW_SENTINEL_APPS: '1' },
  })
  const res = await dispatch('left_click', { x: 1, y: 1 })
  assert.equal(res.telemetry.error_kind, undefined)
  assert.equal(calls[0][0], 'click')
})

test('ordinary apps act normally with no policy set', async () => {
  const { dispatch, calls } = harness({ frontmost: { bundleId: 'com.apple.Safari' } })
  const res = await dispatch('left_click', { x: 1, y: 1 })
  assert.equal(res.telemetry.error_kind, undefined)
  assert.equal(calls[0][0], 'click')
})

test('with CU_ALLOWED_APPS set, a non-granted frontmost app is refused', async () => {
  const { dispatch, calls } = harness({
    frontmost: { bundleId: 'com.apple.Terminal', displayName: 'Terminal' },
    env: { CU_ALLOWED_APPS: 'com.apple.Safari' },
    granted: ['com.apple.Safari'],
  })
  const res = await dispatch('type', { text: 'rm -rf /' })
  assert.equal(res.telemetry.error_kind, 'app_not_granted')
  assert.deepEqual(calls, [], 'the keystrokes never reached Terminal')
})

test('with CU_ALLOWED_APPS set, the granted app still works', async () => {
  const { dispatch, calls } = harness({
    frontmost: { bundleId: 'com.apple.Safari' },
    env: { CU_ALLOWED_APPS: 'com.apple.Safari' },
    granted: ['com.apple.Safari'],
  })
  const res = await dispatch('left_click', { x: 1, y: 1 })
  assert.equal(res.telemetry.error_kind, undefined)
  assert.equal(calls[0][0], 'click')
})

test('request_access cannot grant an app outside CU_ALLOWED_APPS', async () => {
  const { dispatch, ctx } = harness({
    frontmost: { bundleId: 'com.apple.Safari' },
    env: { CU_ALLOWED_APPS: 'com.apple.Safari' },
  })
  const res = await dispatch('request_access', {
    apps: [{ bundleId: 'com.apple.Terminal', displayName: 'Terminal' }],
  })
  assert.match(res.content[0].text, /Denied by the operator/)
  assert.deepEqual(ctx.getAllowedApps(), [])
})

test('unidentifiable frontmost app fails closed only under a policy', async () => {
  const open = harness({ frontmost: null })
  assert.equal((await open.dispatch('left_click', { x: 1, y: 1 })).telemetry.error_kind, undefined)

  const strict = harness({ frontmost: null, env: { CU_ALLOWED_APPS: 'com.apple.Safari' } })
  const res = await strict.dispatch('left_click', { x: 1, y: 1 })
  assert.equal(res.telemetry.error_kind, 'frontmost_unknown')
})

test('non-acting tools are never gated', async () => {
  const { dispatch } = harness({
    frontmost: { bundleId: 'com.1password.1password' },
    env: { CU_ALLOWED_APPS: 'com.apple.Safari' },
  })
  assert.equal((await dispatch('cursor_position', {})).telemetry.error_kind, undefined)
  assert.equal((await dispatch('switch_display', { display: 0 })).telemetry.error_kind, undefined)
})

// ── Tool description honesty ───────────────────────────────────────────────

test('request_access does not claim a human approves the request', () => {
  const tools = buildComputerUseTools({ os: 'darwin' }, 'pixels')
  const desc = tools.find(t => t.name === 'request_access').description
  assert.doesNotMatch(desc, /user will approve/i)
  assert.match(desc, /no human is prompted/i)
})
