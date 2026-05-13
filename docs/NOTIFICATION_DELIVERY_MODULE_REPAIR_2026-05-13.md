# Notification Delivery Module Repair

Date: 2026-05-13
Module: notification_delivery
Classification: USABLE / PASSED

Front-end Paths Verified:
- renderNotificationsCenter calls getNotifications with limit 50.
- markAndReadNotif calls markNotificationRead with notification id.
- _loadNotifBadge calls getUnreadCount.

Backend Paths Verified:
- getNotifications requires notification_delivery.view.
- getNotificationById requires notification_delivery.view.
- markNotificationRead requires notification_delivery.view.
- getUnreadCount requires notification_delivery.view.

Initial Verification:
- Login manifest confirmed notification_delivery is enabled.
- Login manifest confirmed notification_delivery.view is granted.
- getNotifications returned success true.
- getUnreadCount returned success true.

Problem Found:
- markNotificationRead used update() with the wrong argument order.
- This caused D1_TYPE_ERROR when marking a notification as read.

Repair Applied:
- markNotificationRead now uses update(db, "notifications", dataObject, "id", notificationId).

Live API Verification:
- Inserted temporary notification NTF_TEST_20260513_01 for user USRmo8wmd27oewn.
- getNotifications returned the inserted unread notification.
- getUnreadCount before mark returned 1.
- markNotificationRead returned success true.
- getUnreadCount after mark returned 0.

Status:
notification_delivery module repaired and verified end-to-end.
