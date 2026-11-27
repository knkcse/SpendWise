package app.spendwise.android.detection

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "PaymentDetection")
class PaymentDetectionPlugin : Plugin() {
    companion object {
        @Volatile private var instance: PaymentDetectionPlugin? = null
        /** Tells the app right away when it's open; otherwise the item waits in the queue. */
        fun notifyNew(item: JSONObject) {
            instance?.notifyListeners("detected", JSObject().put("count", 1), true)
        }
        @Volatile private var sharedText: String? = null
        /** Text shared to SpendWise; the app picks it up with takeShared(). */
        fun shared(text: String) {
            sharedText = text
            instance?.notifyListeners("shared", JSObject(), true)
        }
    }

    override fun load() { instance = this }
    override fun handleOnDestroy() { if (instance === this) instance = null }

    @PluginMethod
    fun status(call: PluginCall) {
        val store = DetectionStore(context)
        val granted = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
        call.resolve(JSObject().put("accessGranted", granted).put("enabled", store.enabled)
            .put("pending", store.pending()).put("lastHeardAt", store.lastHeardAt).put("listenerInBuild", listenerInBuild()))
    }

    /** False in the "lite" build, which has no notification listener. */
    private fun listenerInBuild(): Boolean = try {
        context.packageManager.getServiceInfo(ComponentName(context, PaymentListenerService::class.java), 0); true
    } catch (_: Exception) { false }

    @PluginMethod
    fun takeShared(call: PluginCall) {
        val t = sharedText; sharedText = null
        call.resolve(JSObject().put("text", t))
    }

    @PluginMethod
    fun openAccessSettings(call: PluginCall) {
        val intent = if (android.os.Build.VERSION.SDK_INT >= 30)
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, ComponentName(context, PaymentListenerService::class.java).flattenToString())
        else Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { context.startActivity(intent) } catch (_: Exception) {
            context.startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        call.resolve()
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        val store = DetectionStore(context)
        store.enabled = call.getBoolean("enabled", false) == true
        store.smsEnabled = call.getBoolean("sms", true) == true
        val pk = call.getArray("packages") ?: JSArray()
        store.packages = (0 until pk.length()).map { pk.getString(it) }.toSet()
        call.resolve()
    }

    @PluginMethod
    fun drain(call: PluginCall) {
        val q = DetectionStore(context).drain()
        call.resolve(JSObject().put("items", JSArray(q.toString())))
    }
}
