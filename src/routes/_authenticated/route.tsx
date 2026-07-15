import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { IncomingBellListener } from "@/components/incoming-bell";
import { MessageNotifier } from "@/components/message-notifier";
import { BellResponseListener } from "@/components/bell-response-listener";
import { registerPushForCurrentUser } from "@/lib/push";

function AuthedShell() {
  useEffect(() => { registerPushForCurrentUser(); }, []);
  return (
    <>
      <Outlet />
      <IncomingBellListener />
      <MessageNotifier />
      <BellResponseListener />
    </>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedShell,
});
