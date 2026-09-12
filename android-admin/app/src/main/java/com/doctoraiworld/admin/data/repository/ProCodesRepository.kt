package com.doctoraiworld.admin.data.repository

import com.doctoraiworld.admin.data.model.CreateProCodeRequest
import com.doctoraiworld.admin.data.model.ProCode
import com.doctoraiworld.admin.data.model.UpdateProCodeRequest
import com.doctoraiworld.admin.data.remote.ApiService
import com.doctoraiworld.admin.util.ApiResult
import com.doctoraiworld.admin.util.safeApiCall

class ProCodesRepository(private val apiService: () -> ApiService) {
    suspend fun list(activeOnly: Boolean = false): ApiResult<List<ProCode>> {
        val result = safeApiCall { apiService().listProCodes(if (activeOnly) true else null) }
        return when (result) {
            is ApiResult.Success -> ApiResult.Success(result.data.codes)
            is ApiResult.Failure -> result
        }
    }

    suspend fun create(request: CreateProCodeRequest): ApiResult<ProCode> {
        val result = safeApiCall { apiService().createProCode(request) }
        return when (result) {
            is ApiResult.Success -> ApiResult.Success(result.data.code)
            is ApiResult.Failure -> result
        }
    }

    suspend fun update(id: String, request: UpdateProCodeRequest): ApiResult<ProCode> {
        val result = safeApiCall { apiService().updateProCode(id, request) }
        return when (result) {
            is ApiResult.Success -> ApiResult.Success(result.data.code)
            is ApiResult.Failure -> result
        }
    }

    suspend fun delete(id: String): ApiResult<Unit> {
        val result = safeApiCall { apiService().deleteProCode(id) }
        return when (result) {
            is ApiResult.Success -> ApiResult.Success(Unit)
            is ApiResult.Failure -> result
        }
    }
}
