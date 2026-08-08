import { UserShow } from "../types";

const NOTIFIED_STORAGE_KEY = "NEXTUP_NOTIFIED_EPISODES";
const NOTIFICATIONS_ENABLED_KEY = "NEXTUP_NOTIFICATIONS_ENABLED";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function getNotificationPermissionStatus(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export function areNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === "true";
}

export function setNotificationsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? "true" : "false");
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isNotificationSupported()) return "unsupported";
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
    }
    return permission;
  } catch (err) {
    console.error("Error requesting notification permission:", err);
    return Notification.permission;
  }
}

function getNotifiedEpisodeIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(NOTIFIED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markEpisodeAsNotified(epId: string): void {
  if (typeof window === "undefined") return;
  try {
    const notified = getNotifiedEpisodeIds();
    notified.add(epId);
    // Keep set bounded to last 500 items
    const arr = Array.from(notified).slice(-500);
    localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {
    console.error("Failed to save notified episode:", e);
  }
}

export async function sendLocalNotification(title: string, body: string, icon?: string, tag?: string) {
  if (!isNotificationSupported() || Notification.permission !== "granted") {
    throw new Error("Notifications are not supported or permitted.");
  }

  try {
    // Try using Service Worker registration if available for best mobile/iOS support
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: icon || "/icon-192.png",
          badge: "/icon-192.png",
          tag: tag || "nextup-alert",
          data: { url: window.location.href }
        });
        return;
      }
    }

    // Fallback to native Notification constructor
    new Notification(title, {
      body,
      icon: icon || "/icon-192.png",
      tag: tag || "nextup-alert"
    });
  } catch (err) {
    console.error("Failed to trigger local notification:", err);
    throw err;
  }
}


const inFlightNotifications = new Set<string>();

/**
 * Checks user library for episodes that have aired recently (within last 24h)
 * or are airing today, and fires alerts if they haven't been notified yet.
 */
export async function checkAndNotifyUpcomingEpisodes(shows: UserShow[]) {
  if (!isNotificationSupported() || Notification.permission !== "granted" || !areNotificationsEnabled()) {
    return;
  }

  const notified = getNotifiedEpisodeIds();
  const now = new Date().getTime();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  
  for (const show of shows) {
    if (!show.episodes || show.episodes.length === 0) continue;

    for (const ep of show.episodes) {
      if (!ep.airstamp) continue;
      const airTime = new Date(ep.airstamp).getTime();
      if (isNaN(airTime)) continue;
      
      const isUpcoming = airTime > now;
      const timeDiffMins = Math.round((airTime - now) / 60000);
      
      let title = "";
      let body = "";
      let phaseKey = "";

      if (isUpcoming && timeDiffMins > 0 && timeDiffMins <= 120) {
          phaseKey = `${show.id}_S${ep.season}E${ep.number}_soon`;
          if (!notified.has(phaseKey) && !inFlightNotifications.has(phaseKey)) {
             title = `🔔 Airing Soon: ${show.name}`;
             body = `S${ep.season} E${ep.number} (${ep.name}) airs in ${timeDiffMins} minutes!`;
          }
      } else if (!isUpcoming && airTime >= oneDayAgo) {
          phaseKey = `${show.id}_S${ep.season}E${ep.number}_avail`;
          if (!notified.has(phaseKey) && !inFlightNotifications.has(phaseKey)) {
             title = `🎉 Now Available: ${show.name}`;
             body = `S${ep.season} E${ep.number} (${ep.name}) has officially aired. Tap to watch!`;
          }
      }

      if (title && body && phaseKey) {
        inFlightNotifications.add(phaseKey);
        try {
          await sendLocalNotification(title, body, show.imageUrl, phaseKey);
          markEpisodeAsNotified(phaseKey);
        } catch (e) {
          console.error("Failed to notify", e);
        } finally {
          inFlightNotifications.delete(phaseKey);
        }
      }
    }
  }
}
