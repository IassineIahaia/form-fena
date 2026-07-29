// ============================================================
//  drive-facim.js — Envio da Manifestação de Interesse FACIM 2026
//  Usa o mesmo CONFIG.SCRIPT_URL e a mesma lógica de retry do
//  drive.js original (vertentes "empresa"/"individual").
// ============================================================

// ── Compressão de imagens (idêntica à do drive.js) ──
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