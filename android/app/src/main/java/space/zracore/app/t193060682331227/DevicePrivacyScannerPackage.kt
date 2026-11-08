// Tujuan file: Menyediakan modul Android lokal untuk membaca izin privasi paket terpasang.
package space.zracore.app.t193060682331227

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ViewManager

class DevicePrivacyScannerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext) = listOf(DevicePrivacyScannerModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class DevicePrivacyScannerModule(private val appContext: ReactApplicationContext) : ReactContextBaseJavaModule(appContext) {
  override fun getName() = "ZraDevicePrivacyScanner"

  @ReactMethod
  fun scanPrivacy(promise: Promise) {
    Thread {
      try {
        val packageManager = appContext.packageManager
        val installedPackages = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          packageManager.getInstalledPackages(PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
        } else {
          @Suppress("DEPRECATION")
          packageManager.getInstalledPackages(PackageManager.GET_PERMISSIONS)
        }

        val appPermissionInventory = Arguments.createArray()
        installedPackages
          .asSequence()
          .filter { it.packageName != appContext.packageName }
          .mapNotNull { packageInfo -> packagePermissionInfo(packageManager, packageInfo) }
          .filter { it.hasSensitivePermission }
          .sortedWith(compareByDescending<PackagePermissionInfo> { it.microphoneGranted || it.cameraGranted }.thenBy { it.label.lowercase() })
          .forEach { inventory -> appPermissionInventory.pushMap(inventory.toWritableMap()) }

        val activeAccessibility = readEnabledServices(Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        val activeNotificationListeners = readEnabledServices("enabled_notification_listeners")
        val devicePolicyManager = appContext.getSystemService(DevicePolicyManager::class.java)
        val activeAdmins = Arguments.createArray()
        devicePolicyManager?.activeAdmins?.forEach { component ->
          activeAdmins.pushMap(serviceMap(packageManager, component))
        }

        val response = Arguments.createMap()
        response.putInt("installedPackageCount", installedPackages.size)
        response.putArray("appsWithSensitivePermissions", appPermissionInventory)
        response.putArray("activeAccessibilityServices", activeAccessibility)
        response.putArray("activeNotificationListeners", activeNotificationListeners)
        response.putArray("activeDeviceAdmins", activeAdmins)
        response.putString("platform", "android")
        promise.resolve(response)
      } catch (error: Exception) {
        promise.reject("DEVICE_PRIVACY_SCAN_FAILED", error.message ?: "Pemeriksaan privasi perangkat gagal.", error)
      }
    }.start()
  }

  private fun readEnabledServices(settingName: String): WritableArray {
    val result = Arguments.createArray()
    val configured = Settings.Secure.getString(appContext.contentResolver, settingName).orEmpty()
    configured.split(":")
      .filter { it.isNotBlank() }
      .mapNotNull { ComponentName.unflattenFromString(it) }
      .distinctBy { it.packageName }
      .forEach { result.pushMap(serviceMap(appContext.packageManager, it)) }
    return result
  }

  private fun serviceMap(packageManager: PackageManager, component: ComponentName): WritableMap {
    val result = Arguments.createMap()
    result.putString("packageName", component.packageName)
    result.putString("serviceName", component.className)
    result.putString("appName", appLabel(packageManager, component.packageName))
    return result
  }

  private fun packagePermissionInfo(packageManager: PackageManager, packageInfo: PackageInfo): PackagePermissionInfo? {
    val permissions = packageInfo.requestedPermissions ?: return null
    val flags = packageInfo.requestedPermissionsFlags ?: IntArray(permissions.size)
    val micIndex = permissions.indexOf(android.Manifest.permission.RECORD_AUDIO)
    val cameraIndex = permissions.indexOf(android.Manifest.permission.CAMERA)
    if (micIndex < 0 && cameraIndex < 0) return null

    val applicationInfo = packageInfo.applicationInfo
    val isSystemApp = applicationInfo != null && (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0
    val installer = try { getInstallerPackage(packageManager, packageInfo.packageName) } catch (_: Exception) { null }

    return PackagePermissionInfo(
      packageName = packageInfo.packageName,
      label = appLabel(packageManager, packageInfo.packageName),
      isSystemApp = isSystemApp,
      installerPackage = installer,
      microphoneRequested = micIndex >= 0,
      microphoneGranted = micIndex >= 0 && (flags.getOrElse(micIndex) { 0 } and PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0,
      cameraRequested = cameraIndex >= 0,
      cameraGranted = cameraIndex >= 0 && (flags.getOrElse(cameraIndex) { 0 } and PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0,
    )
  }

  @Suppress("DEPRECATION")
  private fun getInstallerPackage(packageManager: PackageManager, packageName: String): String? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) packageManager.getInstallSourceInfo(packageName).installingPackageName
    else packageManager.getInstallerPackageName(packageName)

  private fun appLabel(packageManager: PackageManager, packageName: String): String = try {
    val appInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      packageManager.getApplicationInfo(packageName, PackageManager.ApplicationInfoFlags.of(0))
    } else {
      @Suppress("DEPRECATION")
      packageManager.getApplicationInfo(packageName, 0)
    }
    packageManager.getApplicationLabel(appInfo).toString()
  } catch (_: Exception) {
    packageName
  }

  private data class PackagePermissionInfo(
    val packageName: String,
    val label: String,
    val isSystemApp: Boolean,
    val installerPackage: String?,
    val microphoneRequested: Boolean,
    val microphoneGranted: Boolean,
    val cameraRequested: Boolean,
    val cameraGranted: Boolean,
  ) {
    val hasSensitivePermission get() = microphoneRequested || cameraRequested

    fun toWritableMap(): WritableMap = Arguments.createMap().apply {
      putString("packageName", packageName)
      putString("appName", label)
      putBoolean("isSystemApp", isSystemApp)
      if (installerPackage == null) putNull("installerPackage") else putString("installerPackage", installerPackage)
      putBoolean("microphoneRequested", microphoneRequested)
      putBoolean("microphoneGranted", microphoneGranted)
      putBoolean("cameraRequested", cameraRequested)
      putBoolean("cameraGranted", cameraGranted)
    }
  }
}
