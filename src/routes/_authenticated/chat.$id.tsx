import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, initials, playBellSound } from "@/lib/tickbell";
import { dispatchPush } from "@/lib/push.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Bell, Send, Users } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/chat/$id")({
  component: ChatPage,
});

type Message = {
  id: string;
  sender_id: string;
  group_id: string | null;
  recipient_id: string | null;
  content: string;
  created_at: string;
};

function ChatPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const userId = useCurrentUser();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const [kind, target] = id.split(":");
  const isGroup = kind === "group";

  const header = useQuery({
    queryKey: ["chat-header", id],
    enabled: !!target,
    queryFn: async () => {
      if (isGroup) {
        const { data } = await supabase.from("groups").select("*").eq("id", target).maybeSingle();
        return { title: data?.name ?? "Group", subtitle: data?.description ?? null, avatar: data?.avatar_url ?? null, isGroup: true as const };
      }
      const { data } = await supabase.from("profiles").select("display_name, avatar_url, status_message").eq("id", target).maybeSingle();
      return { title: data?.display_name ?? "User", subtitle: data?.status_message ?? null, avatar: data?.avatar_url ?? null, isGroup: false as const };
    },
  });

  const messages = useQuery({
    queryKey: ["messages", id],
    enabled: !!userId && !!target,
    queryFn: async () => {
      const q = supabase.from("messages").select("*").order("created_at", { ascending: true });
      const filtered = isGroup
        ? q.eq("group_id", target)
        : q.is("group_id", null).or(`and(sender_id.eq.${userId},recipient_id.eq.${target}),and(sender_id.eq.${target},recipient_id.eq.${userId})`);
      const { data, error } = await filtered;
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!userId || !target) return;
    const channel = supabase
      .channel(`chat-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        const isMine = isGroup
          ? m.group_id === target
          : m.group_id === null && ((m.sender_id === userId && m.recipient_id === target) || (m.sender_id === target && m.recipient_id === userId));
        if (isMine) {
          qc.setQueryData<Message[]>(["messages", id], (prev = []) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, target, id, isGroup, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data?.length]);

  // Load sender profiles for group chats
  const senderIds = Array.from(new Set((messages.data ?? []).map((m) => m.sender_id)));
  const senders = useQuery({
    queryKey: ["senders", senderIds.sort().join(",")],
    enabled: senderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", senderIds);
      const map: Record<string, { display_name: string; avatar_url: string | null }> = {};
      for (const p of data ?? []) map[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      return map;
    },
  });

  const send = async () => {
    const content = text.trim();
    if (!content || !userId || !target) return;
    setText("");
    const payload = isGroup
      ? { sender_id: userId, group_id: target, recipient_id: null, content }
      : { sender_id: userId, group_id: null, recipient_id: target, content };
    const { data: inserted, error } = await supabase.from("messages").insert(payload).select("id").single();
    if (error) { toast.error(error.message); setText(content); return; }
    if (inserted?.id) {
  dispatchPush({ data: { kind: "message", id: inserted.id } })
    .then((r) => console.log("Message push success:", r))
    .catch((e) => console.error("Message push failed:", e));
}
  };

  const ring = async () => {
    if (!userId || !target) return;
    playBellSound();
    const args = isGroup
      ? { _recipient_id: null as unknown as string, _group_id: target }
      : { _recipient_id: target, _group_id: null as unknown as string };
    const { data, error } = await supabase.rpc("send_bell", args);
    if (error) return toast.error(error.message);
    const res = data as { ok: boolean; error?: string; warning?: boolean; bell_id?: string } | null;
    if (!res?.ok) return toast.error(res?.error ?? "Could not send bell");
    if (res.bell_id) {
      dispatchPush({ data: { kind: "bell", id: res.bell_id } })
        .then((r) => console.log("Bell push success:", r))
        .catch((e) => console.error("Bell push failed:", e));
    }
    if (res.warning) toast.warning("One more Bell attempt within the next 2 minutes will temporarily disable Bell access.");
    else toast.success(`🔔 Rang ${header.data?.title}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b">
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate({ to: "/home" })}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Link to={isGroup ? "/group/$id" : "/home"} params={{ id: target }} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition">
            {isGroup ? (
              <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center text-primary-foreground font-bold shadow-elegant">
                {initials(header.data?.title)}
              </div>
            ) : (
              <Avatar className="h-10 w-10">
                {header.data?.avatar && <AvatarImage src={header.data.avatar} />}
                <AvatarFallback>{initials(header.data?.title)}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{header.data?.title ?? "..."}</div>
              <div className="text-xs text-muted-foreground truncate">
                {isGroup ? "Tap for group info" : header.data?.subtitle ?? ""}
              </div>
            </div>
          </Link>
          <Button size="icon" variant="ghost" className="rounded-full text-accent hover:bg-accent/10" onClick={ring}>
            <Bell className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
          {messages.data?.length === 0 && (
            <div className="text-center py-16 text-sm text-muted-foreground">Say hi 👋</div>
          )}
          {messages.data?.map((m, i) => {
            const mine = m.sender_id === userId;
            const prev = messages.data![i - 1];
            const showAuthor = isGroup && !mine && (!prev || prev.sender_id !== m.sender_id);
            const author = senders.data?.[m.sender_id];
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} animate-fade-up`}>
                <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  {showAuthor && (
                    <div className="text-[11px] font-semibold text-primary pl-3">{author?.display_name ?? "User"}</div>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl shadow-soft ${
                    mine
                      ? "gradient-primary text-primary-foreground rounded-br-md"
                      : "bg-card rounded-bl-md"
                  }`}>
                    <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                  <div className={`text-[10px] text-muted-foreground px-2 ${mine ? "" : ""}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-xl border-t">
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message"
            className="flex-1 h-11 rounded-full bg-muted border-0"
          />
          <Button size="icon" onClick={send} disabled={!text.trim()} className="h-11 w-11 rounded-full gradient-primary text-primary-foreground shadow-elegant disabled:opacity-50">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
