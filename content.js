/***********************
 * CONFIG
 ***********************/
const CAPTION_SELECTORS = [
  '.ytp-caption-segment',
  '.caption-window > span',
  '.captions-text > span',
  'span[class*="caption"]'
];

let tooltip;
let captionsObserver;
let extensionEnabled = true;
let uiContainer = null;
let settingsModal = null;
let currentRightPanel = 'dictionary'; // para saber qué panel mostrar

/***********************
 * INICIALIZACIÓN
 ***********************/
async function init() {
  await loadExtensionState();

  tooltip = document.createElement('div');
  tooltip.className = 'lr-tooltip';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);

  injectUI();
  createSettingsModal();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.extensionEnabled) {
      extensionEnabled = changes.extensionEnabled.newValue;
      handleStateChange();
    }
  });

  if (extensionEnabled) {
    startObserver();
    ensureSubtitlesOn();
  }

  document.addEventListener('mouseenter', handleWordHover, true);
  document.addEventListener('mousemove', handleWordMove, true);
  document.addEventListener('mouseleave', handleWordLeave, true);
  document.addEventListener('click', handleWordClick, true);

  console.log('Extension initialized, enabled:', extensionEnabled);
}

/***********************
 * ESTADO ON/OFF
 ***********************/
function loadExtensionState() {
  return new Promise(resolve => {
    chrome.storage.local.get(['extensionEnabled'], data => {
      if (data.extensionEnabled !== undefined) {
        extensionEnabled = data.extensionEnabled;
      } else {
        extensionEnabled = true;
        chrome.storage.local.set({ extensionEnabled: true });
      }
      resolve();
    });
  });
}

function setExtensionState(enabled) {
  extensionEnabled = enabled;
  chrome.storage.local.set({ extensionEnabled: enabled });
  handleStateChange();
}

function handleStateChange() {
  if (extensionEnabled) {
    startObserver();
    ensureSubtitlesOn();
    processCaptions();
  } else {
    stopObserver();
  }
  updateUIButtons();
}

function startObserver() {
  if (!captionsObserver) {
    captionsObserver = new MutationObserver(() => processCaptions());
  }
  captionsObserver.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (captionsObserver) {
    captionsObserver.disconnect();
  }
}

/***********************
 * INYECCIÓN UI EN REPRODUCTOR
 ***********************/
function injectUI() {
  const waitForControls = setInterval(() => {
    const rightControls = document.querySelector('.ytp-right-controls');
    if (rightControls && !document.querySelector('.lr-controls')) {
      clearInterval(waitForControls);

      uiContainer = document.createElement('div');
      uiContainer.className = 'lr-controls';
      uiContainer.style.display = 'flex';
      uiContainer.style.alignItems = 'center';
      uiContainer.style.marginRight = '8px';

      const powerButton = document.createElement('button');
      powerButton.className = 'lr-power-button';
      powerButton.innerHTML = extensionEnabled ? '🔵 ON' : '⚫ OFF';
      powerButton.style.background = 'transparent';
      powerButton.style.border = 'none';
      powerButton.style.color = '#fff';
      powerButton.style.cursor = 'pointer';
      powerButton.style.fontSize = '12px';
      powerButton.style.fontWeight = 'bold';
      powerButton.style.marginRight = '5px';
      powerButton.addEventListener('click', (e) => {
        e.stopPropagation();
        setExtensionState(!extensionEnabled);
      });

      const configButton = document.createElement('button');
      configButton.className = 'lr-config-button';
      configButton.innerHTML = '⚙️';
      configButton.style.background = 'transparent';
      configButton.style.border = 'none';
      configButton.style.color = '#fff';
      configButton.style.cursor = 'pointer';
      configButton.style.fontSize = '16px';
      configButton.addEventListener('click', (e) => {
        e.stopPropagation();
        showSettingsModal();
      });

      uiContainer.appendChild(powerButton);
      uiContainer.appendChild(configButton);
      rightControls.prepend(uiContainer);

      updateUIButtons();
    }
  }, 500);
}

