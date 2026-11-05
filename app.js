(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = {
    zipFile: null,
    templateFile: null,
    archiveBytes: null,
    members: [],
    pairs: [],
    selected: 0,
    generated: [],
    downloadUrl: null,
    previewUrl: null,
    templateUrl: null,
    sourceUrls: [],
    installPrompt: null,
    customFontFace: null,
    previewTimer: null,
    busy: false,
  };

  const DEFAULTS = {
    keyColor: "#005A00", tolerance: 28, edgeSoftness: 14, minSaturation: 18, spill: 75,
    removeBg: true, scaleSkin: true, skinX: 70, skinY: 40, skinW: 500, skinH: 490,
    femaleX: 105, femaleY: 397, femaleAreaW: 80, femaleAreaH: 52,
    maleX: 1260, maleY: 1110, maleAreaW: 80, maleAreaH: 52,
    clearCodes: true, fitText: true, fontSize: 36, fontStyle: "custom",
    textColor: "#111111", coverColor: "#FFFFFF", scaleCode: true,
    enhance: true, sharpness: 18,
  };

  const EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "gif"]);
  const MAX_ZIP_BYTES = 100 * 1024 * 1024;
  const MAX_IMAGES = 200;
  const MAX_IMAGE_PIXELS = 12_000_000;
  const SETTINGS_KEY = "vela-card-settings-v3";

  function settings() {
    const num = (id) => Math.max(0, Number($(id).value) || 0);
    return {
      keyColor: $("keyColor").value.toUpperCase(),
      tolerance: num("tolerance"), edgeSoftness: num("edgeSoftness"), minSaturation: num("minSaturation"), spill: num("spill"),
      removeBg: $("removeBg").checked, scaleSkin: $("scaleSkin").checked,
      skinX: num("skinX"), skinY: num("skinY"), skinW: Math.max(1, num("skinW")), skinH: Math.max(1, num("skinH")),
      femaleX: num("femaleX"), femaleY: num("femaleY"), femaleAreaW: Math.max(1, num("femaleAreaW")), femaleAreaH: Math.max(1, num("femaleAreaH")),
      maleX: num("maleX"), maleY: num("maleY"), maleAreaW: Math.max(1, num("maleAreaW")), maleAreaH: Math.max(1, num("maleAreaH")),
      clearCodes: $("clearCodes").checked, fitText: $("fitText").checked,
      scaleCode: $("scaleCode").checked, fontSize: Math.max(8, Number($("fontSize").value) || 36),
      fontStyle: $("fontStyle").value, textColor: $("textColor").value, coverColor: $("coverColor").value,
      enhance: $("enhance").checked, sharpness: num("sharpness"),
    };
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings())); } catch { /* local storage is optional */ }
  }

  function restoreSettings() {
    let saved = {};
    try {
      const current = localStorage.getItem(SETTINGS_KEY);
      saved = JSON.parse(current || localStorage.getItem("vela-card-settings-v2") || "{}");
      if (!current) saved.fontStyle = "custom";
    } catch { saved = {}; }
    const merged = { ...DEFAULTS, ...saved };
    const ids = {
      keyColor: "keyColor", tolerance: "tolerance", edgeSoftness: "edgeSoftness", minSaturation: "minSaturation", spill: "spill",
      removeBg: "removeBg", scaleSkin: "scaleSkin", skinX: "skinX", skinY: "skinY", skinW: "skinW", skinH: "skinH",
      femaleX: "femaleX", femaleY: "femaleY", femaleAreaW: "femaleAreaW", femaleAreaH: "femaleAreaH",
      maleX: "maleX", maleY: "maleY", maleAreaW: "maleAreaW", maleAreaH: "maleAreaH",
      clearCodes: "clearCodes", fitText: "fitText", fontSize: "fontSize", fontStyle: "fontStyle",
      textColor: "textColor", coverColor: "coverColor", scaleCode: "scaleCode", enhance: "enhance", sharpness: "sharpness",
    };
    Object.entries(ids).forEach(([key, id]) => {
      const input = $(id);
      if (input.type === "checkbox") input.checked = Boolean(merged[key]);
      else input.value = merged[key];
    });
    $("fontStatus").textContent = "Nenhum arquivo carregado. Selecione a fonte para aplicá-la aos códigos.";
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)); } catch { /* local storage is optional */ }
    updateRangeLabels();
  }

  function setStatus(element, message, kind = "info") {
    element.textContent = message;
    element.className = `status-message ${message ? kind : ""}`;
  }

  let toastTimer;
  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("visible"), 3000);
  }

  function updateRangeLabels() {
    $("keyColorValue").value = $("keyColor").value.toUpperCase();
    $("toleranceValue").value = `${$("tolerance").value}°`;
    $("edgeValue").value = $("edgeSoftness").value;
    $("saturationValue").value = `${$("minSaturation").value}%`;
    $("spillValue").value = `${$("spill").value}%`;
    $("sharpnessValue").value = `${$("sharpness").value}%`;
  }

  function numericId(code) {
    const value = String(code).trim();
    const match = value.match(/^\D*([0-9]{1,20})$/);
    if (!match || /^0+$/.test(match[1])) return null;
    return match[1];
  }

  function parseCodePairs(text) {
    const lines = text.split(/\r?\n/).map((raw, index) => ({ line: raw.trim(), lineNumber: index + 1 })).filter((item) => item.line);
    if (!lines.length) throw new Error("Cole os códigos dos pares para começar.");

    const headerPattern = /^(\d{1,3})\s*[-–—:.)]\s*$/;
    const rolePattern = /^(\S+)\s*\(\s*([MF])\s*\)$/i;
    const numberedMode = lines.some(({ line }) => headerPattern.test(line));

    if (numberedMode) {
      const groups = [];
      const seenNumbers = new Set();
      let current = null;

      for (const { line, lineNumber } of lines) {
        const header = line.match(headerPattern);
        if (header) {
          const imageNumber = Number(header[1]);
          if (!imageNumber) throw new Error("Linha " + lineNumber + ": a numeração das imagens começa em 01.");
          if (seenNumbers.has(imageNumber)) throw new Error("Linha " + lineNumber + ": a imagem " + String(imageNumber).padStart(2, "0") + " está numerada mais de uma vez.");
          seenNumbers.add(imageNumber);
          current = { imageNumber, femaleCode: null, maleCode: null };
          groups.push(current);
          continue;
        }

        if (!current) throw new Error("Linha " + lineNumber + ": coloque um cabeçalho como “01-” antes dos códigos.");
        const tagged = line.match(rolePattern);
        if (!tagged) throw new Error("Linha " + lineNumber + ": use um código por linha e identifique-o como “(M)” ou “(F)”, por exemplo F24244 (M).");
        const code = tagged[1];
        const role = tagged[2].toUpperCase();
        const field = role === "M" ? "maleCode" : "femaleCode";
        if (current[field]) throw new Error("Imagem " + String(current.imageNumber).padStart(2, "0") + ": informe apenas um código (" + role + ").");
        current[field] = code;
      }

      for (const pair of groups) {
        if (!pair.maleCode || !pair.femaleCode) {
          const missing = [!pair.maleCode && "M", !pair.femaleCode && "F"].filter(Boolean).join(" e ");
          throw new Error("Imagem " + String(pair.imageNumber).padStart(2, "0") + ": falta o código " + missing + ".");
        }
        pair.maleId = numericId(pair.maleCode);
        pair.femaleId = numericId(pair.femaleCode);
      }

      groups.sort((a, b) => a.imageNumber - b.imageNumber);
      for (let index = 0; index < groups.length; index++) {
        const expected = index + 1;
        if (groups[index].imageNumber !== expected) {
          throw new Error("A numeração precisa ser contínua de 01 a " + String(groups.length).padStart(2, "0") + ". Está faltando a imagem " + String(expected).padStart(2, "0") + ".");
        }
      }
      return { pairs: groups, numbered: true };
    }

    const pairs = [];
    for (const { line, lineNumber } of lines) {
      const codes = line.split(/[\s,;]+/).filter(Boolean);
      if (codes.length !== 2) throw new Error("Linha " + lineNumber + ": informe dois códigos na mesma linha (feminino primeiro, masculino depois), ou use o formato numerado com (M)/(F).");
      const femaleId = numericId(codes[0]);
      const maleId = numericId(codes[1]);
      if (!femaleId || !maleId) throw new Error("Linha " + lineNumber + ": cada código precisa conter exatamente um ID numérico para a conferência Roblox. As letras e símbolos do código serão mantidos no card.");
      pairs.push({ femaleCode: codes[0], maleCode: codes[1], femaleId, maleId });
    }
    return { pairs, numbered: false };
  }

  function naturalCompare(a, b) {
    return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
  }

  function readUint16(view, offset) { return view.getUint16(offset, true); }
  function readUint32(view, offset) { return view.getUint32(offset, true); }

  async function inflateRaw(data) {
    if (typeof DecompressionStream === "undefined") throw new Error("Este navegador não abre ZIPs compactados. Atualize o navegador ou use outro ZIP.");
    try {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      throw new Error("Não consegui descompactar uma imagem do ZIP. Recompacte como ZIP padrão e tente novamente.");
    }
  }

  async function readImageEntries(zipFile, preserveArchiveOrder = false) {
    if (zipFile.size > MAX_ZIP_BYTES) throw new Error("O ZIP passou de 100 MB. Divida o lote em arquivos menores.");
    const bytes = new Uint8Array(await zipFile.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    const searchStart = Math.max(0, bytes.length - 65_557);
    for (let pos = bytes.length - 22; pos >= searchStart; pos--) {
      if (readUint32(view, pos) === 0x06054b50) { end = pos; break; }
    }
    if (end < 0) throw new Error("O arquivo escolhido não parece ser um ZIP válido.");
    const entries = readUint16(view, end + 10);
    const centralSize = readUint32(view, end + 12);
    let offset = readUint32(view, end + 16);
    if (entries > 500 || offset + centralSize > bytes.length) throw new Error("O ZIP tem uma estrutura ou quantidade de arquivos não suportada.");
    const decoder = new TextDecoder("utf-8");
    const images = [];
    let expandedTotal = 0;

    for (let i = 0; i < entries; i++) {
      if (readUint32(view, offset) !== 0x02014b50) throw new Error("O índice do ZIP está danificado.");
      const flags = readUint16(view, offset + 8);
      const method = readUint16(view, offset + 10);
      const compressedSize = readUint32(view, offset + 20);
      const uncompressedSize = readUint32(view, offset + 24);
      const nameLength = readUint16(view, offset + 28);
      const extraLength = readUint16(view, offset + 30);
      const commentLength = readUint16(view, offset + 32);
      const localOffset = readUint32(view, offset + 42);
      const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
      const name = decoder.decode(nameBytes).replaceAll("\\", "/");
      offset += 46 + nameLength + extraLength + commentLength;
      if (name.endsWith("/") || name.startsWith("/") || name.split("/").includes("..")) continue;
      const ext = name.split(".").pop().toLowerCase();
      if (!EXTENSIONS.has(ext)) continue;
      if (flags & 1) throw new Error("Este ZIP é protegido por senha. Remova a senha e tente de novo.");
      if (uncompressedSize > 60 * 1024 * 1024) throw new Error(`A imagem ${name} é grande demais para processar no celular.`);
      expandedTotal += uncompressedSize;
      if (expandedTotal > 500 * 1024 * 1024) throw new Error("O tamanho total das imagens excede 500 MB. Separe o lote.");
      if (readUint32(view, localOffset) !== 0x04034b50) throw new Error(`O arquivo ${name} está incompleto no ZIP.`);
      const localNameLength = readUint16(view, localOffset + 26);
      const localExtraLength = readUint16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) data = await inflateRaw(compressed);
      else throw new Error(`O ZIP usa um método de compactação não suportado na imagem ${name}.`);
      images.push({ name, data, ext, blob: new Blob([data], { type: mimeForExt(ext) }) });
      if (images.length > MAX_IMAGES) throw new Error(`O lote passou de ${MAX_IMAGES} imagens. Divida em arquivos menores para funcionar melhor no celular.`);
    }
    if (!images.length) throw new Error("Não encontrei imagens no ZIP. Use PNG, JPG ou WebP.");
    return preserveArchiveOrder ? images : images.sort((a, b) => naturalCompare(a.name, b.name));
  }

  function mimeForExt(ext) {
    return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", bmp: "image/bmp", gif: "image/gif" })[ext] || "application/octet-stream";
  }

  function idsInName(name) { return new Set(name.match(/\d+/g) || []); }

  function makePairings(members, parsedCodes) {
    const rawPairs = parsedCodes.pairs;
    if (members.length !== rawPairs.length) throw new Error(`O ZIP contém ${members.length} imagem(ns), mas há ${rawPairs.length} pares de códigos. Deve haver uma imagem por par.`);
    if (parsedCodes.numbered) {
      return rawPairs.map((pair) => {
        const imageIndex = pair.imageNumber - 1;
        const member = members[imageIndex];
        if (!member) throw new Error("Não encontrei a imagem " + String(pair.imageNumber).padStart(2, "0") + " na ordem do ZIP.");
        const nameIds = idsInName(member.name);
        const matchedByFilename = nameIds.has(pair.femaleId) && nameIds.has(pair.maleId);
        return { ...pair, imageIndex, member, matchedByFilename, numbered: true, confirmed: false, refs: {} };
      });
    }
    const assignments = new Map();
    const reserved = new Set();
    rawPairs.forEach((pair, pairIndex) => {
      const matches = members.map((member, i) => ({ member, i, ids: idsInName(member.name) }))
        .filter((row) => row.ids.has(pair.femaleId) && row.ids.has(pair.maleId));
      if (matches.length === 1 && !reserved.has(matches[0].i)) {
        assignments.set(pairIndex, matches[0].i);
        reserved.add(matches[0].i);
      }
    });
    const freeImages = members.map((_, index) => index).filter((index) => !reserved.has(index));
    const freePairs = rawPairs.map((_, index) => index).filter((index) => !assignments.has(index));
    freePairs.forEach((pairIndex, i) => assignments.set(pairIndex, freeImages[i]));
    return rawPairs.map((pair, index) => {
      const imageIndex = assignments.get(index);
      const member = members[imageIndex];
      const nameIds = idsInName(member.name);
      const matchedByFilename = nameIds.has(pair.femaleId) && nameIds.has(pair.maleId);
      return { ...pair, imageIndex, member, matchedByFilename, numbered: false, confirmed: false, refs: {} };
    });
  }

  async function fetchReferences(pairs) {
    const ids = [...new Set(pairs.flatMap((pair) => [pair.femaleId, pair.maleId]).filter(Boolean))];
    const found = new Map();
    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100);
      const query = new URLSearchParams({ userIds: batch.join(","), size: "420x420", format: "Png", isCircular: "false" });
      let payload;
      try {
        const proxyUrl = new URL("./api/roblox-avatar", location.href);
        proxyUrl.search = query.toString();
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("proxy");
        payload = await response.json();
      } catch {
        try {
          const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?${query}`);
          if (!response.ok) throw new Error("Roblox indisponível");
          payload = await response.json();
        } catch {
          batch.forEach((id) => found.set(id, { status: "Consulta indisponível. Confira visualmente pela imagem e pela ordem do ZIP." }));
          continue;
        }
      }
      (payload.data || []).forEach((entry) => {
        const id = String(entry.targetId);
        found.set(id, entry.state === "Completed" && entry.imageUrl
          ? { url: entry.imageUrl, status: "Miniatura encontrada no Roblox" }
          : { status: `Miniatura não disponível (${entry.state || "aguardando"})` });
      });
      batch.forEach((id) => { if (!found.has(id)) found.set(id, { status: "ID não retornado pelo Roblox." }); });
    }
    return found;
  }

  function freeOwnedUrls() {
    state.sourceUrls.forEach((url) => URL.revokeObjectURL(url));
    state.sourceUrls = [];
  }

  function clearDownload() {
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = null;
    $("downloadBtn").hidden = true;
  }

  function invalidatePairs(message = "Os arquivos ou códigos mudaram. Prepare os pares novamente.") {
    freeOwnedUrls();
    state.pairs = [];
    state.selected = 0;
    $("pairWorkspace").hidden = true;
    $("pairEmpty").hidden = false;
    if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; }
    $("cardPreview").hidden = true;
    $("canvasPlaceholder").hidden = false;
    setStatus($("prepareStatus"), message, "info");
    clearDownload();
    updateReadyState();
  }

  function lockControls(locked) {
    ["zipInput", "templateInput", "codesInput", "prepareBtn", "prevPair", "nextPair", "confirmPair"].forEach((id) => { $(id).disabled = locked; });
    document.querySelectorAll(".settings-content input,.settings-content select").forEach((input) => { input.disabled = locked; });
  }

  function renderPair() {
    if (!state.pairs.length) return;
    const pair = state.pairs[state.selected];
    $("pairWorkspace").hidden = false;
    $("pairEmpty").hidden = true;
    $("pairCount").textContent = pair.numbered
      ? "Par " + String(pair.imageNumber).padStart(2, "0") + " · imagem " + String(pair.imageNumber).padStart(2, "0") + " de " + state.pairs.length
      : "Par " + (state.selected + 1) + " de " + state.pairs.length;
    $("pairSource").src = pair.sourceUrl;
    $("femaleCodeLabel").textContent = pair.femaleCode;
    $("maleCodeLabel").textContent = pair.maleCode;
    const fRef = pair.femaleId
      ? pair.refs[pair.femaleId] || { status: "Miniatura Roblox indisponível." }
      : { status: "Código alfanumérico: confira pela imagem e pela ordem do ZIP." };
    const mRef = pair.maleId
      ? pair.refs[pair.maleId] || { status: "Miniatura Roblox indisponível." }
      : { status: "Código alfanumérico: confira pela imagem e pela ordem do ZIP." };
    $("femaleRef").hidden = !fRef.url;
    $("maleRef").hidden = !mRef.url;
    $("femaleRef").src = fRef.url || "";
    $("maleRef").src = mRef.url || "";
    $("femaleRefStatus").textContent = fRef.status || "";
    $("maleRefStatus").textContent = mRef.status || "";
    $("pairMatch").textContent = pair.numbered
      ? "Imagem " + String(pair.imageNumber).padStart(2, "0") + " na ordem do ZIP: " + pair.member.name + ". Os códigos foram associados pelo número informado."
      : pair.matchedByFilename
        ? "✓ Os dois IDs aparecem no nome deste arquivo: " + pair.member.name + "."
        : "Arquivo associado pela ordem natural do nome: " + pair.member.name;
    $("pairMatch").className = "pair-match " + (!pair.numbered && pair.matchedByFilename ? "match-good" : "match-warn");
    $("confirmPair").checked = pair.confirmed;
    const count = state.pairs.filter((item) => item.confirmed).length;
    $("reviewProgress").style.width = `${(count / state.pairs.length) * 100}%`;
    $("reviewCount").textContent = `${count} de ${state.pairs.length} confirmados`;
    updateReadyState();
    schedulePreview();
  }

  async function preparePairs() {
    if (state.busy) return;
    const status = $("prepareStatus");
    try {
      if (!state.zipFile) throw new Error("Escolha primeiro o ZIP das skins.");
      if (!state.templateFile) throw new Error("Escolha também o template do card.");
      const parsedCodes = parseCodePairs($("codesInput").value);
      if (state.zipFile.size > MAX_ZIP_BYTES) throw new Error("O ZIP passou de 100 MB. Divida o lote em partes menores.");
      state.busy = true;
      lockControls(true);
      $("prepareBtn").disabled = true;
      $("prepareBtn").querySelector("span").textContent = "Lendo ZIP e organizando códigos…";
      setStatus(status, "Abrindo o ZIP localmente…", "info");
      const members = await readImageEntries(state.zipFile, parsedCodes.numbered);
      const pairs = makePairings(members, parsedCodes);
      freeOwnedUrls();
      pairs.forEach((pair) => {
        pair.sourceUrl = URL.createObjectURL(pair.member.blob);
        state.sourceUrls.push(pair.sourceUrl);
      });
      state.members = members;
      state.pairs = pairs;
      state.selected = 0;
      setStatus(status, `Encontrei ${pairs.length} par(es). Consultando miniaturas quando há um ID numérico…`, "info");
      const references = await fetchReferences(pairs);
      pairs.forEach((pair) => {
        if (pair.femaleId) pair.refs[pair.femaleId] = references.get(pair.femaleId) || { status: "Miniatura indisponível." };
        if (pair.maleId) pair.refs[pair.maleId] = references.get(pair.maleId) || { status: "Miniatura indisponível." };
      });
      renderPair();
      setStatus(status, `Pronto: ${pairs.length} par(es). Revise cada imagem e marque a confirmação.`, "success");
      document.querySelector("#conferir").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(status, error.message || "Não consegui preparar os pares.", "error");
    } finally {
      state.busy = false;
      lockControls(false);
      $("prepareBtn").disabled = false;
      $("prepareBtn").querySelector("span").textContent = "Preparar pares para conferência";
      updateReadyState();
    }
  }

  function colorHexToRgb(hex) {
    const clean = hex.replace("#", "");
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
    }
    if (hue < 0) hue += 360;
    return [hue, max === 0 ? 0 : delta / max, max];
  }

  function smoothstep(value) { return value * value * (3 - 2 * value); }

  async function loadBitmap(blob) {
    if ("createImageBitmap" in window) return createImageBitmap(blob);
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não consegui abrir uma das imagens.")); };
      img.src = url;
    });
  }

  function removeChroma(imageData, config) {
    const data = imageData.data;
    const key = colorHexToRgb(config.keyColor);
    const keyHue = rgbToHsv(...key)[0];
    const tolerance = Math.max(1, config.tolerance);
    const edge = Math.max(1, config.edgeSoftness);
    const saturationFloor = config.minSaturation / 100;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [hue, saturation, value] = rgbToHsv(r, g, b);
      let hueDistance = Math.abs(hue - keyHue);
      hueDistance = Math.min(hueDistance, 360 - hueDistance);
      const hueScore = smoothstep(Math.max(0, Math.min(1, (tolerance + edge - hueDistance) / edge)));
      const saturationScore = Math.max(0, Math.min(1, (saturation - saturationFloor) / Math.max(.05, .62 - saturationFloor)));
      const brightnessScore = Math.max(0, Math.min(1, value / .22));
      const greenDominance = Math.max((g - Math.max(r, b)) / 255, 0);
      const dominanceScore = Math.max(0, Math.min(1, greenDominance / .08));
      const screenMatch = hueScore * saturationScore * brightnessScore * dominanceScore;
      const alpha = data[i + 3] / 255;
      const edgeWeight = Math.max(0, Math.min(1, screenMatch * alpha * 2));
      const greenExcess = Math.max(0, Math.min(1, g / 255 - Math.max(r, b) / 255 - .025));
      const reducedGreen = g / 255 - greenExcess * edgeWeight * (config.spill / 100);
      data[i + 1] = Math.max(Math.max(r, b) / 255 * .88, reducedGreen) * 255;
      data[i + 3] = alpha * (1 - screenMatch) * 255;
    }
    return imageData;
  }

  function cropTransparent(canvas, threshold = 36) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > threshold) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right < left || bottom < top) return canvas;
    const pad = 3;
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    right = Math.min(canvas.width - 1, right + pad); bottom = Math.min(canvas.height - 1, bottom + pad);
    const crop = document.createElement("canvas");
    crop.width = right - left + 1; crop.height = bottom - top + 1;
    crop.getContext("2d").putImageData(ctx.getImageData(left, top, crop.width, crop.height), 0, 0);
    return crop;
  }

  async function cutoutSkin(blob, config) {
    const bitmap = await loadBitmap(blob);
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) { bitmap.close?.(); throw new Error("Uma imagem do ZIP tem resolução grande demais para o celular."); }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    if (config.removeBg) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.putImageData(removeChroma(pixels, config), 0, 0);
    }
    return cropTransparent(canvas);
  }

  function sharpenCanvas(canvas, amount) {
    if (amount <= 0 || canvas.width < 3 || canvas.height < 3) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = image.data;
    const out = new Uint8ClampedArray(src);
    const strength = amount / 100;
    const width = canvas.width, height = canvas.height;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const p = (y * width + x) * 4;
        if (src[p + 3] < 16) continue;
        for (let channel = 0; channel < 3; channel++) {
          const neighbors = (src[p - 4 + channel] + src[p + 4 + channel] + src[p - width * 4 + channel] + src[p + width * 4 + channel]) / 4;
          out[p + channel] = src[p + channel] + (src[p + channel] - neighbors) * strength;
        }
      }
    }
    image.data.set(out);
    ctx.putImageData(image, 0, 0);
  }

  async function composeCard(pair, config) {
    const templateBitmap = await loadBitmap(state.templateFile);
    const width = templateBitmap.width, height = templateBitmap.height;
    if (width * height > 18_000_000) {
      templateBitmap.close?.();
      throw new Error("O template é grande demais para processar com segurança no celular. Redimensione para até 18 megapixels.");
    }
    const result = document.createElement("canvas");
    result.width = width; result.height = height;
    const ctx = result.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(templateBitmap, 0, 0, width, height);
    templateBitmap.close?.();

    const skin = await cutoutSkin(pair.member.blob, config);
    const scaleX = config.scaleSkin ? width / 640 : 1;
    const scaleY = config.scaleSkin ? height / 640 : 1;
    const boxX = Math.round(config.skinX * scaleX), boxY = Math.round(config.skinY * scaleY);
    const boxW = Math.max(1, Math.round(config.skinW * scaleX)), boxH = Math.max(1, Math.round(config.skinH * scaleY));
    const fitScale = Math.min(boxW / skin.width, boxH / skin.height);
    const skinW = Math.max(1, Math.round(skin.width * fitScale));
    const skinH = Math.max(1, Math.round(skin.height * fitScale));
    const resizedSkin = document.createElement("canvas");
    resizedSkin.width = skinW; resizedSkin.height = skinH;
    const skinCtx = resizedSkin.getContext("2d", { willReadFrequently: true });
    skinCtx.imageSmoothingEnabled = true;
    skinCtx.imageSmoothingQuality = "high";
    if (config.enhance) skinCtx.filter = "contrast(1.035) saturate(1.025)";
    skinCtx.drawImage(skin, 0, 0, skinW, skinH);
    skinCtx.filter = "none";
    if (config.enhance) sharpenCanvas(resizedSkin, config.sharpness);
    ctx.drawImage(resizedSkin, boxX + Math.floor((boxW - skinW) / 2), boxY + Math.floor((boxH - skinH) / 2));

    const codeScale = config.scaleCode ? Math.min(width / 640, height / 640) : 1;
    const fontBase = config.fontStyle === "custom" && state.customFontFace
      ? '"VelaRealisticNatureUploaded", serif'
      : config.fontStyle === "sans" ? "Arial, sans-serif" : '"Times New Roman", Georgia, serif';
    const fontWeight = config.fontStyle === "bold" ? "700" : "400";
    const drawCode = (code, x, y, baseBoxW, baseBoxH) => {
      const boxW = Math.max(1, Math.round(baseBoxW * codeScale));
      const boxH = Math.max(1, Math.round(baseBoxH * codeScale));
      if (config.clearCodes) {
        ctx.fillStyle = config.coverColor;
        ctx.fillRect(x - 4, y - 4, boxW, boxH);
      }
      let fontSize = Math.max(8, Math.round(config.fontSize * codeScale));
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      const fits = () => {
        ctx.font = `${fontWeight} ${fontSize}px ${fontBase}`;
        const metric = ctx.measureText(code);
        const textH = metric.actualBoundingBoxAscent + metric.actualBoundingBoxDescent || fontSize * 1.15;
        return metric.width <= boxW && textH <= boxH;
      };
      if (config.fitText) while (fontSize > 8 && !fits()) fontSize--;
      ctx.font = `${fontWeight} ${fontSize}px ${fontBase}`;
      ctx.fillStyle = config.textColor;
      if (config.fontStyle === "bold") { ctx.lineWidth = 0; }
      ctx.fillText(code, x, y);
    };
    drawCode(pair.femaleCode, config.femaleX, config.femaleY, config.femaleAreaW, config.femaleAreaH);
    drawCode(pair.maleCode, config.maleX, config.maleY, config.maleAreaW, config.maleAreaH);
    return result;
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não consegui exportar o PNG.")), "image/png"));
  }

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    if (!state.pairs.length || !state.templateFile) return;
    state.previewTimer = setTimeout(async () => {
      try {
        const canvas = await composeCard(state.pairs[state.selected], settings());
        await displayPreview(canvas);
      } catch (error) { setStatus($("generationMessage"), error.message || "Falha ao montar a prévia.", "error"); }
      updateReadyState();
    }, 240);
  }

  function updateReadyState() {
    const reviewed = state.pairs.length > 0 && state.pairs.every((pair) => pair.confirmed);
    const ready = Boolean(state.templateFile && reviewed && !state.busy);
    $("generateBtn").disabled = !ready;
    $("dockGenerate").disabled = !ready;
    $("dockHint").textContent = !state.zipFile || !state.templateFile
      ? "Adicione ZIP e template para começar"
      : !state.pairs.length ? "Prepare os pares para revisar"
        : reviewed ? "Pares revisados. Pronto para gerar!" : `${state.pairs.filter((pair) => pair.confirmed).length}/${state.pairs.length} pares conferidos`;
  }

  function updatePositionWarning(width, height, config = settings()) {
    const scale = config.scaleCode ? Math.min(width / 640, height / 640) : 1;
    const outside = [
      [config.femaleX, config.femaleY, config.femaleAreaW, config.femaleAreaH],
      [config.maleX, config.maleY, config.maleAreaW, config.maleAreaH],
    ].some(([x, y, w, h]) => x < 0 || y < 0 || x >= width || y >= height || x + w * scale > width || y + h * scale > height);
    const warning = $("positionWarning");
    warning.hidden = !outside;
    warning.textContent = outside
      ? `Algum código ou sua área de cobertura passa do limite do template (${width} × ${height} px). X/Y usam pixels da imagem original; confira as posições antes de gerar.`
      : "";
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipDateTime() {
    const now = new Date();
    const date = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    return { date, time };
  }

  function zipStored(entries) {
    const encoder = new TextEncoder();
    const local = [], central = [];
    let localOffset = 0;
    const { date, time } = zipDateTime();
    entries.forEach(({ name, data }) => {
      const nameBytes = encoder.encode(name);
      const content = data instanceof Uint8Array ? data : new Uint8Array(data);
      const crc = crc32(content);
      const header = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true); view.setUint16(10, time, true); view.setUint16(12, date, true);
      view.setUint32(14, crc, true); view.setUint32(18, content.length, true); view.setUint32(22, content.length, true);
      view.setUint16(26, nameBytes.length, true); view.setUint16(28, 0, true); header.set(nameBytes, 30);
      local.push(header, content);

      const cdir = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cdir.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, time, true); cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, content.length, true); cv.setUint32(24, content.length, true);
      cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, localOffset, true);
      cdir.set(nameBytes, 46); central.push(cdir);
      localOffset += header.length + content.length;
    });
    const centralSize = central.reduce((total, entry) => total + entry.length, 0);
    const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true); ev.setUint32(16, localOffset, true); ev.setUint16(20, 0, true);
    return new Blob([...local, ...central, end], { type: "application/zip" });
  }

  function csvCell(value) { return `"${String(value).replaceAll('"', '""')}"`; }

  async function generateCards() {
    if (state.busy) return;
    const config = settings();
    if (!state.pairs.length || !state.templateFile) return;
    if (!state.pairs.every((pair) => pair.confirmed)) { toast("Confira e confirme todos os pares antes de gerar."); return; }
    state.busy = true;
    lockControls(true);
    state.generated = [];
    clearDownload();
    $("generationProgressWrap").hidden = false;
    $("generateBtn").disabled = true;
    $("dockGenerate").disabled = true;
    const status = $("generationMessage");
    setStatus(status, "Processando no seu aparelho…", "info");
    const entries = [];
    const csvRows = [["arquivo", "codigo_feminino", "codigo_masculino", "user_id_feminino", "user_id_masculino", "verificacao"]];
    let outputBytes = 0;
    try {
      for (let i = 0; i < state.pairs.length; i++) {
        const pair = state.pairs[i];
        $("generationStatus").textContent = `Montando card ${i + 1} de ${state.pairs.length}…`;
        $("generationProgress").style.width = `${(i / state.pairs.length) * 100}%`;
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
        const canvas = await composeCard(pair, config);
        const blob = await canvasBlob(canvas);
        outputBytes += blob.size;
        if (outputBytes > 400 * 1024 * 1024) throw new Error("O lote gerado passou de 400 MB. Separe os pares em ZIPs menores para não sobrecarregar o celular.");
        const safeCode = (code) => String(code).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) || "codigo";
        const name = `card_${String(i + 1).padStart(4, "0")}_${safeCode(pair.femaleCode)}_${safeCode(pair.maleCode)}.png`;
        entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
        csvRows.push([name, pair.femaleCode, pair.maleCode, pair.femaleId || "", pair.maleId || "", pair.matchedByFilename ? "nome_confirmado" : "ordem_confirmada"]);
        if (i === state.selected) showCanvas(canvas);
      }
      const csv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      entries.push({ name: "conferencia.csv", data: new TextEncoder().encode(csv) });
      const zip = zipStored(entries);
      if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
      state.downloadUrl = URL.createObjectURL(zip);
      $("downloadBtn").href = state.downloadUrl;
      $("downloadBtn").hidden = false;
      $("generationProgress").style.width = "100%";
      $("generationStatus").textContent = `${state.pairs.length} card(s) prontos`;
      setStatus(status, `Pronto! ${state.pairs.length} card(s) criado(s), com PNGs em resolução original e os códigos preservados.`, "success");
      toast("Seus cards estão prontos para baixar ✦");
    } catch (error) {
      setStatus(status, error.message || "Não consegui gerar os cards. Tente um lote menor.", "error");
      $("generationStatus").textContent = "A geração parou";
    } finally {
      state.busy = false;
      lockControls(false);
      updateReadyState();
    }
  }

  function showCanvas(canvas) {
    if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; }
    $("cardPreview").src = canvas.toDataURL("image/png");
    $("cardPreview").hidden = false;
    $("canvasPlaceholder").hidden = true;
    $("templateDimensions").textContent = `${canvas.width} × ${canvas.height} px`;
    updatePositionWarning(canvas.width, canvas.height);
  }

  async function displayPreview(canvas) {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(await canvasBlob(canvas));
    $("cardPreview").src = state.previewUrl;
    $("cardPreview").hidden = false;
    $("canvasPlaceholder").hidden = true;
    $("templateDimensions").textContent = `${canvas.width} × ${canvas.height} px`;
    updatePositionWarning(canvas.width, canvas.height);
  }

  function updateTemplate(file) {
    state.templateFile = file || null;
    clearDownload();
    if (state.templateUrl) URL.revokeObjectURL(state.templateUrl);
    state.templateUrl = file ? URL.createObjectURL(file) : null;
    $("templateName").textContent = file ? `${file.name} · ${Math.round(file.size / 1024)} KB` : "PNG ou JPG com os campos “XXXXX”";
    if (file) {
      loadBitmap(file).then((bitmap) => {
        $("templateDimensions").textContent = `${bitmap.width} × ${bitmap.height} px`;
        updatePositionWarning(bitmap.width, bitmap.height);
        if (state.pairs.length) schedulePreview();
        bitmap.close?.();
      }).catch(() => setStatus($("prepareStatus"), "Não consegui abrir o template. Escolha um PNG ou JPG válido.", "error"));
    } else {
      $("templateDimensions").textContent = "Aguardando template";
      $("positionWarning").hidden = true;
      $("cardPreview").hidden = true;
      $("canvasPlaceholder").hidden = false;
    }
    updateReadyState();
  }

  function showCanvasWhenReady() {
    const file = state.zipFile;
    $("zipName").textContent = file ? `${file.name} · ${Math.round(file.size / 1024)} KB` : "Toque para escolher ou arraste aqui";
    updateReadyState();
  }

  function setupDropzones() {
    document.querySelectorAll(".upload-card").forEach((zone) => {
      ["dragenter", "dragover"].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.add("drag-over"); }));
      ["dragleave", "drop"].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.remove("drag-over"); }));
      zone.addEventListener("drop", (event) => {
        const file = event.dataTransfer.files[0];
        if (!file) return;
        const input = zone.querySelector("input");
        const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  }

  function updateReadyStateWithSettings() {
    saveSettings();
    updateRangeLabels();
    if (state.downloadUrl) {
      URL.revokeObjectURL(state.downloadUrl); state.downloadUrl = null;
      $("downloadBtn").hidden = true;
      setStatus($("generationMessage"), "Os ajustes mudaram. Gere novamente para atualizar o ZIP.", "info");
    }
    schedulePreview();
  }

  async function importCustomFont(file) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo de fonte grande demais.");
      if (typeof FontFace === "undefined") throw new Error("Este navegador não permite carregar uma fonte local.");
      const face = new FontFace("VelaRealisticNatureUploaded", await file.arrayBuffer(), { style: "normal", weight: "400" });
      await face.load();
      if (state.customFontFace) document.fonts.delete(state.customFontFace);
      document.fonts.add(face);
      state.customFontFace = face;
      $("fontStyle").value = "custom";
      $("fontStatus").textContent = `${file.name} carregada. Realistic Nature será usada nos códigos desta sessão.`;
      updateReadyStateWithSettings();
      toast("Realistic Nature aplicada aos códigos ✦");
    } catch {
      $("fontStatus").textContent = "Não consegui abrir esse arquivo de fonte. Escolha um OTF, TTF, WOFF ou WOFF2 válido.";
      toast("A fonte não pôde ser carregada");
    }
  }

  function updateFontStatus() {
    if ($("fontStyle").value === "custom") {
      $("fontStatus").textContent = state.customFontFace
        ? "Realistic Nature carregada e aplicada aos códigos nesta sessão."
        : "Nenhum arquivo carregado. Selecione a fonte para aplicá-la aos códigos.";
    } else {
      const selected = $("fontStyle").selectedOptions[0]?.textContent || "Fonte padrão";
      $("fontStatus").textContent = state.customFontFace
        ? `${selected} selecionada. O arquivo Realistic Nature continua carregado para esta sessão.`
        : `${selected} selecionada. Você pode carregar Realistic Nature quando quiser.`;
    }
  }

  function bindEvents() {
    $("zipInput").addEventListener("change", (event) => {
      state.zipFile = event.target.files[0] || null;
      invalidatePairs("O ZIP foi atualizado. Prepare os pares novamente.");
      showCanvasWhenReady();
    });
    $("codesInput").addEventListener("input", () => {
      if (state.pairs.length) invalidatePairs("Os códigos foram alterados. Prepare os pares novamente para refazer a conferência.");
    });
    $("templateInput").addEventListener("change", (event) => updateTemplate(event.target.files[0] || null));
    $("fontInput").addEventListener("change", (event) => importCustomFont(event.target.files[0] || null));
    $("fontStyle").addEventListener("change", updateFontStatus);
    $("prepareBtn").addEventListener("click", preparePairs);
    $("confirmPair").addEventListener("change", (event) => {
      if (state.pairs[state.selected]) state.pairs[state.selected].confirmed = event.target.checked;
      renderPair();
    });
    $("prevPair").addEventListener("click", () => { state.selected = (state.selected - 1 + state.pairs.length) % state.pairs.length; renderPair(); });
    $("nextPair").addEventListener("click", () => { state.selected = (state.selected + 1) % state.pairs.length; renderPair(); });
    $("generateBtn").addEventListener("click", generateCards);
    $("dockGenerate").addEventListener("click", generateCards);
    $("resetView").addEventListener("click", () => { $("canvasFrame").scrollIntoView({ behavior: "smooth", block: "center" }); toast("Prévia ajustada à tela"); });
    document.querySelectorAll(".step-link").forEach((link) => link.addEventListener("click", () => {
      document.querySelectorAll(".step-link").forEach((item) => item.classList.remove("active")); link.classList.add("active");
    }));
    document.querySelectorAll(".settings-content input,.settings-content select").forEach((input) => {
      input.addEventListener(input.type === "range" ? "input" : "change", updateReadyStateWithSettings);
      if (input.type === "number") input.addEventListener("input", updateReadyStateWithSettings);
    });
    document.querySelectorAll(".upload-card").forEach((zone) => zone.querySelector("input").addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }));
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault(); state.installPrompt = event; $("installBtn").hidden = false;
    });
    $("installBtn").addEventListener("click", async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; $("installBtn").hidden = true;
    });
  }

  function updateTemplateInfoOnly() {
    if (state.templateFile) loadBitmap(state.templateFile).then((bitmap) => {
      $("templateDimensions").textContent = `${bitmap.width} × ${bitmap.height} px`;
      bitmap.close?.();
    }).catch(() => {});
  }

  restoreSettings();
  bindEvents();
  setupDropzones();
  updateTemplateInfoOnly();
  updateReadyState();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
