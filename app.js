const API_BASE = "/api" // change this
let pc, room, role
const userId = Math.random().toString(36).slice(2)
// Buffer remote ICE candidates that arrive before we have a remoteDescription
let pendingRemoteCandidates = []

// Use lower-res video (480p) and lower frame rate to reduce bandwidth
const MEDIA_CONSTRAINTS = {
  // video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 15 } },
  video: true,
  audio: true,
}

const localVideo = document.getElementById("localVideo")
const remoteVideo = document.getElementById("remoteVideo")

async function send(message) {
  await fetch(`${API_BASE}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room, sender: userId, message }),
  })
}

async function joinRoom() {
  room = document.getElementById("roomInput").value
  if (!room) return alert("Enter a room name!")

  const res = await fetch(`${API_BASE}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room, user: userId }),
  })
  const data = await res.json()
  if (data.error) return alert(data.error)

  role = data.role
  console.log("Joined as", role)

  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  })
  // More robust remote track handling (some browsers may not supply streams[0])
  pc.ontrack = (e) => {
    console.log(
      "ontrack: kind=",
      e.track.kind,
      "id=",
      e.track.id,
      "streams=",
      e.streams.map((s) => s.id)
    )
    if (!remoteVideo.srcObject) {
      remoteVideo.srcObject = e.streams[0] || new MediaStream()
    }
    // If we created our own stream, ensure track added
    if (remoteVideo.srcObject instanceof MediaStream && !remoteVideo.srcObject.getTracks().includes(e.track)) {
      remoteVideo.srcObject.addTrack(e.track)
    }
    remoteVideo.play().catch(() => {})
  }
  pc.onicecandidate = (e) => e.candidate && send({ type: "candidate", candidate: e.candidate })
  pc.onconnectionstatechange = () => console.log("connectionState:", pc.connectionState)
  pc.oniceconnectionstatechange = () => console.log("iceConnectionState:", pc.iceConnectionState)
  pc.onicegatheringstatechange = () => console.log("iceGatheringState:", pc.iceGatheringState)
  pc.onsignalingstatechange = () => console.log("signalingState:", pc.signalingState)

  poll()

  if (role === "offerer") {
    document.getElementById("start").disabled = false
    alert("You are the offerer. Click Start Call.")
  } else {
    alert("You are the answerer. Wait for the offer.")
  }
}

async function startCall() {
  console.log("startCall invoked (role=", role, ")")
  const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS)
  localVideo.srcObject = stream
  stream.getTracks().forEach((t) => pc.addTrack(t, stream))
  console.log(
    "Local tracks added:",
    stream.getTracks().map((t) => t.kind + ":" + t.id)
  )

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  console.log("Created and set local offer")
  await send(offer)
  console.log("Offer sent")
}

async function poll() {
  const res = await fetch(`${API_BASE}/receive?room=${room}&user=${userId}`)
  const msgs = await res.json()

  for (const m of msgs) {
    const msg = m.data

    if (msg.type === "offer" && role === "answerer") {
      console.log("Received offer")
      await pc.setRemoteDescription(new RTCSessionDescription(msg))
      console.log("Set remote offer")

      // Apply any candidates that arrived early
      for (const c of pendingRemoteCandidates) {
        try {
          await pc.addIceCandidate(c)
        } catch (e) {
          console.warn("Late addIceCandidate (offer->answer)", e)
        }
      }
      pendingRemoteCandidates = []

      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS)
      localVideo.srcObject = stream
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      console.log(
        "Answerer local tracks added:",
        stream.getTracks().map((t) => t.kind + ":" + t.id)
      )

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log("Created & set local answer")
      await send(answer)
      console.log("Answer sent")
    } else if (msg.type === "answer" && role === "offerer") {
      console.log("Received answer")
      await pc.setRemoteDescription(new RTCSessionDescription(msg))
      console.log("Set remote answer")

      for (const c of pendingRemoteCandidates) {
        try {
          await pc.addIceCandidate(c)
        } catch (e) {
          console.warn("Late addIceCandidate (answer->offer)", e)
        }
      }
      pendingRemoteCandidates = []
    } else if (msg.type === "candidate") {
      try {
        const candidateObj = new RTCIceCandidate(msg.candidate)
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          // Can't add yet; buffer until remoteDescription is set
          pendingRemoteCandidates.push(candidateObj)
          console.log("Buffered remote ICE candidate (total now", pendingRemoteCandidates.length, ")")
        } else {
          await pc.addIceCandidate(candidateObj)
          console.log("Added remote ICE candidate")
        }
      } catch (e) {
        console.error("ICE error", e)
      }
    }
  }

  setTimeout(poll, 1000)
}

document.getElementById("joinRoom").onclick = joinRoom
document.getElementById("start").onclick = startCall
