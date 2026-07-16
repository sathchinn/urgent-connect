import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, showBrowserNotification } from "@/lib/tickbell";
import { toast } from "sonner";

type ResponseRow = {
  id: string;
  bell_id: string;
  user_id: string;
  response: string;
  created_at: string;
};

/**
 * Listens for responses to bells the current user has sent, and
 * surfaces them as a toast + browser notification in real time.
 */
export function BellResponseListener() {
  const userId = useCurrentUser();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("bell-responses-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bell_responses" },
        async (payload) => {
          const r = payload.new as ResponseRow;
          if (r.user_id === userId) return; // own response, ignore

          // Was this a bell I sent?
          const { data: bell } = await supabase
            .from("bells")
            .select("id, sender_id")
            .eq("id", r.bell_id)
            .maybeSingle();
          if (!bell || bell.sender_id !== userId) return;

          const { data: responder } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", r.user_id)
            .maybeSingle();
          const name = responder?.display_name ?? "Someone";

          let msg = "";
          let icon = "";
          if (r.response === "accept") { msg = `${name} accepted your bell.`; icon = "✅"; }
          else if (r.response === "rejected") { msg = `${name} rejected your bell.`; icon = "❌"; }
          else if (r.response === "busy") { msg = `${name} is currently busy.`; icon = "⛔"; }
          else return;

          toast(`${icon} ${msg}`);
          showBrowserNotification("Bell response", msg, `bell-${r.bell_id}`);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return null;
}
