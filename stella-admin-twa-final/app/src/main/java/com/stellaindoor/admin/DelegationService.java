package com.stellaindoor.admin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {

    // Android locks a channel's importance at creation time, and the TWA
    // library would otherwise create it at IMPORTANCE_DEFAULT (no heads-up).
    // We own the channel instead: created HIGH, and every delegated web
    // notification is rebuilt onto it, so banners pop by default.
    private static final String CHANNEL_ID = "stella_admin_alerts";
    private static final String CHANNEL_NAME = "Booking alerts";

    @Override
    public void onCreate() {
        super.onCreate();
        ensureHighImportanceChannel();
    }

    private void ensureHighImportanceChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Bookings, cancellations and admin alerts");
        channel.enableVibration(true);
        channel.setShowBadge(true);
        nm.createNotificationChannel(channel);
    }

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId,
            Notification notification, String channelName) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ensureHighImportanceChannel();
            NotificationManager nm = getSystemService(NotificationManager.class);
            Notification rebuilt = Notification.Builder
                    .recoverBuilder(this, notification)
                    .setChannelId(CHANNEL_ID)
                    .build();
            nm.notify(platformTag, platformId, rebuilt);
            return true;
        }
        return super.onNotifyNotificationWithChannel(
                platformTag, platformId, notification, channelName);
    }

    @Override
    public boolean onAreNotificationsEnabled(String channelName) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ensureHighImportanceChannel();
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (!nm.areNotificationsEnabled()) return false;
            NotificationChannel channel = nm.getNotificationChannel(CHANNEL_ID);
            return channel == null
                    || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        return super.onAreNotificationsEnabled(channelName);
    }
}
