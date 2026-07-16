import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, initials, playBellSound, showBrowserNotification } from "@/lib/tickbell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell as BellIcon, X, Check, CircleSlash } from "lucide-react";
import { toast } from "sonner";

type IncomingBell = {
  id: string;
  sender_id: string;
  group_id: string | null;
  recipient_id: string | null;
  created_at: string;
  senderName?: string;
  senderAvatar?: string | null;
  groupName?: string | null;
};

export function IncomingBellListener() {
  const userId = useCurrentUser();
  const [incoming, setIncoming] = useState<IncomingBell | null>(null);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("bells-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bells" },
        async (payload) => {
          const bell = payload.new as IncomingBell;
          if (bell.sender_id === userId) return; // don't ring self

          // Fetch context: sender + group
          const [{ data: sender }, groupRes] = await Promise.all([
            supabase.from("profiles").select("display_name, avatar_url").eq("id", bell.sender_id).maybeSingle(),
            bell.group_id
              ? supabase.from("groups").select("name").eq("id", bell.group_id).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);

          // Only ring if it targets this user (DM to me, or member of group)
          if (bell.recipient_id && bell.recipient_id !== userId) return;

          const senderName = sender?.display_name ?? "Someone";
          const groupName = groupRes?.data?.name ?? null;

          setIncoming({
            ...bell,
            senderName,
            senderAvatar: sender?.avatar_url ?? null,
            groupName,
          });
          playBellSound();
          showBrowserNotification(
            `🔔 ${senderName} is ringing you`,
            groupName ? `Rang ${groupName}` : "Tap to respond: Accept, Reject, or Busy",
            `bell-${bell.id}`,
            "bell",
            bell.group_id ? `/chat/group:${bell.group_id}` : `/chat/dm:${bell.sender_id}`,
          );
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const respond = async (type: "accept" | "reject" | "busy" | "dismiss") => {
    if (!incoming || !userId) return;
    if (type !== "dismiss") {
      const { error } = await supabase
        .from("bell_responses")
        .upsert({ bell_id: incoming.id, user_id: userId, response: type }, { onConflict: "bell_id,user_id" });
      if (error) toast.error(error.message);
      else {
        const label = type === "accept" ? "Accepted" : type === "reject" ? "Rejected" : "Marked as busy";
        toast.success(label);
      }
    }
    setIncoming(null);
  };

  if (!incoming) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-up">
      <div className="w-full max-w-sm rounded-3xl bg-card shadow-bell overflow-hidden animate-bell-flash">
        <div className="gradient-bell p-8 text-primary-foreground text-center relative">
          <div className="mx-auto w-24 h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shadow-bell">
            <BellIcon className="w-12 h-12 animate-bell-shake" />
          </div>
          <div className="mt-4 text-xs uppercase tracking-widest opacity-80">Incoming Bell</div>
          <div className="mt-1 text-2xl font-bold">{incoming.senderName}</div>
          {incoming.groupName && <div className="text-sm opacity-90">rang · {incoming.groupName}</div>}
        </div>
        <div className="p-4 flex items-center gap-3 border-b">
          <Avatar className="h-10 w-10">
            {incoming.senderAvatar && <AvatarImage src={incoming.senderAvatar} />}
            <AvatarFallback>{initials(incoming.senderName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{incoming.senderName}</div>
            <div className="text-xs text-muted-foreground">{new Date(incoming.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          <Button onClick={() => respond("accept")} className="h-12 rounded-2xl bg-success text-success-foreground hover:opacity-90 flex-col gap-0.5">
            <Check className="w-4 h-4" /><span className="text-xs">Accept</span>
          </Button>
          <Button onClick={() => respond("reject")} className="h-12 rounded-2xl bg-destructive text-destructive-foreground hover:opacity-90 flex-col gap-0.5">
            <X className="w-4 h-4" /><span className="text-xs">Reject</span>
          </Button>
          <Button onClick={() => respond("busy")} variant="secondary" className="h-12 rounded-2xl flex-col gap-0.5">
            <CircleSlash className="w-4 h-4" /><span className="text-xs">Busy</span>
          </Button>
          <Button onClick={() => respond("dismiss")} variant="outline" className="h-12 rounded-2xl flex-col gap-0.5">
            <X className="w-4 h-4" /><span className="text-xs">Dismiss</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
