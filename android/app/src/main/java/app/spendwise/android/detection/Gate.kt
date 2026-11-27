package app.spendwise.android.detection

/**
 * Decides, before anything is stored, whether a notification could be a payment message.
 * Pure Kotlin (no Android types) so it is covered by plain JUnit tests.
 */
object Gate {
    /** SMS apps whose notifications carry bank messages. */
    val SMS_APPS = setOf(
        "com.google.android.apps.messaging",       // Google Messages
        "com.samsung.android.messaging",           // Samsung Messages
        "com.android.mms",                         // Xiaomi / Redmi / POCO and others
        "com.android.messaging",                   // AOSP Messaging
        "com.motorola.messaging",
        "com.oneplus.mms",
        "com.coloros.mms", "com.oplus.mms",        // OPPO / realme
        "com.vivo.message",
        "com.microsoft.android.smsorganizer",
        "com.truecaller",
    )

    // Never kept: messages that carry a one-time password, PIN or code. Safety lines such as
    // "Never share your OTP" in a normal payment message don't count; giving a code does.
    private const val CODE = """(otp|one[\s-]?time[\s-]?password|verification code|security code|login code|auth(?:entication)? code|passcode|password|m?pin|cvv)"""
    private val SECRET = Regex(
        """\b$CODE\b\s*(is|:|for|-)|\b(is|use|enter)\s+(your\s+|the\s+)?$CODE\b|\b\d{4,8}\s+is\s+(your|the)\b""",
        RegexOption.IGNORE_CASE,
    )
    // Must mention money: Rs, Rs., INR or the rupee sign followed by a number.
    private val MONEY = Regex("""(rs\.?|inr|₹)\s*[0-9][0-9,]*(\.[0-9]+)?""", RegexOption.IGNORE_CASE)

    /** True when [pkg] is one of the apps the user switched on (SMS apps count when "bank" is on). */
    fun appAllowed(pkg: String, allowed: Set<String>, smsEnabled: Boolean): Boolean =
        pkg in allowed || (smsEnabled && pkg in SMS_APPS)

    /** True when the text may be a payment message worth parsing. OTP-like text is always rejected. */
    fun looksLikePayment(text: String): Boolean = !SECRET.containsMatchIn(text) && MONEY.containsMatchIn(text)
}
