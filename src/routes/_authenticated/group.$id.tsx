import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useProfiles, initials } from "@/lib/tickbell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MessageCircle, Trash2, UserPlus, UserMinus, Crown, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/group/$id")({
  component: GroupPage,
});

type Member = {
  member_row_id: string;
  user_id: string;
  role: string;
  nickname: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status_message: string | null;
};

function GroupPage() {
  const { id } = Route.useParams();
  const userId = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const contacts = useProfiles();

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [nicknameFor, setNicknameFor] = useState<Member | null>(null);
  const [nicknameValue, setNicknameValue] = useState("");

  const group = useQuery({
    queryKey: ["group", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("groups").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const members = useQuery({
    queryKey: ["group-members", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_group_members", { _group_id: id });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  // Realtime: refresh when group_members changes for this group
  useEffect(() => {
    const channel = supabase
      .channel(`group-members-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["group-members", id] });
        qc.invalidateQueries({ queryKey: ["my-groups"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, qc]);

  const myRow = members.data?.find((m) => m.user_id === userId);
  const isAdmin = myRow?.role === "admin";
  const memberIds = new Set((members.data ?? []).map((m) => m.user_id));
  const memberCount = members.data?.length ?? 0;

  const openEdit = () => {
    setEditName(group.data?.name ?? "");
    setEditDesc(group.data?.description ?? "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const { error } = await supabase.from("groups").update({ name: editName.trim(), description: editDesc.trim() || null }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Group updated"); qc.invalidateQueries({ queryKey: ["group", id] }); qc.invalidateQueries({ queryKey: ["my-groups"] }); setEditOpen(false); }
  };

  const addMember = async (uid: string) => {
    const { error } = await supabase.from("group_members").insert({ group_id: id, user_id: uid, role: "member" });
    if (error) toast.error(error.message);
    else { toast.success("Added"); qc.invalidateQueries({ queryKey: ["group-members", id] }); }
  };

  const removeMember = async (rowId: string) => {
    const { error } = await supabase.from("group_members").delete().eq("id", rowId);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["group-members", id] }); }
  };

  const openNickname = (m: Member) => {
    setNicknameFor(m);
    setNicknameValue(m.nickname ?? "");
  };

  const saveNickname = async () => {
    if (!nicknameFor) return;
    const trimmed = nicknameValue.trim();
    const { error } = await supabase
      .from("group_members")
      .update({ nickname: trimmed || null })
      .eq("id", nicknameFor.member_row_id);
    if (error) toast.error(error.message);
    else {
      toast.success("Nickname updated");
      qc.invalidateQueries({ queryKey: ["group-members", id] });
      setNicknameFor(null);
    }
  };

  const leaveGroup = async () => {
    if (!userId) return;
    if (!confirm("Leave this group?")) return;
    const { error } = await supabase.from("group_members").delete().eq("group_id", id).eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Left group");
    qc.invalidateQueries();
    navigate({ to: "/home" });
  };

  const deleteGroup = async () => {
    if (!confirm("Delete this group? This can't be undone.")) return;
    const { error } = await supabase.from("groups").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Group deleted");
    qc.invalidateQueries();
    navigate({ to: "/home" });
  };

  const displayFor = (m: Member) => m.nickname?.trim() || m.display_name || "User";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b">
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate({ to: "/home" })}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="font-semibold">Group info</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <div className="flex flex-col items-center text-center animate-fade-up">
          <div className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center text-primary-foreground text-3xl font-bold shadow-elegant">
            {initials(group.data?.name)}
          </div>
          <h1 className="mt-4 text-2xl font-bold">{group.data?.name}</h1>
          {group.data?.description && <p className="text-sm text-muted-foreground mt-1 max-w-md">{group.data.description}</p>}
          <div className="text-xs text-muted-foreground mt-1">{memberCount} {memberCount === 1 ? "member" : "members"}</div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => navigate({ to: "/chat/$id", params: { id: `group:${id}` } })}>
              <MessageCircle className="w-4 h-4 mr-1.5" /> Open chat
            </Button>
            {isAdmin && (
              <Button size="sm" variant="outline" className="rounded-full" onClick={openEdit}>Edit</Button>
            )}
          </div>
        </div>

        {/* Members */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Members ({memberCount})</h2>
            {isAdmin && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="rounded-full"><UserPlus className="w-4 h-4 mr-1" /> Add</Button>
                </DialogTrigger>
                <DialogContent className="rounded-3xl">
                  <DialogHeader><DialogTitle>Add members</DialogTitle></DialogHeader>
                  <div className="max-h-72 overflow-y-auto space-y-1">
                    {(contacts.data ?? []).filter((c) => !memberIds.has(c.id)).map((c) => (
                      <button key={c.id} onClick={() => addMember(c.id)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted text-left">
                        <Avatar className="h-8 w-8"><AvatarFallback>{initials(c.display_name)}</AvatarFallback></Avatar>
                        <span className="text-sm flex-1">{c.display_name}</span>
                        <UserPlus className="w-4 h-4 text-primary" />
                      </button>
                    ))}
                    {(contacts.data ?? []).filter((c) => !memberIds.has(c.id)).length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-6">Everyone is already a member.</div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="space-y-1 rounded-2xl bg-card shadow-soft p-1.5">
            {members.data?.map((m) => (
              <div key={m.member_row_id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted transition">
                <Avatar className="h-10 w-10">
                  {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                  <AvatarFallback>{initials(displayFor(m))}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1">
                    {displayFor(m)}
                    {m.role === "admin" && <Crown className="w-3.5 h-3.5 text-accent" />}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m.nickname ? `${m.display_name ?? "User"} · ` : ""}{m.role === "admin" ? "Admin" : "Member"}
                  </div>
                </div>
                {isAdmin && (
                  <Button size="icon" variant="ghost" className="rounded-full" onClick={() => openNickname(m)} title="Set nickname">
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && m.user_id !== userId && (
                  <Button size="icon" variant="ghost" className="rounded-full text-destructive hover:bg-destructive/10" onClick={() => removeMember(m.member_row_id)}>
                    <UserMinus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            {memberCount === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">No members yet.</div>
            )}
          </div>
        </section>

        {/* Actions */}
        <div className="space-y-2">
          <Button variant="outline" className="w-full rounded-2xl" onClick={leaveGroup}>
            Leave group
          </Button>
          {isAdmin && (
            <Button variant="outline" className="w-full rounded-2xl text-destructive border-destructive/30 hover:bg-destructive/10" onClick={deleteGroup}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete group
            </Button>
          )}
        </div>
      </div>

      {/* Edit group */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Edit group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-11 rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-11 rounded-xl" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} className="gradient-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set nickname */}
      <Dialog open={!!nicknameFor} onOpenChange={(v) => !v && setNicknameFor(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Nickname (Preferred Name)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Set a per-group nickname for <span className="font-semibold">{nicknameFor?.display_name}</span>.
              This only shows inside this group and doesn't change their profile name.
            </p>
            <div className="space-y-1.5">
              <Label>Nickname</Label>
              <Input
                value={nicknameValue}
                onChange={(e) => setNicknameValue(e.target.value)}
                placeholder="e.g. Lakshmi – HR"
                className="h-11 rounded-xl"
                onKeyDown={(e) => { if (e.key === "Enter") saveNickname(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNicknameFor(null)}>Cancel</Button>
            <Button onClick={saveNickname} className="gradient-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
