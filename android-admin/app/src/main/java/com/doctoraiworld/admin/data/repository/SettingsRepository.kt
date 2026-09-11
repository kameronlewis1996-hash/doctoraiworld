package com.doctoraiworld.admin.data.repository

import com.doctoraiworld.admin.data.remote.ApiService
import com.doctoraiworld.admin.util.ApiResult
import com.doctoraiworld.admin.util.safeApiCall

class SettingsRepository(private val apiService: () -> ApiService) {
    suspend fun get(): ApiResult<Map<String, String>> {
        val result = safeApiCall { apiService().getSettings() }
        return when (result) {
            is ApiResult.Success -> ApiResult.Success(result.data.settings)
            is ApiResult.Failure -> result
        }
    }

    suspend fun update(settings: Map<String, String>): ApiResult<Map<String, String>> {
        val result = safeApiCall { apiService().updateSettings(settings) }
        return when (result) {
            is ApiResult.Success -> ApiResult.Success(result.data.settings)
            is ApiResult.Failure -> result
        }
    }
}
