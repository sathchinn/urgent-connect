import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useMyGroups, useMyProfile, useProfiles, initials, playBellSound } from "@/lib/tickbell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Bell, LogOut, MessageCircle, Plus, Search, Users, Moon, Sun, Settings, ChevronRight, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useTheme } from "@/components/theme-provider";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

function HomePage() {
  const profile = useMyProfile();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center shadow-elegant">
            <Bell className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-bold tracking-tight leading-tight">TickBell</div>
            <div className="text-xs text-muted-foreground leading-tight">When every second matters</div>
          </div>
          <Button variant="ghost" size="icon" onClick={toggle} className="rounded-full">
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
          <Link to="/profile">
            <Avatar className="h-9 w-9 ring-2 ring-primary/20 hover:ring-primary/40 transition">
              {profile.data?.avatar_url && <AvatarImage src={profile.data.avatar_url} />}
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                {initials(profile.data?.display_name ?? "?")}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-24 pt-4">
        <Tabs defaultValue="bell" className="w-full">
          <TabsList className="grid grid-cols-3 w-full h-12 p-1 rounded-2xl bg-muted">
            <TabsTrigger value="bell" className="rounded-xl data-[state=active]:shadow-soft"><Bell className="w-4 h-4 mr-1.5" />Bell</TabsTrigger>
            <TabsTrigger value="chats" className="rounded-xl data-[state=active]:shadow-soft"><Users className="w-4 h-4 mr-1.5" />Groups</TabsTrigger>
            <TabsTrigger value="contacts" className="rounded-xl data-[state=active]:shadow-soft"><MessageCircle className="w-4 h-4 mr-1.5" />Contacts</TabsTrigger>
          </TabsList>

          <TabsContent value="bell" className="mt-6"><BellTab /></TabsContent>
          <TabsContent value="chats" className="mt-6"><ChatsTab /></TabsContent>
          <TabsContent value="contacts" className="mt-6"><ContactsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ================= Bell Tab ================= */
function BellTab() {
  const userId = useCurrentUser();
  const groups = useMyGroups();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [ringing, setRinging] = useState(false);
  const qc = useQueryClient();

  // Auto-pick first group
  const activeGroupId = selectedGroup ?? groups.data?.[0]?.id ?? null;
  const activeGroup = groups.data?.find((g) => g.id === activeGroupId);

  const history = useQuery({
    queryKey: ["bell-history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bells")
        .select("*, groups(name), sender:profiles!bells_sender_id_profile_fkey(display_name, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ringGroup = async () => {
    if (!activeGroupId || !userId) {
      toast.error("Create or join a group first");
      return;
    }
    setRinging(true);
    playBellSound();
    const { data, error } = await supabase.rpc("send_bell", { _recipient_id: null as unknown as string, _group_id: activeGroupId });
    setTimeout(() => setRinging(false), 900);
    if (error) return toast.error(error.message);
    const res = data as { ok: boolean; error?: string; warning?: boolean; blocked?: boolean } | null;
    if (!res?.ok) return toast.error(res?.error ?? "Could not send bell");
    if (res.warning) toast.warning("One more Bell attempt within the next 2 minutes will temporarily disable Bell access.");
    else toast.success(`🔔 Rang ${activeGroup?.name}`);
    qc.invalidateQueries({ queryKey: ["bell-history"] });
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Group selector */}
      {groups.data && groups.data.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {groups.data.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g.id)}
              className={`flex-shrink-0 px-4 h-10 rounded-full text-sm font-medium border transition ${
                g.id === activeGroupId
                  ? "gradient-primary text-primary-foreground border-transparent shadow-elegant"
                  : "bg-card hover:bg-secondary border-border"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* Big bell button */}
      <div className="flex flex-col items-center py-6">
        <button
          onClick={ringGroup}
          disabled={!activeGroupId || ringing}
          className={`relative w-48 h-48 rounded-full gradient-bell text-primary-foreground flex flex-col items-center justify-center shadow-bell hover:scale-105 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed ${
            ringing ? "animate-bell-pulse" : ""
          }`}
        >
          <Bell className={`w-20 h-20 ${ringing ? "animate-bell-shake" : ""}`} strokeWidth={2.2} />
          <span className="mt-2 text-sm font-bold tracking-wider uppercase">Ring Everyone</span>
        </button>
        <p className="mt-6 text-center text-sm text-muted-foreground max-w-xs">
          {activeGroup
            ? <>Rings all {" "}<span className="font-semibold text-foreground">{activeGroup.name}</span>{" "}members instantly.</>
            : "Create a group to start ringing."}
        </p>
      </div>

      {/* History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Bells</h3>
        </div>
        <div className="space-y-2">
          {history.data?.length === 0 && (
            <div className="text-center py-10 text-sm text-muted-foreground rounded-2xl bg-muted/40">
              No bells yet. Press the button above 🔔
            </div>
          )}
          {history.data?.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-3 rounded-2xl bg-card shadow-soft">
              <Avatar className="h-10 w-10">
                {b.sender?.avatar_url && <AvatarImage src={b.sender.avatar_url} />}
                <AvatarFallback className="bg-accent/20 text-accent">{initials(b.sender?.display_name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-semibold">{b.sender_id === userId ? "You" : b.sender?.display_name ?? "Someone"}</span>
                  {" "}rang{" "}
                  <span className="font-medium">{b.groups?.name ?? (b.recipient_id === userId ? "you" : "a contact")}</span>
                </div>
                <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}</div>
              </div>
              <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center">
                <Bell className="w-4 h-4 text-accent" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= Chats Tab ================= */
function ChatsTab() {
  const userId = useCurrentUser();
  const groups = useMyGroups();
  const [query, setQuery] = useState("");

  // Last DM per counterpart
  const dms = useQuery({
    queryKey: ["dms", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, sender:profiles!messages_sender_id_profile_fkey(display_name, avatar_url), recipient:profiles!messages_recipient_id_profile_fkey(display_name, avatar_url)")
        .not("recipient_id", "is", null)
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const map = new Map<string, typeof data[number]>();
      for (const m of data ?? []) {
        const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
        if (other && !map.has(other)) map.set(other, m);
      }
      return Array.from(map.entries()).map(([otherId, m]) => ({ otherId, message: m }));
    },
  });

  const filteredGroups = (groups.data ?? []).filter((g) => g.name.toLowerCase().includes(query.toLowerCase()));
  const filteredDms = (dms.data ?? []).filter(({ message }) => {
    const name = message.sender_id === userId ? message.recipient?.display_name : message.sender?.display_name;
    return (name ?? "").toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" className="pl-9 h-11 rounded-2xl bg-muted border-0" />
        </div>
        <CreateGroupButton />
      </div>

      <div className="space-y-1">
        {filteredGroups.length === 0 && filteredDms.length === 0 && (
          <div className="text-center py-16 rounded-2xl bg-muted/40">
            <MessageCircle className="w-10 h-10 mx-auto text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">No conversations yet.</p>
            <p className="text-xs text-muted-foreground">Create a group or say hi from Contacts.</p>
          </div>
        )}
        {filteredGroups.map((g) => (
          <Link key={g.id} to="/chat/$id" params={{ id: `group:${g.id}` }} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-muted transition">
            <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-primary-foreground font-bold shadow-elegant">
              {initials(g.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{g.name}</div>
              <div className="text-xs text-muted-foreground truncate">{g.description ?? "Group chat"}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        ))}
        {filteredDms.map(({ otherId, message }) => {
          const other = message.sender_id === userId ? message.recipient : message.sender;
          return (
            <Link key={otherId} to="/chat/$id" params={{ id: `dm:${otherId}` }} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-muted transition">
              <Avatar className="h-12 w-12">
                {other?.avatar_url && <AvatarImage src={other.avatar_url} />}
                <AvatarFallback className="bg-accent/20 text-accent">{initials(other?.display_name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{other?.display_name ?? "User"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {message.sender_id === userId && "You: "}
                  {message.content}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(message.created_at), { addSuffix: false })}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ================= Contacts Tab ================= */
function ContactsTab() {
  const userId = useCurrentUser();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [phoneQuery, setPhoneQuery] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const contacts = useQuery({
    queryKey: ["contacts", userId, query],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase.from("profiles").select("*").neq("id", userId!);
      const term = query.trim();
      if (term) {
        const like = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
        q = q.or(`display_name.ilike.${like},email.ilike.${like}`);
      }
      const { data, error } = await q.order("display_name").limit(200);
      console.log("Current User ID:", userId);
      console.log("Contacts Data:", data);
      console.log("Contacts Error:", error);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = contacts.data ?? [];

  const ringUser = async (targetId: string, name: string) => {
    if (!userId) return;
    playBellSound();
    const { data, error } = await supabase.rpc("send_bell", { _recipient_id: targetId, _group_id: null as unknown as string });
    if (error) return toast.error(error.message);
    const res = data as { ok: boolean; error?: string; warning?: boolean; blocked?: boolean } | null;
    if (!res?.ok) return toast.error(res?.error ?? "Could not send bell");
    if (res.warning) toast.warning("One more Bell attempt within the next 2 minutes will temporarily disable Bell access.");
    else toast.success(`🔔 Rang ${name}`);
  };

  const addByPhone = async () => {
    const clean = phoneQuery.trim().replace(/[\s()-]/g, "");
    if (!clean) return;
    if (!/^\+?[0-9]{7,15}$/.test(clean)) {
      toast.error("Enter a valid phone number");
      return;
    }
    setLookingUp(true);
    const { data: rows, error } = await supabase.rpc("find_user_by_phone", { _phone: clean });
    const data = Array.isArray(rows) ? rows[0] ?? null : null;
    setLookingUp(false);
    if (error) return toast.error(error.message);
    if (!data) return toast.error("No TickBell user found with that number");
    if (data.id === userId) return toast.error("That's your own number");
    toast.success(`Found ${data.display_name}`);
    setPhoneQuery("");
    qc.invalidateQueries({ queryKey: ["contacts"] });
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className="pl-9 h-11 rounded-2xl bg-muted border-0"
        />
      </div>

      <button
        onClick={() => setShowPhone((v) => !v)}
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
      >
        {showPhone ? "− Hide phone lookup" : "+ Find by phone number"}
      </button>

      {showPhone && (
        <div className="rounded-2xl bg-card shadow-soft p-3 space-y-2">
          <div className="flex gap-2">
            <Input
              value={phoneQuery}
              onChange={(e) => setPhoneQuery(e.target.value)}
              placeholder="+1 555 123 4567"
              inputMode="tel"
              type="tel"
              className="h-11 rounded-xl bg-muted border-0"
              onKeyDown={(e) => { if (e.key === "Enter") addByPhone(); }}
            />
            <Button onClick={addByPhone} disabled={lookingUp} className="h-11 rounded-xl gradient-primary text-primary-foreground px-4">
              {lookingUp ? "…" : <><Plus className="w-4 h-4 mr-1" />Add</>}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Finds any TickBell user who saved this number on their profile.</p>
        </div>
      )}

      <div className="space-y-1">
        {contacts.isLoading && (
          <div className="text-center py-10 text-sm text-muted-foreground">Loading contacts…</div>
        )}
        {!contacts.isLoading && filtered.length === 0 && (
          <div className="text-center py-16 rounded-2xl bg-muted/40">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">
              {query ? "No users match your search." : "No other users yet."}
            </p>
            <p className="text-xs text-muted-foreground">Invite friends — they'll appear here once they sign up.</p>
          </div>
        )}
        {filtered.map((c) => (
          <Link
            key={c.id}
            to="/chat/$id"
            params={{ id: `dm:${c.id}` }}
            className="flex items-center gap-3 p-3 rounded-2xl bg-card shadow-soft hover:bg-muted transition"
          >
            <Avatar className="h-11 w-11">
              {c.avatar_url && <AvatarImage src={c.avatar_url} />}
              <AvatarFallback className="bg-primary/15 text-primary font-semibold">{initials(c.display_name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{c.display_name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {(c as { email?: string | null }).email ?? (c as { phone?: string | null }).phone ?? c.status_message ?? "Available"}
              </div>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full h-10 w-10 text-accent hover:bg-accent/10"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); ringUser(c.id, c.display_name); }}
              >
                <Bell className="w-5 h-5" />
              </Button>
              <div className="rounded-full h-10 w-10 flex items-center justify-center text-primary">
                <MessageCircle className="w-5 h-5" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ================= Create Group ================= */
function CreateGroupButton() {
  const userId = useCurrentUser();
  const contacts = useProfiles();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const toggle = (id: string) => {
    setMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!userId || !name.trim()) return;
    setLoading(true);
    try {
      const { data: group, error } = await supabase
        .from("groups")
        .insert({ name: name.trim(), description: desc.trim() || null, created_by: userId })
        .select()
        .single();
      if (error) throw error;
      const rows = [
        { group_id: group.id, user_id: userId, role: "admin" as const },
        ...Array.from(members).map((id) => ({ group_id: group.id, user_id: id, role: "member" as const })),
      ];
      const { error: mErr } = await supabase.from("group_members").insert(rows);
      if (mErr) throw mErr;
      toast.success(`Group "${group.name}" created`);
      qc.invalidateQueries();
      setOpen(false);
      setName(""); setDesc(""); setMembers(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-11 w-11 rounded-2xl gradient-primary shadow-elegant"><Plus className="w-5 h-5" /></Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl max-w-md">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>Ring a whole team with one tap.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trading Desk" className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What's this group for?" className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>Members ({members.size})</Label>
            <div className="max-h-52 overflow-y-auto space-y-1 rounded-xl border p-1.5">
              {(contacts.data ?? []).filter((c) => c.id !== userId).map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition ${
                    members.has(c.id) ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <Avatar className="h-8 w-8">
                    {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                    <AvatarFallback className="text-xs">{initials(c.display_name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm">{c.display_name}</span>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${members.has(c.id) ? "bg-primary border-primary" : "border-border"}`}>
                    {members.has(c.id) && <div className="w-2 h-2 bg-primary-foreground rounded-full" />}
                  </div>
                </button>
              ))}
              {(contacts.data ?? []).filter((c) => c.id !== userId).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">No other users yet. You can add members later.</div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || loading} className="gradient-primary text-primary-foreground">
            {loading ? "Creating..." : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
