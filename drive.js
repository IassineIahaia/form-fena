// ============================================================
//  drive.js — B2B Mozambique · Google Drive API
//  Responsabilidades:
//    1. Autenticar o utilizador com Google OAuth
//    2. Criar pasta da empresa no Drive
//    3. Fazer upload de ficheiros (imagens + JSON)
// ============================================================

// ── Estado global ───────────────────────────────────────────
let tokenClient   = null;   // cliente OAuth Google
let accessToken   = null;   // token activo após login
let onReadyCallback = null; // função chamada após auth ok

// ============================================================
//  1. INICIALIZAR — chamado no window.onload do index.html
// ============================================================
function initGoogleDrive() {
  google.accounts.oauth2 && _initTokenClient();
}

function _initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope:     CONFIG.SCOPES,
    callback:  (response) => {
      if (response.error) {
        _showStatus("Erro na autenticação: " + response.error, "error");
        return;
      }
      accessToken = response.access_token;
      _showStatus("Autenticado com Google ✓", "success");
      if (onReadyCallback) onReadyCallback();
    },
  });
}

// ============================================================
//  2. LOGIN — abre popup Google para o utilizador autorizar
// ============================================================
function googleLogin(callback) {
  onReadyCallback = callback;
  if (!tokenClient) {
    _showStatus("API Google ainda não carregou. Aguarda 2 segundos.", "error");
    return;
  }
  if (accessToken) {
    // já autenticado — corre callback directamente
    if (callback) callback();
    return;
  }
  tokenClient.requestAccessToken({ prompt: "consent" });
}

// ============================================================
//  3. CRIAR PASTA DA EMPRESA NO DRIVE
//  Retorna: { id, webViewLink }
// ============================================================
async function createCompanyFolder(companyName) {
  const meta = {
    name:     companyName,
    mimeType: "application/vnd.google-apps.folder",
    parents:  [CONFIG.FOLDER_ID],
  };

  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method:  "POST",
    headers: {
      Authorization:  "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(meta),
  });

  if (!res.ok) throw new Error("Erro ao criar pasta: " + res.statusText);
  return res.json(); // { id, webViewLink }
}

// ============================================================
//  4. UPLOAD DE FICHEIRO (imagem ou qualquer File object)
//  Parâmetros:
//    file      — File object do input
//    fileName  — nome final no Drive (ex: "logo.png")
//    folderId  — ID da pasta da empresa criada acima
// ============================================================
async function uploadFile(file, fileName, folderId) {
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });

  const form = new FormData();
  form.append("metadata", new Blob([meta], { type: "application/json" }));
  form.append("file", file);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method:  "POST",
      headers: { Authorization: "Bearer " + accessToken },
      body:    form,
    }
  );

  if (!res.ok) throw new Error("Erro ao fazer upload de " + fileName + ": " + res.statusText);
  return res.json(); // { id, webViewLink }
}

// ============================================================
//  5. UPLOAD DE JSON (dados da empresa)
//  Guarda um ficheiro "dados.json" na pasta da empresa
// ============================================================
async function uploadJSON(data, folderId) {
  const blob    = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const jsonFile = new File([blob], "dados.json", { type: "application/json" });
  return uploadFile(jsonFile, "dados.json", folderId);
}

// ============================================================
//  6. PROCESSO COMPLETO — chamado pelo formulário ao submeter
//  Orquestra: login → criar pasta → uploads → JSON
// ============================================================
async function submitCompanyToDrive(formData) {
  // formData = {
  //   nome, descricao, nuit, fundacao, funcionarios,
  //   industria, provincia, email, telefone, website,
  //   linkedin, twitter, badges,
  //   logo        : File,
  //   cover       : File,
  //   servicos    : [{ nome, descricao, precoTipo, preco, imagem: File }],
  //   stats       : { exp, entregas, rating, frota, labels: [] },
  // }

  _showStatus("A autenticar com Google...", "loading");

  googleLogin(async () => {
    try {
      const companyName = formData.nome.trim() || "Empresa_sem_nome";

      // ── Passo 1: criar pasta ──────────────────────────────
      _showStatus("A criar pasta no Drive...", "loading");
      const folder = await createCompanyFolder(companyName);
      const folderId = folder.id;

      // ── Passo 2: upload logo ──────────────────────────────
      let logoLink = null;
      if (formData.logo) {
        _showStatus("A fazer upload do logótipo...", "loading");
        const ext  = formData.logo.name.split(".").pop();
        const logo = await uploadFile(formData.logo, "logo." + ext, folderId);
        logoLink   = logo.webViewLink;
      }

      // ── Passo 3: upload cover ─────────────────────────────
      let coverLink = null;
      if (formData.cover) {
        _showStatus("A fazer upload da imagem de capa...", "loading");
        const ext   = formData.cover.name.split(".").pop();
        const cover = await uploadFile(formData.cover, "cover." + ext, folderId);
        coverLink   = cover.webViewLink;
      }

      // ── Passo 4: upload imagens dos serviços ──────────────
      const servicosComLinks = [];
      for (let i = 0; i < formData.servicos.length; i++) {
        const s = formData.servicos[i];
        let imgLink = null;
        if (s.imagem) {
          _showStatus(`A fazer upload: serviço ${i + 1}...`, "loading");
          const ext = s.imagem.name.split(".").pop();
          const img = await uploadFile(s.imagem, `servico_${i + 1}.${ext}`, folderId);
          imgLink   = img.webViewLink;
        }
        servicosComLinks.push({ ...s, imagem: undefined, imagemUrl: imgLink });
      }

      // ── Passo 5: montar JSON final e fazer upload ─────────
      _showStatus("A guardar dados.json...", "loading");
      const payload = {
        _meta: {
          versao:    "1.0",
          criadoEm:  new Date().toISOString(),
          pastaId:   folderId,
          pastaUrl:  folder.webViewLink,
        },
        empresa: {
          nome:        formData.nome,
          descricao:   formData.descricao,
          badges:      formData.badges,
          nuit:        formData.nuit,
          fundacao:    formData.fundacao,
          funcionarios:formData.funcionarios,
          industria:   formData.industria,
          provincia:   formData.provincia,
          contactos: {
            email:    formData.email,
            telefone: formData.telefone,
            website:  formData.website,
            linkedin: formData.linkedin,
            twitter:  formData.twitter,
          },
          media: {
            logoUrl:  logoLink,
            coverUrl: coverLink,
          },
          servicos: servicosComLinks,
          stats:    formData.stats,
        },
      };

      await uploadJSON(payload, folderId);

      // ── Sucesso ───────────────────────────────────────────
      _showStatus(
        `✅ "${companyName}" guardada com sucesso! <a href="${folder.webViewLink}" target="_blank">Ver no Drive →</a>`,
        "success"
      );

    } catch (err) {
      console.error(err);
      _showStatus("❌ Erro: " + err.message, "error");
    }
  });
}

// ============================================================
//  UTILITÁRIO — mostrar mensagem de estado no ecrã
// ============================================================
function _showStatus(msg, type) {
  const el = document.getElementById("status-msg");
  if (!el) return;
  el.innerHTML  = msg;
  el.className  = "status-msg status-" + type;
  el.style.display = "block";
}
