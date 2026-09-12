package com.doctoraiworld.admin.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.doctoraiworld.admin.data.model.StatsOverview
import com.doctoraiworld.admin.data.repository.StatsRepository
import com.doctoraiworld.admin.di.ServiceLocator
import com.doctoraiworld.admin.util.ApiResult
import com.doctoraiworld.admin.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class DashboardViewModel @JvmOverloads constructor(
    private val statsRepository: StatsRepository = ServiceLocator.statsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<StatsOverview>>(UiState.Loading)
    val uiState: StateFlow<UiState<StatsOverview>> = _uiState

    init {
        load()
    }

    fun load() {
        _uiState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = statsRepository.overview()) {
                is ApiResult.Success -> _uiState.value = UiState.Success(result.data)
                is ApiResult.Failure -> _uiState.value = UiState.Error(result.message)
            }
        }
    }
}
