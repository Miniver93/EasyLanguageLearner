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

/***********************
 * INICIALIZACIÓN
 ***********************/
function init() {
  tooltip = document.createElement('div');
  tooltip.className = 'lr-tooltip';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);

  captionsObserver = new MutationObserver(() => processCaptions());
  captionsObserver.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('mouseenter', handleWordHover, true);
  document.addEventListener('mousemove', handleWordMove, true);
  document.addEventListener('mouseleave', handleWordLeave, true);
  document.addEventListener('click', handleWordClick, true);

  console.log('Extension initialized');
}

/***********************
 * PROCESAR SUBTÍTULOS
 ***********************/
async function processCaptions() {
  if (!isExtensionValid()) {
    console.warn('Extension context invalidated, skipping storage access');
    return;
  }

  captionsObserver.disconnect();
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
          const normalized = normalize(token.value);
          const isKnown = dict[normalized] ? true : false;
          span.className = `word ${isKnown ? 'known' : 'unknown'}`;
          span.textContent = token.value;
          span.dataset.time = currentTime;
          span.dataset.normalized = normalized;
          // NOTA: ya no aplicamos estilos inline. Todo se hereda vía CSS.
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
    captionsObserver.observe(document.body, { childList: true, subtree: true });
  }
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

function normalize(word) {
  return word.toLowerCase().replace(/[^\p{L}]/gu, '');
}

/***********************
 * VERIFICAR EXTENSIÓN VÁLIDA
 ***********************/
function isExtensionValid() {
  return Boolean(chrome.runtime && chrome.runtime.id);
}

/***********************
 * STORAGE (CON MANEJO DE ERRORES)
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

  const word = wordSpan.dataset.normalized || normalize(wordSpan.textContent);
  const translation = await translate(word);
  tooltip.textContent = translation;
}

function handleWordMove(e) {
  if (tooltip.style.display === 'block') {
    tooltip.style.top = `${e.clientY - 36}px`;
    tooltip.style.left = `${e.clientX}px`;
  }
}

function handleWordLeave(e) {
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
  const targetElement = e.target.nodeType === 1 ? e.target : e.target.parentElement;
  const wordSpan = targetElement?.closest('.word');
  if (!wordSpan) return;

  const word = wordSpan.dataset.normalized || normalize(wordSpan.textContent);
  if (!word) return;

  console.log('Click on word:', word, 'current class:', wordSpan.className);

  if (wordSpan.classList.contains('known')) {
    await removeWord(word);
    wordSpan.classList.remove('known');
    wordSpan.classList.add('unknown');
    console.log(`Word "${word}" removed from dictionary`);
  } else {
    const translation = await translate(word);
    await saveWord(word, translation);
    wordSpan.classList.remove('unknown');
    wordSpan.classList.add('known');
    console.log(`Word "${word}" saved to dictionary`);
  }

  tooltip.style.display = 'none';
}

init();