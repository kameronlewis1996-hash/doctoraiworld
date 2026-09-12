package com.doctoraiworld.admin.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.ui.graphics.vector.ImageVector

object AdminDestinations {
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard"
    const val PRO_CODES = "pro_codes"
    const val USERS = "users"
    const val USER_DETAIL = "users/{userId}"
    const val SETTINGS = "settings"

    fun userDetail(userId: String) = "users/$userId"
}

data class BottomTab(val route: String, val label: String, val icon: ImageVector)

val bottomTabs = listOf(
    BottomTab(AdminDestinations.DASHBOARD, "Dashboard", Icons.Filled.Dashboard),
    BottomTab(AdminDestinations.PRO_CODES, "Pro Codes", Icons.Filled.VpnKey),
    BottomTab(AdminDestinations.USERS, "Users", Icons.Filled.People),
    BottomTab(AdminDestinations.SETTINGS, "Settings", Icons.Filled.Settings)
)
