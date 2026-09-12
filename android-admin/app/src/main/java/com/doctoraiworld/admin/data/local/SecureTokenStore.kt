package com.doctoraiworld.admin.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Holds the admin session token and configured API base URL in an
 * EncryptedSharedPreferences file, so neither survives a backup/restore
 * (backups are disabled at the manifest level too) and both are encrypted
 * at rest on the device.
 */
class SecureTokenStore(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "doctoraiworld_admin_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var adminEmail: String?
        get() = prefs.getString(KEY_ADMIN_EMAIL, null)
        set(value) = prefs.edit().putString(KEY_ADMIN_EMAIL, value).apply()

    var baseUrl: String
        get() = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        set(value) = prefs.edit().putString(KEY_BASE_URL, value).apply()

    fun clearSession() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_ADMIN_EMAIL).apply()
    }

    val isLoggedIn: Boolean get() = !token.isNullOrBlank()

    companion object {
        private const val KEY_TOKEN = "session_token"
        private const val KEY_ADMIN_EMAIL = "admin_email"
        private const val KEY_BASE_URL = "api_base_url"

        // 10.0.2.2 is how the Android emulator reaches "localhost" on the
        // host machine, so this points at a backend run locally via `npm run dev`.
        // Change it on the login screen to your deployed HTTPS backend URL.
        const val DEFAULT_BASE_URL = "http://10.0.2.2:4000/"
    }
}
