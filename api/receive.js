export const config = {
  runtime: "edge",
}

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
  const { searchParams } = new URL(req.url)
  const room = searchParams.get("room")
  const user = searchParams.get("user")

  if (!room || !user) {
    return new Response("Missing params", { status: 400 })
  }

  const key = `room:${room}:messages:${user}`
  const msgs = []
  while (true) {
    const res = await redisFetch("LPOP", key)
    if (!res.result) break
    msgs.push(JSON.parse(decodeURIComponent(res.result)))
  }

  return new Response(JSON.stringify(msgs), {
    headers: { "Content-Type": "application/json" },
  })
}
