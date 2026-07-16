import webpush from "web-push";

type Kind = "bell" | "message";

let vapidReady = false;
function initVapid() {
  if (vapidReady) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || "mailto:support@tickbell.app";
  if (!pub || !priv) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails(subj, pub, priv);
  vapidReady = true;
}

export async function sendPushForEvent(kind: Kind, id: string, senderUserId: string) {
  initVapid();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Determine recipients + notification payload
  let recipients: string[] = [];
  let title = "TickBell";
  let body = "";
  let url = "/home";
  let tag = `${kind}-${id}`;

  const { data: sender } = await supabaseAdmin
    .from("profiles").select("display_name").eq("id", senderUserId).maybeSingle();
  const senderName = sender?.display_name ?? "Someone";

  if (kind === "bell") {
    const { data: bell } = await supabaseAdmin
      .from("bells").select("id, sender_id, recipient_id, group_id")
      .eq("id", id).maybeSingle();
    if (!bell) return { ok: false, reason: "bell not found" };
    if (bell.recipient_id) {
      recipients = [bell.recipient_id];
      url = `/chat/dm:${bell.sender_id}`;
    } else if (bell.group_id) {
      const { data: members } = await supabaseAdmin
        .from("group_members").select("user_id").eq("group_id", bell.group_id);
      recipients = (members ?? []).map((m) => m.user_id).filter((u) => u !== senderUserId);
      const { data: g } = await supabaseAdmin.from("groups").select("name").eq("id", bell.group_id).maybeSingle();
      url = `/chat/group:${bell.group_id}`;
      title = `🔔 ${senderName} rang ${g?.name ?? "the group"}`;
    }
    if (!title.startsWith("🔔")) title = `🔔 ${senderName} is ringing you`;
    body = "Tap to respond: Accept, Reject, or Busy";
  } else {
    const { data: msg } = await supabaseAdmin
      .from("messages").select("id, sender_id, recipient_id, group_id, content")
      .eq("id", id).maybeSingle();
    if (!msg) return { ok: false, reason: "message not found" };
    if (msg.recipient_id) {
      recipients = [msg.recipient_id];
      url = `/chat/dm:${msg.sender_id}`;
      title = senderName;
    } else if (msg.group_id) {
      const { data: members } = await supabaseAdmin
        .from("group_members").select("user_id").eq("group_id", msg.group_id);
      recipients = (members ?? []).map((m) => m.user_id).filter((u) => u !== senderUserId);
      const { data: g } = await supabaseAdmin.from("groups").select("name").eq("id", msg.group_id).maybeSingle();
      url = `/chat/group:${msg.group_id}`;
      title = `${senderName} · ${g?.name ?? "Group"}`;
    }
    body = (msg.content ?? "").slice(0, 140);
  }

  if (recipients.length === 0) return { ok: true, sent: 0 };

  console.log("Recipients:", recipients);
 

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", recipients);
  console.log("Subscriptions found:", subs);
  const payload = JSON.stringify({ title, body, url, kind, tag });
  console.log("Push payload:", payload);

  let sent = 0;
  const stale: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: kind === "bell" ? 60 : 3600, urgency: kind === "bell" ? "high" : "normal" },
        );
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) stale.push(s.id);
      }
    }),
  );
  if (stale.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
  }
  return { ok: true, sent };
}
