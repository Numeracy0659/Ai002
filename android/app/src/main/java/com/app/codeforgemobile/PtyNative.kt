package com.app.codeforgemobile

/** JNI boundary for the device-gated PTY backend. */
object PtyNative {
  private var loaded = false

  init {
    loaded = try {
      System.loadLibrary("codeforge_pty")
      true
    } catch (_: UnsatisfiedLinkError) {
      false
    }
  }

  fun isAvailable(): Boolean = loaded

  external fun create(cwd: String, rows: Int, columns: Int): Long
  external fun read(handle: Long, maxBytes: Int): ByteArray?
  external fun write(handle: Long, bytes: ByteArray): Int
  external fun resize(handle: Long, rows: Int, columns: Int): Boolean
  external fun signal(handle: Long, signal: Int): Boolean
  external fun waitForExit(handle: Long): Int
  external fun close(handle: Long)
}
