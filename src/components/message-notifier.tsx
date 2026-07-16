import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, playMessageChime, showBrowserNotification } from "@/lib/tickbell";

type Msg = {
  id: string;
  sender_id: string;
  group_id: string | null;
  recipient_id: string | null;
  content: string;
  created_at: string;
};

export function MessageNotifier() {
  const userId = useCurrentUser();
  const location = useLocation();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("messages-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const m = payload.new as Msg;
        if (m.sender_id === userId) return;

        // Determine if this message targets me
        const isDMToMe = m.group_id === null && m.recipient_id === userId;
        let isGroupForMe = false;
        if (m.group_id) {
          const { data } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", m.group_id)
            .eq("user_id", userId)
            .maybeSingle();
          isGroupForMe = !!data;
        }
        if (!isDMToMe && !isGroupForMe) return;

        // Skip chime if user is already viewing this exact chat
        const openChatId = location.pathname.startsWith("/chat/")
          ? decodeURIComponent(location.pathname.slice("/chat/".length))
          : null;
        const thisChatId = m.group_id ? `group:${m.group_id}` : `dm:${m.sender_id}`;
        const viewing = openChatId === thisChatId && document.visibilityState === "visible";
        if (viewing) return;

        // Fetch sender name for a friendly notification
        const { data: sender } = await supabase
          .from("profiles").select("display_name").eq("id", m.sender_id).maybeSingle();
        const senderName = sender?.display_name ?? "New message";

        let title = senderName;
        if (m.group_id) {
          const { data: g } = await supabase.from("groups").select("name").eq("id", m.group_id).maybeSingle();
          if (g?.name) title = `${senderName} · ${g.name}`;
        }

        playMessageChime();
        showBrowserNotification(title, m.content, thisChatId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, location.pathname]);

  return null;
}
