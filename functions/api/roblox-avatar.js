const json = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=900",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });

export async function onRequestGet({ request }) {
  const incoming = new URL(request.url);
  const rawIds = incoming.searchParams.get("userIds") || "";
  const ids = [...new Set(rawIds.split(",").map((value) => value.trim()).filter(Boolean))];

  if (!ids.length || ids.length > 100 || ids.some((id) => !/^\d{1,20}$/.test(id))) {
    return json({ errors: ["Informe de 1 a 100 UserIds numéricos válidos."] }, 400);
  }

  const query = new URLSearchParams({
    userIds: ids.join(","),
    size: "420x420",
    format: "Png",
    isCircular: "false",
  });

  try {
    const upstream = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?${query}`, {
      headers: { "user-agent": "VelaCardStudio/1.0" },
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    const body = await upstream.text();
    if (!upstream.ok) {
      return json({ errors: ["O Roblox não conseguiu buscar os avatares agora."], upstreamStatus: upstream.status }, 502);
    }
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=900",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return json({ errors: ["Não foi possível consultar as miniaturas do Roblox."] }, 502);
  }
}
