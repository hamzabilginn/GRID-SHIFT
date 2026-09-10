// Compact touch HUD. Opening this menu does not pause an online race.
const hud = document.querySelector('#race-hud');
const toggle = document.createElement('button');
toggle.id = 'mobile-menu-toggle';
toggle.textContent = '☰';
toggle.setAttribute('aria-label', 'Yarış menüsü');
toggle.setAttribute('aria-haspopup', 'dialog');
toggle.setAttribute('aria-controls', 'mobile-race-menu');
const dialog = document.createElement('dialog');
dialog.id = 'mobile-race-menu';
dialog.setAttribute('aria-label', 'Yarış menüsü');
dialog.innerHTML = `<form method="dialog"><h2>Yarış menüsü</h2><p>Çevrimiçi yarış menü açıkken devam eder.</p><button value="close" class="primary">Yarışa dön</button></form><div class="race-menu-actions"><button data-forward="race-sound">Sesi aç / kapat</button><button data-forward="cam-toggle-btn">Kamerayı değiştir</button><button data-forward="reset">Piste dön</button><button data-forward="host-restart">Yeniden başlat</button><button data-forward="host-finish">Yarışı bitir</button></div><h3>Sıralama</h3><div id="mobile-menu-leaders"></div>`;
document.body.append(dialog);
hud.append(toggle);
toggle.onclick = () => {
  document.dispatchEvent(new Event('race-menu-open'));
  dialog.querySelector('#mobile-menu-leaders').replaceChildren(...[...document.querySelector('#leaders').children].map(row => row.cloneNode(true)));
  dialog.querySelectorAll('[data-forward]').forEach(button => {
    const original = document.getElementById(button.dataset.forward);
    button.hidden = !original || original.hidden;
  });
  dialog.showModal();
};
dialog.querySelectorAll('[data-forward]').forEach(button => button.onclick = () => {
  document.getElementById(button.dataset.forward)?.click();
  dialog.close();
});
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
});
new MutationObserver(() => {
  if (hud.hidden && dialog.open) dialog.close();
}).observe(hud, {attributes:true, attributeFilter:['hidden']});
