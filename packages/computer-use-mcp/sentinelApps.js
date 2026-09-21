// sentinelApps subpath — apps that should never be controlled by computer-use.
//
// Synthetic clicks and keystrokes are indistinguishable from a real person's to
// the app receiving them, and a screenshot of an unlocked vault is a plaintext
// dump of its contents. These are the apps where that matters most: password
// managers, the system keychain, and authenticator apps.
//
// Matching is by bundle-ID prefix, so "com.1password.1password" also covers
// "com.1password.1password-launcher" and friends.

/** @type {Array<{prefix: string, category: string}>} */
export const sentinelAppRules = [
  // Password managers
  { prefix: 'com.1password', category: 'password-manager' },
  { prefix: 'com.agilebits', category: 'password-manager' },
  { prefix: 'com.bitwarden', category: 'password-manager' },
  { prefix: 'com.lastpass', category: 'password-manager' },
  { prefix: 'com.dashlane', category: 'password-manager' },
  { prefix: 'org.keepassxc', category: 'password-manager' },
  { prefix: 'com.kyleduo.keepassium', category: 'password-manager' },
  { prefix: 'in.sinew.Enpass', category: 'password-manager' },
  { prefix: 'com.nordpass', category: 'password-manager' },
  { prefix: 'com.proton.pass', category: 'password-manager' },
  { prefix: 'me.proton.pass', category: 'password-manager' },
  { prefix: 'com.apple.Passwords', category: 'password-manager' },

  // System credential and security surfaces
  { prefix: 'com.apple.keychainaccess', category: 'system-credentials' },
  { prefix: 'com.apple.SecurityAgent', category: 'system-credentials' },
  { prefix: 'com.apple.PasswordBreachAgent', category: 'system-credentials' },

  // Two-factor / authenticator apps
  { prefix: 'com.authy', category: 'authenticator' },
  { prefix: 'com.google.Authenticator', category: 'authenticator' },
  { prefix: 'com.matthewmcgarvey.Authenticator', category: 'authenticator' },
  { prefix: 'com.yubico', category: 'authenticator' },
]

/** Flat list of prefixes, kept for consumers of the original export. */
export const sentinelApps = sentinelAppRules.map(r => r.prefix)
