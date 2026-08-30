package com.wodus.travelmap

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.webkit.WebView
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.exifinterface.media.ExifInterface
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * 이 폰의 사진·동영상에서 촬영 위치를 읽어 지도를 만든다.
 *
 * 브라우저로는 할 수 없는 일이라 앱으로 만들었다. 안드로이드는 갤러리의 사진을 다른 앱에
 * 넘길 때 EXIF 의 GPS 태그를 지우는데, ACCESS_MEDIA_LOCATION 권한을 가진 앱이
 * MediaStore.setRequireOriginal() 로 요청하면 지워지지 않은 원본을 받는다.
 *
 * 지역 판정·서울 제외·집계·지도 그리기는 assets/travel_map.html 이 그대로 맡는다.
 * 앱은 좌표만 모아서 window.__SCAN__ 으로 넘긴다.
 */
class MainActivity : AppCompatActivity() {

    private data class Pt(val lat: Double, val lon: Double, val t: Long?)

    private val io = Executors.newSingleThreadExecutor()
    private lateinit var web: WebView
    private lateinit var status: TextView
    private lateinit var bar: ProgressBar
    private lateinit var scanBtn: Button

    /** true 로 두면 DCIM 폴더(카메라로 찍은 것)만 훑는다. false 면 사진 전체. */
    private val dcimOnly = true

    private val isoLoc = Regex("([+-]\\d+(?:\\.\\d+)?)([+-]\\d+(?:\\.\\d+)?)")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        status = findViewById(R.id.status)
        bar = findViewById(R.id.bar)
        scanBtn = findViewById(R.id.scanBtn)

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true          // 기록이 쌓이도록 localStorage 허용

