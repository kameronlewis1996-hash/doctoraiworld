package com.doctoraiworld.admin.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class AdminInfo(val id: String, val email: String)

@Serializable
data class LoginResponse(val token: String, val admin: AdminInfo)

@Serializable
data class StatsOverview(
    val totalUsers: Int,
    val proUsers: Int,
    val newUsersLast7Days: Int,
    val totalQueries: Int,
    val queriesLast7Days: Int,
    val activeCodes: Int,
    val bannedUsers: Int,
    val estimatedMonthlyRevenueUsd: Double
)

@Serializable
data class TimeseriesPoint(val day: String, val count: Int)

@Serializable
data class TimeseriesResponse(val metric: String, val days: Int, val points: List<TimeseriesPoint>)

@Serializable
data class AppUser(
    val id: String,
    val email: String,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("is_pro") val isPro: Boolean,
    @SerialName("pro_expires_at") val proExpiresAt: String? = null,
    @SerialName("is_banned") val isBanned: Boolean,
    @SerialName("created_at") val createdAt: String
)

@Serializable
data class UsersResponse(val total: Int, val page: Int, val pageSize: Int, val users: List<AppUser>)

@Serializable
data class UserDetailResponse(val user: AppUser, val queryCount: Int)

@Serializable
data class UserResponse(val user: AppUser)

@Serializable
data class UpdateUserRequest(
    val displayName: String? = null,
    val isPro: Boolean? = null,
    val proExpiresAt: String? = null,
    val isBanned: Boolean? = null
)

@Serializable
data class ProCode(
    val id: String,
    val code: String,
    val note: String? = null,
    @SerialName("max_uses") val maxUses: Int,
    val uses: Int,
    val active: Boolean,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("created_at") val createdAt: String
)

@Serializable
data class ProCodesResponse(val codes: List<ProCode>)

@Serializable
data class ProCodeResponse(val code: ProCode)

@Serializable
data class CreateProCodeRequest(
    val note: String? = null,
    val maxUses: Int = 1,
    val expiresAt: String? = null,
    val customCode: String? = null
)

@Serializable
data class UpdateProCodeRequest(
    val note: String? = null,
    val maxUses: Int? = null,
    val active: Boolean? = null,
    val expiresAt: String? = null
)

@Serializable
data class SettingsResponse(val settings: Map<String, String>)

@Serializable
data class ApiErrorBody(val error: String? = null)
