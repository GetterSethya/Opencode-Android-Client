# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Development workflow

Iterate on the **expo-dev-client build only**. Do not build or install the standalone
release APK locally — GitHub Actions builds and publishes it on `release-*` tags
(see `.github/workflows/release-apk.yml`).

- **Dev client**: package `com.opencode.expo`, runs JS served by Metro on port 8081.
  Start Metro, then forward the port and launch the app explicitly by package, because
  older release APKs also register an `exp+` scheme and the deep link is otherwise
  ambiguous:

  ```bash
  npx expo start --dev-client --port 8081
  adb reverse tcp:8081 tcp:8081
  adb shell am start -a android.intent.action.VIEW \
    -d "exp+opencode-expo://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" \
    -p com.opencode.expo
  ```

- **Release**: package `com.opencode.expo.release`, built only by CI. It bundles the JS
  runtime (no Metro needed) and installs side by side with the dev client.
- The opencode server default lives in `src/chat/settings.tsx`; both builds can also be
  repointed at runtime in Settings.
