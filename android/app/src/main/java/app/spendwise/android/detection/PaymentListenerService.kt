package app.spendwise.android.detection

import android.app.Notification
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Android calls this for every notification once the user grants SpendWise notification access.
 * Notifications from apps the user didn't switch on are ignored without reading their text.
 * Text that mentions an OTP, PIN or password is dropped. Only payment-looking text is queued.
 */
class PaymentListenerService : NotificationListenerService() {
    override fun onListenerConnected() { DetectionStore(this).lastHeardAt = System.currentTimeMillis() }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            val store = DetectionStore(this)
            if (!store.enabled) return
            if (!Gate.appAllowed(sbn.packageName, store.packages, store.smsEnabled)) return
            val n = sbn.notification ?: return
            if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
            val extras = n.extras ?: return
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
            val text = latestMessage(extras) ?: return
            store.lastHeardAt = System.currentTimeMillis()
            if (!Gate.looksLikePayment(text)) return
            val item = store.add(sbn.packageName, title, text, sbn.postTime) ?: return
            PaymentDetectionPlugin.notifyNew(item)
        } catch (_: Exception) {
            // Never crash the listener because of one odd notification.
        }
    }

    /** Messaging apps put the newest message in EXTRA_MESSAGES; others use big text or text. */
    private fun latestMessage(extras: android.os.Bundle): String? {
        val msgs = if (Build.VERSION.SDK_INT >= 33) extras.getParcelableArray(Notification.EXTRA_MESSAGES, android.os.Parcelable::class.java)
            else @Suppress("DEPRECATION") extras.getParcelableArray(Notification.EXTRA_MESSAGES)
        val last = msgs?.lastOrNull() as? android.os.Bundle
        val fromMessages = last?.getCharSequence("text")?.toString()
        val big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
        val plain = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
        return listOf(fromMessages, big, plain).firstOrNull { !it.isNullOrBlank() }?.trim()
    }
}
