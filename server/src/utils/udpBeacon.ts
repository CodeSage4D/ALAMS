import dgram from "dgram";
import os from "os";

const PORT = 35200;
const BROADCAST_ADDR = "255.255.255.255";
let beaconInterval: NodeJS.Timeout | null = null;
let socket: dgram.Socket | null = null;

function getLocalIPs(): string[] {
  const ips: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const interfaceName of Object.keys(interfaces)) {
    const addresses = interfaces[interfaceName];
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

export function startUdpBeacon(serverPort: number | string) {
  if (socket) return;

  socket = dgram.createSocket("udp4");

  socket.bind(() => {
    socket?.setBroadcast(true);
    console.log(`[UDP BEACON] Broadcast server initialized on port ${PORT}`);
  });

  beaconInterval = setInterval(() => {
    const localIps = getLocalIPs();
    if (localIps.length === 0) return;

    // Broadcast server config for each local interface (usually just one primary IP is needed, but we use the first active IP)
    const primaryIp = localIps[0];
    const message = JSON.stringify({
      type: "ALAMS_SERVER_BEACON",
      serverUrl: `http://${primaryIp}:${serverPort}`,
      timestamp: Date.now(),
    });

    const buffer = Buffer.from(message);
    
    socket?.send(buffer, 0, buffer.length, PORT, BROADCAST_ADDR, (err) => {
      if (err) {
        console.error("[UDP BEACON] Error broadcasting beacon:", err);
      }
    });
  }, 5000); // Broadcast every 5 seconds
}

export function stopUdpBeacon() {
  if (beaconInterval) {
    clearInterval(beaconInterval);
    beaconInterval = null;
  }
  if (socket) {
    socket.close();
    socket = null;
    console.log("[UDP BEACON] Broadcast server stopped.");
  }
}
