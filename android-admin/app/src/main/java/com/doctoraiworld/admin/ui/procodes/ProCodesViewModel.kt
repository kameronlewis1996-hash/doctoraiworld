package com.doctoraiworld.admin.ui.procodes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.doctoraiworld.admin.data.model.CreateProCodeRequest
import com.doctoraiworld.admin.data.model.ProCode
import com.doctoraiworld.admin.data.model.UpdateProCodeRequest
import com.doctoraiworld.admin.data.repository.ProCodesRepository
import com.doctoraiworld.admin.di.ServiceLocator
import com.doctoraiworld.admin.util.ApiResult
import com.doctoraiworld.admin.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProCodesScreenState(
    val list: UiState<List<ProCode>> = UiState.Loading,
    val isCreateDialogOpen: Boolean = false,
    val isSubmitting: Boolean = false,
    val actionError: String? = null,
    val lastCreatedCode: String? = null
)

class ProCodesViewModel @JvmOverloads constructor(
    private val repository: ProCodesRepository = ServiceLocator.proCodesRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProCodesScreenState())
    val uiState: StateFlow<ProCodesScreenState> = _uiState

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(list = UiState.Loading) }
        viewModelScope.launch {
            when (val result = repository.list()) {
                is ApiResult.Success -> _uiState.update { it.copy(list = UiState.Success(result.data)) }
                is ApiResult.Failure -> _uiState.update { it.copy(list = UiState.Error(result.message)) }
            }
        }
    }

    fun openCreateDialog() = _uiState.update { it.copy(isCreateDialogOpen = true, actionError = null) }
    fun dismissCreateDialog() = _uiState.update { it.copy(isCreateDialogOpen = false) }
    fun dismissLastCreatedCode() = _uiState.update { it.copy(lastCreatedCode = null) }

    fun createCode(note: String, maxUses: Int, customCode: String?) {
        _uiState.update { it.copy(isSubmitting = true, actionError = null) }
        viewModelScope.launch {
            val request = CreateProCodeRequest(
                note = note.ifBlank { null },
                maxUses = maxUses.coerceAtLeast(1),
                customCode = customCode?.trim()?.ifBlank { null }
            )
            when (val result = repository.create(request)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(isSubmitting = false, isCreateDialogOpen = false, lastCreatedCode = result.data.code)
                    }
                    load()
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(isSubmitting = false, actionError = result.message)
                }
            }
        }
    }

    fun toggleActive(code: ProCode) {
        viewModelScope.launch {
            when (repository.update(code.id, UpdateProCodeRequest(active = !code.active))) {
                is ApiResult.Success -> load()
                is ApiResult.Failure -> Unit
            }
        }
    }

    fun deleteCode(code: ProCode) {
        viewModelScope.launch {
            when (repository.delete(code.id)) {
                is ApiResult.Success -> load()
                is ApiResult.Failure -> Unit
            }
        }
    }
}
