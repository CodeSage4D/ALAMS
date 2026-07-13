import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import prisma from "./prisma";
import { isIpInSubnet } from "./controllers/adminController";
import { evaluateWorkstationBehavior } from "./utils/aiAnalytics";
import { computeHmac } from "./utils/crypto";

// Map of active client computer IDs to their open WebSocket connections
const connectedClients = new Map<string, WebSocket>();

// Pending diagnostics callbacks keyed by computer ID
const pendingDiagnostics = new Map<string, { resolve: (data: any) => void; reject: (err: any) => void; timeout: NodeJS.Timeout }>();

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    // Basic path checking if needed, upgrade directly for simplicity
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    let pairedComputerId: string | null = null;

    ws.on("message", async (message: string) => {
      try {
        const payload = JSON.parse(message);

        switch (payload.type) {
          case "register": {
            const {
              macAddress,
              deviceName,
              ipAddress,
              fingerprint,
              computerUuid,
              machineGuid,
              motherboardSerial,
              cpuId,
              biosSerial,
              ram,
              storage,
              osVersion,
              clientVersion,
              ipv6Address,
              gateway,
              dnsServers,
              networkAdapter,
              domainWorkgroup,
            } = payload;

            if (!macAddress) {
              ws.send(JSON.stringify({ type: "error", message: "MAC Address required" }));
              return;
            }

            let computer = null;
            if (fingerprint) {
              computer = await prisma.computer.findUnique({
                where: { fingerprint },
              });
            }

            if (!computer) {
              computer = await prisma.computer.findUnique({
                where: { macAddress },
              });
            }

            if (!computer) {
              // Auto-register as PENDING
              let defaultLab = await prisma.lab.findFirst({
                include: { profile: true },
              });
              if (!defaultLab) {
                // Seed default profile
                let defProfile = await prisma.profile.findFirst();
                if (!defProfile) {
                  defProfile = await prisma.profile.create({
                    data: {
                      name: "Default Profile",
                      qrLifetime: 30,
                      heartbeatInterval: 30,
                    },
                  });
                }
                defaultLab = await prisma.lab.create({
                  data: {
                    name: "Default Lab",
                    location: "Building A",
                    profileId: defProfile.id,
                  },
                  include: { profile: true },
                });
              }

              computer = await prisma.computer.create({
                data: {
                  deviceName: deviceName || `PC-${macAddress.replace(/:/g, "")}`,
                  macAddress,
                  ipAddress: ipAddress || "127.0.0.1",
                  pcNumber: "PENDING-PC",
                  qrSeed: "",
                  fingerprint: fingerprint || null,
                  labId: defaultLab.id,
                  status: "PENDING",
                  computerUuid,
                  machineGuid,
                  motherboardSerial,
                  cpuId,
                  biosSerial,
                  ram,
                  storage,
                  osVersion,
                  clientVersion,
                  ipv6Address,
                  gateway,
                  dnsServers,
                  networkAdapter,
                  domainWorkgroup,
                  deviceGroup: "Workstation",
                  connectedAt: new Date(),
                },
              });
            } else {
              // Blocked / Retired Device rejection
              if (computer.status === "BLOCKED" || computer.status === "RETIRED") {
                ws.send(JSON.stringify({ type: "error", message: "Device has been disabled or retired. Connection rejected." }));
                ws.close(1000, "Device disabled");
                console.log(`[WS] Connection rejected for disabled/retired device: ${computer.deviceName}`);
                return;
              }

              // Hardware Change Audit
              const hardwareChanged =
                (computer.biosSerial && biosSerial && computer.biosSerial !== biosSerial) ||
                (computer.motherboardSerial && motherboardSerial && computer.motherboardSerial !== motherboardSerial) ||
                (computer.cpuId && cpuId && computer.cpuId !== cpuId);

              if (hardwareChanged) {
                await prisma.securityAlert.create({
                  data: {
                    computerId: computer.id,
                    alertType: "hardware_change",
                    alertSeverity: "CRITICAL",
                    details: `Hardware Tamper Alert! BIOS Serial: ${computer.biosSerial} -> ${biosSerial}, Motherboard: ${computer.motherboardSerial} -> ${motherboardSerial}`,
                  },
                });

                await prisma.auditLog.create({
                  data: {
                    action: "HARDWARE_TAMPER",
                    computerId: computer.id,
                    details: `Hardware configuration change flagged for computer ${computer.deviceName}. BIOS: ${computer.biosSerial} -> ${biosSerial}`,
                  },
                });
              }

              // Update metrics
              const updateData: any = {
                ipAddress: ipAddress || computer.ipAddress,
                lastSeen: new Date(),
                connectedAt: new Date(),
                status: computer.status === "PENDING" ? "PENDING" : "APPROVED",
                fingerprint: fingerprint || computer.fingerprint,
                computerUuid: computerUuid || computer.computerUuid,
                machineGuid: machineGuid || computer.machineGuid,
                motherboardSerial: motherboardSerial || computer.motherboardSerial,
                cpuId: cpuId || computer.cpuId,
                biosSerial: biosSerial || computer.biosSerial,
                ram: ram || computer.ram,
                storage: storage || computer.storage,
                osVersion: osVersion || computer.osVersion,
                clientVersion: clientVersion || computer.clientVersion,
                ipv6Address: ipv6Address || computer.ipv6Address,
                gateway: gateway || computer.gateway,
                dnsServers: dnsServers || computer.dnsServers,
                networkAdapter: networkAdapter || computer.networkAdapter,
                domainWorkgroup: domainWorkgroup || computer.domainWorkgroup,
              };

              computer = await prisma.computer.update({
                where: { id: computer.id },
                data: updateData,
              });
            }

            // Subnet Validation Audit
            const lab = await prisma.lab.findUnique({
              where: { id: computer.labId },
              include: { profile: true },
            });
            
            if (lab && lab.subnet && ipAddress) {
              const subnetValid = isIpInSubnet(ipAddress, lab.subnet);
              if (!subnetValid) {
                await prisma.securityAlert.create({
                  data: {
                    computerId: computer.id,
                    alertType: "subnet_mismatch",
                    alertSeverity: "WARNING",
                    details: `Workstation IP address ${ipAddress} does not match configured Lab subnet ${lab.subnet}`,
                  },
                });
                await prisma.auditLog.create({
                  data: {
                    action: "SUBNET_MISMATCH",
                    computerId: computer.id,
                    details: `Workstation IP mismatch flagged: ${ipAddress} vs lab subnet ${lab.subnet}`,
                  },
                });
              }
            }

            pairedComputerId = computer.id;
            connectedClients.set(computer.id, ws);

            // Dispatch profile details
            const qrLifetime = lab?.profile?.qrLifetime ?? 30;
            const heartbeatInterval = lab?.profile?.heartbeatInterval ?? 30;
            const offlinePinEnabled = lab?.profile?.offlinePinEnabled ?? true;
            const qrAuthEnabled = lab?.profile?.qrAuthEnabled ?? true;

            // Fetch custom GPO policies associated with the profile
            let gpoPolicies: any[] = [];
            if (lab?.profileId) {
              gpoPolicies = await prisma.gpoPolicy.findMany({
                where: { profileId: lab.profileId },
                select: { key: true, valueName: true, valueType: true, value: true }
              });
            }

            const adminUsers = await prisma.user.findMany({
              where: { role: { in: ["ADMIN", "SUPERVISOR", "FACULTY"] } },
              select: { enrollmentNumber: true, passwordHash: true }
            });
            const adminCredentials = adminUsers.map(u => ({
              username: u.enrollmentNumber,
              pinHash: u.passwordHash,
              passcodeHash: u.passwordHash
            }));

            const studentUsers = await prisma.user.findMany({
              where: { role: "STUDENT", isActive: true },
              select: { enrollmentNumber: true, pinHash: true }
            });
            const studentCredentials = studentUsers.map(u => ({
              enrollmentNumber: u.enrollmentNumber,
              pinHash: u.pinHash
            }));

            const configPayload = {
              qrLifetime,
              heartbeatInterval,
              offlinePinEnabled,
              qrAuthEnabled,
              gpoPolicies,
              usbBlocked: lab?.profile?.usbBlocked ?? false,
              cmdBlocked: lab?.profile?.cmdBlocked ?? false,
              taskMgrBlocked: lab?.profile?.taskMgrBlocked ?? false,
              wallpaperUrl: lab?.profile?.wallpaperUrl ?? null,
              softwareBlocklist: lab?.profile?.softwareBlocklist ?? null,
              adminCredentials,
              studentCredentials,
              timestamp: Date.now()
            };

            const configString = JSON.stringify(configPayload);
            const signature = computeHmac(configString, computer.machineToken);

            ws.send(
              JSON.stringify({
                type: "config_profile",
                ...configPayload,
                signature
              })
            );

            if (computer.status === "PENDING") {
              ws.send(
                JSON.stringify({
                  type: "pending_approval",
                  computerId: computer.id,
                  fingerprint: computer.fingerprint,
                  deviceName: computer.deviceName,
                  machineToken: computer.machineToken,
                })
              );
              console.log(`[WS] Workstation connected in PENDING registration state: ${computer.deviceName}`);
            } else {
              ws.send(
                JSON.stringify({
                  type: "registered",
                  computerId: computer.id,
                  deviceName: computer.deviceName,
                  pcNumber: computer.pcNumber,
                  fallbackEnabled: computer.fallbackEnabled,
                  qrSeed: computer.qrSeed,
                  machineToken: computer.machineToken,
                })
              );
              console.log(`[WS] Workstation registered & unlocked: ${computer.deviceName} (ID: ${computer.id})`);
            }
            break;
          }

          case "heartbeat": {
            if (!pairedComputerId) return;

            const { status, timestamp, signature } = payload;
            const computer = await prisma.computer.findUnique({ where: { id: pairedComputerId } });
            
            if (computer) {
              // Cryptographic heartbeat signature validation
              const calculatedSig = computeHmac((status || "") + (timestamp || ""), computer.machineToken);
              if (signature !== calculatedSig) {
                console.error(`[WS] Heartbeat HMAC validation failed for device ${computer.deviceName}`);
                await prisma.securityAlert.create({
                  data: {
                    computerId: computer.id,
                    alertType: "heartbeat_hmac_failure",
                    alertSeverity: "CRITICAL",
                    details: `Cryptographic heartbeat validation failed. Signature mismatch on status "${status}".`,
                  },
                });
                ws.send(JSON.stringify({ type: "error", message: "Cryptographic heartbeat verification failed." }));
                ws.close(1008, "HMAC Verification Failed");
                return;
              }

              // Detect Clock Tampering (skew > 5 mins)
              if (timestamp) {
                const clientTime = Number(timestamp);
                const serverTime = Date.now();
                const skewMs = Math.abs(serverTime - clientTime);
                if (skewMs > 300000) {
                  await prisma.securityAlert.create({
                    data: {
                      computerId: computer.id,
                      alertType: "clock_tampering_anomaly",
                      alertSeverity: "WARNING",
                      details: `Detected client-side clock skew of ${Math.round(skewMs / 1000)} seconds. Potential bypass attempt.`,
                    },
                  });
                  console.warn(`[WS] Clock anomaly detected on ${computer.deviceName}: skew is ${skewMs} ms`);
                }
              }

              const isStatusManaged = ["PENDING", "APPROVED", "ACTIVE"].includes(computer.status);
              const nextStatus: any = isStatusManaged
                ? (status === "in_use" || status === "IN_USE" ? "ACTIVE" : "APPROVED")
                : computer.status;

              await prisma.computer.update({
                where: { id: pairedComputerId },
                data: {
                  status: nextStatus,
                  lastSeen: new Date(),
                },
              });
            }

            ws.send(JSON.stringify({ type: "heartbeat_ack", timestamp: Date.now() }));
            break;
          }

          case "telemetry": {
            if (!pairedComputerId) return;
            const { cpuUsage, ramUsage, loggedStudent, policyStatus, installedVersion } = payload;
            const cpuNum = cpuUsage !== undefined ? parseFloat(cpuUsage) : null;
            const ramNum = ramUsage !== undefined ? parseFloat(ramUsage) : null;

            await prisma.computer.update({
              where: { id: pairedComputerId },
              data: {
                cpuUsage: cpuNum,
                ramUsage: ramNum,
                loggedStudent: loggedStudent || null,
                policyStatus: policyStatus || null,
                installedVersion: installedVersion || null,
                lastTelemetry: new Date(),
              },
            });

            // Trigger behavioral analytics check
            if (cpuNum !== null && ramNum !== null) {
              evaluateWorkstationBehavior({
                computerId: pairedComputerId,
                cpuUsage: cpuNum,
                ramUsage: ramNum,
              }).catch(err => console.error("AI Evaluation error:", err));
            }
            break;
          }

          case "command_result": {
            if (!pairedComputerId) return;
            const { commandId, status, error } = payload;
            if (commandId) {
              await prisma.commandQueue.update({
                where: { id: commandId },
                data: {
                  status: status || "EXECUTED",
                  executedAt: new Date(),
                  parameters: error ? JSON.stringify({ error }) : undefined,
                },
              });
              console.log(`[WS] Command ${commandId} result: ${status} for computer ID: ${pairedComputerId}`);
            }
            break;
          }

          case "logout_complete": {
            if (!pairedComputerId) return;

            const computer = await prisma.computer.findUnique({ where: { id: pairedComputerId } });
            if (computer && (computer.status === "ACTIVE" || computer.status === "APPROVED")) {
              await prisma.computer.update({
                where: { id: pairedComputerId },
                data: { status: "APPROVED" },
              });
            }

            console.log(`[WS] Logout completed for computer ID: ${pairedComputerId}`);
            break;
          }

          case "diagnostics_response": {
            const { computerId, diagnostics } = payload;
            const pending = pendingDiagnostics.get(computerId);
            if (pending) {
              clearTimeout(pending.timeout);
              pending.resolve(diagnostics);
              pendingDiagnostics.delete(computerId);
            }
            break;
          }

          default:
            ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
        }
      } catch (err: any) {
        console.error("[WS] Message processing error:", err);
        ws.send(JSON.stringify({ type: "error", message: "Invalid payload format" }));
      }
    });

    ws.on("close", async () => {
      if (pairedComputerId) {
        connectedClients.delete(pairedComputerId);
        console.log(`[WS] Connection closed for computer ID: ${pairedComputerId}`);

        try {
          const comp = await prisma.computer.findUnique({ where: { id: pairedComputerId } });
          if (comp && comp.status !== "PENDING" && comp.status !== "BLOCKED" && comp.status !== "RETIRED") {
            await prisma.computer.update({
              where: { id: pairedComputerId },
              data: { status: "OFFLINE" }
            });
          }
        } catch (err) {
          console.error("Failed to update status to OFFLINE on WS close:", err);
        }
      }
    });
  });
}

