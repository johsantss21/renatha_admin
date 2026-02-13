import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import forge from "https://esm.sh/node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read credentials from system_settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['pix_client_id', 'pix_client_secret', 'pix_certificates_meta']);

    const settingsMap = new Map(settings?.map((s: any) => [s.key, s.value]) || []);
    const clientId = settingsMap.get('pix_client_id') as string;
    const clientSecret = settingsMap.get('pix_client_secret') as string;
    const certsMeta = settingsMap.get('pix_certificates_meta') as any;

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Client ID e/ou Client Secret não configurados." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download certificates - supports multiple formats
    let certPem = '';
    let keyPem = '';
    let certFormat = '';

    // Try .crt + .key (Banco Inter)
    if (certsMeta?.pix_cert_crt?.storage_path) {
      const { data: crtData } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_crt.storage_path);
      if (crtData) certPem = await crtData.text();
    }
    if (certsMeta?.pix_cert_key?.storage_path) {
      const { data: keyData } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_key.storage_path);
      if (keyData) keyPem = await keyData.text();
    }

    if (certPem && keyPem) {
      certFormat = '.crt + .key';
    } else {
      // Try .pem
      if (certsMeta?.pix_cert_pem?.storage_path) {
        const { data: pemBlob } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_pem.storage_path);
        if (pemBlob) {
          const pemData = await pemBlob.text();
          const certMatch = pemData.match(/(-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----)/g);
          const keyMatch = pemData.match(/(-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----)/);
          if (certMatch && keyMatch) {
            certPem = certMatch.join('\n');
            keyPem = keyMatch[1];
            certFormat = '.pem';
          }
        }
      }

      // Check .p12 - convert to PEM via node-forge
      if (!certPem && certsMeta?.pix_cert_p12?.storage_path) {
        const { data: p12Blob } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_p12.storage_path);
        if (p12Blob) {
          const p12ArrayBuffer = await p12Blob.arrayBuffer();
          const p12Bytes = new Uint8Array(p12ArrayBuffer);
          
          let binaryStr = '';
          for (let i = 0; i < p12Bytes.length; i++) {
            binaryStr += String.fromCharCode(p12Bytes[i]);
          }
          
          const p12Der = forge.util.createBuffer(binaryStr, 'raw');
          const p12Asn1 = forge.asn1.fromDer(p12Der);
          const p12Parsed = forge.pkcs12.pkcs12FromAsn1(p12Asn1, '');
          
          const certBags = p12Parsed.getBags({ bagType: forge.pki.oids.certBag });
          const allCerts = certBags[forge.pki.oids.certBag] || [];
          if (allCerts.length > 0 && allCerts[0].cert) {
            certPem = allCerts.map((b: any) => b.cert ? forge.pki.certificateToPem(b.cert) : '').filter(Boolean).join('\n');
          }
          
          const keyBags = p12Parsed.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
          let keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
          if (!keyBag?.key) {
            const keyBags2 = p12Parsed.getBags({ bagType: forge.pki.oids.keyBag });
            keyBag = (keyBags2[forge.pki.oids.keyBag] || [])[0];
          }
          if (keyBag?.key) {
            const rsaPrivateKey = forge.pki.privateKeyToAsn1(keyBag.key);
            const privateKeyInfo = forge.pki.wrapRsaPrivateKey(rsaPrivateKey);
            keyPem = forge.pki.privateKeyInfoToPem(privateKeyInfo);
          }
          
          if (certPem && keyPem) certFormat = '.p12 (convertido para PEM)';
        }
      }
    }

    if (!certPem || !keyPem) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum certificado válido encontrado. Faça upload de .crt+.key, .pem, ou .p12 em Configurações." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create mTLS client
    const httpClient = Deno.createHttpClient({
      cert: certPem,
      key: keyPem,
    });

    // Try to get OAuth token from Efí Pay using Basic Auth
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch("https://pix.api.efipay.com.br/oauth/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
      client: httpClient,
    } as any);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Autenticação falhou (HTTP ${tokenResponse.status}). Verifique credenciais e certificados.`,
          details: errorText,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenResponse.json();
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Conexão com API Pix da Efí Pay estabelecida com sucesso! (formato: ${certFormat})`,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        cert_format: certFormat,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
