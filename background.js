chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TRANSLATE') {
    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(msg.text)}`)
      .then(r => r.json())
      .then(d => {
        const translation = d[0].map(x => x[0]).join('');
        sendResponse(translation);
      })
      .catch(err => {
        console.error('Translation error:', err);
        sendResponse('Error');
      });
    return true;
  }
  // Eliminamos OPEN_POPUP porque ahora usamos modal
});