function updateUIButtons() {
  if (!uiContainer) return;
  const powerBtn = uiContainer.querySelector('.lr-power-button');
  if (powerBtn) {
    powerBtn.innerHTML = extensionEnabled ? '🔵 ON' : '⚫ OFF';
  }
}

/***********************
 * MODAL DE CONFIGURACIÓN
 ***********************/
function createSettingsModal() {
  // Fondo oscuro
  const overlay = document.createElement('div');
  overlay.className = 'lr-modal-overlay';
  overlay.style.display = 'none';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideSettingsModal();
  });

  // Modal principal
  const modal = document.createElement('div');
  modal.className = 'lr-modal';

  // Cabecera
  const header = document.createElement('div');
  header.className = 'lr-modal-header';
  header.innerHTML = '<span>Configuración</span><button class="lr-modal-close">&times;</button>';
  header.querySelector('.lr-modal-close').addEventListener('click', hideSettingsModal);

  // Cuerpo con dos paneles
  const body = document.createElement('div');
  body.className = 'lr-modal-body';

  // Panel izquierdo (menú)
  const leftPanel = document.createElement('div');
  leftPanel.className = 'lr-modal-left';
  const menu = document.createElement('ul');
  menu.className = 'lr-settings-menu';
  const menuItem = document.createElement('li');
  menuItem.textContent = 'Diccionario';
  menuItem.dataset.panel = 'dictionary';
  menuItem.classList.add('active'); // por defecto activo
  menuItem.addEventListener('click', () => {
    setActivePanel('dictionary');
  });
  menu.appendChild(menuItem);
  // Podemos añadir más items aquí en el futuro
  leftPanel.appendChild(menu);

  // Panel derecho (contenido)
  const rightPanel = document.createElement('div');
  rightPanel.className = 'lr-modal-right';
  rightPanel.id = 'lr-right-panel-content';

  body.appendChild(leftPanel);
  body.appendChild(rightPanel);

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  settingsModal = overlay;
}

function showSettingsModal() {
  if (!settingsModal) return;
  settingsModal.style.display = 'flex';
  // Actualizar el panel derecho con el contenido actual
  loadRightPanel(currentRightPanel);
}

function hideSettingsModal() {
  if (settingsModal) settingsModal.style.display = 'none';
}

