// ============================================================
//  drive.js — B2B Mozambique · Envio via Apps Script
//  Sem login Google. Qualquer pessoa pode submeter.
// ============================================================

// ============================================================
//  Redimensionar + comprimir imagem antes de converter
//  Evita payloads gigantes que falham em redes móveis.
//  maxDim: maior dimensão (largura ou altura) em pixels
//  NUNCA rejeita — se falhar, devolve null e o envio continua.
// ============================================================
function compressImage(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);

    // Tipos que o <canvas> normalmente não consegue desenhar
    // (ex: HEIC/HEIF do iPhone). Avisamos e ignoramos a imagem.
    const tipo = (file.type || "").toLowerCase();
    const nomeExt = (file.name || "").toLowerCase();
    if (tipo.includes("heic") || tipo.includes("heif") || nomeExt.endsWith(".heic") || nomeExt.endsWith(".heif")) {
      console.warn("Formato HEIC/HEIF não suportado, a ignorar imagem:", file.name);
      resolve(null);
      return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        try {
          let { width, height } = img;

          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // Sempre exportar como JPEG para máxima compressão
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        } catch (err) {
          console.warn("Erro ao comprimir imagem, a ignorar:", file.name, err);
          resolve(null);
        }
      };
      img.onerror = () => {
        console.warn("Imagem ilegível pelo browser, a ignorar:", file.name);
        resolve(null);
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      console.warn("Erro ao ler ficheiro, a ignorar:", file.name);
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================
//  Calcular tamanho aproximado (em MB) de uma string base64
// ============================================================
function base64SizeMB(dataUrl) {
  if (!dataUrl) return 0;
  const base64 = dataUrl.split(",")[1] || "";
  return (base64.length * 0.75) / (1024 * 1024);
}

// ============================================================
//  PROCESSO COMPLETO — chamado pelo formulário ao submeter
// ============================================================
async function submitCompanyToDrive(formData) {
  _showStatus("A preparar dados...", "loading");

  try {
    const imagensFalhadas = [];

    // ── Comprimir + converter logo e capa ─────────────────
    _showStatus("A comprimir imagens (logo e capa)...", "loading");
    const logoBase64  = await compressImage(formData.logo,  800, 0.8);
    const coverBase64 = await compressImage(formData.cover, 1280, 0.75);

    if (formData.logo && !logoBase64)   imagensFalhadas.push("Logótipo");
    if (formData.cover && !coverBase64) imagensFalhadas.push("Imagem de capa");

    // ── Comprimir + converter imagens dos serviços ────────
    const servicosComBase64 = [];
    for (let i = 0; i < formData.servicos.length; i++) {
      const s = formData.servicos[i];
      _showStatus(`A comprimir imagem do serviço ${i + 1}/${formData.servicos.length}...`, "loading");
      const imgBase64 = await compressImage(s.imagem, 1000, 0.7);
      if (s.imagem && !imgBase64) imagensFalhadas.push(`Imagem do serviço "${s.nome || i + 1}"`);
      servicosComBase64.push({
        nome:         s.nome,
        descricao:    s.descricao,
        imagemBase64: imgBase64,
      });
    }

    if (imagensFalhadas.length > 0) {
      console.warn("Imagens ignoradas (formato não suportado ou ficheiro inválido):", imagensFalhadas);
    }

    // ── Montar payload ────────────────────────────────────
    const payload = {
      nome:        formData.nome,
      descricao:   formData.descricao,
      badges:      formData.badges,
      nuit:        formData.nuit,
      fundacao:    formData.fundacao,
      porte:       formData.porte,
      industria:   formData.industria,
      legalizada:  formData.legalizada,
      provincia:   formData.provincia,
      cidade:      formData.cidade,
      endereco:    formData.endereco,
      email:       formData.email,
      telefone:    formData.telefone,
      website:     formData.website,
      linkedin:    formData.linkedin,
      twitter:     formData.twitter,
      logo:        logoBase64,
      cover:       coverBase64,
      servicos:    servicosComBase64,
      stats:       formData.stats,
    };

    // ── Verificar tamanho total antes de enviar ───────────
    const payloadStr = JSON.stringify(payload);
    const totalMB = (payloadStr.length) / (1024 * 1024);
    console.log("Tamanho total do payload: " + totalMB.toFixed(2) + " MB");

    if (totalMB > 35) {
      throw new Error(
        "Os ficheiros são demasiado grandes (" + totalMB.toFixed(1) + " MB). " +
        "Reduz o número ou tamanho das imagens e tenta novamente."
      );
    }

    // ── Enviar para o Apps Script ─────────────────────────
    _showStatus("A enviar para o Google Drive... isto pode demorar um pouco.", "loading");

    const res = await fetchWithRetry(CONFIG.SCRIPT_URL, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" }, // evita preflight CORS
      body:    payloadStr,
    });

    const result = await res.json();

    if (result.ok) {
      let msg = `✅ "${result.empresa}" guardada com sucesso! <a href="${result.pasta}" target="_blank">Ver no Drive →</a>`;
      if (imagensFalhadas.length > 0) {
        msg += `<br><br>⚠️ Estas imagens não foram guardadas (formato não suportado, ex: HEIC do iPhone — converte para JPG/PNG e tenta de novo): ${imagensFalhadas.join(", ")}`;
      }
      _showStatus(msg, "success");
    } else {
      throw new Error(result.erro || "Erro desconhecido");
    }

  } catch (err) {
    console.error(err);
    let msg = err.message;
    if (msg === "Failed to fetch") {
      msg = "Falha de ligação à internet ou ficheiros demasiado grandes. Verifica a tua ligação e tenta novamente, ou reduz o número de imagens.";
    }
    _showStatus("❌ Erro: " + msg, "error");
  }
}

// ============================================================
//  Fetch com retry automático (2 tentativas extra)
//  Útil para redes móveis instáveis
// ============================================================
async function fetchWithRetry(url, options, retries = 2, delayMs = 1500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt === retries) throw err;
      _showStatus(`Ligação falhou, a tentar novamente (${attempt + 1}/${retries})...`, "loading");
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// ============================================================
//  UTILITÁRIO — mostrar mensagem de estado no ecrã
// ============================================================
function _showStatus(msg, type) {
  const el = document.getElementById("status-msg");
  if (!el) return;
  el.innerHTML     = msg;
  el.className     = "status-msg status-" + type;
  el.style.display = "block";
}

// Função vazia — já não precisamos de Google OAuth
function initGoogleDrive() {}