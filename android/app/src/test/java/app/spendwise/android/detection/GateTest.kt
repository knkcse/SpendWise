package app.spendwise.android.detection

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GateTest {
    @Test fun bankMessagesPass() {
        assertTrue(Gate.looksLikePayment("Sent Rs.338.00 From HDFC Bank A/C *1111 To Swiggy Ltd On 27/11/26 Ref 700000000001"))
        assertTrue(Gate.looksLikePayment("INR 2,194.00 spent on CanaraBank CreditCard XX4444: APTAMITRA HEALTHCARE P on 27-NOV-26 14:37:47"))
    }
    @Test fun otpsAreDropped() {
        assertFalse(Gate.looksLikePayment("123456 is your OTP for a payment of Rs.500 at Amazon. Do not share."))
        assertFalse(Gate.looksLikePayment("Use one-time password 4411 to pay INR 2,000"))
        assertFalse(Gate.looksLikePayment("Your PIN for Rs 10 txn"))
    }
    @Test fun safetyLinesDoNotDropPayments() {
        assertTrue(Gate.looksLikePayment("Rs 500 debited from A/c XX1111 to ABC. Never share your OTP/PIN with anyone."))
        assertTrue(Gate.looksLikePayment("Rs.250 spent on card. Do not share OTP to anyone."))
    }
    @Test fun textWithoutMoneyIsDropped() = assertFalse(Gate.looksLikePayment("Hi, are you coming tonight?"))
    @Test fun onlyChosenApps() {
        assertTrue(Gate.appAllowed("com.google.android.apps.messaging", emptySet(), true))
        assertFalse(Gate.appAllowed("com.google.android.apps.messaging", emptySet(), false))
        assertFalse(Gate.appAllowed("com.whatsapp", setOf("com.phonepe.app"), true))
        assertTrue(Gate.appAllowed("com.phonepe.app", setOf("com.phonepe.app"), false))
    }
}
