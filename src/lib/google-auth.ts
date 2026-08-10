import "server-only";
import { GoogleAuth } from "google-auth-library";

// Credenciales de la cuenta de servicio de Google, compartidas entre
// cualquier API de Google que necesite la app (hoy: Sheets). Centralizado acá
// para no repetir la validación de env vars en cada integración nueva.
function getServiceAccountCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error(
      "La cuenta de servicio de Google no está configurada — faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY en .env.local.",
    );
  }
  return { email, privateKey };
}

export async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  const { email, privateKey } = getServiceAccountCredentials();
  const auth = new GoogleAuth({ credentials: { client_email: email, private_key: privateKey }, scopes });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("No se pudo autenticar con la cuenta de servicio de Google.");
  return token;
}
