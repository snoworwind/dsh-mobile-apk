package com.dsharnessmobile.shell

import android.content.Context
import android.net.LocalSocket
import android.net.LocalSocketAddress
import android.os.Process
import java.io.File
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.util.concurrent.Semaphore

/** Owns the public port for the entire shell process; forwards only to a private, UID-checked socket. */
object EngineTransport {
  @Volatile private var listener: ServerSocket? = null
  @Volatile private var endpoint: File? = null
  private val slots = Semaphore(32)

  @Synchronized fun initialize(context: Context) {
    if (listener != null) return
    val server = ServerSocket()
    try {
      // Linux still forbids a second listener; allow rebinding after the previous shell's TIME_WAIT.
      server.reuseAddress = true
      server.bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 3080), 32)
      endpoint = File(context.filesDir, "engine-private.sock")
      listener = server
      Thread({ accept(server) }, "engine-private-relay").apply { isDaemon = true }.start()
    } catch (e: Exception) {
      server.close()
      throw IOException("Engine port is not owned by this shell", e)
    }
  }

  /** Never release this binding on engine restart: a freed port could receive persisted browser cookies. */
  fun requireOwnedPort() {
    val server = listener
    if (server == null || server.isClosed || !server.isBound) {
      throw SecurityException("Engine transport ownership unavailable")
    }
  }

  fun ownsPort(): Boolean = listener?.let { it.isBound && !it.isClosed } == true

  private fun backend(): LocalSocket {
    requireOwnedPort()
    val socket = LocalSocket()
    try {
      socket.connect(LocalSocketAddress(endpoint!!.absolutePath, LocalSocketAddress.Namespace.FILESYSTEM))
      // SO_PEERCRED belongs to this established connection, not a preflight port observation.
      if (socket.peerCredentials.uid != Process.myUid()) throw SecurityException("Foreign engine socket")
      socket.soTimeout = 60_000
      return socket
    } catch (e: Exception) {
      socket.close()
      throw e
    }
  }

  fun backendReachable(): Boolean = try { backend().use { true } } catch (_: Exception) { false }

  /** The packaged preload changes only the engine's HTTP bind; unrelated servers keep their normal ports. */
  fun preparePreload(context: Context): File {
    initialize(context)
    val socket = endpoint ?: throw IOException("Missing engine socket")
    if (socket.exists() && !socket.delete()) throw IOException("Could not remove stopped engine socket")
    val preload = File(context.filesDir, "engine-private-transport.cjs")
    context.assets.open("engine-private-transport.cjs").use { input ->
      preload.outputStream().use { input.copyTo(it) }
    }
    return preload
  }

  private fun accept(server: ServerSocket) {
    while (!server.isClosed) {
      val client = try { server.accept() } catch (_: IOException) { return }
      if (!slots.tryAcquire()) { client.close(); continue }
      Thread({
        try {
          client.use { tcp ->
            tcp.soTimeout = 60_000
            backend().use { unix ->
              val activity = java.util.concurrent.atomic.AtomicLong(android.os.SystemClock.elapsedRealtime())
              val upload = Thread({
                try { copyActive(tcp.getInputStream(), unix.outputStream, activity) }
                catch (_: Exception) { }
                finally { runCatching { unix.shutdownOutput() } }
              }, "engine-private-upload").apply { isDaemon = true; start() }
              try { copyActive(unix.inputStream, tcp.getOutputStream(), activity) }
              finally { tcp.close(); unix.close(); upload.join(1_000) }
            }
          }
        } catch (_: Exception) { runCatching { client.close() } }
        finally { slots.release() }
      }, "engine-private-stream").apply { isDaemon = true; start() }
    }
  }

  /** A streaming response also keeps its upload half alive, even when the browser sends no more data. */
  private fun copyActive(
    input: java.io.InputStream,
    output: java.io.OutputStream,
    activity: java.util.concurrent.atomic.AtomicLong,
  ) {
    val buffer = ByteArray(8192)
    while (true) {
      val count = try { input.read(buffer) } catch (e: java.io.InterruptedIOException) {
        if (android.os.SystemClock.elapsedRealtime() - activity.get() >= 60_000) throw e
        continue
      }
      if (count < 0) return
      activity.set(android.os.SystemClock.elapsedRealtime())
      output.write(buffer, 0, count)
    }
  }
}
