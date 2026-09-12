package com.doctoraiworld.admin.data.repository

import com.doctoraiworld.admin.data.local.SecureTokenStore
import com.doctoraiworld.admin.data.model.LoginRequest
import com.doctoraiworld.admin.data.model.LoginResponse
import com.doctoraiworld.admin.data.remote.ApiService
import com.doctoraiworld.admin.util.ApiResult
import com.doctoraiworld.admin.util.safeApiCall

class AuthRepository(
    private val apiService: () -> ApiService,
    private val tokenStore: SecureTokenStore
) {
    val isLoggedIn: Boolean get() = tokenStore.isLoggedIn
    val currentAdminEmail: String? get() = tokenStore.adminEmail

    suspend fun login(baseUrl: String, email: String, password: String): ApiResult<LoginResponse> {
        tokenStore.baseUrl = baseUrl.trim()
        val result = safeApiCall { apiService().login(LoginRequest(email.trim(), password)) }
        if (result is ApiResult.Success) {
            tokenStore.token = result.data.token
            tokenStore.adminEmail = result.data.admin.email
        }
        return result
    }

    fun logout() {
        tokenStore.clearSession()
    }
}
