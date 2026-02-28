const list = document.getElementById('list');
const exportBtn = document.getElementById('export');

chrome.storage.local.get(['dict'], data => {
  const dict = data.dict || {};
  Object.entries(dict).forEach(([word, info]) => renderWord(word, info));
});

function renderWord(word, info) {
  const li = document.createElement('li');
  li.innerHTML = `${word} → ${info.translation} <button>❌</button>`;

  li.querySelector('button').onclick = () => {
    chrome.storage.local.get(['dict'], data => {
      delete data.dict[word];
      chrome.storage.local.set({ dict: data.dict }, () => li.remove());
    });
  };

  list.appendChild(li);
}

exportBtn.onclick = () => {
  chrome.storage.local.get(['dict'], data => exportCSV(data.dict || {}));
};

function exportCSV(dict) {
  let csv = 'Front,Back\n';
  Object.entries(dict).forEach(([w, i]) => csv += `${w},${i.translation}\n`);

  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anki.csv';
  a.click();
}