package com.doctoraiworld.admin.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.doctoraiworld.admin.di.ServiceLocator
import com.doctoraiworld.admin.ui.dashboard.DashboardScreen
import com.doctoraiworld.admin.ui.login.LoginScreen
import com.doctoraiworld.admin.ui.procodes.ProCodesScreen
import com.doctoraiworld.admin.ui.settings.SettingsScreen
import com.doctoraiworld.admin.ui.users.UserDetailScreen
import com.doctoraiworld.admin.ui.users.UsersScreen

@Composable
fun AdminApp() {
    val navController = rememberNavController()
    val startDestination = if (ServiceLocator.authRepository.isLoggedIn) {
        AdminDestinations.DASHBOARD
    } else {
        AdminDestinations.LOGIN
    }

    NavHost(navController = navController, startDestination = startDestination) {
        composable(AdminDestinations.LOGIN) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(AdminDestinations.DASHBOARD) {
                        popUpTo(AdminDestinations.LOGIN) { inclusive = true }
                    }
                }
            )
        }
        composable(AdminDestinations.DASHBOARD) { AdminShell(navController, AdminDestinations.DASHBOARD) }
        composable(AdminDestinations.PRO_CODES) { AdminShell(navController, AdminDestinations.PRO_CODES) }
        composable(AdminDestinations.USERS) { AdminShell(navController, AdminDestinations.USERS) }
        composable(AdminDestinations.SETTINGS) { AdminShell(navController, AdminDestinations.SETTINGS) }
        composable(AdminDestinations.USER_DETAIL) {
            UserDetailScreen(onBack = { navController.popBackStack() })
        }
    }
}

/**
 * Wraps the four main tabs in a shared bottom navigation bar. Each tab route
 * re-enters this composable, which then renders the matching tab content —
 * keeping a single NavHost while still giving every tab a stable back stack entry.
 */
@Composable
private fun AdminShell(navController: NavHostController, currentRoute: String) {
    Scaffold(
        bottomBar = {
            NavigationBar {
                val backStackEntry by navController.currentBackStackEntryAsState()
                val hierarchy = backStackEntry?.destination?.hierarchy
                bottomTabs.forEach { tab ->
                    NavigationBarItem(
                        selected = hierarchy?.any { it.route == tab.route } == true,
                        onClick = {
                            navController.navigate(tab.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) }
                    )
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(bottom = padding.calculateBottomPadding())) {
            when (currentRoute) {
                AdminDestinations.DASHBOARD -> DashboardScreen()
                AdminDestinations.PRO_CODES -> ProCodesScreen()
                AdminDestinations.USERS -> UsersScreen(
                    onUserClick = { userId -> navController.navigate(AdminDestinations.userDetail(userId)) }
                )
                AdminDestinations.SETTINGS -> SettingsScreen(
                    onLoggedOut = {
                        navController.navigate(AdminDestinations.LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }
        }
    }
}
