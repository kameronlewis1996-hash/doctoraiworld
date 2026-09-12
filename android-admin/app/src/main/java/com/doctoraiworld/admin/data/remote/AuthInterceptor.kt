package com.doctoraiworld.admin.data.remote

import com.doctoraiworld.admin.data.local.SecureTokenStore
import okhttp3.Interceptor
import okhttp3.Response

/** Attaches the admin session token (if any) to every outgoing request. */
class AuthInterceptor(private val tokenStore: SecureTokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = tokenStore.token
        val request = if (token.isNullOrBlank()) {
            original
        } else {
            original.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        }
        return chain.proceed(request)
    }
}