/**
 * Sends an unlock command to a connected client PC.
 */
export function unlockComputer(computerId: string, enrollmentNumber: string): boolean {
  const clientSocket = connectedClients.get(computerId);
  if (!clientSocket || clientSocket.readyState !== WebSocket.OPEN) {
    console.error(`[WS] Attempted to unlock PC ${computerId} but socket is offline.`);
    return false;
  }

  clientSocket.send(
    JSON.stringify({
      type: "unlock",
      enrollmentNumber,
    })
  );
  return true;
}

/**
 * Sends a force-lock command to a connected client PC.
 */
export function lockComputer(computerId: string): boolean {
  const clientSocket = connectedClients.get(computerId);
  if (!clientSocket || clientSocket.readyState !== WebSocket.OPEN) {
    return false;
  }

  clientSocket.send(JSON.stringify({ type: "lock" }));
  return true;
}

export function isComputerOnline(computerId: string): boolean {
  return connectedClients.has(computerId);
}

/**
 * Dispatches a command to a connected client PC and returns true if it was sent.
 */
export function sendRemoteCommand(computerId: string, commandId: string, command: string, parameters?: string): boolean {
  const clientSocket = connectedClients.get(computerId);
  if (!clientSocket || clientSocket.readyState !== WebSocket.OPEN) {
    console.error(`[WS] Attempted to send command ${command} to PC ${computerId} but socket is offline.`);
    return false;
  }

  clientSocket.send(
    JSON.stringify({
      type: "command",
      commandId,
      command,
      parameters,
    })
  );
  return true;
}

