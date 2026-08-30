plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.wodus.travelmap"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.wodus.travelmap"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    // 원본 EXIF 를 읽는다. ACCESS_MEDIA_LOCATION 과 짝이 되는 부분.
    implementation("androidx.exifinterface:exifinterface:1.3.7")
}
