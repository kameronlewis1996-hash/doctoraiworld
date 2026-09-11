package com.doctoraiworld.admin.di

import android.content.Context
import com.doctoraiworld.admin.data.local.SecureTokenStore
import com.doctoraiworld.admin.data.remote.ApiService
import com.doctoraiworld.admin.data.remote.buildApiService
import com.doctoraiworld.admin.data.repository.AuthRepository
import com.doctoraiworld.admin.data.repository.ProCodesRepository
import com.doctoraiworld.admin.data.repository.SettingsRepository
import com.doctoraiworld.admin.data.repository.StatsRepository
import com.doctoraiworld.admin.data.repository.UsersRepository

/**
 * Minimal hand-rolled service locator. This app is small enough that a
 * dependency-injection framework would add more ceremony than it saves;
 * everything is a plain singleton created lazily on first access.
 */
object ServiceLocator {

    lateinit var tokenStore: SecureTokenStore
        private set

    private var cachedBaseUrl: String? = null
    private var cachedApiService: ApiService? = null

    fun init(context: Context) {
        if (!::tokenStore.isInitialized) {
            tokenStore = SecureTokenStore(context.applicationContext)
        }
    }

    /** Rebuilds the Retrofit client only when the configured base URL actually changes. */
    fun apiService(): ApiService {
        val currentBaseUrl = tokenStore.baseUrl
        val existing = cachedApiService
        if (existing != null && cachedBaseUrl == currentBaseUrl) {
            return existing
        }
        val fresh = buildApiService(currentBaseUrl, tokenStore)
        cachedApiService = fresh
        cachedBaseUrl = currentBaseUrl
        return fresh
    }

    fun invalidateApiService() {
        cachedApiService = null
    }

    val authRepository: AuthRepository by lazy { AuthRepository(::apiService, tokenStore) }
    val statsRepository: StatsRepository by lazy { StatsRepository(::apiService) }
    val usersRepository: UsersRepository by lazy { UsersRepository(::apiService) }
    val proCodesRepository: ProCodesRepository by lazy { ProCodesRepository(::apiService) }
    val settingsRepository: SettingsRepository by lazy { SettingsRepository(::apiService) }
}
