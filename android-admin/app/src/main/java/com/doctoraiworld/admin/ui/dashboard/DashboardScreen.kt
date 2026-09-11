package com.doctoraiworld.admin.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.doctoraiworld.admin.data.model.StatsOverview
import com.doctoraiworld.admin.ui.components.FullScreenError
import com.doctoraiworld.admin.ui.components.FullScreenLoading
import com.doctoraiworld.admin.ui.components.StatCard
import com.doctoraiworld.admin.util.UiState
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(viewModel: DashboardViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(topBar = { TopAppBar(title = { Text("Dashboard") }) }) { padding ->
        when (val current = state) {
            is UiState.Loading -> FullScreenLoading(modifier = Modifier.padding(padding))
            is UiState.Error -> FullScreenError(
                message = current.message,
                onRetry = viewModel::load,
                modifier = Modifier.padding(padding)
            )
            is UiState.Success -> DashboardContent(
                stats = current.data,
                modifier = Modifier.padding(padding)
            )
        }
    }
}

@Composable
private fun DashboardContent(stats: StatsOverview, modifier: Modifier = Modifier) {
    val currencyFormat = remember(stats.estimatedMonthlyRevenueUsd) {
        NumberFormat.getCurrencyInstance(Locale.US)
    }

    val tiles = listOf(
        "Total users" to stats.totalUsers.toString(),
        "Pro subscribers" to stats.proUsers.toString(),
        "New users (7d)" to stats.newUsersLast7Days.toString(),
        "AI queries (total)" to stats.totalQueries.toString(),
        "AI queries (7d)" to stats.queriesLast7Days.toString(),
        "Active pro codes" to stats.activeCodes.toString(),
        "Banned users" to stats.bannedUsers.toString(),
        "Est. monthly revenue" to currencyFormat.format(stats.estimatedMonthlyRevenueUsd)
    )

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(tiles) { (title, value) ->
            StatCard(title = title, value = value, modifier = Modifier.height(96.dp))
        }
    }
}
