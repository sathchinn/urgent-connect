import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useCurrentUser() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);
  return userId;
}

export function useMyProfile() {
  const userId = useCurrentUser();
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useIsAdmin() {
  const userId = useCurrentUser();
  return useQuery({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: userId!, _role: "admin" });
      if (error) return false;
      return !!data;
    },
  });
}

export function useMyGroups() {
  const userId = useCurrentUser();
  return useQuery({
    queryKey: ["my-groups", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members")
        .select("role, joined_at, groups(*)")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.groups ? { ...r.groups, myRole: r.role } : null)
        .filter((g): g is NonNullable<typeof g> => g !== null);
    },
  });
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export function playBellSound() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(ctx.destination);
    const now = ctx.currentTime;
    // Louder, richer two-tone bell (6 pulses)
    [880, 1320, 880, 1320, 880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = now + i * 0.26;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.9, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.28);
    });
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 400]);
  } catch { /* ignore */ }
}

export function playMessageChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.6, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch { /* ignore */ }
}

export function requestNotificationPermission() {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
  } catch { /* ignore */ }
}

type BrowserNotificationKind = "bell" | "message" | "bell-response";
type TickBellNotificationOptions = NotificationOptions & {
  badge?: string;
  renotify?: boolean;
  timestamp?: number;
  vibrate?: number[];
};

export function showBrowserNotification(
  title: string,
  body: string,
  tag?: string,
  kind: BrowserNotificationKind = "message",
  url = "/home",
) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const options: TickBellNotificationOptions = {
      body,
      tag: tag || kind,
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url, kind },
      requireInteraction: kind === "bell",
      vibrate: kind === "bell" ? [300, 100, 300, 100, 400, 100, 300] : [120, 60, 120],
    };

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => registration.showNotification(title, options))
        .catch(() => {
          const n = new Notification(title, options);
          if (kind !== "bell") setTimeout(() => n.close(), 6000);
        });
      return;
    }

    const n = new Notification(title, options);
    if (kind !== "bell") setTimeout(() => n.close(), 6000);
  } catch { /* ignore */ }
}
