/**
 * Version info baked in at bundle time.
 *
 * `EXPO_PUBLIC_*` values are inlined by Metro when the bundle is built, so the
 * release workflow sets these from the git tag and an installed release
 * reports the version it was actually built from. Expo Go / dev-client builds
 * fall back to a dev marker rather than lying about being a release.
 */
export const APP_VERSION = process.env.EXPO_PUBLIC_APP_VERSION ?? 'dev';
export const APP_VERSION_CODE = process.env.EXPO_PUBLIC_APP_VERSION_CODE ?? '';

/** e.g. "1.0.2 (build 3)" or just "dev". */
export function appVersionLabel(): string {
  if (!APP_VERSION_CODE) {
    return APP_VERSION;
  }
  return `${APP_VERSION} (build ${APP_VERSION_CODE})`;
}
