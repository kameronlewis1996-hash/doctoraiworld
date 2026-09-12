package com.doctoraiworld.admin.data.repository

import com.doctoraiworld.admin.data.model.UpdateUserRequest
import com.doctoraiworld.admin.data.model.UserDetailResponse
import com.doctoraiworld.admin.data.model.UserResponse
import com.doctoraiworld.admin.data.model.UsersResponse
import com.doctoraiworld.admin.data.remote.ApiService
import com.doctoraiworld.admin.util.ApiResult
import com.doctoraiworld.admin.util.safeApiCall

class UsersRepository(private val apiService: () -> ApiService) {
    suspend fun list(search: String?, page: Int, pageSize: Int): ApiResult<UsersResponse> =
        safeApiCall { apiService().listUsers(search?.ifBlank { null }, page, pageSize) }

    suspend fun get(id: String): ApiResult<UserDetailResponse> =
        safeApiCall { apiService().getUser(id) }

    suspend fun update(id: String, request: UpdateUserRequest): ApiResult<UserResponse> =
        safeApiCall { apiService().updateUser(id, request) }
}
