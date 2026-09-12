package com.doctoraiworld.admin.ui.users

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.doctoraiworld.admin.data.model.AppUser
import com.doctoraiworld.admin.data.model.UpdateUserRequest
import com.doctoraiworld.admin.data.repository.UsersRepository
import com.doctoraiworld.admin.di.ServiceLocator
import com.doctoraiworld.admin.util.ApiResult
import com.doctoraiworld.admin.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class UserDetailState(
    val user: UiState<AppUser> = UiState.Loading,
    val queryCount: Int = 0,
    val isSaving: Boolean = false,
    val saveError: String? = null,
    val saveSucceeded: Boolean = false
)

class UserDetailViewModel(savedStateHandle: SavedStateHandle) : ViewModel() {

    private val repository: UsersRepository = ServiceLocator.usersRepository
    private val userId: String = checkNotNull(savedStateHandle["userId"])

    private val _uiState = MutableStateFlow(UserDetailState())
    val uiState: StateFlow<UserDetailState> = _uiState

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(user = UiState.Loading) }
        viewModelScope.launch {
            when (val result = repository.get(userId)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(user = UiState.Success(result.data.user), queryCount = result.data.queryCount)
                }
                is ApiResult.Failure -> _uiState.update { it.copy(user = UiState.Error(result.message)) }
            }
        }
    }

    fun setPro(isPro: Boolean) = update(UpdateUserRequest(isPro = isPro))
    fun setBanned(isBanned: Boolean) = update(UpdateUserRequest(isBanned = isBanned))
    fun setDisplayName(name: String) = update(UpdateUserRequest(displayName = name))

    private fun update(request: UpdateUserRequest) {
        _uiState.update { it.copy(isSaving = true, saveError = null, saveSucceeded = false) }
        viewModelScope.launch {
            when (val result = repository.update(userId, request)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(isSaving = false, user = UiState.Success(result.data.user), saveSucceeded = true)
                }
                is ApiResult.Failure -> _uiState.update { it.copy(isSaving = false, saveError = result.message) }
            }
        }
    }
}
