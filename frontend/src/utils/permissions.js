import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { Dialog } from '@capacitor/dialog';
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';

/**
 * Checks and requests all necessary mobile app permissions.
 * If any permissions are permanently denied, prompts the user to open settings.
 */
export const checkAndRequestPermissions = async () => {
  // Only run on native mobile platforms (Android/iOS)
  if (!Capacitor.isNativePlatform()) return;

  const deniedPermissions = [];

  try {
    // 1. Check and Request Camera Permission
    let cameraStatus = await Camera.checkPermissions();
    if (cameraStatus.camera !== 'granted') {
      cameraStatus = await Camera.requestPermissions();
    }
    if (cameraStatus.camera === 'denied') {
      deniedPermissions.push('Camera');
    }

    // 2. Check and Request Geolocation Permission
    let locationStatus = await Geolocation.checkPermissions();
    if (locationStatus.location !== 'granted') {
      locationStatus = await Geolocation.requestPermissions();
    }
    if (locationStatus.location === 'denied') {
      deniedPermissions.push('Location');
    }

    // 3. Check and Request Push Notifications Permission
    let pushStatus = await PushNotifications.checkPermissions();
    if (pushStatus.receive !== 'granted') {
      pushStatus = await PushNotifications.requestPermissions();
    }
    if (pushStatus.receive === 'denied') {
      deniedPermissions.push('Notifications');
    }

    // 4. If any permissions were denied, show a dialog and offer to open settings
    if (deniedPermissions.length > 0) {
      const { value } = await Dialog.confirm({
        title: 'Permissions Required',
        message: `The app needs access to ${deniedPermissions.join(', ')} to function correctly (scanning, tracking attendance, alerts). Would you like to open Settings to enable them?`,
        okButtonTitle: 'Open Settings',
        cancelButtonTitle: 'Not Now'
      });

      if (value) {
        // User agreed to open settings
        await NativeSettings.open({
          optionAndroid: AndroidSettings.ApplicationDetails,
          optionIOS: IOSSettings.App
        });
      }
    }
  } catch (error) {
    console.error('Error during permission check:', error);
  }
};
