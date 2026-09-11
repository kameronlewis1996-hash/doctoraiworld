package com.doctoraiworld.admin.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.doctoraiworld.admin.data.repository.AuthRepository
import com.doctoraiworld.admin.data.repository.SettingsRepository
import com.doctoraiworld.admin.di.ServiceLocator
import com.doctoraiworld.admin.util.ApiResult
import com.doctoraiworld.admin.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SettingsScreenState(
    val settings: UiState<Map<String, String>> = UiState.Loading,
    val isSaving: Boolean = false,
    val saveMessage: String? = null
)

class SettingsViewModel @JvmOverloads constructor(
    private val settingsRepository: SettingsRepository = ServiceLocator.settingsRepository,
    private val authRepository: AuthRepository = ServiceLocator.authRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsScreenState())
    val uiState: StateFlow<SettingsScreenState> = _uiState

    val adminEmail: String? get() = authRepository.currentAdminEmail

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(settings = UiState.Loading) }
        viewModelScope.launch {
            when (val result = settingsRepository.get()) {
                is ApiResult.Success -> _uiState.update { it.copy(settings = UiState.Success(result.data)) }
                is ApiResult.Failure -> _uiState.update { it.copy(settings = UiState.Error(result.message)) }
            }
        }
    }

    fun save(updates: Map<String, String>) {
        _uiState.update { it.copy(isSaving = true, saveMessage = null) }
        viewModelScope.launch {
            when (val result = settingsRepository.update(updates)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(isSaving = false, settings = UiState.Success(result.data), saveMessage = "Saved")
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(isSaving = false, saveMessage = result.message)
                }
            }
        }
    }

    fun logout() = authRepository.logout()
}
