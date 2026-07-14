// ============================================================
//  drive.js — OHOLO Hub · Envio via Apps Script
//  Suporta vertente "empresa" e "individual"
// ============================================================

function compressImage(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);

    const tipo    = (file.type || "").toLowerCase();
    const nomeExt = (file.name || "").toLowerCase();
    if (tipo.includes("heic") || tipo.includes("heif") || nomeExt.endsWith(".heic") || nomeExt.endsWith(".heif")) {
      console.warn("Formato HEIC/HEIF não suportado, a ignorar imagem:", file.name);
      resolve(null);
      return;
    }

    const img    = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width  = maxDim;
          } else if (height > maxDim) {
            width  = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width  = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (err) {
          console.warn("Erro ao comprimir imagem:", file.name, err);
          resolve(null);
        }
      };
      img.onerror = () => { console.warn("Imagem ilegível:", file.name); resolve(null); };
      img.src = e.target.result;
    };
    reader.onerror = () => { console.warn("Erro ao ler ficheiro:", file.name); resolve(null); };
    reader.readAsDataURL(file);
  });
}

// ============================================================
//  PROCESSO COMPLETO
// ============================================================
async function submitCompanyToDrive(formData) {
  _showStatus("A preparar dados...", "loading");

  try {
    const imagensFalhadas = [];
    const isEmpresa       = formData.vertente !== 'individual';

    // ── Comprimir imagens ─────────────────────────────────
    let logoBase64  = null;
    let coverBase64 = null;
    let fotoBase64  = null;

    if (isEmpresa) {
      _showStatus("A comprimir imagens (logo e capa)...", "loading");
      logoBase64  = await compressImage(formData.logo,  800,  0.8);
      coverBase64 = await compressImage(formData.cover, 1280, 0.75);
      if (formData.logo  && !logoBase64)  imagensFalhadas.push("Logótipo");
      if (formData.cover && !coverBase64) imagensFalhadas.push("Imagem de capa");
    } else {
      _showStatus("A comprimir foto de perfil...", "loading");
      fotoBase64 = await compressImage(formData.foto, 800, 0.8);
      if (formData.foto && !fotoBase64) imagensFalhadas.push("Foto de perfil");
    }

    // ── Comprimir imagens dos serviços (só empresa) ───────
    const servicosComBase64 = [];
    if (isEmpresa) {
      for (let i = 0; i < formData.servicos.length; i++) {
        const s = formData.servicos[i];
        _showStatus(`A comprimir imagem do serviço ${i + 1}/${formData.servicos.length}...`, "loading");
        const imgBase64 = await compressImage(s.imagem, 1000, 0.7);
        if (s.imagem && !imgBase64) imagensFalhadas.push(`Imagem do serviço "${s.nome || i + 1}"`);
        servicosComBase64.push({ nome: s.nome, descricao: s.descricao, imagemBase64: imgBase64 });
      }
    }

    if (imagensFalhadas.length > 0) {
      console.warn("Imagens ignoradas:", imagensFalhadas);
    }

    // ── Montar payload consoante a vertente ───────────────
    let payload;

    if (isEmpresa) {
      payload = {
        vertente:   'empresa',
        nome:       formData.nome,
        descricao:  formData.descricao,
        badges:     formData.badges     || [],
        nuit:       formData.nuit       || "",
        fundacao:   formData.fundacao   || "",
        porte:      formData.porte      || "",
        industria:  formData.industria  || "",
        legalizada: formData.legalizada || "",
        provincia:  formData.provincia  || "",
        cidade:     formData.cidade     || "",
        endereco:   formData.endereco   || "",
        email:      formData.email      || "",
        telefone:   formData.telefone   || "",
        website:    formData.website    || "",
        linkedin:   formData.linkedin   || "",
        twitter:    formData.twitter    || "",
        logo:       logoBase64,
        cover:      coverBase64,
        servicos:   servicosComBase64,
        stats:      formData.stats      || {},
      };
    } else {
      payload = {
        vertente:     'individual',
        nome:         formData.nome,
        profissao:    formData.profissao    || "",
        areas:        formData.areas        || "",
        descricao:    formData.descricao,
        provincia:    formData.provincia    || "",
        cidade:       formData.cidade       || "",
        email:        formData.email        || "",
        telefone:     formData.telefone     || "",
        website:      formData.website      || "",
        linkedin:     formData.linkedin     || "",
        twitter:      formData.twitter      || "",
        foto:         fotoBase64,
        competencias: formData.competencias || [],
        servicosDesc: formData.servicosDesc || "",
      };
    }

    // ── Verificar tamanho ─────────────────────────────────
    const payloadStr = JSON.stringify(payload);
    const totalMB    = payloadStr.length / (1024 * 1024);
    console.log("Tamanho total do payload: " + totalMB.toFixed(2) + " MB");

    if (totalMB > 35) {
      throw new Error(
        "Os ficheiros são demasiado grandes (" + totalMB.toFixed(1) + " MB). " +
        "Reduz o número ou tamanho das imagens e tenta novamente."
      );
    }

    // ── Enviar ────────────────────────────────────────────
    _showStatus("A enviar para o servidor... isto pode demorar um pouco.", "loading");

    const res    = await fetchWithRetry(CONFIG.SCRIPT_URL, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },
      body:    payloadStr,
    });
    const result = await res.json();

    if (result.ok) {
      let msg = `✅ "${result.nome}" guardado com sucesso!`;
      if (imagensFalhadas.length > 0) {
        msg += `<br><br>⚠️ Estas imagens não foram guardadas (formato não suportado): ${imagensFalhadas.join(", ")}`;
      }
      _showStatus(msg, "success");
    } else {
      throw new Error(result.erro || "Erro desconhecido");
    }

  } catch (err) {
    console.error(err);
    let msg = err.message;
    if (msg === "Failed to fetch") {
      msg = "Falha de ligação à internet. Verifica a tua ligação e tenta novamente.";
    }
    _showStatus("❌ Erro: " + msg, "error");
  }
}

// ============================================================
//  Fetch com retry
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
//  Utilitário — mostrar estado
// ============================================================
function _showStatus(msg, type) {
  const el = document.getElementById("status-msg");
  if (!el) return;
  el.innerHTML     = msg;
  el.className     = "status-msg status-" + type;
  el.style.display = "block";
}

function initGoogleDrive() {}