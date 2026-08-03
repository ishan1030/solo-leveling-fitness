import type { ExpoConfig } from 'expo/config';

/**
 * MERIDIAN — working name. See docs/13-launch-assets.md for the five candidates.
 */
const config: ExpoConfig = {
  name: 'Meridian',
  slug: 'meridian',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'meridian',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0A0B0D',
  splash: {
    // §4: no splash carousel. This is a single frame that resolves straight into
    // CALIBRATION — it exists only to cover the JS bundle load.
    backgroundColor: '#0A0B0D',
    resizeMode: 'contain',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.meridian.client',
    infoPlist: {
      // §10 PRIVACY: location is requested only at check-in time, never in background.
      NSLocationWhenInUseUsageDescription:
        'Meridian uses your location once, at the moment you scan into a venue, to confirm you are physically there. It is never tracked in the background and never sold.',
      NSCameraUsageDescription:
        'Meridian uses the camera to scan venue check-in codes and operator invite codes.',
      NSPhotoLibraryAddUsageDescription:
        'Meridian saves your Rank Card to your photo library so you can share it.',
      NSMicrophoneUsageDescription:
        'Meridian can count your reps by voice during a live session. This is optional and off by default.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'app.meridian.client',
    adaptiveIcon: { backgroundColor: '#0A0B0D' },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'CAMERA',
      'VIBRATE',
      'RECORD_AUDIO',
    ],
    blockedPermissions: [
      // Explicitly refused: §10 forbids continuous tracking.
      'android.permission.ACCESS_BACKGROUND_LOCATION',
    ],
  },
  plugins: ['expo-location', 'expo-media-library', 'expo-av'],
  extra: {
    // §5: "Expose the curve as editable config, never hardcoded."
    // The runtime reads progression constants from src/engine/config.ts, which is
    // seeded from here so the values can be moved to remote config without a
    // code change.
    progressionConfigVersion: 1,
  },
};

export default config;
