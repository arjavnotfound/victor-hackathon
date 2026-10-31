package app.teamvictor.check;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NetworkCheckPlugin.class); // our own plugin must be registered before the bridge starts
        super.onCreate(savedInstanceState);
    }
}