export function sendApprovalToClient(computerId: string, pcNumber: string, qrSeed: string, fallbackEnabled: boolean, deviceName: string): boolean {
  const clientSocket = connectedClients.get(computerId);
  if (!clientSocket || clientSocket.readyState !== WebSocket.OPEN) {
    return false;
  }
  clientSocket.send(
    JSON.stringify({
      type: "registered",
      computerId,
      pcNumber,
      qrSeed,
      fallbackEnabled,
      deviceName,
    })
  );
  return true;
}

export function requestDiagnosticsFromClient(computerId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const clientSocket = connectedClients.get(computerId);
    if (!clientSocket || clientSocket.readyState !== 1) { // 1 = WebSocket.OPEN
      return reject(new Error("Workstation is offline"));
    }

    const timeout = setTimeout(() => {
      pendingDiagnostics.delete(computerId);
      reject(new Error("Diagnostics request timed out"));
    }, 5000);

    pendingDiagnostics.set(computerId, { resolve, reject, timeout });

    clientSocket.send(JSON.stringify({ type: "request_diagnostics" }));
  });
}

// Broadcast updated configuration profile to all connected workstations using that profile
export async function sendProfileConfigToConnectedClients(profileId: string) {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        labs: {
          include: {
            computers: true
          }
        }
      }
    });

    if (!profile) return;

    const gpoPolicies = await prisma.gpoPolicy.findMany({
      where: { profileId },
      select: { key: true, valueName: true, valueType: true, value: true }
    });

    // Gather all computer IDs that belong to the profile
    const computerIds: string[] = [];
    for (const lab of profile.labs) {
      if (lab.computers) {
        for (const pc of lab.computers) {
          computerIds.push(pc.id);
        }
      }
    }

    // Send updated config to all connected sockets
    for (const pcId of computerIds) {
      const ws = connectedClients.get(pcId);
      if (ws && ws.readyState === 1) { // 1 = OPEN
        const adminUsers = await prisma.user.findMany({
          where: { role: { in: ["ADMIN", "SUPERVISOR", "FACULTY"] } },
          select: { enrollmentNumber: true, passwordHash: true }
        });
        const adminCredentials = adminUsers.map(u => ({
          username: u.enrollmentNumber,
          pinHash: u.passwordHash,
          passcodeHash: u.passwordHash
        }));

        const studentUsers = await prisma.user.findMany({
          where: { role: "STUDENT", isActive: true },
          select: { enrollmentNumber: true, pinHash: true }
        });
        const studentCredentials = studentUsers.map(u => ({
          enrollmentNumber: u.enrollmentNumber,
          pinHash: u.pinHash
        }));

        ws.send(
          JSON.stringify({
            type: "config_profile",
            qrLifetime: profile.qrLifetime,
            heartbeatInterval: profile.heartbeatInterval,
            offlinePinEnabled: profile.offlinePinEnabled,
            qrAuthEnabled: profile.qrAuthEnabled,
            gpoPolicies,
            usbBlocked: profile.usbBlocked,
            cmdBlocked: profile.cmdBlocked,
            taskMgrBlocked: profile.taskMgrBlocked,
            wallpaperUrl: profile.wallpaperUrl,
            softwareBlocklist: profile.softwareBlocklist,
            adminCredentials,
            studentCredentials
          })
        );
      }
    }
  } catch (err) {
    console.error("Failed to broadcast updated profile configuration:", err);
  }
}

export function disconnectClient(computerId: string): boolean {
  const ws = connectedClients.get(computerId);
  if (ws) {
    try {
      ws.close(1000, "Device disabled or removed by administrator");
    } catch {}
    connectedClients.delete(computerId);
    return true;
  }
  return false;
}