        scanBtn.setOnClickListener { start() }
    }

    // ---------------------------------------------------------------- 권한

    private fun needed(): Array<String> = when {
        Build.VERSION.SDK_INT >= 33 -> arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES,
            Manifest.permission.READ_MEDIA_VIDEO,
            Manifest.permission.ACCESS_MEDIA_LOCATION
        )
        Build.VERSION.SDK_INT >= 29 -> arrayOf(
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.ACCESS_MEDIA_LOCATION
        )
        else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

    private fun missing(): List<String> = needed().filter {
        ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }

    private fun start() {
        val miss = missing()
        if (miss.isEmpty()) scan() else ActivityCompat.requestPermissions(this, miss.toTypedArray(), 1001)
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, res: IntArray) {
        super.onRequestPermissionsResult(code, perms, res)
        if (code != 1001) return
        val denied = perms.indices.filter { res[it] != PackageManager.PERMISSION_GRANTED }.map { perms[it] }
        when {
            denied.any { it != Manifest.permission.ACCESS_MEDIA_LOCATION } ->
                status.text = "사진을 읽을 권한이 없어 진행할 수 없습니다.\n설정 → 앱 → 여행 발자국 → 권한에서 허용해 주세요."
            denied.contains(Manifest.permission.ACCESS_MEDIA_LOCATION) ->
                status.text = "위치 정보 접근이 허용되지 않았습니다.\n이 권한이 없으면 안드로이드가 좌표를 지운 사본을 넘겨줍니다.\n설정 → 앱 → 여행 발자국 → 권한에서 허용해 주세요."
            else -> scan()
        }
    }

    // ---------------------------------------------------------------- 스캔

    private fun scan() {
        scanBtn.isEnabled = false
        bar.visibility = View.VISIBLE
        status.text = "사진을 훑는 중..."

        io.execute {
            val pts = ArrayList<Pt>()
            var files = 0
            try {
                files += readImages(pts)
                files += readVideos(pts)
            } catch (e: Throwable) {
                val msg = e.message ?: e.javaClass.simpleName
                runOnUiThread {
                    bar.visibility = View.GONE
                    scanBtn.isEnabled = true
                    status.text = "읽는 중 문제가 생겼습니다: $msg"
                }
                return@execute
            }
            val n = files
            runOnUiThread { show(n, pts) }
        }
    }

    private fun progress(done: Int) {
        runOnUiThread { status.text = "사진을 훑는 중... ${"%,d".format(done)}개" }
    }

    /** DCIM 안의 것만 볼지 결정하는 selection. null 이면 전부. */
    private fun where(): Pair<String?, Array<String>?> {
        if (!dcimOnly) return Pair(null, null)
        return if (Build.VERSION.SDK_INT >= 29)
            Pair("${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?", arrayOf("DCIM/%"))
        else
            @Suppress("DEPRECATION")
            Pair("${MediaStore.MediaColumns.DATA} LIKE ?", arrayOf("%/DCIM/%"))
    }

    private fun readImages(out: MutableList<Pt>): Int {
        var n = 0
        val proj = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_TAKEN)
        val (sel, args) = where()
        contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, proj, sel, args, null)?.use { c ->
            val idCol = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val dtCol = c.getColumnIndex(MediaStore.Images.Media.DATE_TAKEN)
            while (c.moveToNext()) {
                n++
                val id = c.getLong(idCol)
                var uri: Uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                if (Build.VERSION.SDK_INT >= 29) {
                    // 이 한 줄이 이 앱의 존재 이유다. 없으면 좌표가 지워진 사본이 온다.
                    try { uri = MediaStore.setRequireOriginal(uri) } catch (e: Throwable) { }
                }
                try {
                    contentResolver.openInputStream(uri)?.use { input ->
                        val ll = ExifInterface(input).latLong
                        if (ll != null && ll.size >= 2 && !(ll[0] == 0.0 && ll[1] == 0.0)) {
                            val t = if (dtCol >= 0 && !c.isNull(dtCol)) c.getLong(dtCol) else null
                            out.add(Pt(ll[0], ll[1], t))
                        }
                    }
                } catch (e: Throwable) { /* 한 장 실패는 건너뛴다 */ }
                if (n % 50 == 0) progress(n)
            }
        }
        return n
    }

    private fun readVideos(out: MutableList<Pt>): Int {
        var n = 0
        val proj = arrayOf(MediaStore.Video.Media._ID, MediaStore.Video.Media.DATE_TAKEN)
        val (sel, args) = where()
        contentResolver.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, proj, sel, args, null)?.use { c ->
            val idCol = c.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
            val dtCol = c.getColumnIndex(MediaStore.Video.Media.DATE_TAKEN)
            while (c.moveToNext()) {
                n++
                val id = c.getLong(idCol)
                var uri: Uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                if (Build.VERSION.SDK_INT >= 29) {
                    try { uri = MediaStore.setRequireOriginal(uri) } catch (e: Throwable) { }
                }
                val r = MediaMetadataRetriever()
                try {
                    r.setDataSource(this, uri)
                    val loc = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_LOCATION)
                    val m = if (loc != null) isoLoc.find(loc) else null
                    if (m != null) {
                        val lat = m.groupValues[1].toDouble()
                        val lon = m.groupValues[2].toDouble()
                        if (!(lat == 0.0 && lon == 0.0)) {
                            val t = if (dtCol >= 0 && !c.isNull(dtCol)) c.getLong(dtCol) else null
                            out.add(Pt(lat, lon, t))
                        }
                    }
                } catch (e: Throwable) {
                } finally {
                    try { r.release() } catch (e: Throwable) { }
                }
                if (n % 20 == 0) progress(n)
            }
        }
        return n
    }

    // ---------------------------------------------------------------- 지도 표시

    private fun show(files: Int, pts: List<Pt>) {
        bar.visibility = View.GONE
        scanBtn.isEnabled = true
        scanBtn.text = "다시 훑기"
        status.text = "사진·동영상 ${"%,d".format(files)}개 중 ${"%,d".format(pts.size)}개에서 위치를 찾았습니다."

        val arr = JSONArray()
        for (p in pts) {
            val o = JSONObject()
            o.put("lat", p.lat)
            o.put("lon", p.lon)
            if (p.t != null && p.t > 0) o.put("t", p.t)
            arr.put(o)
        }
        val scan = JSONObject().put("files", files).put("points", arr)

        val html = assets.open("travel_map.html").bufferedReader().use { it.readText() }
        // '<' 를 이스케이프해 두면 좌표 안의 무엇도 스크립트 태그를 닫을 수 없다
        val tag = "<script>window.__SCAN__=" + scan.toString().replace("<", "\\u003c") + ";</script>"
        val page = if (html.contains("<body>")) html.replaceFirst("<body>", "<body>\n$tag") else tag + html
        web.loadDataWithBaseURL("file:///android_asset/", page, "text/html", "utf-8", null)
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }
}
