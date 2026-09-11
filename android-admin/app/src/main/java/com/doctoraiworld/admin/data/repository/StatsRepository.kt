package com.doctoraiworld.admin.data.repository

import com.doctoraiworld.admin.data.model.StatsOverview
import com.doctoraiworld.admin.data.model.TimeseriesResponse
import com.doctoraiworld.admin.data.remote.ApiService
import com.doctoraiworld.admin.util.ApiResult
import com.doctoraiworld.admin.util.safeApiCall

class StatsRepository(private val apiService: () -> ApiService) {
    suspend fun overview(): ApiResult<StatsOverview> =
        safeApiCall { apiService().statsOverview() }

    suspend fun timeseries(metric: String, days: Int): ApiResult<TimeseriesResponse> =
        safeApiCall { apiService().statsTimeseries(metric, days) }
}