function setActivePanel(panelId) {
  currentRightPanel = panelId;
  // Actualizar clase activa en el menú
  const menuItems = document.querySelectorAll('.lr-settings-menu li');
  menuItems.forEach(item => {
    if (item.dataset.panel === panelId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  loadRightPanel(panelId);
}

function loadRightPanel(panelId) {
  const rightPanel = document.getElementById('lr-right-panel-content');
  if (!rightPanel) return;

  if (panelId === 'dictionary') {
    renderDictionaryPanel(rightPanel);
  }
  // Aquí se pueden añadir más paneles
}

function renderDictionaryPanel(container) {
  container.innerHTML = ''; // Limpiar

  const title = document.createElement('h3');
  title.textContent = 'Mi Diccionario';
  container.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'lr-dictionary-list';

  chrome.storage.local.get(['dict'], data => {
    const dict = data.dict || {};
    const entries = Object.entries(dict);
    if (entries.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = 'No hay palabras guardadas.';
      list.appendChild(empty);
    } else {
      entries.forEach(([word, info]) => {
        const li = document.createElement('li');
        li.innerHTML = `${word} → ${info.translation} <button data-word="${word}" class="lr-delete-word">❌</button>`;
        li.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation();
          const wordToDelete = e.target.dataset.word;
          deleteWordFromDict(wordToDelete, li);
        });
        list.appendChild(li);
      });
    }
    container.appendChild(list);
  });
}

function deleteWordFromDict(word, listItem) {
  chrome.storage.local.get(['dict'], data => {
    const dict = data.dict || {};
    if (dict[word]) {
      delete dict[word];
      chrome.storage.local.set({ dict }, () => {
        listItem.remove();
        // También podríamos actualizar los subtítulos en tiempo real, pero es más complejo.
        // Por simplicidad, no lo hacemos aquí.
      });
    }
  });
}

/***********************
 * FORZAR SUBTÍTULOS ACTIVADOS
 ***********************/
function ensureSubtitlesOn() {
  const subtitlesButton = document.querySelector('.ytp-subtitles-button');
  if (subtitlesButton) {
    const isPressed = subtitlesButton.getAttribute('aria-pressed') === 'true';
    if (!isPressed) {
      subtitlesButton.click();
    }
  }
}

/***********************
 * PROCESAR SUBTÍTULOS
 ***********************/
async function processCaptions() {
  if (!extensionEnabled) return;
  if (!isExtensionValid()) {
    console.warn('Extension context invalidated, skipping storage access');
    return;
  }

  if (captionsObserver) captionsObserver.disconnect();
  try {
    const nodes = getCaptionNodes();
    if (!nodes.length) return;

    const dict = await loadDictionary();
    const video = document.querySelector('video');
    const currentTime = video ? video.currentTime : 0;

    nodes.forEach(node => {
      if (node.dataset.processedByLR === 'true') return;
      node.dataset.processedByLR = 'true';

      const text = node.textContent;
      if (!text) return;

      const tokens = tokenizePreserve(text);
      const fragment = document.createDocumentFragment();

      tokens.forEach(token => {
        if (token.type === 'word') {
          const span = document.createElement('span');
          const normalized = normalizeWord(token.value);
          const isKnown = dict[normalized] ? true : false;
          span.className = `word ${isKnown ? 'known' : 'unknown'}`;
          span.textContent = token.value;
          span.dataset.time = currentTime;
          span.dataset.normalized = normalized;
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(token.value));
        }
      });

      node.innerHTML = '';
      node.appendChild(fragment);
    });
  } catch (error) {
    console.error('Error processing captions:', error);
  } finally {
    if (extensionEnabled && captionsObserver) {
      captionsObserver.observe(document.body, { childList: true, subtree: true });
    }
  }
}
/***********************
 * ACTUALIZAR TODAS LAS OCURRENCIAS DE UNA PALABRA
 ***********************/
function updateWordSpans(word, makeKnown) {
  const spans = document.querySelectorAll(`.word[data-normalized="${word}"]`);
  spans.forEach(span => {
    if (makeKnown) {
      span.classList.remove('unknown');
      span.classList.add('known');
    } else {
      span.classList.remove('known');
      span.classList.add('unknown');
    }
  });
}

/***********************
 * OBTENER NODOS DE SUBTÍTULOS
 ***********************/
function getCaptionNodes() {
  let nodes = [];

  for (const sel of CAPTION_SELECTORS) {
    nodes = nodes.concat(Array.from(document.querySelectorAll(sel)));
  }

  const player = document.querySelector('#movie_player, #player-container');
  if (player && player.shadowRoot) {
    for (const sel of CAPTION_SELECTORS) {
      nodes = nodes.concat(Array.from(player.shadowRoot.querySelectorAll(sel)));
    }
  }

  return [...new Set(nodes)];
}

/***********************
 * TOKENIZACIÓN
 ***********************/
function tokenizePreserve(text) {
  const regex = /(\s+|[.,!?;:]|\p{L}+)/gu;
  const tokens = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    if (/^\s+$/.test(value)) tokens.push({ type: 'space', value });
    else if (/^[.,!?;:]$/.test(value)) tokens.push({ type: 'punct', value });
    else tokens.push({ type: 'word', value });
  }
  return tokens;
}

function normalizeWord(word) {
  return word.toLowerCase().replace(/[^\p{L}]/gu, '');
}

/***********************
 * VERIFICAR EXTENSIÓN VÁLIDA
 ***********************/
function isExtensionValid() {
  return Boolean(chrome.runtime && chrome.runtime.id);
}

/***********************
 * STORAGE
 ***********************/
function loadDictionary() {
  return new Promise(resolve => {
    if (!isExtensionValid()) {
      console.warn('Extension invalid, returning empty dictionary');
      resolve({});
      return;
    }
    chrome.storage.local.get(['dict'], data => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        resolve({});
      } else {
        resolve(data.dict || {});
      }
    });
  });
}

