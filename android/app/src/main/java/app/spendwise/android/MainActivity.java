package app.spendwise.android;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import app.spendwise.android.detection.PaymentDetectionPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PaymentDetectionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
