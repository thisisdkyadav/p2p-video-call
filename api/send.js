export const config = { runtime: "edge" }

const REDIS_URL = process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN

async function redisFetch(command, ...args) {
  const res = await fetch(`${REDIS_URL}/${command}/${args.join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    cache: "no-store",
  })
  return res.json()
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  const { room, sender, message } = await req.json()
  if (!room || !sender || !message) {
    return new Response("Missing fields", { status: 400 })
  }

  const users = (await redisFetch("SMEMBERS", `room:${room}:users`)).result || []

  for (const u of users) {
    if (u !== sender) {
      await redisFetch("RPUSH", `room:${room}:messages:${u}`, encodeURIComponent(JSON.stringify({ from: sender, data: message })))
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  })
}
