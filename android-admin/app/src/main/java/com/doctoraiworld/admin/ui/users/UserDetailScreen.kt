package com.doctoraiworld.admin.ui.users

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.doctoraiworld.admin.data.model.AppUser
import com.doctoraiworld.admin.ui.components.FullScreenError
import com.doctoraiworld.admin.ui.components.FullScreenLoading
import com.doctoraiworld.admin.ui.components.InlineErrorBanner
import com.doctoraiworld.admin.util.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserDetailScreen(
    onBack: () -> Unit,
    viewModel: UserDetailViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("User detail") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        when (val current = state.user) {
            is UiState.Loading -> FullScreenLoading(modifier = Modifier.padding(padding))
            is UiState.Error -> FullScreenError(
                message = current.message,
                onRetry = viewModel::load,
                modifier = Modifier.padding(padding)
            )
            is UiState.Success -> UserDetailContent(
                user = current.data,
                queryCount = state.queryCount,
                saveError = state.saveError,
                onTogglePro = viewModel::setPro,
                onToggleBanned = viewModel::setBanned,
                modifier = Modifier.padding(padding)
            )
        }
    }
}

@Composable
private fun UserDetailContent(
    user: AppUser,
    queryCount: Int,
    saveError: String?,
    onTogglePro: (Boolean) -> Unit,
    onToggleBanned: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(text = user.displayName ?: "(no display name)", style = MaterialTheme.typography.titleLarge)
        Text(
            text = user.email,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = "Joined ${user.createdAt} · $queryCount AI queries",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        saveError?.let { InlineErrorBanner(message = it) }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Pro access", style = MaterialTheme.typography.titleMedium)
                user.proExpiresAt?.let {
                    Text(
                        "Expires $it",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Switch(checked = user.isPro, onCheckedChange = onTogglePro)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Banned", style = MaterialTheme.typography.titleMedium)
            Switch(checked = user.isBanned, onCheckedChange = onToggleBanned)
        }
    }
}
