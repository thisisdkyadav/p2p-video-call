export const config = {
  runtime: "edge", // Run on Vercel Edge
}

const rooms = {} // { roomName: [WebSocket, WebSocket] }

export default async function handler(req) {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected a WebSocket request", { status: 400 })
  }

  const { socket, response } = Deno.upgradeWebSocket(req)

  let currentRoom = null

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      if (data.type === "join") {
        const room = data.room
        if (!rooms[room]) rooms[room] = []

        if (rooms[room].length >= 2) {
          socket.send(JSON.stringify({ type: "error", message: "Room full (max 2 users)" }))
          socket.close()
          return
        }

        rooms[room].push(socket)
        currentRoom = room
        console.log(`User joined room: ${room}`)
        return
      }

      // Relay signaling messages only to the other peer in the same room
      if (currentRoom && rooms[currentRoom]) {
        rooms[currentRoom].forEach((client) => {
          if (client !== socket && client.readyState === 1) {
            client.send(JSON.stringify(data))
          }
        })
      }
    } catch (err) {
      console.error("Invalid message", err)
    }
  }

  socket.onclose = () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom] = rooms[currentRoom].filter((c) => c !== socket)
      if (rooms[currentRoom].length === 0) {
        delete rooms[currentRoom]
      }
    }
  }

  return response
}
