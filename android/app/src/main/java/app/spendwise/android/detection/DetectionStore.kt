package app.spendwise.android.detection

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

/**
 * App-private storage for the listener: the user's switches, and a short queue of payment-looking
 * messages waiting for the app to read them. The app empties the queue as soon as it reads it.
 */
class DetectionStore(context: Context) {
    private val prefs = context.getSharedPreferences("spendwise.detection", Context.MODE_PRIVATE)

    var enabled: Boolean
        get() = prefs.getBoolean("enabled", false)
        set(v) { prefs.edit().putBoolean("enabled", v).apply() }
    var smsEnabled: Boolean
        get() = prefs.getBoolean("sms", true)
        set(v) { prefs.edit().putBoolean("sms", v).apply() }
    var packages: Set<String>
        get() = prefs.getStringSet("packages", emptySet()) ?: emptySet()
        set(v) { prefs.edit().putStringSet("packages", v).apply() }

    /** Adds an item unless the same text from the same app was already seen. Returns the item, or null if a duplicate. */
    @Synchronized
    fun add(pkg: String, title: String, text: String, postedAt: Long): JSONObject? {
        val key = sha1("$pkg|$text")
        val seen = JSONArray(prefs.getString("seen", "[]"))
        for (i in 0 until seen.length()) if (seen.getString(i) == key) return null
        seen.put(key)
        while (seen.length() > 300) seen.remove(0)
        val item = JSONObject().put("id", key).put("pkg", pkg).put("title", title).put("text", text).put("postedAt", postedAt)
        val queue = JSONArray(prefs.getString("queue", "[]")).put(item)
        while (queue.length() > 200) queue.remove(0)
        prefs.edit().putString("seen", seen.toString()).putString("queue", queue.toString()).apply()
        return item
    }

    /** Returns and clears everything waiting. */
    @Synchronized
    fun drain(): JSONArray {
        val q = JSONArray(prefs.getString("queue", "[]"))
        prefs.edit().putString("queue", "[]").apply()
        return q
    }

    fun pending(): Int = JSONArray(prefs.getString("queue", "[]")).length()

    var lastHeardAt: Long
        get() = prefs.getLong("lastHeard", 0)
        set(v) { prefs.edit().putLong("lastHeard", v).apply() }

    private fun sha1(s: String): String =
        MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
}
