chrome.runtime.onMessage.addListener((msg, _, send) => {
  if (msg.type === 'TRANSLATE') {
    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(msg.text)}`)
      .then(r => r.json())
      .then(d => {
        const translation = d[0].map(x => x[0]).join('');
        send(translation);
      })
      .catch(err => {
        console.error('Translation error:', err);
        send('Error');
      });
    return true;
  }
});