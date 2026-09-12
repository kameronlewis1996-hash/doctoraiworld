package com.doctoraiworld.admin.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColors = darkColorScheme(
    primary = ConsoleBlue,
    onPrimary = ConsoleBackgroundDark,
    secondary = ConsoleBlueDark,
    background = ConsoleBackgroundDark,
    onBackground = ConsoleOnDark,
    surface = ConsoleSurfaceDark,
    onSurface = ConsoleOnDark,
    surfaceVariant = ConsoleSurfaceVariantDark,
    onSurfaceVariant = ConsoleMuted,
    error = ConsoleDanger
)

private val LightColors = lightColorScheme(
    primary = ConsoleBlueDark,
    onPrimary = ConsoleSurfaceLight,
    secondary = ConsoleBlue,
    background = ConsoleBackgroundLight,
    onBackground = ConsoleOnLight,
    surface = ConsoleSurfaceLight,
    onSurface = ConsoleOnLight,
    error = ConsoleDanger
)

@Composable
fun DoctorAiAdminTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AdminTypography,
        content = content
    )
}
