import { savePushSubscription } from "./push.functions";

// Public VAPID key — safe to expose in the client. Override it with
// VITE_VAPID_PUBLIC_KEY when you generate your own VAPID pair.
const DEFAULT_VAPID_PUBLIC_KEY =
  "BMwofsLKVUuJKCe-riQRocm5SZuSY17dH8l9gOjq972FiHTGi9aSXKXnRBaKHcisThG6BlJcLvfyC_-Hn9XBspQ";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;

export type PushNotificationStatus = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  reason?: string;
};

type PushRegistrationResult = {
  ok: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  reason?: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function unsupported(reason: string): PushRegistrationResult {
  return { ok: false, permission: "unsupported", subscribed: false, reason };
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.isSecureContext
  );
}

async function getTickBellServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

async function subscribeAndSave(registration: ServiceWorkerRegistration) {
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Browser did not return a complete push subscription");
  }

  await savePushSubscription({
    data: {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent,
    },
  });
}

async function configurePushNotifications(requestPermission: boolean): Promise<PushRegistrationResult> {
  if (!isPushSupported()) {
    return unsupported("Push notifications require HTTPS and browser Web Push support.");
  }

  try {
    let permission = Notification.permission;
    if (permission === "default" && requestPermission) {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      const reason = permission === "denied"
        ? "Notifications are blocked in this browser. Enable them in site settings."
        : "Tap Enable alerts to allow notifications.";
      return { ok: false, permission, subscribed: false, reason };
    }

    const registration = await getTickBellServiceWorker();
    await subscribeAndSave(registration);
    return { ok: true, permission, subscribed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("push registration failed", err);
    return { ok: false, permission: Notification.permission, subscribed: false, reason: message };
  }
}

export async function getPushNotificationStatus(): Promise<PushNotificationStatus> {
  if (!isPushSupported()) {
    return { supported: false, permission: "unsupported", subscribed: false, reason: "This browser does not support Web Push." };
  }

  try {
    const registration = await getTickBellServiceWorker();
    const subscription = await registration.pushManager.getSubscription();
    return { supported: true, permission: Notification.permission, subscribed: !!subscription };
  } catch (err) {
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function enablePushNotifications(): Promise<PushRegistrationResult> {
  return configurePushNotifications(true);
}

export async function registerPushForCurrentUser(): Promise<void> {
  await configurePushNotifications(false);
}
