import dgram from "dgram";
import os from "os";

const PORT = 35200;
let beaconInterval: NodeJS.Timeout | null = null;
let socket: dgram.Socket | null = null;

function getLocalIPs(): string[] {
  const ips: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name];
    if (addresses) {
      for (const addr of addresses) {
        if (addr.family === "IPv4" && !addr.internal) {
          ips.push(addr.address);
        }
      }
    }
  }
  return ips;
}

function getBroadcastTargets(): string[] {
  const targets: string[] = ["255.255.255.255"];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name];
    if (!addresses) continue;
    for (const addr of addresses) {
      if (addr.family === "IPv4" && !addr.internal && addr.address && addr.netmask) {
        try {
          const ipParts = addr.address.split(".").map(Number);
          const maskParts = addr.netmask.split(".").map(Number);
          if (ipParts.length === 4 && maskParts.length === 4) {
            const bcastParts = ipParts.map((ip, i) => (ip | (~maskParts[i] & 255)));
            const bcast = bcastParts.join(".");
            if (!targets.includes(bcast)) {
              targets.push(bcast);
            }
          }
        } catch { }
      }
    }
  }
  return targets;
}

export function startUdpBeacon(serverPort: number | string) {
  if (socket) return;

  socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  socket.bind(PORT, () => {
    try {
      socket?.setBroadcast(true);
      console.log(`[UDP BEACON] Multi-NIC Subnet Broadcast server initialized on port ${PORT}`);
    } catch (err: any) {
      console.error("[UDP BEACON] Error configuring broadcast socket:", err);
    }
  });

  socket.on("error", (err) => {
    console.error("[UDP BEACON] Socket error:", err);
  });

  beaconInterval = setInterval(() => {
    const localIps = getLocalIPs();
    if (localIps.length === 0) return;

    const primaryIp = localIps[0];
    const message = JSON.stringify({
      type: "ALAMS_SERVER_BEACON",
      serverUrl: `http://${primaryIp}:${serverPort}`,
      allIps: localIps,
      timestamp: Date.now(),
    });

    const buffer = Buffer.from(message);
    const targets = getBroadcastTargets();

    for (const target of targets) {
      socket?.send(buffer, 0, buffer.length, PORT, target, (err) => {
        if (err && err.message && !err.message.includes("ENETUNREACH")) {
          // Ignore unreachable virtual interfaces
        }
      });
    }
  }, 3000); // Broadcast every 3 seconds across all NICs
}

export function stopUdpBeacon() {
  if (beaconInterval) {
    clearInterval(beaconInterval);
    beaconInterval = null;
  }
  if (socket) {
    try {
      socket.close();
    } catch { }
    socket = null;
    console.log("[UDP BEACON] Broadcast server stopped.");
  }
}

