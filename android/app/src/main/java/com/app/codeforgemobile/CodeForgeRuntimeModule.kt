package com.app.codeforgemobile

import android.content.Context
import android.content.ComponentName
import android.content.ServiceConnection
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
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

class CodeForgeRuntimeModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), TerminalService.Listener {
  private val preferences = reactContext.getSharedPreferences("codeforge.native.trust.v1", Context.MODE_PRIVATE)
  private val terminalSessions = ConcurrentHashMap<String, TerminalSession>()
  private val terminalExecutor = Executors.newCachedThreadPool()
  private var terminalService: TerminalService? = null
  private var terminalBound = false
  private var pendingStart: Promise? = null
  private val terminalConnection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, binder: android.os.IBinder?) {
      terminalService = (binder as? TerminalService.LocalBinder)?.service()
      terminalService?.addListener(this@CodeForgeRuntimeModule)
      terminalBound = true
      pendingStart?.let { promise ->
        pendingStart = null
        try {
          val started = terminalService!!.startSession()
          val result = Arguments.createMap()
          started.forEach { (key, value) -> if (value == "true" || value == "false") result.putBoolean(key, value.toBoolean()) else result.putString(key, value) }
          promise.resolve(result)
        } catch (error: Exception) {
          promise.reject("TERMINAL_START_FAILED", error.message, error)
        }
      }
    }

    override fun onServiceDisconnected(name: ComponentName?) {
      terminalService = null
      terminalBound = false
    }
  }

  override fun getName(): String = "CodeForgeRuntime"

  override fun onTerminalEvent(sessionId: String, kind: String, payload: String?) = emitTerminalEvent(sessionId, kind, payload)

  override fun invalidate() {
    terminalService?.removeListener(this)
    if (terminalBound) reactContext.unbindService(terminalConnection)
    terminalBound = false
    terminalService = null
    super.invalidate()
  }

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

  @ReactMethod
  fun startTerminal(promise: Promise) {
    pendingStart = promise
    try {
      TerminalService.start(reactContext)
      if (!terminalBound) {
        val intent = android.content.Intent(reactContext, TerminalService::class.java)
        if (!reactContext.bindService(intent, terminalConnection, Context.BIND_AUTO_CREATE)) {
          pendingStart = null
          promise.reject("TERMINAL_BIND_FAILED", "Could not bind to the terminal service")
        }
      } else {
        pendingStart = null
        val started = terminalService?.startSession() ?: error("The terminal service is unavailable")
        val result = Arguments.createMap()
        started.forEach { (key, value) -> if (value == "true" || value == "false") result.putBoolean(key, value.toBoolean()) else result.putString(key, value) }
        promise.resolve(result)
      }
    } catch (error: Exception) {
      pendingStart = null
      promise.reject("TERMINAL_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun writeTerminalInput(sessionId: String, input: String, promise: Promise) {
    try {
      terminalService?.writeInput(sessionId, input) ?: error("The terminal service is unavailable")
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("TERMINAL_WRITE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun interruptTerminal(sessionId: String, promise: Promise) {
    try {
      terminalService?.interrupt(sessionId) ?: error("The terminal service is unavailable")
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("TERMINAL_SIGNAL_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun terminateTerminal(sessionId: String, promise: Promise) {
    try {
      terminalService?.stopSession() ?: return promise.resolve(null)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("TERMINAL_STOP_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getTerminalState(sessionId: String, promise: Promise) {
    val result = Arguments.createMap()
    terminalService?.state(sessionId)?.forEach { (key, value) -> if (value == "true" || value == "false") result.putBoolean(key, value.toBoolean()) else result.putString(key, value) }
      ?: run {
        result.putString("sessionId", sessionId)
        result.putString("state", "lost")
        result.putBoolean("pty", false)
        result.putString("transport", "android-process-pipes")
      }
    promise.resolve(result)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

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

  private fun writeControlByte(sessionId: String, value: Int, promise: Promise) {
    val session = terminalSessions[sessionId]
    if (session == null || !session.process.isAlive) {
      promise.reject("TERMINAL_NOT_RUNNING", "The terminal session is not running")
      return
    }
    try {
      synchronized(session.process.outputStream) {
        session.process.outputStream.write(byteArrayOf(value.toByte()))
        session.process.outputStream.flush()
      }
      emitTerminalEvent(sessionId, "signal", "INT")
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("TERMINAL_SIGNAL_FAILED", error.message, error)
    }
  }

  private fun readTerminalOutput(session: TerminalSession) {
    val buffer = ByteArray(4096)
    try {
      session.process.inputStream.use { stream ->
        while (true) {
          val count = stream.read(buffer)
          if (count < 0) break
          val total = session.outputBytes.addAndGet(count.toLong())
          if (total > MAX_OUTPUT_BYTES) {
            session.state = TerminalContract.State.FAILED
            emitTerminalEvent(session.sessionId, "output-truncated", null)
            session.process.destroy()
            break
          }
          val chunk = Base64.encodeToString(buffer.copyOf(count), Base64.NO_WRAP)
          emitTerminalEvent(session.sessionId, "output", chunk)
        }
      }
    } catch (error: Exception) {
      session.state = TerminalContract.State.FAILED
      emitTerminalEvent(session.sessionId, "error", error.message ?: "Terminal output failed")
    }
  }

  private fun waitForTerminal(session: TerminalSession) {
    try {
      val exitCode = session.process.waitFor()
      session.state = TerminalContract.State.EXITED
      emitTerminalEvent(session.sessionId, "exit", exitCode.toString())
    } catch (error: InterruptedException) {
      Thread.currentThread().interrupt()
      session.state = TerminalContract.State.LOST
      emitTerminalEvent(session.sessionId, "error", "Terminal wait interrupted")
    } finally {
      terminalSessions.remove(session.sessionId)
    }
  }

  private fun emitTerminalEvent(sessionId: String, kind: String, payload: String?) {
    val event = Arguments.createMap()
    event.putString("sessionId", sessionId)
    event.putString("kind", kind)
    if (payload != null) event.putString("payload", payload)
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("CodeForgeTerminalEvent", event)
  }

  private data class TerminalSession(
    val sessionId: String,
    val process: Process,
    val workspace: java.io.File,
    val outputBytes: AtomicLong,
  ) {
    @Volatile var state: TerminalContract.State = TerminalContract.State.RUNNING
  }

  companion object {
    private val SAFE_CAPABILITIES = setOf("clock", "randomness", "diagnostics.log", "storage.read", "storage.write")
    private const val MAX_INPUT_BYTES = TerminalContract.MAX_INPUT_BYTES
    private const val MAX_OUTPUT_BYTES = TerminalContract.MAX_OUTPUT_BYTES
  }
}
