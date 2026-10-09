package com.yigit.orendapass;

import android.app.Activity;
import android.app.PendingIntent;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;

import java.util.Collections;

/**
 * Gets an access token for the app's own folder in the user's Google Drive.
 * Google Play services keeps the sign-in; the app never sees a password or a long-lived token.
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {
    private static final String DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        consentLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(), this::onConsentResult);
    }

    private AuthorizationClient client() {
        return Identity.getAuthorizationClient(getActivity());
    }

    /**
     * interactive: true  - may show Google's account and permission screens
     *              false - only succeeds when the user already allowed access
     * Resolves { token } or { canceled: true }.
     */
    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_APPDATA)))
            .build();

        client().authorize(request)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    finish(call, result);
                    return;
                }
                PendingIntent consent = result.getPendingIntent();
                if (!interactive || consent == null) {
                    canceled(call);
                    return;
                }
                if (pendingCall != null) canceled(pendingCall);
                pendingCall = call;
                consentLauncher.launch(new IntentSenderRequest.Builder(consent.getIntentSender()).build());
            })
            .addOnFailureListener(error -> call.reject("Google'a bağlanılamadı: " + error.getMessage()));
    }

    private void onConsentResult(ActivityResult activityResult) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            canceled(call);
            return;
        }
        try {
            finish(call, client().getAuthorizationResultFromIntent(activityResult.getData()));
        } catch (Exception error) {
            call.reject("Google'a bağlanılamadı: " + error.getMessage());
        }
    }

    private void finish(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) {
            canceled(call);
            return;
        }
        JSObject response = new JSObject();
        response.put("token", token);
        call.resolve(response);
    }

    private void canceled(PluginCall call) {
        JSObject response = new JSObject();
        response.put("canceled", true);
        call.resolve(response);
    }

    /** Forgets an access token Google no longer accepts, so the next authorize() returns a fresh one. */
    @PluginMethod
    public void clearToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.resolve();
            return;
        }
        client().clearToken(ClearTokenRequest.builder().setToken(token).build())
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(error -> call.resolve());
    }
}
