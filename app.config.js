/**
 * APP_VARIANT=release produces the standalone build: a distinct package id
 * (installs alongside the dev-client build) and Play-style versioning.
 * Default (unset) is the dev-client configuration used for daily iteration.
 *
 * Release knobs (see .github/workflows/release-apk.yml):
 *   APP_VARIANT=release  APP_VERSION=1.2.3  APP_VERSION_CODE=42
 */
const APP_VARIANT = process.env.APP_VARIANT ?? 'dev';
const isRelease = APP_VARIANT === 'release';

module.exports = {
  expo: {
    name: isRelease ? 'opencode' : 'opencode-expo',
    slug: 'opencode-expo',
    version: process.env.APP_VERSION ?? '1.0.0',
    platforms: ['android'],
    orientation: 'default',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    android: {
      package: isRelease ? 'com.opencode.expo.release' : 'com.opencode.expo',
      versionCode: Number(process.env.APP_VERSION_CODE ?? 1),
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    experiments: {
      tsconfigPaths: true,
    },
    plugins: [
      [
        'expo-navigation-bar',
        {
          enforceContrast: false,
          style: 'auto',
        },
      ],
      './plugins/with-android-manifest-tweaks',
    ],
  },
};
