package com.doctoraiworld.admin.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.doctoraiworld.admin.data.local.SecureTokenStore
import com.doctoraiworld.admin.data.repository.AuthRepository
import com.doctoraiworld.admin.di.ServiceLocator
import com.doctoraiworld.admin.util.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val serverUrl: String = ServiceLocator.tokenStore.baseUrl,
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val loginSucceeded: Boolean = false
)

class LoginViewModel @JvmOverloads constructor(
    private val authRepository: AuthRepository = ServiceLocator.authRepository,
    private val tokenStore: SecureTokenStore = ServiceLocator.tokenStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState

    init {
        if (authRepository.isLoggedIn) {
            _uiState.update { it.copy(loginSucceeded = true) }
        }
    }

    fun onServerUrlChange(value: String) = _uiState.update { it.copy(serverUrl = value, errorMessage = null) }
    fun onEmailChange(value: String) = _uiState.update { it.copy(email = value, errorMessage = null) }
    fun onPasswordChange(value: String) = _uiState.update { it.copy(password = value, errorMessage = null) }

    fun submit() {
        val state = _uiState.value
        if (state.serverUrl.isBlank() || state.email.isBlank() || state.password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Fill in the server URL, email, and password.") }
            return
        }

        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            ServiceLocator.invalidateApiService()
            when (val result = authRepository.login(state.serverUrl, state.email, state.password)) {
                is ApiResult.Success -> _uiState.update { it.copy(isLoading = false, loginSucceeded = true) }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(isLoading = false, errorMessage = result.message)
                }
            }
        }
    }
}
