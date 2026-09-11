package com.doctoraiworld.admin.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.doctoraiworld.admin.ui.components.FullScreenError
import com.doctoraiworld.admin.ui.components.FullScreenLoading
import com.doctoraiworld.admin.util.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onLoggedOut: () -> Unit,
    viewModel: SettingsViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(topBar = { TopAppBar(title = { Text("Settings") }) }) { padding ->
        when (val current = state.settings) {
            is UiState.Loading -> FullScreenLoading(modifier = Modifier.padding(padding))
            is UiState.Error -> FullScreenError(
                message = current.message,
                onRetry = viewModel::load,
                modifier = Modifier.padding(padding)
            )
            is UiState.Success -> SettingsContent(
                settings = current.data,
                adminEmail = viewModel.adminEmail,
                isSaving = state.isSaving,
                saveMessage = state.saveMessage,
                onSave = viewModel::save,
                onLogout = {
                    viewModel.logout()
                    onLoggedOut()
                },
                modifier = Modifier.padding(padding)
            )
        }
    }
}

@Composable
private fun SettingsContent(
    settings: Map<String, String>,
    adminEmail: String?,
    isSaving: Boolean,
    saveMessage: String?,
    onSave: (Map<String, String>) -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    var proPrice by remember(settings) { mutableStateOf(settings["pro_price_usd"] ?: "") }
    var pricePeriod by remember(settings) { mutableStateOf(settings["pro_price_period"] ?: "month") }
    var banner by remember(settings) { mutableStateOf(settings["announcement_banner"] ?: "") }
    var maintenanceMode by remember(settings) { mutableStateOf(settings["maintenance_mode"] == "true") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        adminEmail?.let {
            Text("Signed in as $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        Text("Pro plan", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            value = proPrice,
            onValueChange = { proPrice = it },
            label = { Text("Price (USD)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = pricePeriod,
            onValueChange = { pricePeriod = it },
            label = { Text("Billing period (e.g. month, year)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Text("Announcement banner", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            value = banner,
            onValueChange = { banner = it },
            label = { Text("Shown in the app (blank = hidden)") },
            modifier = Modifier.fillMaxWidth()
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Maintenance mode", style = MaterialTheme.typography.titleMedium)
            Switch(checked = maintenanceMode, onCheckedChange = { maintenanceMode = it })
        }

        saveMessage?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }

        Button(
            enabled = !isSaving,
            onClick = {
                onSave(
                    mapOf(
                        "pro_price_usd" to proPrice,
                        "pro_price_period" to pricePeriod,
                        "announcement_banner" to banner,
                        "maintenance_mode" to maintenanceMode.toString()
                    )
                )
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Save changes")
        }

        OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
            Text("Log out")
        }
    }
}
