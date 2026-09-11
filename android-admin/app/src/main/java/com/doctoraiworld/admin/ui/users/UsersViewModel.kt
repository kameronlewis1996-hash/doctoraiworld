package com.doctoraiworld.admin.ui.users

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.doctoraiworld.admin.data.model.AppUser
import com.doctoraiworld.admin.data.repository.UsersRepository
import com.doctoraiworld.admin.di.ServiceLocator
import com.doctoraiworld.admin.util.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val PAGE_SIZE = 25

data class UsersScreenState(
    val search: String = "",
    val users: List<AppUser> = emptyList(),
    val page: Int = 1,
    val total: Int = 0,
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val errorMessage: String? = null
) {
    val hasMore: Boolean get() = users.size < total
}

class UsersViewModel @JvmOverloads constructor(
    private val repository: UsersRepository = ServiceLocator.usersRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(UsersScreenState())
    val uiState: StateFlow<UsersScreenState> = _uiState

    init {
        search("")
    }

    fun search(query: String) {
        _uiState.update { it.copy(search = query, isLoading = true, page = 1, users = emptyList(), errorMessage = null) }
        viewModelScope.launch {
            when (val result = repository.list(query, 1, PAGE_SIZE)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(isLoading = false, users = result.data.users, total = result.data.total, page = 1)
                }
                is ApiResult.Failure -> _uiState.update { it.copy(isLoading = false, errorMessage = result.message) }
            }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoadingMore || !state.hasMore) return

        _uiState.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            val nextPage = state.page + 1
            when (val result = repository.list(state.search, nextPage, PAGE_SIZE)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(isLoadingMore = false, users = it.users + result.data.users, page = nextPage, total = result.data.total)
                }
                is ApiResult.Failure -> _uiState.update { it.copy(isLoadingMore = false, errorMessage = result.message) }
            }
        }
    }
}
