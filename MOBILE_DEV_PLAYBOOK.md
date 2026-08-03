# 📱 Android Local Development Playbook

If you ever undo your changes or clone this repository on a fresh machine, follow this exact checklist to prevent the Android app from hanging, crashing, or throwing CORS/Location errors when communicating with your local laptop.

---

## 1. The Indestructible ADB Tunnel (The "Processing Circle" Fix)
Android Studio and other tools will randomly kill the ADB background daemon, which silently destroys your USB port forwarding tunnel. 

**The Fix:** Do not run `adb reverse` just once. Open a **PowerShell** terminal and leave this exact command running in the background. It will automatically re-establish the tunnel every 2 seconds if it drops:

```powershell
powershell -Command "while (1) { & $env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe reverse tcp:5000 tcp:5000 2>&1 | Out-Null; Start-Sleep -Seconds 2 }"
```

---

## 2. The IPv6 Blackhole (The "Server Offline" Fix #1)
Android WebViews often resolve the word `localhost` to an IPv6 address (`::1`), but the ADB tunnel only works on IPv4 (`127.0.0.1`). 

**The Fix:**
1. In `frontend/src/config.js`, explicitly use `127.0.0.1`:
   ```javascript
   export const API_BASE_URL = window.Capacitor ? 'http://127.0.0.1:5000' : ...
   ```
2. In `backend/server.js`, force Node.js to listen on IPv4 by binding to `0.0.0.0`:
   ```javascript
   app.listen(PORT, '0.0.0.0', () => {
       console.log(`Server running on port ${PORT}`);
   });
   ```

---

## 3. The CORS Preflight Rejection (The "Server Offline" Fix #2)
When the Android phone makes a request, its origin is `http://localhost` or `capacitor://localhost`, which your backend will block if CORS is strictly set to `http://localhost:5173`.

**The Fix:**
In `backend/server.js`, update the CORS configuration to accept Capacitor origins:
```javascript
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true); // Allow any origin for Capacitor/Local Dev
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role']
}));
```

---

## 4. The Silent Geolocation Block (The Location Permission Fix)
Standard web `navigator.geolocation` gets silently blocked inside Android apps for privacy reasons, and the Android OS hides the permission completely if it isn't listed in the app's internal blueprint.

**The Fix:**
1. Install the native Capacitor plugins in the frontend:
   ```bash
   npm install @capacitor/geolocation capacitor-native-settings
   ```
2. Add the actual permissions to `frontend/android/app/src/main/AndroidManifest.xml` (right above `</manifest>`):
   ```xml
   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   <uses-feature android:name="android.hardware.location.gps" android:required="false" />
   ```
3. In `scan.jsx` and `dashboard.jsx`, use the native plugins with a **Timeout Fallback**. (If high-accuracy GPS fails indoors, you MUST fall back to coarse location or the app will throw an error).
   ```javascript
   import { Geolocation } from '@capacitor/geolocation';
   import { NativeSettings, AndroidSettings } from 'capacitor-native-settings';

   // Example robust request logic:
   let perm = await Geolocation.checkPermissions();
   if (perm.location !== 'granted') perm = await Geolocation.requestPermissions();
   
   if (perm.location !== 'granted') {
       if (window.confirm("Permission required. Open Settings?")) {
           NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDetails });
       }
       return;
   }

   let position;
   try {
       // Try High Accuracy (GPS Hardware)
       position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
   } catch (gpsErr) {
       // Fallback to Coarse (Network/WiFi) if indoors
       position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
   }
   ```
