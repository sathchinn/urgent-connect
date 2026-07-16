import {
  buildPushPayload,
  type PushSubscription as WebPushSubscription,
  type VapidKeys,
} from "@block65/webcrypto-web-push";

type Kind = "bell" | "message";

function getVapid(): VapidKeys {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@tickbell.app";
  if (!publicKey || !privateKey) throw new Error("VAPID keys not configured");
  return { subject, publicKey, privateKey };
}

export async function sendPushForEvent(kind: Kind, id: string, senderUserId: string) {
  const vapid = getVapid();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let recipients: string[] = [];
  let title = "TickBell";
  let body = "";
  let url = "/home";
  const tag = `${kind}-${id}`;

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
      title = `🔔 ${senderName} is ringing you`;
    } else if (bell.group_id) {
      const { data: members } = await supabaseAdmin
        .from("group_members").select("user_id").eq("group_id", bell.group_id);
      recipients = (members ?? []).map((m) => m.user_id).filter((u) => u !== senderUserId);
      const { data: g } = await supabaseAdmin.from("groups").select("name").eq("id", bell.group_id).maybeSingle();
      url = `/chat/group:${bell.group_id}`;
      title = `🔔 ${senderName} rang ${g?.name ?? "the group"}`;
    }
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

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", recipients);

  const payloadData = JSON.stringify({ title, body, url, kind, tag });
  const ttl = kind === "bell" ? 60 : 3600;
  const urgency: "high" | "normal" = kind === "bell" ? "high" : "normal";

  let sent = 0;
  const stale: string[] = [];
  const errors: Array<{ id: string; status?: number; message?: string }> = [];

  await Promise.all(
    (subs ?? []).map(async (s) => {
      const subscription: WebPushSubscription = {
        endpoint: s.endpoint,
        expirationTime: null,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        const payload = await buildPushPayload(
          { data: payloadData, options: { ttl, urgency, topic: tag.slice(0, 32) } },
          subscription,
          vapid,
        );
        const res = await fetch(subscription.endpoint, payload as RequestInit);
        if (res.status >= 200 && res.status < 300) {
          sent++;
        } else if (res.status === 404 || res.status === 410) {
          stale.push(s.id);
          errors.push({ id: s.id, status: res.status, message: "subscription gone" });
        } else {
          const text = await res.text().catch(() => "");
          errors.push({ id: s.id, status: res.status, message: text.slice(0, 200) });
        }
      } catch (err) {
        errors.push({ id: s.id, message: err instanceof Error ? err.message : String(err) });
      }
    }),
  );

  if (stale.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
  }

  if (errors.length) {
    console.error("[push] delivery errors:", JSON.stringify(errors));
  }
  console.log(`[push] kind=${kind} id=${id} recipients=${recipients.length} subs=${subs?.length ?? 0} sent=${sent} stale=${stale.length}`);

  return { ok: true, sent, failed: errors.length, stale: stale.length };
};

