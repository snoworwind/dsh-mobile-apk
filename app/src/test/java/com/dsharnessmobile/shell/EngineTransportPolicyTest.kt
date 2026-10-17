package com.dsharnessmobile.shell

import java.net.HttpURLConnection
import java.net.URL
import org.junit.Assert.*
import org.junit.Test

class EngineTransportPolicyTest {
  @Test
  fun `cookie attachment refuses unowned transport before modifying connection`() {
    val connection = object : HttpURLConnection(URL(EngineAuth.BASE_URL)) {
      var touched = false
      override fun connect() { touched = true }
      override fun disconnect() { }
      override fun usingProxy() = false
      override fun setRequestProperty(key: String?, value: String?) { touched = true }
    }
    try { EngineAuth.attach(connection); fail("must reject unowned initial listener") }
    catch (_: SecurityException) { }
    assertFalse(connection.touched)
  }

  @Test
  fun `mux credentials refuse unknown ownership even before context initialization`() {
    try { EngineAuth.attachMux(); fail("must reject before retrieving credentials") }
    catch (_: SecurityException) { }
  }

  @Test
  fun `health probe cannot send requests to an unowned TCP listener`() {
    val probe = EngineProbe.check(100)
    assertFalse(probe.getBoolean("running"))
    assertFalse(probe.getBoolean("listening"))
    assertEquals("unknown", probe.getString("auth"))
    assertEquals("Engine transport ownership unavailable", probe.getString("error"))
  }
}
