// ============================================================
//  drive.js — B2B Mozambique · Envio via Apps Script
//  Sem login Google. Qualquer pessoa pode submeter.
// ============================================================

// ============================================================
//  Converter File (imagem) para base64
// ============================================================
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Erro ao ler ficheiro"));
    reader.readAsDataURL(file);
  });
}

// ============================================================
//  PROCESSO COMPLETO — chamado pelo formulário ao submeter
// ============================================================
async function submitCompanyToDrive(formData) {
  _showStatus("A preparar dados...", "loading");

  try {
    // ── Converter imagens para base64 ─────────────────────
    const logoBase64 = await fileToBase64(formData.logo);
    const coverBase64 = await fileToBase64(formData.cover);

    // Converter imagens dos serviços
    const servicosComBase64 = await Promise.all(
      formData.servicos.map(async (s) => ({
        nome: s.nome,
        descricao: s.descricao,
        imagemBase64: await fileToBase64(s.imagem),
      })),
    );

    // ── Montar payload ────────────────────────────────────
    const payload = {
      nome: formData.nome,
      descricao: formData.descricao,
      badges: formData.badges,
      nuit: formData.nuit,
      fundacao: formData.fundacao,
      porte: formData.porte,
      industria: formData.industria,
      legalizada: formData.legalizada,
      provincia: formData.provincia,
      cidade: formData.cidade,
      endereco: formData.endereco,
      email: formData.email,
      telefone: formData.telefone,
      website: formData.website,
      linkedin: formData.linkedin,
      twitter: formData.twitter,
      logo: logoBase64,
      cover: coverBase64,
      servicos: servicosComBase64,
      stats: formData.stats,
    };

    // ── Enviar para o Apps Script ─────────────────────────
    _showStatus("A enviar para Marketaccess", "loading");

    const res = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" }, // evita preflight CORS
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (result.ok) {
      _showStatus(`✅ "${result.empresa}" guardada com sucesso! `, "success");
    } else {
      throw new Error(result.erro || "Erro desconhecido");
    }
  } catch (err) {
    console.error(err);
    _showStatus("❌ Erro: " + err.message, "error");
  }
}

// ============================================================
//  UTILITÁRIO — mostrar mensagem de estado no ecrã
// ============================================================
function _showStatus(msg, type) {
  const el = document.getElementById("status-msg");
  if (!el) return;
  el.innerHTML = msg;
  el.className = "status-msg status-" + type;
  el.style.display = "block";
}

// Função vazia — já não precisamos de Google OAuth
function initGoogleDrive() {}
