/**
 * Re-applies the hand-maintained Android tweaks on every `expo prebuild`
 * (android/ is gitignored and regenerated):
 *
 * - res/xml/network_security_config.xml allowing cleartext HTTP, so release
 *   builds can reach an opencode server over plain HTTP on the LAN.
 * - android:usesCleartextTraffic + android:networkSecurityConfig on <application>.
 * - MainActivity screenOrientation=unspecified (landscape support).
 * - android:enableOnBackInvokedCallback=false on <application>.
 * - reactNativeArchitectures=arm64-v8a,x86_64, dropping the two 32-bit ABIs from
 *   the template default. arm64 covers physical devices, x86_64 covers the
 *   Windows emulator; keeping it to these two halves the native compile work
 *   compared to the all-four default that was crashing CI. Release builds stay
 *   arm64-only via the -P flag on the Gradle command line (CLI wins over
 *   gradle.properties).
 * - Low-memory Gradle tuning (org.gradle.parallel=false, -Xmx1024m,
 *   org.gradle.workers.max=2): this dev machine has 4 cores / 11GiB RAM and
 *   was swapping hard (8GiB swap full) during the x86_64 C++ compile, which
 *   made ninja/clang crawl. Slower task scheduling, but no paging storm.
 */
const {
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
} = require('@expo/config-plugins');
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

function withAndroidArchitectures(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const existing = props.find((item) => item.key === 'reactNativeArchitectures');
    if (existing) {
      existing.value = 'arm64-v8a,x86_64';
    } else {
      props.push({
        type: 'property',
        key: 'reactNativeArchitectures',
        value: 'arm64-v8a,x86_64',
      });
    }
    return config;
  });
}

function upsertGradleProperty(props, key, value) {
  const existing = props.find((item) => item.key === key);
  if (existing) {
    existing.value = value;
  } else {
    props.push({ type: 'property', key, value });
  }
}

function withLowMemoryGradleSettings(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    upsertGradleProperty(props, 'org.gradle.jvmargs', '-Xmx1024m -XX:MaxMetaspaceSize=384m');
    upsertGradleProperty(props, 'org.gradle.parallel', 'false');
    upsertGradleProperty(props, 'org.gradle.workers.max', '2');
    return config;
  });
}

module.exports = function withAndroidManifestTweaks(config) {
  config = withManifestAttributes(config);
  config = withNetworkSecurityConfigFile(config);
  config = withAndroidArchitectures(config);
  config = withLowMemoryGradleSettings(config);
  return config;
};
