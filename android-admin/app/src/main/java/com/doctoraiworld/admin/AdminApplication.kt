package com.doctoraiworld.admin

import android.app.Application
import com.doctoraiworld.admin.di.ServiceLocator

class AdminApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.init(this)
    }
}
