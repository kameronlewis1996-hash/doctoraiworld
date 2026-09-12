package com.doctoraiworld.admin.ui.procodes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.doctoraiworld.admin.data.model.ProCode
import com.doctoraiworld.admin.ui.components.FullScreenError
import com.doctoraiworld.admin.ui.components.FullScreenLoading
import com.doctoraiworld.admin.ui.components.InlineErrorBanner
import com.doctoraiworld.admin.util.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProCodesScreen(viewModel: ProCodesViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Pro Codes") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = viewModel::openCreateDialog) {
                Icon(Icons.Filled.Add, contentDescription = "Create pro code")
            }
        }
    ) { padding ->
        when (val current = state.list) {
            is UiState.Loading -> FullScreenLoading(modifier = Modifier.padding(padding))
            is UiState.Error -> FullScreenError(
                message = current.message,
                onRetry = viewModel::load,
                modifier = Modifier.padding(padding)
            )
            is UiState.Success -> ProCodesList(
                codes = current.data,
                onToggleActive = viewModel::toggleActive,
                onDelete = viewModel::deleteCode,
                modifier = Modifier.padding(padding)
            )
        }
    }

    if (state.isCreateDialogOpen) {
        CreateCodeDialog(
            isSubmitting = state.isSubmitting,
            errorMessage = state.actionError,
            onDismiss = viewModel::dismissCreateDialog,
            onCreate = viewModel::createCode
        )
    }

    state.lastCreatedCode?.let { code ->
        AlertDialog(
            onDismissRequest = viewModel::dismissLastCreatedCode,
            confirmButton = { TextButton(onClick = viewModel::dismissLastCreatedCode) { Text("Done") } },
            title = { Text("Code created") },
            text = { Text(code, style = MaterialTheme.typography.titleMedium) }
        )
    }
}

@Composable
private fun ProCodesList(
    codes: List<ProCode>,
    onToggleActive: (ProCode) -> Unit,
    onDelete: (ProCode) -> Unit,
    modifier: Modifier = Modifier
) {
    if (codes.isEmpty()) {
        FullScreenError(message = "No pro codes yet. Tap + to create one.", modifier = modifier)
        return
    }

    LazyColumn(modifier = modifier.fillMaxWidth(), contentPadding = PaddingValues(vertical = 8.dp)) {
        items(codes, key = { it.id }) { code ->
            ProCodeRow(code = code, onToggleActive = { onToggleActive(code) }, onDelete = { onDelete(code) })
        }
    }
}

@Composable
private fun ProCodeRow(code: ProCode, onToggleActive: () -> Unit, onDelete: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = code.code, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = "${code.uses}/${code.maxUses} used" + (code.note?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                code.expiresAt?.let {
                    Text(
                        text = "Expires $it",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Switch(checked = code.active, onCheckedChange = { onToggleActive() })
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Delete code")
            }
        }
    }
}

@Composable
private fun CreateCodeDialog(
    isSubmitting: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onCreate: (note: String, maxUses: Int, customCode: String?) -> Unit
) {
    var note by remember { mutableStateOf("") }
    var maxUsesText by remember { mutableStateOf("1") }
    var customCode by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New pro code") },
        text = {
            Column {
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Note (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = maxUsesText,
                    onValueChange = { maxUsesText = it.filter(Char::isDigit) },
                    label = { Text("Max redemptions") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                )
                OutlinedTextField(
                    value = customCode,
                    onValueChange = { customCode = it },
                    label = { Text("Custom code (optional, auto-generated otherwise)") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                )
                errorMessage?.let {
                    InlineErrorBanner(message = it, modifier = Modifier.padding(top = 8.dp))
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !isSubmitting,
                onClick = { onCreate(note, maxUsesText.toIntOrNull() ?: 1, customCode) }
            ) { Text("Create") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
