import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type"); // 'cnpj' or 'cpf' or 'cep'
    const value = url.searchParams.get("value");

    if (!type || !value) {
      return new Response(
        JSON.stringify({ error: "Missing type or value parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limpar valor (remover pontuação)
    const cleanValue = value.replace(/\D/g, "");

    let apiUrl: string;
    
    switch (type) {
      case "cnpj":
        if (cleanValue.length !== 14) {
          return new Response(
            JSON.stringify({ error: "CNPJ deve ter 14 dígitos" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        apiUrl = `https://brasilapi.com.br/api/cnpj/v1/${cleanValue}`;
        break;

      case "cep":
        if (cleanValue.length !== 8) {
          return new Response(
            JSON.stringify({ error: "CEP deve ter 8 dígitos" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        apiUrl = `https://brasilapi.com.br/api/cep/v2/${cleanValue}`;
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Tipo inválido. Use 'cnpj' ou 'cep'" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log(`Consultando ${type}: ${cleanValue}`);

    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Lovable-Hidroponia-App/1.0",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`Erro na consulta ${type}:`, data);
      return new Response(
        JSON.stringify({ 
          error: data.message || `Erro ao consultar ${type.toUpperCase()}`,
          details: data
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Formatar resposta baseado no tipo
    let formattedData: any;

    if (type === "cnpj") {
      formattedData = {
        cnpj: data.cnpj,
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia,
        situacao_cadastral: data.descricao_situacao_cadastral,
        data_situacao_cadastral: data.data_situacao_cadastral,
        data_inicio_atividade: data.data_inicio_atividade,
        cnae_fiscal: data.cnae_fiscal,
        cnae_fiscal_descricao: data.cnae_fiscal_descricao,
        natureza_juridica: data.natureza_juridica,
        logradouro: data.logradouro,
        numero: data.numero,
        complemento: data.complemento,
        bairro: data.bairro,
        municipio: data.municipio,
        uf: data.uf,
        cep: data.cep,
        telefone: data.ddd_telefone_1,
        email: data.email,
        porte: data.porte,
        capital_social: data.capital_social,
        qsa: data.qsa, // Quadro de sócios
        raw: data, // Dados completos para futuras integrações
      };
    } else if (type === "cep") {
      formattedData = {
        cep: data.cep,
        logradouro: data.street,
        bairro: data.neighborhood,
        cidade: data.city,
        estado: data.state,
        raw: data,
      };
    }

    console.log(`Consulta ${type} bem sucedida para: ${cleanValue}`);

    return new Response(
      JSON.stringify({ success: true, data: formattedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Erro na validação:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
