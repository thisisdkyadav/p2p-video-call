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

  const { room, user } = await req.json()
  if (!room || !user) {
    return new Response("Missing fields", { status: 400 })
  }

  const users = (await redisFetch("SMEMBERS", `room:${room}:users`)).result || []

  if (users.includes(user)) {
    return new Response(JSON.stringify({ ok: true, role: "existing" }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  if (users.length >= 2) {
    return new Response(JSON.stringify({ error: "Room full" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  await redisFetch("SADD", `room:${room}:users`, user)

  const role = users.length === 0 ? "offerer" : "answerer"

  return new Response(JSON.stringify({ ok: true, role }), {
    headers: { "Content-Type": "application/json" },
  })
}
