# Keep kotlinx.serialization models used for Retrofit request/response bodies.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class com.doctoraiworld.admin.data.model.** {
    *** Companion;
}
-keepclasseswithmembers class com.doctoraiworld.admin.data.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.doctoraiworld.admin.data.model.**$$serializer { *; }
