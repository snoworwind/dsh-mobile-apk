package com.dsharnessmobile.shell

import java.net.HttpURLConnection
import java.net.URL
import org.junit.Assert.*
import org.junit.Test

class EngineTransportPolicyTest {
  @Test
  fun `relay admission requires exact secret in a header or cookie field`() {
    val token = "test-secret"
    assertFalse(EngineTransport.admissionAuthorized("GET / HTTP/1.1\r\nHost: 127.0.0.1", token))
    assertFalse(EngineTransport.admissionAuthorized("GET /?x-dsh-relay=$token HTTP/1.1\r\nX-Other: $token", token))
    assertFalse(EngineTransport.admissionAuthorized("GET / HTTP/1.1\r\nCookie: dsh-relay=$token-extra", token))
    assertTrue(EngineTransport.admissionAuthorized("GET / HTTP/1.1\r\nX-DSH-Relay: $token", token))
    assertTrue(EngineTransport.admissionAuthorized("GET / HTTP/1.1\r\nCookie: a=b; dsh-relay=$token", token))
  }
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
