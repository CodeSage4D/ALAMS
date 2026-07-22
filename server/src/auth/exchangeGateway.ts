import https from "https";
import { decryptString } from "./passwordHelper";

export interface ExchangeConfigInput {
  exchangeClientId: string;
  exchangeClientSecretEncrypted: string;
  exchangeTenantId: string;
  senderEmail: string;
  senderName: string;
}

export class ExchangeGateway {
  private static makePostRequest(url: string, body: string, headers: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        method: "POST",
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: headers,
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch {
              resolve(data);
            }
          } else {
            reject(new Error(`HTTP Status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (err) => reject(err));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });

      req.write(body);
      req.end();
    });
  }

  private static async getAccessToken(config: ExchangeConfigInput): Promise<string> {
    if (!config.exchangeTenantId || !config.exchangeClientId || !config.exchangeClientSecretEncrypted) {
      throw new Error("Missing Microsoft Exchange credentials (Tenant ID, Client ID, or Client Secret)");
    }

    let clientSecret = "";
    try {
      clientSecret = decryptString(config.exchangeClientSecretEncrypted);
    } catch {
      clientSecret = config.exchangeClientSecretEncrypted;
    }

    const url = `https://login.microsoftonline.com/${config.exchangeTenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: config.exchangeClientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }).toString();

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const response = await this.makePostRequest(url, body, headers);
    if (!response || !response.access_token) {
      throw new Error("Failed to retrieve access token from Microsoft Identity Platform");
    }
    return response.access_token;
  }

  public static async verifyConnection(config: ExchangeConfigInput): Promise<boolean> {
    if (!config.exchangeClientId || !config.exchangeTenantId || !config.exchangeClientSecretEncrypted) {
      console.warn("[Exchange] Configuration incomplete — skipping verification");
      return false;
    }
    try {
      const token = await this.getAccessToken(config);
      return !!token;
    } catch (err: any) {
      console.error("[Exchange] Connection verification failed:", err.message);
      return false;
    }
  }

  public static async sendMailDirect(
    config: ExchangeConfigInput,
    to: string,
    subject: string,
    html: string
  ): Promise<boolean> {
    try {
      const token = await this.getAccessToken(config);
      
      const url = `https://graph.microsoft.com/v1.0/users/${config.senderEmail}/sendMail`;
      
      const emailPayload = {
        message: {
          subject: subject,
          body: {
            contentType: "HTML",
            content: html,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
        },
        saveToSentItems: "true",
      };

      const body = JSON.stringify(emailPayload);
      const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      await this.makePostRequest(url, body, headers);
      console.log(`[Exchange] Email delivered to ${to} via Graph API.`);
      return true;
    } catch (err: any) {
      console.error(`[Exchange] Delivery failed to ${to}:`, err.message);
      throw new Error(err.message);
    }
  }
}
