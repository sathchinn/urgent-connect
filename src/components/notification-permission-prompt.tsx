import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  enablePushNotifications,
  getPushNotificationStatus,
  type PushNotificationStatus,
} from "@/lib/push";

export function NotificationPermissionPrompt() {
  const [status, setStatus] = useState<PushNotificationStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushNotificationStatus().then(setStatus).catch(() => {
      setStatus({ supported: false, permission: "unsupported", subscribed: false });
    });
  }, []);

  if (!status?.supported) return null;
  if (status.permission === "granted" && status.subscribed) return null;

  const enable = async () => {
    setBusy(true);
    const result = await enablePushNotifications();
    setBusy(false);
    setStatus(await getPushNotificationStatus());

    if (result.ok) toast.success("Notifications enabled");
    else toast.error(result.reason ?? "Could not enable notifications");
  };

  const blocked = status.permission === "denied";

  return (
    <div className="fixed inset-x-0 bottom-4 z-[90] mx-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-card p-3 shadow-elegant">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <BellRing className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {blocked ? "Notifications blocked" : "Enable TickBell alerts"}
          </div>
          <div className="text-xs text-muted-foreground">
            {blocked ? "Allow notifications in browser settings, then reopen TickBell." : "Required for alerts when TickBell is closed."}
          </div>
        </div>
        {!blocked && (
          <Button size="sm" onClick={enable} disabled={busy} className="rounded-full">
            {busy ? "Enabling" : "Enable"}
          </Button>
        )}
      </div>
    </div>
  );
}