function saveWord(word, translation) {
  return new Promise(resolve => {
    if (!isExtensionValid()) {
      console.warn('Extension invalid, cannot save word');
      resolve();
      return;
    }
    chrome.storage.local.get(['dict'], data => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        resolve();
        return;
      }
      const dict = data.dict || {};
      dict[word] = { translation, added: Date.now() };
      chrome.storage.local.set({ dict }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage error on set:', chrome.runtime.lastError);
        }
        resolve();
      });
    });
  });
}

function removeWord(word) {
  return new Promise(resolve => {
    if (!isExtensionValid()) {
      console.warn('Extension invalid, cannot remove word');
      resolve();
      return;
    }
    chrome.storage.local.get(['dict'], data => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        resolve();
        return;
      }
      const dict = data.dict || {};
      if (dict[word]) {
        delete dict[word];
        chrome.storage.local.set({ dict }, () => {
          if (chrome.runtime.lastError) {
            console.error('Storage error on set:', chrome.runtime.lastError);
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

function translate(text) {
  return new Promise(resolve => {
    if (!isExtensionValid()) {
      console.warn('Extension invalid, cannot translate');
      resolve('Error: extension invalid');
      return;
    }
    chrome.runtime.sendMessage({ type: 'TRANSLATE', text }, response => {
      if (chrome.runtime.lastError) {
        console.error('Translation error:', chrome.runtime.lastError);
        resolve('Error');
      } else {
        resolve(response || 'Error');
      }
    });
  });
}

/***********************
 * MANEJADORES DE EVENTOS
 ***********************/
async function handleWordHover(e) {
  if (!extensionEnabled) return;
  const targetElement = e.target.nodeType === 1 ? e.target : e.target.parentElement;
  const wordSpan = targetElement?.closest('.word');
  if (!wordSpan) return;

  console.log('Hover on word:', wordSpan.textContent);

  const video = document.querySelector('video');
  if (video && !video.paused) {
    video.dataset.wasPlaying = 'true';
    video.pause();
  }

  tooltip.style.display = 'block';
  tooltip.style.top = `${e.clientY - 36}px`;
  tooltip.style.left = `${e.clientX}px`;
  tooltip.textContent = '…';

  const word = wordSpan.dataset.normalized || normalizeWord(wordSpan.textContent);
  const translation = await translate(word);
  tooltip.textContent = translation;
}

function handleWordMove(e) {
  if (!extensionEnabled) return;
  if (tooltip.style.display === 'block') {
    tooltip.style.top = `${e.clientY - 36}px`;
    tooltip.style.left = `${e.clientX}px`;
  }
}

function handleWordLeave(e) {
  if (!extensionEnabled) return;
  const targetElement = e.target.nodeType === 1 ? e.target : e.target.parentElement;
  const wordSpan = targetElement?.closest('.word');
  if (!wordSpan) {
    const video = document.querySelector('video');
    if (video && video.dataset.wasPlaying === 'true') {
      video.play();
      delete video.dataset.wasPlaying;
    }
    tooltip.style.display = 'none';
  }
}

async function handleWordClick(e) {
  if (!extensionEnabled) return;
  const targetElement = e.target.nodeType === 1 ? e.target : e.target.parentElement;
  const wordSpan = targetElement?.closest('.word');
  if (!wordSpan) return;

  const word = wordSpan.dataset.normalized || normalizeWord(wordSpan.textContent);
  if (!word) return;

  console.log('Click on word:', word, 'current class:', wordSpan.className);

  if (wordSpan.classList.contains('known')) {
    // Eliminar del diccionario
    await removeWord(word);
    // Actualizar todas las apariciones visibles de esta palabra
    updateWordSpans(word, false);
    console.log(`Word "${word}" removed from dictionary`);
  } else {
    // Guardar como nueva
    const translation = await translate(word);
    await saveWord(word, translation);
    // Actualizar todas las apariciones visibles de esta palabra
    updateWordSpans(word, true);
    console.log(`Word "${word}" saved to dictionary`);
  }

  tooltip.style.display = 'none';
}

init();