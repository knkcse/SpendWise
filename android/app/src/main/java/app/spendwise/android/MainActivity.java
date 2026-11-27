package app.spendwise.android;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import app.spendwise.android.detection.PaymentDetectionPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PaymentDetectionPlugin.class);
        super.onCreate(savedInstanceState);
        takeShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        takeShare(intent);
    }

    /** A bank SMS shared to SpendWise from the Messages app ("Share" › SpendWise). */
    private void takeShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text != null && text.length() > 0) PaymentDetectionPlugin.Companion.shared(text.toString());
        intent.setAction(Intent.ACTION_MAIN); // don't add it twice on rotation
    }
}
