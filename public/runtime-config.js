window.GRIDSHIFT_CONFIG = {"apiBase":""};
window.addEventListener('DOMContentLoaded', () => {
  for (const id of ['garage-hero-img', 'cockpit-car-img']) document.getElementById(id)?.setAttribute('src', '/cars/grid-car.svg');
  const brand = document.getElementById('garage-hero-brand'); if (brand) brand.textContent = 'GRID WORKS';
  const name = document.getElementById('garage-hero-name'); if (name) name.textContent = 'Apex Vortex';
  const cockpit = document.getElementById('cockpit-car-name'); if (cockpit) cockpit.textContent = 'VORTEX';
});
