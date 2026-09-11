package com.doctoraiworld.admin.ui.users

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Search
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
import com.doctoraiworld.admin.ui.theme.ConsoleSuccess

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsersScreen(
    onUserClick: (String) -> Unit,
    viewModel: UsersViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(topBar = { TopAppBar(title = { Text("Users") }) }) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            OutlinedTextField(
                value = state.search,
                onValueChange = viewModel::search,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text("Search by email or name") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            )

            when {
                state.isLoading -> FullScreenLoading()
                state.errorMessage != null && state.users.isEmpty() ->
                    FullScreenError(message = state.errorMessage!!, onRetry = { viewModel.search(state.search) })
                else -> UsersList(
                    users = state.users,
                    isLoadingMore = state.isLoadingMore,
                    hasMore = state.hasMore,
                    onLoadMore = viewModel::loadMore,
                    onUserClick = onUserClick
                )
            }
        }
    }
}

@Composable
private fun UsersList(
    users: List<AppUser>,
    isLoadingMore: Boolean,
    hasMore: Boolean,
    onLoadMore: () -> Unit,
    onUserClick: (String) -> Unit
) {
    if (users.isEmpty()) {
        FullScreenError(message = "No users found.")
        return
    }

    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        items(users, key = { it.id }) { user ->
            UserRow(user = user, onClick = { onUserClick(user.id) })
        }
        if (hasMore) {
            item {
                if (isLoadingMore) {
                    CircularProgressIndicator(modifier = Modifier.padding(16.dp))
                } else {
                    TextButton(onClick = onLoadMore, modifier = Modifier.padding(16.dp)) {
                        Text("Load more")
                    }
                }
            }
        }
    }
}

@Composable
private fun UserRow(user: AppUser, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = user.displayName ?: user.email, style = MaterialTheme.typography.titleMedium)
            Text(
                text = user.email,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (user.isPro) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = "Pro",
                        tint = ConsoleSuccess,
                        modifier = Modifier.padding(end = 4.dp)
                    )
                    Text("Pro", style = MaterialTheme.typography.bodyMedium, color = ConsoleSuccess)
                }
                if (user.isBanned) {
                    Text(
                        text = if (user.isPro) "  ·  Banned" else "Banned",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}
