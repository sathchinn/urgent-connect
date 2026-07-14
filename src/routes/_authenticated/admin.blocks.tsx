import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, initials } from "@/lib/tickbell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldOff, ShieldAlert, Plus, Minus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/blocks")({
  component: BlocksPage,
});

type BlockRow = {
  id: string;
  user_id: string;
  blocked_until: string;
  reason: string;
  created_at: string;
  profile?: { display_name: string | null; avatar_url: string | null; email: string | null } | null;
};

function BlocksPage() {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();

  useEffect(() => {
    if (isAdmin.isFetched && !isAdmin.data) {
      toast.error("Admins only");
      navigate({ to: "/home" });
    }
  }, [isAdmin.isFetched, isAdmin.data, navigate]);

  const blocks = useQuery({
    queryKey: ["bell-blocks"],
    enabled: !!isAdmin.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bell_blocks")
        .select("id, user_id, blocked_until, reason, created_at")
        .order("blocked_until", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [] as BlockRow[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, email")
        .in("id", ids);
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null })) as BlockRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-bell-blocks")
      .on("postgres_changes", { event: "*", schema: "public", table: "bell_blocks" }, () => {
        qc.invalidateQueries({ queryKey: ["bell-blocks"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const unblock = async (id: string) => {
    const { error } = await supabase.from("bell_blocks").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Unblocked"); qc.invalidateQueries({ queryKey: ["bell-blocks"] }); }
  };

  const extend = async (row: BlockRow, hours: number) => {
    const base = new Date(row.blocked_until).getTime();
    const next = new Date(base + hours * 3600 * 1000).toISOString();
    const { error } = await supabase.from("bell_blocks").update({ blocked_until: next }).eq("id", row.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bell-blocks"] });
  };

  const now = Date.now();
  const active = (blocks.data ?? []).filter((b) => new Date(b.blocked_until).getTime() > now);
  const past = (blocks.data ?? []).filter((b) => new Date(b.blocked_until).getTime() <= now);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b">
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate({ to: "/home" })}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="font-semibold flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-accent" /> Bell Abuse — Blocks</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="rounded-2xl bg-card shadow-soft p-4 text-sm text-muted-foreground">
          Users are automatically blocked from ringing for 3 hours after 4 Bells to the same recipient within 2 minutes.
          The 3rd attempt shows a warning.
        </div>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Active blocks ({active.length})
          </h2>
          <div className="space-y-1 rounded-2xl bg-card shadow-soft p-1.5">
            {active.map((b) => (
              <BlockRowView key={b.id} row={b} onUnblock={() => unblock(b.id)} onExtend={(h) => extend(b, h)} active />
            ))}
            {active.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">No active blocks.</div>}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Expired</h2>
          <div className="space-y-1 rounded-2xl bg-card shadow-soft p-1.5">
            {past.slice(0, 20).map((b) => (
              <BlockRowView key={b.id} row={b} onUnblock={() => unblock(b.id)} onExtend={(h) => extend(b, h)} />
            ))}
            {past.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">No expired blocks.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function BlockRowView({ row, onUnblock, onExtend, active }: { row: BlockRow; onUnblock: () => void; onExtend: (hours: number) => void; active?: boolean }) {
  const until = new Date(row.blocked_until);
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted transition">
      <Avatar className="h-10 w-10">
        {row.profile?.avatar_url && <AvatarImage src={row.profile.avatar_url} />}
        <AvatarFallback>{initials(row.profile?.display_name ?? row.profile?.email ?? "?")}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{row.profile?.display_name ?? row.profile?.email ?? row.user_id.slice(0, 8)}</div>
        <div className="text-xs text-muted-foreground truncate">
          {active ? "Until" : "Ended"} {until.toLocaleString()} · {row.reason || "abuse"}
        </div>
      </div>
      {active && (
        <>
          <Button size="icon" variant="ghost" className="rounded-full" title="Extend by 1 hour" onClick={() => onExtend(1)}>
            <Plus className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="rounded-full" title="Shorten by 1 hour" onClick={() => onExtend(-1)}>
            <Minus className="w-4 h-4" />
          </Button>
        </>
      )}
      <Button size="sm" variant="outline" className="rounded-full" onClick={onUnblock}>
        <ShieldOff className="w-4 h-4 mr-1" /> {active ? "Unblock" : "Clear"}
      </Button>
    </div>
  );
}
