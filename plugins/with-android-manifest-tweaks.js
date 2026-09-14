/**
 * Re-applies the hand-maintained Android tweaks on every `expo prebuild`
 * (android/ is gitignored and regenerated):
 *
 * - res/xml/network_security_config.xml allowing cleartext HTTP, so release
 *   builds can reach an opencode server over plain HTTP on the LAN.
 * - android:usesCleartextTraffic + android:networkSecurityConfig on <application>.
 * - MainActivity screenOrientation=unspecified (landscape support).
 * - android:enableOnBackInvokedCallback=false on <application>.
 */
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

function withManifestAttributes(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (app) {
      app.$ = {
        ...app.$,
        'android:usesCleartextTraffic': 'true',
        'android:networkSecurityConfig': '@xml/network_security_config',
        'android:enableOnBackInvokedCallback': 'false',
      };
      const activity = (app.activity ?? []).find(
        (entry) => entry.$?.['android:name'] === '.MainActivity',
      );
      if (activity) {
        activity.$['android:screenOrientation'] = 'unspecified';
      }
    }
    return config;
  });
}

function withNetworkSecurityConfigFile(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'network_security_config.xml'), NETWORK_SECURITY_CONFIG);
      return config;
    },
  ]);
}

module.exports = function withAndroidManifestTweaks(config) {
  config = withManifestAttributes(config);
  config = withNetworkSecurityConfigFile(config);
  return config;
};
