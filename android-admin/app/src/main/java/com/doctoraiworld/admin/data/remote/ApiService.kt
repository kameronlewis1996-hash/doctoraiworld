package com.doctoraiworld.admin.data.remote

import com.doctoraiworld.admin.data.model.CreateProCodeRequest
import com.doctoraiworld.admin.data.model.LoginRequest
import com.doctoraiworld.admin.data.model.LoginResponse
import com.doctoraiworld.admin.data.model.ProCodeResponse
import com.doctoraiworld.admin.data.model.ProCodesResponse
import com.doctoraiworld.admin.data.model.SettingsResponse
import com.doctoraiworld.admin.data.model.StatsOverview
import com.doctoraiworld.admin.data.model.TimeseriesResponse
import com.doctoraiworld.admin.data.model.UpdateProCodeRequest
import com.doctoraiworld.admin.data.model.UpdateUserRequest
import com.doctoraiworld.admin.data.model.UserDetailResponse
import com.doctoraiworld.admin.data.model.UserResponse
import com.doctoraiworld.admin.data.model.UsersResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @GET("api/stats/overview")
    suspend fun statsOverview(): Response<StatsOverview>

    @GET("api/stats/timeseries")
    suspend fun statsTimeseries(
        @Query("metric") metric: String,
        @Query("days") days: Int
    ): Response<TimeseriesResponse>

    @GET("api/users")
    suspend fun listUsers(
        @Query("search") search: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20
    ): Response<UsersResponse>

    @GET("api/users/{id}")
    suspend fun getUser(@Path("id") id: String): Response<UserDetailResponse>

    @PATCH("api/users/{id}")
    suspend fun updateUser(@Path("id") id: String, @Body request: UpdateUserRequest): Response<UserResponse>

    @GET("api/pro-codes")
    suspend fun listProCodes(@Query("activeOnly") activeOnly: Boolean? = null): Response<ProCodesResponse>

    @POST("api/pro-codes")
    suspend fun createProCode(@Body request: CreateProCodeRequest): Response<ProCodeResponse>

    @PATCH("api/pro-codes/{id}")
    suspend fun updateProCode(@Path("id") id: String, @Body request: UpdateProCodeRequest): Response<ProCodeResponse>

    @DELETE("api/pro-codes/{id}")
    suspend fun deleteProCode(@Path("id") id: String): Response<Void>

    @GET("api/settings")
    suspend fun getSettings(): Response<SettingsResponse>

    @PATCH("api/settings")
    suspend fun updateSettings(@Body settings: Map<String, String>): Response<SettingsResponse>
}
