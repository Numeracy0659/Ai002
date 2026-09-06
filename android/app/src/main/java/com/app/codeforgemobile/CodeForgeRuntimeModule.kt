package com.app.codeforgemobile

import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.MessageDigest
import java.util.UUID

class CodeForgeRuntimeModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val preferences = reactContext.getSharedPreferences("codeforge.native.trust.v1", Context.MODE_PRIVATE)

  override fun getName(): String = "CodeForgeRuntime"

  @ReactMethod
  fun getHostState(promise: Promise) {
    try {
      val result = Arguments.createMap()
      result.putInt("apiLevel", Build.VERSION.SDK_INT)
      result.putString("abi", Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
      result.putBoolean("offline", isOffline())
      result.putBoolean("nativeEnforcementAvailable", true)
      val capabilities = Arguments.createArray()
      SAFE_CAPABILITIES.forEach { capability -> capabilities.pushString(capability) }
      result.putArray("capabilities", capabilities)
      result.putString("packageName", reactContext.packageName)
      result.putString("signerSha256", signerSha256())
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("HOST_STATE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun verifyArtifactSha256(base64Bytes: String, expectedSha256: String, promise: Promise) {
    try {
      val bytes = Base64.decode(base64Bytes, Base64.DEFAULT)
      val actual = sha256(bytes)
      val result = Arguments.createMap()
      result.putBoolean("verified", actual.equals(expectedSha256, ignoreCase = true))
      result.putString("actualSha256", actual)
      result.putString("verificationId", UUID.randomUUID().toString())
      promise.resolve(result)
    } catch (error: IllegalArgumentException) {
      promise.reject("ARTIFACT_ENCODING_INVALID", "Artifact bytes are not valid base64", error)
    } catch (error: Exception) {
      promise.reject("ARTIFACT_VERIFY_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun setProjectTrust(
    projectId: String,
    requestedState: String,
    artifactDigest: String?,
    nativeVerified: Boolean,
    promise: Promise,
  ) {
    if (projectId.isBlank()) {
      promise.reject("PROJECT_ID_INVALID", "Project identity is required")
      return
    }
    val state = when {
      requestedState == "verified" && nativeVerified && !artifactDigest.isNullOrBlank() -> "verified"
      requestedState == "revoked" -> "revoked"
      requestedState == "quarantined" -> "quarantined"
      else -> "unverified"
    }
    preferences.edit()
      .putString("trust.$projectId.state", state)
      .putString("trust.$projectId.digest", artifactDigest)
      .apply()
    val result = Arguments.createMap()
    result.putString("projectId", projectId)
    result.putString("trustState", state)
    result.putBoolean("nativeVerified", state == "verified")
    promise.resolve(result)
  }

  @ReactMethod
  fun getProjectTrust(projectId: String, promise: Promise) {
    val result = Arguments.createMap()
    result.putString("projectId", projectId)
    result.putString("trustState", preferences.getString("trust.$projectId.state", "unknown"))
    result.putString("artifactDigest", preferences.getString("trust.$projectId.digest", null))
    promise.resolve(result)
  }

  @ReactMethod
  fun evaluateCapability(projectId: String, capabilityId: String, promise: Promise) {
    val trustState = preferences.getString("trust.$projectId.state", "unknown")
    val result = Arguments.createMap()
    result.putString("capabilityId", capabilityId)
    result.putString("trustState", trustState)
    val granted = trustState == "verified" && SAFE_CAPABILITIES.contains(capabilityId)
    result.putString("decision", if (granted) "granted" else "denied")
    result.putBoolean("nativeEnforcementConfirmed", granted)
    if (!granted) result.putString("reason", "Project trust or native capability policy does not permit this capability")
    promise.resolve(result)
  }

  private fun isOffline(): Boolean {
    val manager = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      ?: return true
    val network = manager.activeNetwork ?: return true
    val capabilities = manager.getNetworkCapabilities(network) ?: return true
    return !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
  }

  private fun signerSha256(): String {
    val packageManager = reactContext.packageManager
    val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      packageManager.getPackageInfo(reactContext.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
    } else {
      @Suppress("DEPRECATION")
      packageManager.getPackageInfo(reactContext.packageName, PackageManager.GET_SIGNATURES)
    }
    val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      packageInfo.signingInfo?.apkContentsSigners?.toList().orEmpty()
    } else {
      @Suppress("DEPRECATION")
      packageInfo.signatures?.toList().orEmpty()
    }
    return signatures.firstOrNull()?.let { sha256(it.toByteArray()) } ?: ""
  }

  private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes)
    .joinToString(":") { byte -> "%02X".format(byte) }

  companion object {
    private val SAFE_CAPABILITIES = setOf("clock", "randomness", "diagnostics.log", "storage.read", "storage.write")
  }
}
