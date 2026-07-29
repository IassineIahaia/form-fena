// ============================================================
//  drive-facim.js — Envio da Manifestação de Interesse FACIM 2026
//  Usa o mesmo CONFIG.SCRIPT_URL e a mesma lógica de retry do
//  drive.js original (vertentes "empresa"/"individual").
// ============================================================

async function submitFacimToDrive(payload) {
  // ── Verificar tamanho do payload (alvará + outro documento em base64) ──
  const payloadStr = JSON.stringify(payload);
  const totalMB = payloadStr.length / (1024 * 1024);
  console.log("Tamanho total do payload (FACIM 2026): " + totalMB.toFixed(2) + " MB");

  if (totalMB > 35) {
    throw new Error(
      "Os ficheiros são demasiado grandes (" + totalMB.toFixed(1) + " MB). " +
      "Reduz o tamanho dos documentos e tenta novamente."
    );
  }

  const res = await _fetchComRetryFacim(CONFIG.SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: payloadStr,
  });

  return await res.json();
}

// ── Fetch com retry (idêntico ao fetchWithRetry do drive.js) ──
async function _fetchComRetryFacim(url, options, retries = 2, delayMs = 1500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Ligação falhou, a tentar novamente (${attempt + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}