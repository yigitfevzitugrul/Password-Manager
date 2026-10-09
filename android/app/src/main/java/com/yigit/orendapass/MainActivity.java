package com.yigit.orendapass;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Passwords must not show up in screenshots, screen recordings or the recent apps list
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        registerPlugin(GoogleDrivePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
