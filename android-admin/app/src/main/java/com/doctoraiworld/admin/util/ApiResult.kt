package com.doctoraiworld.admin.util

import com.doctoraiworld.admin.data.model.ApiErrorBody
import kotlinx.serialization.json.Json
import retrofit2.Response

sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Failure(val message: String, val statusCode: Int? = null) : ApiResult<Nothing>()
}

private val errorJson = Json { ignoreUnknownKeys = true }

/** Converts a Retrofit [Response] into an [ApiResult], extracting the backend's `error` field on failure. */
fun <T> Response<T>.toApiResult(): ApiResult<T> {
    if (isSuccessful) {
        val body = body()
        @Suppress("UNCHECKED_CAST")
        return if (body == null && code() == 204) {
            ApiResult.Success(Unit as T)
        } else if (body != null) {
            ApiResult.Success(body)
        } else {
            ApiResult.Failure("Empty response from server", code())
        }
    }

    val rawError = errorBody()?.string()
    val message = rawError?.let {
        runCatching { errorJson.decodeFromString(ApiErrorBody.serializer(), it).error }.getOrNull()
    } ?: "Request failed (${code()})"

    return ApiResult.Failure(message, code())
}

suspend fun <T> safeApiCall(block: suspend () -> Response<T>): ApiResult<T> {
    return try {
        block().toApiResult()
    } catch (e: java.io.IOException) {
        ApiResult.Failure("Can't reach the server. Check the API URL and your connection.")
    } catch (e: Exception) {
        ApiResult.Failure(e.message ?: "Unexpected error")
    }
}
