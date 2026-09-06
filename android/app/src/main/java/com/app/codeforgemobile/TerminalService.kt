package com.app.codeforgemobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Base64
import androidx.core.app.NotificationCompat
import java.io.File
import java.util.UUID
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/** Owns one user-visible local terminal session independently of the Activity lifecycle. */
class TerminalService : Service() {
  interface Listener { fun onTerminalEvent(sessionId: String, kind: String, payload: String?) }
  private val binder = LocalBinder()
  private val listeners = CopyOnWriteArraySet<Listener>()
  private var session: Session? = null

  inner class LocalBinder : Binder() { fun service(): TerminalService = this@TerminalService }

  override fun onCreate() { super.onCreate(); createNotificationChannel() }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIFICATION_ID, buildNotification())
    if (intent?.action == ACTION_STOP) stopSession("service-stopped")
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder = binder
  fun addListener(listener: Listener) { listeners += listener }
  fun removeListener(listener: Listener) { listeners -= listener }

  @Synchronized
  fun startSession(): Map<String, String> {
    session?.let { if (it.isAlive()) return it.metadata() }
    val id = UUID.randomUUID().toString()
    val workspace = File(filesDir, "codeforge/v1/terminal/$id")
    check(workspace.mkdirs() || workspace.isDirectory) { "Could not create the app-private terminal workspace" }
    val ptyHandle = if (PtyNative.isAvailable()) PtyNative.create(workspace.absolutePath, 24, 80) else 0L
    val process = if (ptyHandle == 0L) createPipeProcess(workspace) else null
    val next = Session(id, workspace, process, ptyHandle)
    session = next
    emit(id, "started", null)
    Thread { readOutput(next) }.start()
    Thread { waitForExit(next) }.start()
    return next.metadata()
  }

  private fun createPipeProcess(workspace: File): Process = ProcessBuilder("/system/bin/sh")
    .directory(workspace)
    .redirectErrorStream(true)
    .apply {
      environment().clear()
      environment()["HOME"] = workspace.absolutePath
      environment()["PATH"] = "/system/bin:/system/xbin"
      environment()["TERM"] = "xterm-256color"
      environment()["LANG"] = "C.UTF-8"
    }
    .start()

  @Synchronized
  fun writeInput(sessionId: String, input: String) {
    val current = requireSession(sessionId)
    require(current.isAlive()) { "The terminal session is not running" }
    require(input.toByteArray(Charsets.UTF_8).size <= TerminalContract.MAX_INPUT_BYTES) { "Terminal input exceeds the session limit" }
    if (current.isPty()) PtyNative.write(current.ptyHandle, input.toByteArray(Charsets.UTF_8))
    else synchronized(current.process!!.outputStream) { current.process.outputStream.write(input.toByteArray(Charsets.UTF_8)); current.process.outputStream.flush() }
  }

  @Synchronized
  fun interrupt(sessionId: String) {
    val current = requireSession(sessionId)
    require(current.isAlive()) { "The terminal session is not running" }
    if (current.isPty()) PtyNative.signal(current.ptyHandle, 2)
    else synchronized(current.process!!.outputStream) { current.process.outputStream.write(byteArrayOf(0x03)); current.process.outputStream.flush() }
    emit(sessionId, "signal", "INT")
  }

  @Synchronized
  fun stopSession(reason: String = "user-stopped") {
    val current = session ?: return
    if (current.isPty()) PtyNative.signal(current.ptyHandle, 15)
    else { current.process!!.destroy(); if (!current.process.waitFor(750, TimeUnit.MILLISECONDS)) current.process.destroyForcibly() }
    emit(current.id, "stopping", reason)
  }

  fun state(sessionId: String): Map<String, String> = session?.takeIf { it.id == sessionId }?.let { current ->
    current.metadata() + ("state" to if (current.isAlive()) "running" else "exited")
  } ?: mapOf("sessionId" to sessionId, "state" to "lost", "pty" to "false", "transport" to "unavailable")

  private fun requireSession(sessionId: String): Session = session?.takeIf { it.id == sessionId } ?: error("Unknown terminal session")

  private fun readOutput(current: Session) {
    try {
      if (current.isPty()) {
        while (current.isAlive()) {
          val bytes = PtyNative.read(current.ptyHandle, 4096) ?: break
          if (bytes.isEmpty()) { Thread.sleep(10); continue }
          if (current.outputBytes.addAndGet(bytes.size.toLong()) > TerminalContract.MAX_OUTPUT_BYTES) {
            PtyNative.signal(current.ptyHandle, 9); emit(current.id, "output-truncated", null); return
          }
          emit(current.id, "output", Base64.encodeToString(bytes, Base64.NO_WRAP))
        }
      } else current.process!!.inputStream.use { stream ->
        val buffer = ByteArray(4096)
        while (true) {
          val count = stream.read(buffer)
          if (count < 0) break
          if (current.outputBytes.addAndGet(count.toLong()) > TerminalContract.MAX_OUTPUT_BYTES) { current.process.destroy(); emit(current.id, "output-truncated", null); return }
          emit(current.id, "output", Base64.encodeToString(buffer.copyOf(count), Base64.NO_WRAP))
        }
      }
    } catch (error: Exception) { emit(current.id, "error", error.message ?: "Terminal output failed") }
  }

  private fun waitForExit(current: Session) {
    try {
      val code = if (current.isPty()) PtyNative.waitForExit(current.ptyHandle) else current.process!!.waitFor()
      emit(current.id, "exit", code.toString())
    } catch (error: InterruptedException) { Thread.currentThread().interrupt(); emit(current.id, "error", "Terminal wait interrupted") }
    finally { if (current.isPty()) PtyNative.close(current.ptyHandle); synchronized(this) { if (session?.id == current.id) session = null } }
  }

  private fun emit(sessionId: String, kind: String, payload: String?) { listeners.forEach { it.onTerminalEvent(sessionId, kind, payload) } }
  private fun createNotificationChannel() { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL_ID, "CodeForge terminal", NotificationManager.IMPORTANCE_LOW)) }
  private fun buildNotification(): Notification {
    val stop = PendingIntent.getService(this, 2, Intent(this, TerminalService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(R.mipmap.ic_launcher).setContentTitle("CodeForge terminal").setContentText("App-private Android shell session").setContentIntent(open).setOngoing(true).addAction(NotificationCompat.Action(0, "Stop", stop)).build()
  }
  override fun onDestroy() { stopSession("service-destroyed"); super.onDestroy() }

  private data class Session(val id: String, val workspace: File, val process: Process?, val ptyHandle: Long, val outputBytes: AtomicLong = AtomicLong(0)) {
    fun isPty() = ptyHandle != 0L
    fun isAlive() = if (isPty()) true else process?.isAlive == true
    fun metadata() = mapOf("sessionId" to id, "state" to "running", "cwd" to workspace.absolutePath, "pty" to isPty().toString(), "transport" to if (isPty()) "native-pty" else "android-process-pipes")
  }

  companion object {
    const val ACTION_STOP = "com.app.codeforgemobile.action.STOP_TERMINAL"
    private const val CHANNEL_ID = "codeforge-terminal"
    private const val NOTIFICATION_ID = 4201
    fun start(context: Context) { val intent = Intent(context, TerminalService::class.java); if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent) }
  }
}
